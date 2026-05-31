import {
  ConflictException,
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  MultiWorkflowRun,
  MultiWorkflowRunDocument,
  MultiWorkflowRunStatus,
} from '../multi-workflows/multi-workflow-run.schema';
import { MultiWorkflowsService } from '../multi-workflows/multi-workflows.service';
import { ExtensionPresenceService } from '../workflow-runs/extension-presence.service';
import {
  WorkflowRun,
  WorkflowRunDocument,
  WorkflowRunStatus,
} from '../workflow-runs/workflow-run.schema';
import { WorkflowRunsEvents } from '../workflow-runs/workflow-runs.events';
import { WorkflowRunsService } from '../workflow-runs/workflow-runs.service';
import {
  WorkflowScheduleRun,
  WorkflowScheduleRunDocument,
} from './workflow-schedule-run.schema';
import { computeNextRunAt } from './workflow-schedule-time.util';
import {
  WorkflowSchedule,
  WorkflowScheduleBatchStatus,
  WorkflowScheduleDocument,
  WorkflowScheduleKind,
  WorkflowScheduleLastRunStatus,
  WorkflowScheduleTargetType,
} from './workflow-schedule.schema';

type ScheduleLean = WorkflowSchedule & { _id: Types.ObjectId };

export type ScheduleBatchPayload = {
  scheduleId?: string;
  scheduleBatch?: boolean;
  batchIndex?: number;
  batchTotal?: number;
  trigger?: string;
};

@Injectable()
export class WorkflowScheduleBatchService implements OnModuleInit {
  private readonly logger = new Logger(WorkflowScheduleBatchService.name);

  constructor(
    @InjectModel(WorkflowSchedule.name)
    private readonly scheduleModel: Model<WorkflowScheduleDocument>,
    @InjectModel(WorkflowScheduleRun.name)
    private readonly scheduleRunModel: Model<WorkflowScheduleRunDocument>,
    @InjectModel(MultiWorkflowRun.name)
    private readonly multiWorkflowRunModel: Model<MultiWorkflowRunDocument>,
    @InjectModel(WorkflowRun.name)
    private readonly workflowRunModel: Model<WorkflowRunDocument>,
    private readonly multiWorkflowsService: MultiWorkflowsService,
    private readonly workflowRunsService: WorkflowRunsService,
    private readonly extensionPresence: ExtensionPresenceService,
    private readonly workflowRunsEvents: WorkflowRunsEvents,
  ) {}

  onModuleInit() {
    this.workflowRunsEvents.events$.subscribe((event) => {
      if (event.type !== 'workflow_run_updated') return;
      const run = event.run;
      const status = String(run.status || '');
      if (!['completed', 'failed', 'cancelled'].includes(status)) return;

      const payload = (run.payload || {}) as Record<string, unknown>;
      if (payload.source === 'multi_workflow' || payload.multiWorkflowJobId || payload.multiWorkflowRunId) {
        return;
      }
      if (!this.isScheduleBatchPayload(payload)) return;

      const runId = String(run._id || '').trim();
      if (!runId) return;
      void this.onWorkflowRunFinished(runId).catch((error) => {
        this.logger.error('Schedule batch hook (workflow run event) failed', error as Error);
      });
    });
  }

  isScheduleBatchPayload(payload: Record<string, unknown> | undefined): boolean {
    if (!payload || payload.scheduleBatch !== true) return false;
    return Boolean(String(payload.scheduleId || '').trim());
  }

  async triggerSchedule(
    schedule: ScheduleLean,
    triggeredAt: Date,
    options: { manual: boolean },
  ) {
    if (schedule.batchStatus === WorkflowScheduleBatchStatus.RUNNING) {
      return this.recordTriggerSkipped(schedule, triggeredAt, 'Batch is running — skipped new trigger.');
    }

    const consecutiveRuns = Math.max(1, schedule.consecutiveRuns || 1);
    const isBatch = consecutiveRuns > 1;

    if (isBatch) {
      await this.scheduleModel.updateOne(
        { _id: schedule._id },
        {
          $set: {
            batchStatus: WorkflowScheduleBatchStatus.RUNNING,
            batchCompletedRuns: 0,
            batchStartedAt: triggeredAt,
            lastRunAt: triggeredAt,
            lastRunMessage: `Running batch 0/${consecutiveRuns}…`,
          },
        },
      );
    }

    const result = await this.spawnBatchRun(
      { ...schedule, consecutiveRuns },
      1,
      triggeredAt,
      options,
    );

    if (!isBatch) {
      const nextRunAt = this.computeNextAfterExecution(schedule, triggeredAt);
      await this.scheduleModel.updateOne(
        { _id: schedule._id },
        {
          $set: {
            lastRunAt: triggeredAt,
            lastRunStatus: result.status,
            lastRunMessage: result.message,
            nextRunAt,
            ...(schedule.scheduleKind === WorkflowScheduleKind.ONCE && !nextRunAt
              ? { enabled: false }
              : {}),
          },
        },
      );
      await this.scheduleRunModel.create({
        scheduleId: schedule._id,
        userId: schedule.userId,
        triggeredAt,
        status: result.status,
        targetType: schedule.targetType,
        multiWorkflowRunId: result.multiWorkflowRunId,
        workflowRunId: result.workflowRunId,
        message: result.message,
        batchIndex: null,
        batchTotal: null,
      });
    } else if (result.status !== WorkflowScheduleLastRunStatus.SUCCESS) {
      await this.failBatch(
        schedule._id,
        triggeredAt,
        1,
        consecutiveRuns,
        result.message || 'Failed to start batch.',
      );
    }

    const refreshed = await this.scheduleModel.findById(schedule._id).lean();
    return refreshed;
  }

  async onMultiWorkflowRunFinished(runId: string) {
    const run = await this.multiWorkflowRunModel.findById(runId).lean();
    if (!run) return;

    const payload = (run.payload || {}) as ScheduleBatchPayload;
    if (!this.isScheduleBatchPayload(payload as Record<string, unknown>)) return;

    const scheduleId = String(payload.scheduleId || '').trim();
    const batchIndex = Number(payload.batchIndex) || 0;

    if (run.status === MultiWorkflowRunStatus.COMPLETED) {
      await this.handleBatchRunSuccess(scheduleId, batchIndex, {
        multiWorkflowRunId: new Types.ObjectId(runId),
      });
      return;
    }

    if (
      run.status === MultiWorkflowRunStatus.FAILED ||
      run.status === MultiWorkflowRunStatus.CANCELLED
    ) {
      const errMsg =
        run.status === MultiWorkflowRunStatus.CANCELLED
          ? 'Cancelled.'
          : 'Multi workflow run failed.';
      await this.handleBatchRunFailure(scheduleId, batchIndex, errMsg, {
        multiWorkflowRunId: new Types.ObjectId(runId),
      });
    }
  }

  async onWorkflowRunFinished(runId: string) {
    const run = await this.workflowRunModel.findById(runId).lean();
    if (!run) return;

    const payload = (run.payload || {}) as Record<string, unknown>;
    if (!this.isScheduleBatchPayload(payload)) return;
    if (payload.source === 'multi_workflow' || payload.multiWorkflowJobId || payload.multiWorkflowRunId) {
      return;
    }

    const scheduleId = String(payload.scheduleId || '').trim();
    const batchIndex = Number(payload.batchIndex) || 0;

    if (run.status === WorkflowRunStatus.COMPLETED) {
      await this.handleBatchRunSuccess(scheduleId, batchIndex, {
        workflowRunId: new Types.ObjectId(runId),
      });
      return;
    }

    if (
      run.status === WorkflowRunStatus.FAILED ||
      run.status === WorkflowRunStatus.CANCELLED
    ) {
      const errMsg =
        (run.error?.message || '').trim() ||
        (run.status === WorkflowRunStatus.CANCELLED ? 'Cancelled.' : 'Workflow run failed.');
      await this.handleBatchRunFailure(scheduleId, batchIndex, errMsg, {
        workflowRunId: new Types.ObjectId(runId),
      });
    }
  }

  private async handleBatchRunSuccess(
    scheduleId: string,
    batchIndex: number,
    refs: { multiWorkflowRunId?: Types.ObjectId; workflowRunId?: Types.ObjectId },
  ) {
    const schedule = await this.scheduleModel.findOne({
      _id: scheduleId,
      batchStatus: WorkflowScheduleBatchStatus.RUNNING,
    });
    if (!schedule) return;

    const total = Math.max(1, schedule.consecutiveRuns || 1);
    if (batchIndex !== schedule.batchCompletedRuns + 1) {
      this.logger.warn(
        `Batch index mismatch schedule=${scheduleId} expected=${schedule.batchCompletedRuns + 1} got=${batchIndex}`,
      );
    }

    schedule.batchCompletedRuns = batchIndex;
    schedule.lastRunMessage = `Completed run ${batchIndex}/${total}.`;
    schedule.lastRunStatus = WorkflowScheduleLastRunStatus.SUCCESS;
    schedule.lastRunAt = new Date();
    await schedule.save();

    if (batchIndex >= total) {
      await this.completeBatch(schedule.toObject(), refs);
      return;
    }

    const nextIndex = batchIndex + 1;
    const result = await this.spawnBatchRun(schedule.toObject(), nextIndex, new Date(), {
      manual: false,
    });
    if (result.status !== WorkflowScheduleLastRunStatus.SUCCESS) {
      await this.failBatch(schedule._id, new Date(), nextIndex, total, result.message);
    }
  }

  private async handleBatchRunFailure(
    scheduleId: string,
    batchIndex: number,
    reason: string,
    refs: { multiWorkflowRunId?: Types.ObjectId; workflowRunId?: Types.ObjectId },
  ) {
    const schedule = await this.scheduleModel.findById(scheduleId).lean();
    if (!schedule || schedule.batchStatus !== WorkflowScheduleBatchStatus.RUNNING) return;

    const total = Math.max(1, schedule.consecutiveRuns || 1);
    await this.failBatch(
      schedule._id,
      new Date(),
      batchIndex,
      total,
      reason,
      refs,
    );
  }

  private async completeBatch(
    schedule: ScheduleLean,
    refs: { multiWorkflowRunId?: Types.ObjectId; workflowRunId?: Types.ObjectId },
  ) {
    const triggeredAt = schedule.batchStartedAt || new Date();
    const total = Math.max(1, schedule.consecutiveRuns || 1);
    const nextRunAt = this.computeNextAfterExecution(schedule, new Date());

    await this.scheduleModel.updateOne(
      { _id: schedule._id },
      {
        $set: {
          batchStatus: WorkflowScheduleBatchStatus.COMPLETED,
          lastRunStatus: WorkflowScheduleLastRunStatus.SUCCESS,
          lastRunMessage: `Completed batch ${total}/${total}.`,
          lastRunAt: new Date(),
          nextRunAt,
          ...(schedule.scheduleKind === WorkflowScheduleKind.ONCE && !nextRunAt
            ? { enabled: false }
            : {}),
        },
      },
    );

    await this.scheduleRunModel.create({
      scheduleId: schedule._id,
      userId: schedule.userId,
      triggeredAt,
      status: WorkflowScheduleLastRunStatus.SUCCESS,
      targetType: schedule.targetType,
      multiWorkflowRunId: refs.multiWorkflowRunId || null,
      workflowRunId: refs.workflowRunId || null,
      message: `Completed batch ${total}/${total} consecutive runs.`,
      batchIndex: total,
      batchTotal: total,
    });
  }

  private async failBatch(
    scheduleId: Types.ObjectId,
    triggeredAt: Date,
    failedAtIndex: number,
    total: number,
    reason: string,
    refs?: { multiWorkflowRunId?: Types.ObjectId; workflowRunId?: Types.ObjectId },
  ) {
    const schedule = await this.scheduleModel.findById(scheduleId).lean();
    if (!schedule) return;

    const message = `Batch stopped at run ${failedAtIndex}/${total}: ${reason}`;
    const nextRunAt = this.computeNextAfterExecution(schedule, triggeredAt);

    await this.scheduleModel.updateOne(
      { _id: scheduleId },
      {
        $set: {
          batchStatus: WorkflowScheduleBatchStatus.FAILED,
          lastRunStatus: WorkflowScheduleLastRunStatus.FAILED,
          lastRunMessage: message,
          lastRunAt: triggeredAt,
          nextRunAt,
        },
      },
    );

    await this.scheduleRunModel.create({
      scheduleId,
      userId: schedule.userId,
      triggeredAt: schedule.batchStartedAt || triggeredAt,
      status: WorkflowScheduleLastRunStatus.FAILED,
      targetType: schedule.targetType,
      multiWorkflowRunId: refs?.multiWorkflowRunId || null,
      workflowRunId: refs?.workflowRunId || null,
      message,
      batchIndex: failedAtIndex,
      batchTotal: total,
    });
  }

  private async recordTriggerSkipped(
    schedule: ScheduleLean,
    triggeredAt: Date,
    message: string,
  ) {
    await this.scheduleModel.updateOne(
      { _id: schedule._id },
      {
        $set: {
          lastRunAt: triggeredAt,
          lastRunStatus: WorkflowScheduleLastRunStatus.SKIPPED,
          lastRunMessage: message,
        },
      },
    );
    await this.scheduleRunModel.create({
      scheduleId: schedule._id,
      userId: schedule.userId,
      triggeredAt,
      status: WorkflowScheduleLastRunStatus.SKIPPED,
      targetType: schedule.targetType,
      message,
      batchIndex: null,
      batchTotal: null,
    });
    return this.scheduleModel.findById(schedule._id).lean();
  }

  private async spawnBatchRun(
    schedule: ScheduleLean,
    batchIndex: number,
    triggeredAt: Date,
    options: { manual: boolean },
  ): Promise<{
    status: WorkflowScheduleLastRunStatus;
    message: string;
    multiWorkflowRunId: Types.ObjectId | null;
    workflowRunId: Types.ObjectId | null;
  }> {
    const userId = String(schedule.userId);
    const total = Math.max(1, schedule.consecutiveRuns || 1);
    const isBatch = total > 1;
    const trigger = options.manual ? 'schedule_manual' : 'schedule';

    const batchPayload: ScheduleBatchPayload = {
      scheduleId: String(schedule._id),
      scheduleBatch: isBatch,
      batchIndex: isBatch ? batchIndex : undefined,
      batchTotal: isBatch ? total : undefined,
      trigger,
    };

    let multiWorkflowRunId: Types.ObjectId | null = null;
    let workflowRunId: Types.ObjectId | null = null;

    try {
      if (schedule.targetType === WorkflowScheduleTargetType.WORKFLOW) {
        if (!this.extensionPresence.isOnline(userId)) {
          return {
            status: WorkflowScheduleLastRunStatus.SKIPPED,
            message: isBatch
              ? `Extension offline — cannot start run ${batchIndex}/${total}.`
              : 'Extension offline — skipped single workflow run.',
            multiWorkflowRunId: null,
            workflowRunId: null,
          };
        }
        if (await this.hasActiveWorkflowRun(schedule.userId, schedule.workflowId!)) {
          return {
            status: WorkflowScheduleLastRunStatus.SKIPPED,
            message: isBatch
              ? `Single workflow busy — cannot start run ${batchIndex}/${total}.`
              : 'Single workflow is running — skipped this slot.',
            multiWorkflowRunId: null,
            workflowRunId: null,
          };
        }

        const run = await this.workflowRunsService.createForUser(userId, {
          workflowId: String(schedule.workflowId),
          payload: {
            ...(schedule.payload || {}),
            ...batchPayload,
          },
        });
        workflowRunId = new Types.ObjectId(String(run._id));

        if (isBatch) {
          await this.scheduleModel.updateOne(
            { _id: schedule._id },
            {
              $set: {
                lastRunMessage: `Running ${batchIndex}/${total}…`,
                lastRunAt: triggeredAt,
              },
            },
          );
        }

        return {
          status: WorkflowScheduleLastRunStatus.SUCCESS,
          message: isBatch
            ? `Started run ${batchIndex}/${total}.`
            : options.manual
              ? 'Triggered run now.'
              : 'Triggered by schedule.',
          multiWorkflowRunId: null,
          workflowRunId,
        };
      }

      if (await this.hasActiveMultiWorkflowRun(schedule.userId, schedule.multiWorkflowId!)) {
        return {
          status: WorkflowScheduleLastRunStatus.SKIPPED,
          message: isBatch
            ? `Multi workflow busy — cannot start run ${batchIndex}/${total}.`
            : 'Multi workflow is running — skipped this slot.',
          multiWorkflowRunId: null,
          workflowRunId: null,
        };
      }

      const run = await this.multiWorkflowsService.createRunForUser(userId, {
        multiWorkflowId: String(schedule.multiWorkflowId),
        trigger,
        payload: {
          ...(schedule.payload || {}),
          ...batchPayload,
        },
      });
      if (run?._id) {
        multiWorkflowRunId = new Types.ObjectId(String(run._id));
      }

      if (isBatch) {
        await this.scheduleModel.updateOne(
          { _id: schedule._id },
          {
            $set: {
              lastRunMessage: `Running ${batchIndex}/${total}…`,
              lastRunAt: triggeredAt,
            },
          },
        );
      }

      return {
        status: WorkflowScheduleLastRunStatus.SUCCESS,
        message: isBatch
          ? `Started run ${batchIndex}/${total}.`
          : this.extensionPresence.isOnline(userId)
            ? options.manual
              ? 'Triggered run now.'
              : 'Triggered by schedule.'
            : 'Queued — extension will run when online.',
        multiWorkflowRunId,
        workflowRunId: null,
      };
    } catch (error) {
      if (error instanceof ConflictException) {
        return {
          status: WorkflowScheduleLastRunStatus.SKIPPED,
          message: isBatch
            ? `Run conflict — cannot start run ${batchIndex}/${total}.`
            : 'Multi workflow is running — skipped this slot.',
          multiWorkflowRunId: null,
          workflowRunId: null,
        };
      }
      if (error instanceof ServiceUnavailableException) {
        return {
          status: WorkflowScheduleLastRunStatus.SKIPPED,
          message: String((error as ServiceUnavailableException).message || 'Extension not ready.'),
          multiWorkflowRunId: null,
          workflowRunId: null,
        };
      }
      throw error;
    }
  }

  private computeNextAfterExecution(schedule: ScheduleLean, from: Date): Date | null {
    if (schedule.scheduleKind === WorkflowScheduleKind.ONCE) {
      return null;
    }
    return computeNextRunAt(
      {
        scheduleKind: schedule.scheduleKind,
        runAt: schedule.runAt,
        timeOfDay: schedule.timeOfDay,
        daysOfWeek: schedule.daysOfWeek,
        timezone: schedule.timezone,
      },
      from,
    );
  }

  private async hasActiveWorkflowRun(userId: Types.ObjectId, workflowId: Types.ObjectId) {
    const exists = await this.workflowRunModel.exists({
      userId,
      workflowId,
      status: {
        $in: [WorkflowRunStatus.RUNNING, WorkflowRunStatus.QUEUED, WorkflowRunStatus.WAITING],
      },
    });
    return !!exists;
  }

  private async hasActiveMultiWorkflowRun(userId: Types.ObjectId, multiWorkflowId: Types.ObjectId) {
    const exists = await this.multiWorkflowRunModel.exists({
      userId,
      multiWorkflowId,
      status: { $in: [MultiWorkflowRunStatus.QUEUED, MultiWorkflowRunStatus.RUNNING] },
    });
    return !!exists;
  }
}

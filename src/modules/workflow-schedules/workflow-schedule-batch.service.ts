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

/** Dừng batch khi đủ số lần lỗi/skip liên tiếp (không reset giữa các lần thành công). */
const MAX_CONSECUTIVE_BATCH_FAILURES = 3;

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
            batchConsecutiveFailures: 0,
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
      await this.proceedBatchAfterSlot(String(schedule._id), 1, {
        type: 'skip',
        reason: result.message || 'Failed to start batch.',
        status: WorkflowScheduleLastRunStatus.SKIPPED,
      });
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

    if (batchIndex !== schedule.batchCompletedRuns + 1) {
      this.logger.warn(
        `Batch index mismatch schedule=${scheduleId} expected=${schedule.batchCompletedRuns + 1} got=${batchIndex}`,
      );
    }

    await this.proceedBatchAfterSlot(scheduleId, batchIndex, { type: 'success', refs });
  }

  private async handleBatchRunFailure(
    scheduleId: string,
    batchIndex: number,
    reason: string,
    refs: { multiWorkflowRunId?: Types.ObjectId; workflowRunId?: Types.ObjectId },
  ) {
    const schedule = await this.scheduleModel.findById(scheduleId).lean();
    if (!schedule || schedule.batchStatus !== WorkflowScheduleBatchStatus.RUNNING) return;

    await this.proceedBatchAfterSlot(scheduleId, batchIndex, {
      type: 'skip',
      reason,
      status: WorkflowScheduleLastRunStatus.FAILED,
      refs,
    });
  }

  /** Sau mỗi slot (thành công hoặc lỗi): ghi nhận và thử slot tiếp theo thay vì dừng batch. */
  private async proceedBatchAfterSlot(
    scheduleId: string,
    slotIndex: number,
    outcome:
      | { type: 'success'; refs?: { multiWorkflowRunId?: Types.ObjectId; workflowRunId?: Types.ObjectId } }
      | {
          type: 'skip';
          reason: string;
          status: WorkflowScheduleLastRunStatus.SKIPPED | WorkflowScheduleLastRunStatus.FAILED;
          refs?: { multiWorkflowRunId?: Types.ObjectId; workflowRunId?: Types.ObjectId };
        },
  ) {
    const schedule = await this.scheduleModel.findOne({
      _id: scheduleId,
      batchStatus: WorkflowScheduleBatchStatus.RUNNING,
    });
    if (!schedule) return;

    const total = Math.max(1, schedule.consecutiveRuns || 1);
    schedule.batchCompletedRuns = slotIndex;
    schedule.lastRunAt = new Date();

    if (outcome.type === 'success') {
      schedule.lastRunMessage = `Completed run ${slotIndex}/${total}.`;
      schedule.lastRunStatus = WorkflowScheduleLastRunStatus.SUCCESS;
      schedule.batchConsecutiveFailures = 0;
      await schedule.save();

      if (slotIndex >= total) {
        await this.completeBatch(schedule.toObject(), outcome.refs || {}, { hadSkips: false });
        return;
      }

      await this.spawnRemainingBatchSlots(schedule.toObject(), slotIndex + 1);
      return;
    }

    const skipMessage = `Skipped run ${slotIndex}/${total}: ${outcome.reason}`;
    schedule.lastRunMessage = skipMessage;
    if (schedule.lastRunStatus !== WorkflowScheduleLastRunStatus.SUCCESS) {
      schedule.lastRunStatus = outcome.status;
    }
    schedule.batchConsecutiveFailures = (schedule.batchConsecutiveFailures || 0) + 1;
    await schedule.save();

    await this.scheduleRunModel.create({
      scheduleId: schedule._id,
      userId: schedule.userId,
      triggeredAt: new Date(),
      status: outcome.status,
      targetType: schedule.targetType,
      multiWorkflowRunId: outcome.refs?.multiWorkflowRunId || null,
      workflowRunId: outcome.refs?.workflowRunId || null,
      message: skipMessage,
      batchIndex: slotIndex,
      batchTotal: total,
    });

    if (schedule.batchConsecutiveFailures >= MAX_CONSECUTIVE_BATCH_FAILURES) {
      await this.abortBatchAfterConsecutiveFailures(
        schedule.toObject(),
        slotIndex,
        total,
        outcome.reason,
        outcome.refs,
      );
      return;
    }

    if (slotIndex >= total) {
      await this.completeBatch(schedule.toObject(), outcome.refs || {}, { hadSkips: true });
      return;
    }

    await this.spawnRemainingBatchSlots(schedule.toObject(), slotIndex + 1);
  }

  /** Thử spawn một slot; không spawn được thì skip slot đó và chuyển tiếp qua `proceedBatchAfterSlot`. */
  private async spawnRemainingBatchSlots(schedule: ScheduleLean, startIndex: number) {
    const total = Math.max(1, schedule.consecutiveRuns || 1);
    const scheduleId = String(schedule._id);

    if (startIndex > total) {
      await this.completeBatch(schedule, {}, { hadSkips: true });
      return;
    }

    const current = await this.scheduleModel.findOne({
      _id: scheduleId,
      batchStatus: WorkflowScheduleBatchStatus.RUNNING,
    });
    if (!current) return;

    const result = await this.spawnBatchRun(current.toObject(), startIndex, new Date(), {
      manual: false,
    });
    if (result.status === WorkflowScheduleLastRunStatus.SUCCESS) {
      return;
    }

    await this.proceedBatchAfterSlot(scheduleId, startIndex, {
      type: 'skip',
      reason: result.message || `Cannot start run ${startIndex}/${total}.`,
      status: WorkflowScheduleLastRunStatus.SKIPPED,
    });
  }

  private async abortBatchAfterConsecutiveFailures(
    schedule: ScheduleLean,
    failedAtIndex: number,
    total: number,
    reason: string,
    refs?: { multiWorkflowRunId?: Types.ObjectId; workflowRunId?: Types.ObjectId },
  ) {
    const triggeredAt = schedule.batchStartedAt || new Date();
    const message = `Batch stopped: ${MAX_CONSECUTIVE_BATCH_FAILURES} consecutive failures at run ${failedAtIndex}/${total} — ${reason}`;
    const nextRunAt = this.computeNextAfterExecution(schedule, new Date());

    await this.scheduleModel.updateOne(
      { _id: schedule._id },
      {
        $set: {
          batchStatus: WorkflowScheduleBatchStatus.FAILED,
          batchConsecutiveFailures: 0,
          lastRunStatus: WorkflowScheduleLastRunStatus.FAILED,
          lastRunMessage: message,
          lastRunAt: new Date(),
          nextRunAt,
        },
      },
    );

    await this.scheduleRunModel.create({
      scheduleId: schedule._id,
      userId: schedule.userId,
      triggeredAt,
      status: WorkflowScheduleLastRunStatus.FAILED,
      targetType: schedule.targetType,
      multiWorkflowRunId: refs?.multiWorkflowRunId || null,
      workflowRunId: refs?.workflowRunId || null,
      message,
      batchIndex: failedAtIndex,
      batchTotal: total,
    });
  }

  private async completeBatch(
    schedule: ScheduleLean,
    refs: { multiWorkflowRunId?: Types.ObjectId; workflowRunId?: Types.ObjectId },
    options?: { hadSkips?: boolean },
  ) {
    const triggeredAt = schedule.batchStartedAt || new Date();
    const total = Math.max(1, schedule.consecutiveRuns || 1);
    const nextRunAt = this.computeNextAfterExecution(schedule, new Date());
    const hadSkips = options?.hadSkips === true;
    const hadSuccess = schedule.lastRunStatus === WorkflowScheduleLastRunStatus.SUCCESS;
    const finalStatus = hadSuccess
      ? WorkflowScheduleLastRunStatus.SUCCESS
      : hadSkips
        ? WorkflowScheduleLastRunStatus.SKIPPED
        : WorkflowScheduleLastRunStatus.SUCCESS;
    const finalMessage = hadSkips
      ? `Completed batch ${total}/${total} (some runs skipped on error).`
      : `Completed batch ${total}/${total}.`;

    await this.scheduleModel.updateOne(
      { _id: schedule._id },
      {
        $set: {
          batchStatus: WorkflowScheduleBatchStatus.COMPLETED,
          batchConsecutiveFailures: 0,
          lastRunStatus: finalStatus,
          lastRunMessage: finalMessage,
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
      status: finalStatus,
      targetType: schedule.targetType,
      multiWorkflowRunId: refs.multiWorkflowRunId || null,
      workflowRunId: refs.workflowRunId || null,
      message: finalMessage,
      batchIndex: total,
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

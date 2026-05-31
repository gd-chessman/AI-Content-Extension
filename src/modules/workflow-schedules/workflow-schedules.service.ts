import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { MultiWorkflow, MultiWorkflowDocument } from '../multi-workflows/multi-workflow.schema';
import {
  MultiWorkflowRun,
  MultiWorkflowRunDocument,
} from '../multi-workflows/multi-workflow-run.schema';
import { Workflow, WorkflowDocument, WorkflowPlatform, WorkflowStatus } from '../workflows/workflow.schema';
import {
  WorkflowScheduleRun,
  WorkflowScheduleRunDocument,
} from './workflow-schedule-run.schema';
import { WorkflowScheduleBatchService } from './workflow-schedule-batch.service';
import {
  computeNextRunAt,
  DEFAULT_SCHEDULE_TIMEZONE,
  formatScheduleSummary,
  normalizeDaysOfWeek,
  parseTimeOfDay,
} from './workflow-schedule-time.util';
import {
  WorkflowSchedule,
  WorkflowScheduleBatchStatus,
  WorkflowScheduleDocument,
  WorkflowScheduleKind,
  WorkflowScheduleTargetType,
} from './workflow-schedule.schema';
import {
  CreateWorkflowScheduleDto,
  ListWorkflowScheduleRunsQueryDto,
  UpdateWorkflowScheduleDto,
} from './workflow-schedules.dto';

type ScheduleLean = WorkflowSchedule & { _id: Types.ObjectId };

const MAX_CONSECUTIVE_RUNS = 100;

@Injectable()
export class WorkflowSchedulesService {
  private readonly logger = new Logger(WorkflowSchedulesService.name);

  constructor(
    @InjectModel(WorkflowSchedule.name)
    private readonly scheduleModel: Model<WorkflowScheduleDocument>,
    @InjectModel(WorkflowScheduleRun.name)
    private readonly scheduleRunModel: Model<WorkflowScheduleRunDocument>,
    @InjectModel(MultiWorkflow.name)
    private readonly multiWorkflowModel: Model<MultiWorkflowDocument>,
    @InjectModel(Workflow.name)
    private readonly workflowModel: Model<WorkflowDocument>,
    @InjectModel(MultiWorkflowRun.name)
    private readonly multiWorkflowRunModel: Model<MultiWorkflowRunDocument>,
    private readonly batchService: WorkflowScheduleBatchService,
  ) {}

  async listForUser(userId: string) {
    const userOid = this.normalizeObjectId(userId, 'Invalid user id.');
    const items = await this.scheduleModel.find({ userId: userOid }).sort({ createdAt: -1 }).lean();
    return Promise.all(items.map((item) => this.enrichSchedule(item)));
  }

  async getForUser(userId: string, id: string) {
    const schedule = await this.findOwnedSchedule(userId, id);
    return this.enrichSchedule(schedule);
  }

  async listRunsForUser(userId: string, scheduleId: string, query: ListWorkflowScheduleRunsQueryDto) {
    await this.findOwnedSchedule(userId, scheduleId);
    const userOid = this.normalizeObjectId(userId, 'Invalid user id.');
    const scheduleOid = this.normalizeObjectId(scheduleId, 'Invalid schedule id.');
    const limit = Math.min(Math.max(Number(query.limit) || 30, 1), 100);
    return this.scheduleRunModel
      .find({ userId: userOid, scheduleId: scheduleOid })
      .sort({ triggeredAt: -1 })
      .limit(limit)
      .lean();
  }

  async createForUser(userId: string, dto: CreateWorkflowScheduleDto) {
    const userOid = this.normalizeObjectId(userId, 'Invalid user id.');
    const normalized = this.normalizeScheduleInput(dto);
    await this.validateTarget(userOid, normalized.targetType, normalized.multiWorkflowId, normalized.workflowId);

    const nextRunAt = computeNextRunAt({
      scheduleKind: normalized.scheduleKind,
      runAt: normalized.runAt,
      timeOfDay: normalized.timeOfDay,
      daysOfWeek: normalized.daysOfWeek,
      timezone: normalized.timezone,
    });

    if (!nextRunAt && normalized.scheduleKind === WorkflowScheduleKind.ONCE) {
      throw new BadRequestException('One-time schedule must be in the future.');
    }

    const created = await this.scheduleModel.create({
      userId: userOid,
      name: normalized.name,
      enabled: normalized.enabled,
      targetType: normalized.targetType,
      multiWorkflowId: normalized.multiWorkflowId,
      workflowId: normalized.workflowId,
      scheduleKind: normalized.scheduleKind,
      runAt: normalized.runAt,
      timeOfDay: normalized.timeOfDay,
      daysOfWeek: normalized.daysOfWeek,
      timezone: normalized.timezone,
      payload: normalized.payload,
      consecutiveRuns: normalized.consecutiveRuns,
      nextRunAt,
      lastRunAt: null,
      lastRunStatus: null,
      lastRunMessage: '',
      batchCompletedRuns: 0,
      batchStatus: WorkflowScheduleBatchStatus.IDLE,
      batchStartedAt: null,
      lockedAt: null,
      lockExpiresAt: null,
    });

    return this.enrichSchedule(created.toObject());
  }

  async updateForUser(userId: string, id: string, dto: UpdateWorkflowScheduleDto) {
    const existing = await this.findOwnedScheduleDoc(userId, id);
    if (existing.batchStatus === WorkflowScheduleBatchStatus.RUNNING) {
      throw new BadRequestException('Cannot update schedule while batch is running.');
    }

    const merged = this.mergeScheduleInput(existing.toObject(), dto);
    await this.validateTarget(
      existing.userId,
      merged.targetType,
      merged.multiWorkflowId,
      merged.workflowId,
    );

    const nextRunAt = merged.enabled
      ? computeNextRunAt({
          scheduleKind: merged.scheduleKind,
          runAt: merged.runAt,
          timeOfDay: merged.timeOfDay,
          daysOfWeek: merged.daysOfWeek,
          timezone: merged.timezone,
        })
      : existing.nextRunAt;

    if (merged.enabled && merged.scheduleKind === WorkflowScheduleKind.ONCE && !nextRunAt) {
      throw new BadRequestException('One-time schedule must be in the future.');
    }

    existing.name = merged.name;
    existing.enabled = merged.enabled;
    existing.targetType = merged.targetType;
    existing.multiWorkflowId = merged.multiWorkflowId;
    existing.workflowId = merged.workflowId;
    existing.scheduleKind = merged.scheduleKind;
    existing.runAt = merged.runAt;
    existing.timeOfDay = merged.timeOfDay;
    existing.daysOfWeek = merged.daysOfWeek;
    existing.timezone = merged.timezone;
    existing.payload = merged.payload;
    existing.consecutiveRuns = merged.consecutiveRuns;
    existing.nextRunAt = nextRunAt;
    await existing.save();

    return this.enrichSchedule(existing.toObject());
  }

  async toggleForUser(userId: string, id: string, enabled: boolean) {
    const existing = await this.findOwnedScheduleDoc(userId, id);
    if (existing.batchStatus === WorkflowScheduleBatchStatus.RUNNING) {
      throw new BadRequestException('Cannot toggle schedule while batch is running.');
    }

    existing.enabled = enabled;
    if (enabled) {
      existing.nextRunAt = computeNextRunAt({
        scheduleKind: existing.scheduleKind,
        runAt: existing.runAt,
        timeOfDay: existing.timeOfDay,
        daysOfWeek: existing.daysOfWeek,
        timezone: existing.timezone,
      });
      if (existing.scheduleKind === WorkflowScheduleKind.ONCE && !existing.nextRunAt) {
        throw new BadRequestException('One-time schedule has passed — update runAt before enabling.');
      }
    }
    await existing.save();
    return this.enrichSchedule(existing.toObject());
  }

  async deleteForUser(userId: string, id: string) {
    const existing = await this.findOwnedScheduleDoc(userId, id);
    if (existing.batchStatus === WorkflowScheduleBatchStatus.RUNNING) {
      throw new BadRequestException('Cannot delete schedule while batch is running.');
    }
    await this.scheduleModel.deleteOne({ _id: existing._id });
    return { deleted: true, id: String(existing._id) };
  }

  async runNowForUser(userId: string, id: string) {
    const schedule = await this.findOwnedScheduleDoc(userId, id);
    await this.validateTarget(
      schedule.userId,
      schedule.targetType,
      schedule.multiWorkflowId,
      schedule.workflowId,
    );
    const refreshed = await this.batchService.triggerSchedule(schedule.toObject(), new Date(), {
      manual: true,
    });
    return refreshed ? this.enrichSchedule(refreshed as ScheduleLean) : null;
  }

  async tickDueSchedules() {
    const now = new Date();
    const due = await this.scheduleModel
      .find({
        enabled: true,
        nextRunAt: { $ne: null, $lte: now },
        batchStatus: { $ne: WorkflowScheduleBatchStatus.RUNNING },
        $or: [{ lockExpiresAt: null }, { lockExpiresAt: { $lte: now } }],
      })
      .sort({ nextRunAt: 1 })
      .limit(50)
      .lean();

    for (const item of due) {
      const claimed = await this.scheduleModel.findOneAndUpdate(
        {
          _id: item._id,
          enabled: true,
          nextRunAt: { $lte: now },
          batchStatus: { $ne: WorkflowScheduleBatchStatus.RUNNING },
          $or: [{ lockExpiresAt: null }, { lockExpiresAt: { $lte: now } }],
        },
        {
          $set: {
            lockedAt: now,
            lockExpiresAt: new Date(now.getTime() + 120_000),
          },
        },
        { new: true },
      );
      if (!claimed) continue;

      try {
        await this.validateTarget(
          claimed.userId,
          claimed.targetType,
          claimed.multiWorkflowId,
          claimed.workflowId,
        );
        await this.batchService.triggerSchedule(claimed.toObject(), now, { manual: false });
      } catch (error) {
        this.logger.error(`Schedule ${String(item._id)} tick failed`, error as Error);
      } finally {
        await this.scheduleModel.updateOne(
          { _id: item._id },
          { $set: { lockedAt: null, lockExpiresAt: null } },
        );
      }
    }
  }

  private async validateTarget(
    userId: Types.ObjectId,
    targetType: WorkflowScheduleTargetType,
    multiWorkflowId: Types.ObjectId | null,
    workflowId: Types.ObjectId | null,
  ) {
    if (targetType === WorkflowScheduleTargetType.MULTI_WORKFLOW) {
      if (!multiWorkflowId) {
        throw new BadRequestException('multiWorkflowId is required when targetType is multi_workflow.');
      }
      const found = await this.multiWorkflowModel.findOne({ _id: multiWorkflowId, userId }).lean();
      if (!found) throw new NotFoundException('Multi workflow not found.');
      const enabledCount = (found.items || []).filter((item) => item.enabled).length;
      if (!enabledCount) {
        throw new BadRequestException('Multi workflow has no enabled steps.');
      }
      return;
    }

    if (!workflowId) {
      throw new BadRequestException('workflowId is required when targetType is workflow.');
    }
    const found = await this.workflowModel
      .findOne({ _id: workflowId, status: WorkflowStatus.ACTIVE })
      .lean();
    if (!found) throw new NotFoundException('Workflow not found or not active.');
    if (found.platform === WorkflowPlatform.MULTI) {
      throw new BadRequestException('Cannot schedule workflow with platform multi.');
    }
  }

  private normalizeScheduleInput(dto: CreateWorkflowScheduleDto) {
    const name = (dto.name || '').trim();
    if (!name) throw new BadRequestException('name is required.');

    const targetType = this.normalizeTargetType(dto.targetType);
    const scheduleKind = this.normalizeScheduleKind(dto.scheduleKind);
    const timezone = (dto.timezone || DEFAULT_SCHEDULE_TIMEZONE).trim() || DEFAULT_SCHEDULE_TIMEZONE;
    const consecutiveRuns = this.normalizeConsecutiveRuns(dto.consecutiveRuns);

    let multiWorkflowId: Types.ObjectId | null = null;
    let workflowId: Types.ObjectId | null = null;

    if (targetType === WorkflowScheduleTargetType.MULTI_WORKFLOW) {
      if (!dto.multiWorkflowId?.trim()) {
        throw new BadRequestException('Select one multi workflow.');
      }
      if (dto.workflowId?.trim()) {
        throw new BadRequestException('Select either multi workflow or workflow, not both.');
      }
      multiWorkflowId = this.normalizeObjectId(dto.multiWorkflowId, 'Invalid multiWorkflowId.');
    } else {
      if (!dto.workflowId?.trim()) {
        throw new BadRequestException('Select one workflow.');
      }
      if (dto.multiWorkflowId?.trim()) {
        throw new BadRequestException('Select either multi workflow or workflow, not both.');
      }
      workflowId = this.normalizeObjectId(dto.workflowId, 'Invalid workflowId.');
    }

    const runAt = this.normalizeRunAt(dto.runAt, scheduleKind);

    let timeOfDayStr = '';
    if (scheduleKind !== WorkflowScheduleKind.ONCE) {
      const parsed = parseTimeOfDay(dto.timeOfDay || '');
      timeOfDayStr = `${String(parsed.hour).padStart(2, '0')}:${String(parsed.minute).padStart(2, '0')}`;
    }

    const daysOfWeek =
      scheduleKind === WorkflowScheduleKind.WEEKLY
        ? normalizeDaysOfWeek(dto.daysOfWeek)
        : [];

    if (scheduleKind === WorkflowScheduleKind.WEEKLY && !daysOfWeek.length) {
      throw new BadRequestException('Select at least one day of the week.');
    }

    return {
      name,
      enabled: dto.enabled !== false,
      targetType,
      multiWorkflowId,
      workflowId,
      scheduleKind,
      runAt,
      timeOfDay: timeOfDayStr,
      daysOfWeek,
      timezone,
      payload: dto.payload && typeof dto.payload === 'object' ? dto.payload : {},
      consecutiveRuns,
    };
  }

  private mergeScheduleInput(existing: ScheduleLean, dto: UpdateWorkflowScheduleDto) {
    return this.normalizeScheduleInput({
      name: dto.name ?? existing.name,
      enabled: dto.enabled ?? existing.enabled,
      targetType: dto.targetType ?? existing.targetType,
      multiWorkflowId:
        dto.multiWorkflowId ??
        (existing.multiWorkflowId ? String(existing.multiWorkflowId) : undefined),
      workflowId: dto.workflowId ?? (existing.workflowId ? String(existing.workflowId) : undefined),
      scheduleKind: dto.scheduleKind ?? existing.scheduleKind,
      runAt: dto.runAt ?? (existing.runAt ? existing.runAt.toISOString() : undefined),
      timeOfDay: dto.timeOfDay ?? existing.timeOfDay,
      daysOfWeek: dto.daysOfWeek ?? existing.daysOfWeek,
      timezone: dto.timezone ?? existing.timezone,
      payload: dto.payload ?? existing.payload,
      consecutiveRuns: dto.consecutiveRuns ?? existing.consecutiveRuns,
    });
  }

  private normalizeConsecutiveRuns(raw?: number) {
    const value = raw === undefined || raw === null ? 1 : Math.floor(Number(raw));
    if (!Number.isFinite(value) || value < 1) {
      throw new BadRequestException('consecutiveRuns must be >= 1.');
    }
    if (value > MAX_CONSECUTIVE_RUNS) {
      throw new BadRequestException(`consecutiveRuns max is ${MAX_CONSECUTIVE_RUNS}.`);
    }
    return value;
  }

  private normalizeRunAt(raw: string | undefined, scheduleKind: WorkflowScheduleKind): Date | null {
    if (scheduleKind !== WorkflowScheduleKind.ONCE) return null;
    if (!raw?.trim()) throw new BadRequestException('runAt is required for one-time schedule.');
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) throw new BadRequestException('Invalid runAt.');
    return date;
  }

  private normalizeTargetType(raw: WorkflowScheduleTargetType | string): WorkflowScheduleTargetType {
    const value = String(raw || '').trim() as WorkflowScheduleTargetType;
    if (!Object.values(WorkflowScheduleTargetType).includes(value)) {
      throw new BadRequestException('Invalid targetType.');
    }
    return value;
  }

  private normalizeScheduleKind(raw: WorkflowScheduleKind | string): WorkflowScheduleKind {
    const value = String(raw || '').trim() as WorkflowScheduleKind;
    if (!Object.values(WorkflowScheduleKind).includes(value)) {
      throw new BadRequestException('Invalid scheduleKind.');
    }
    return value;
  }

  private async enrichSchedule(schedule: ScheduleLean) {
    let targetName = '';
    if (schedule.targetType === WorkflowScheduleTargetType.MULTI_WORKFLOW && schedule.multiWorkflowId) {
      const mw = await this.multiWorkflowModel
        .findById(schedule.multiWorkflowId)
        .select('name')
        .lean();
      targetName = mw?.name || '';
    } else if (schedule.workflowId) {
      const wf = await this.workflowModel.findById(schedule.workflowId).select('name platform').lean();
      targetName = wf?.name || '';
    }

    const consecutiveRuns = Math.max(1, schedule.consecutiveRuns || 1);
    let batchProgressLabel = '';
    if (consecutiveRuns > 1) {
      if (schedule.batchStatus === WorkflowScheduleBatchStatus.RUNNING) {
        batchProgressLabel = ` · Batch ${schedule.batchCompletedRuns}/${consecutiveRuns} (running)`;
      } else if (schedule.batchStatus === WorkflowScheduleBatchStatus.FAILED) {
        batchProgressLabel = ` · Batch stopped at ${schedule.batchCompletedRuns}/${consecutiveRuns}`;
      } else if (schedule.batchStatus === WorkflowScheduleBatchStatus.COMPLETED) {
        batchProgressLabel = ` · Batch ${consecutiveRuns}/${consecutiveRuns} done`;
      } else {
        batchProgressLabel = ` · ${consecutiveRuns} consecutive runs per trigger`;
      }
    }

    return {
      ...schedule,
      targetName,
      scheduleSummary:
        formatScheduleSummary({
          scheduleKind: schedule.scheduleKind,
          runAt: schedule.runAt,
          timeOfDay: schedule.timeOfDay,
          daysOfWeek: schedule.daysOfWeek,
          timezone: schedule.timezone,
        }) + batchProgressLabel,
    };
  }

  private async findOwnedSchedule(userId: string, id: string) {
    const found = await this.scheduleModel
      .findOne({
        _id: this.normalizeObjectId(id, 'Invalid schedule id.'),
        userId: this.normalizeObjectId(userId, 'Invalid user id.'),
      })
      .lean();
    if (!found) throw new NotFoundException('Workflow schedule not found.');
    return found;
  }

  private async findOwnedScheduleDoc(userId: string, id: string) {
    const found = await this.scheduleModel.findOne({
      _id: this.normalizeObjectId(id, 'Invalid schedule id.'),
      userId: this.normalizeObjectId(userId, 'Invalid user id.'),
    });
    if (!found) throw new NotFoundException('Workflow schedule not found.');
    return found;
  }

  private normalizeObjectId(raw: string, message: string): Types.ObjectId {
    const value = (raw || '').trim();
    if (!Types.ObjectId.isValid(value)) throw new BadRequestException(message);
    return new Types.ObjectId(value);
  }
}

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type WorkflowScheduleDocument = HydratedDocument<WorkflowSchedule>;

export enum WorkflowScheduleTargetType {
  MULTI_WORKFLOW = 'multi_workflow',
  WORKFLOW = 'workflow',
}

export enum WorkflowScheduleKind {
  ONCE = 'once',
  DAILY = 'daily',
  WEEKLY = 'weekly',
}

export enum WorkflowScheduleLastRunStatus {
  SUCCESS = 'success',
  SKIPPED = 'skipped',
  FAILED = 'failed',
}

export enum WorkflowScheduleBatchStatus {
  IDLE = 'idle',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Schema({ timestamps: true, collection: 'workflow_schedules' })
export class WorkflowSchedule {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ default: true, index: true })
  enabled: boolean;

  @Prop({ required: true, enum: Object.values(WorkflowScheduleTargetType), index: true })
  targetType: WorkflowScheduleTargetType;

  @Prop({ type: Types.ObjectId, default: null })
  multiWorkflowId: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, default: null })
  workflowId: Types.ObjectId | null;

  @Prop({ required: true, enum: Object.values(WorkflowScheduleKind) })
  scheduleKind: WorkflowScheduleKind;

  @Prop({ default: null })
  runAt: Date | null;

  @Prop({ default: '', trim: true })
  timeOfDay: string;

  @Prop({ type: [Number], default: [] })
  daysOfWeek: number[];

  @Prop({ default: 'Asia/Ho_Chi_Minh', trim: true })
  timezone: string;

  @Prop({ default: null, index: true })
  nextRunAt: Date | null;

  @Prop({ default: null })
  lastRunAt: Date | null;

  @Prop({ enum: Object.values(WorkflowScheduleLastRunStatus), default: null })
  lastRunStatus: WorkflowScheduleLastRunStatus | null;

  @Prop({ default: '', trim: true })
  lastRunMessage: string;

  @Prop({ type: Object, default: {} })
  payload: Record<string, unknown>;

  @Prop({ default: null })
  lockedAt: Date | null;

  @Prop({ default: null })
  lockExpiresAt: Date | null;

  /** Số lần chạy liên tiếp mỗi lần lịch kích hoạt (1 = như cũ). */
  @Prop({ default: 1, min: 1, max: 100 })
  consecutiveRuns: number;

  @Prop({ default: 0, min: 0 })
  batchCompletedRuns: number;

  /** Lỗi/skip liên tiếp trong batch hiện tại — reset khi một lần chạy thành công. */
  @Prop({ default: 0, min: 0 })
  batchConsecutiveFailures: number;

  @Prop({
    default: WorkflowScheduleBatchStatus.IDLE,
    enum: Object.values(WorkflowScheduleBatchStatus),
    index: true,
  })
  batchStatus: WorkflowScheduleBatchStatus;

  @Prop({ default: null })
  batchStartedAt: Date | null;
}

export const WorkflowScheduleSchema = SchemaFactory.createForClass(WorkflowSchedule);
WorkflowScheduleSchema.index({ enabled: 1, nextRunAt: 1 });
WorkflowScheduleSchema.index({ userId: 1, createdAt: -1 });

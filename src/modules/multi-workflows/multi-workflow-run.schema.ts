import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { WorkflowPlatform } from '../workflows/workflow.schema';

export type MultiWorkflowRunDocument = HydratedDocument<MultiWorkflowRun>;

export enum MultiWorkflowRunStatus {
  QUEUED = 'queued',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum MultiWorkflowRunItemStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  SKIPPED = 'skipped',
}

@Schema({ _id: false })
export class MultiWorkflowRunItem {
  @Prop({ required: true, min: 1 })
  order: number;

  @Prop({ type: Types.ObjectId, required: true })
  workflowId: Types.ObjectId;

  @Prop({ required: true, enum: Object.values(WorkflowPlatform) })
  platform: WorkflowPlatform;

  @Prop({ default: true })
  enabled: boolean;

  @Prop({
    default: MultiWorkflowRunItemStatus.PENDING,
    enum: Object.values(MultiWorkflowRunItemStatus),
  })
  status: MultiWorkflowRunItemStatus;

  @Prop({ type: Types.ObjectId, default: null })
  multiWorkflowJobId: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, default: null })
  workflowRunId: Types.ObjectId | null;
}

export const MultiWorkflowRunItemSchema = SchemaFactory.createForClass(MultiWorkflowRunItem);

@Schema({ timestamps: true, collection: 'multi_workflow_runs' })
export class MultiWorkflowRun {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  multiWorkflowId: Types.ObjectId;

  /** Gom các job cùng một reel — thường là videoSourceId. */
  @Prop({ required: true, trim: true, index: true })
  multiWorkflowKey: string;

  /** Điền sau khi bước Facebook lưu reel — không bắt buộc lúc khởi chạy. */
  @Prop({ type: Types.ObjectId, default: null, index: true })
  videoSourceId: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, default: null })
  videoShortId: Types.ObjectId | null;

  @Prop({
    default: MultiWorkflowRunStatus.QUEUED,
    enum: Object.values(MultiWorkflowRunStatus),
    index: true,
  })
  status: MultiWorkflowRunStatus;

  @Prop({ default: 0, min: 0 })
  currentOrder: number;

  @Prop({ type: [MultiWorkflowRunItemSchema], default: [] })
  items: MultiWorkflowRunItem[];

  @Prop({ type: Object, default: {} })
  payload: Record<string, unknown>;

  @Prop({ default: null })
  startedAt: Date | null;

  @Prop({ default: null })
  finishedAt: Date | null;
}

export const MultiWorkflowRunSchema = SchemaFactory.createForClass(MultiWorkflowRun);
MultiWorkflowRunSchema.index({ userId: 1, createdAt: -1 });
MultiWorkflowRunSchema.index({ userId: 1, multiWorkflowKey: 1, status: 1 });

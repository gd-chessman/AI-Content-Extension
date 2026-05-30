import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { WorkflowPlatform } from '../workflows/workflow.schema';

export type MultiWorkflowJobDocument = HydratedDocument<MultiWorkflowJob>;

export enum MultiWorkflowJobStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  SKIPPED = 'skipped',
}

@Schema({ timestamps: true, collection: 'multi_workflow_jobs' })
export class MultiWorkflowJob {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  multiWorkflowRunId: Types.ObjectId;

  @Prop({ required: true, trim: true, index: true })
  multiWorkflowKey: string;

  @Prop({ type: Types.ObjectId, required: true })
  workflowId: Types.ObjectId;

  @Prop({ required: true, enum: Object.values(WorkflowPlatform), index: true })
  platform: WorkflowPlatform;

  @Prop({ required: true, min: 1 })
  order: number;

  @Prop({
    default: MultiWorkflowJobStatus.PENDING,
    enum: Object.values(MultiWorkflowJobStatus),
    index: true,
  })
  status: MultiWorkflowJobStatus;

  @Prop({ default: 0, min: 0 })
  attempts: number;

  @Prop({ default: 3, min: 1 })
  maxAttempts: number;

  @Prop({ type: Types.ObjectId, default: null })
  workflowRunId: Types.ObjectId | null;

  @Prop({ type: Object, default: {} })
  payload: Record<string, unknown>;

  @Prop({ type: Object, default: {} })
  result: Record<string, unknown>;

  @Prop({
    type: {
      code: { type: String, default: '' },
      message: { type: String, default: '' },
      details: { type: Object, default: {} },
    },
    default: {},
  })
  lastError: {
    code?: string;
    message?: string;
    details?: Record<string, unknown>;
  };

  @Prop({ default: null })
  lockedAt: Date | null;

  @Prop({ default: '', trim: true })
  lockedBy: string;

  @Prop({ default: null })
  lockExpiresAt: Date | null;

  @Prop({ default: null })
  nextRetryAt: Date | null;

  @Prop({ default: null })
  startedAt: Date | null;

  @Prop({ default: null })
  finishedAt: Date | null;
}

export const MultiWorkflowJobSchema = SchemaFactory.createForClass(MultiWorkflowJob);
MultiWorkflowJobSchema.index({ multiWorkflowRunId: 1, order: 1 }, { unique: true });
MultiWorkflowJobSchema.index({ userId: 1, platform: 1, status: 1, order: 1, createdAt: 1 });

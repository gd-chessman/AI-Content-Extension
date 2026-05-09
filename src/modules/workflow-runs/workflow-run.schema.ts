import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type WorkflowRunDocument = HydratedDocument<WorkflowRun>;

export enum WorkflowRunStatus {
  QUEUED = 'queued',
  RUNNING = 'running',
  WAITING = 'waiting',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

@Schema({ timestamps: true })
export class WorkflowRun {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  workflowId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId: Types.ObjectId;

  @Prop({
    default: WorkflowRunStatus.QUEUED,
    enum: Object.values(WorkflowRunStatus),
    index: true,
  })
  status: WorkflowRunStatus;

  @Prop({ default: 0, min: 0 })
  progress: number;

  @Prop({ default: 0, min: 0 })
  currentStepNo: number;

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
  error: {
    code?: string;
    message?: string;
    details?: Record<string, unknown>;
  };

  @Prop({ default: 0, min: 0 })
  attempt: number;

  @Prop({ default: null })
  startedAt: Date | null;

  @Prop({ default: null })
  finishedAt: Date | null;
}

export const WorkflowRunSchema = SchemaFactory.createForClass(WorkflowRun);
WorkflowRunSchema.index({ userId: 1, createdAt: -1 });
WorkflowRunSchema.index({ workflowId: 1, createdAt: -1 });
WorkflowRunSchema.index({ status: 1, updatedAt: -1 });

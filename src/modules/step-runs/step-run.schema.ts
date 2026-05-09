import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type StepRunDocument = HydratedDocument<StepRun>;

export enum StepRunStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  SKIPPED = 'skipped',
}

@Schema({ timestamps: true })
export class StepRun {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  workflowRunId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  stepId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  workflowId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, min: 1 })
  stepNo: number;

  @Prop({ required: true, trim: true })
  stepTitle: string;

  @Prop({
    default: StepRunStatus.PENDING,
    enum: Object.values(StepRunStatus),
    index: true,
  })
  status: StepRunStatus;

  @Prop({ type: Object, default: {} })
  input: Record<string, unknown>;

  @Prop({ type: Object, default: {} })
  output: Record<string, unknown>;

  @Prop({
    type: {
      message: { type: String, default: '' },
      details: { type: Object, default: {} },
    },
    default: {},
  })
  error: {
    message?: string;
    details?: Record<string, unknown>;
  };

  @Prop({ default: null })
  startedAt: Date | null;

  @Prop({ default: null })
  finishedAt: Date | null;
}

export const StepRunSchema = SchemaFactory.createForClass(StepRun);
StepRunSchema.index({ workflowRunId: 1, stepNo: 1 }, { unique: true });
StepRunSchema.index({ workflowRunId: 1, createdAt: 1 });
StepRunSchema.index({ userId: 1, createdAt: -1 });

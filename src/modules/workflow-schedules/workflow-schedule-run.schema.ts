import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { WorkflowScheduleLastRunStatus, WorkflowScheduleTargetType } from './workflow-schedule.schema';

export type WorkflowScheduleRunDocument = HydratedDocument<WorkflowScheduleRun>;

@Schema({ timestamps: true, collection: 'workflow_schedule_runs' })
export class WorkflowScheduleRun {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  scheduleId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  triggeredAt: Date;

  @Prop({ required: true, enum: Object.values(WorkflowScheduleLastRunStatus) })
  status: WorkflowScheduleLastRunStatus;

  @Prop({ required: true, enum: Object.values(WorkflowScheduleTargetType) })
  targetType: WorkflowScheduleTargetType;

  @Prop({ type: Types.ObjectId, default: null })
  multiWorkflowRunId: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, default: null })
  workflowRunId: Types.ObjectId | null;

  @Prop({ default: '', trim: true })
  message: string;

  @Prop({ default: null, min: 1 })
  batchIndex: number | null;

  @Prop({ default: null, min: 1 })
  batchTotal: number | null;
}

export const WorkflowScheduleRunSchema = SchemaFactory.createForClass(WorkflowScheduleRun);
WorkflowScheduleRunSchema.index({ scheduleId: 1, triggeredAt: -1 });

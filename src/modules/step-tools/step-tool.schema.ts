import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Step } from '../steps/step.schema';
import { Tool } from '../tools/tool.schema';

export type StepToolDocument = HydratedDocument<StepTool>;

/** MongoDB collection: `steptools` (Mongoose pluralize mặc định từ `StepTool`). */
@Schema({ timestamps: true })
export class StepTool {
  @Prop({ type: Types.ObjectId, ref: Step.name, required: true, index: true })
  stepId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: Tool.name, required: true, index: true })
  toolId: Types.ObjectId;

  @Prop({ default: 0 })
  sortOrder: number;

  /** Ghi đè `defaultConfig` của Tool cho riêng step này. */
  @Prop({ type: Object, default: {} })
  config: Record<string, unknown>;

  @Prop({ default: true, index: true })
  isActive: boolean;
}

export const StepToolSchema = SchemaFactory.createForClass(StepTool);
StepToolSchema.index({ stepId: 1, toolId: 1 }, { unique: true });
StepToolSchema.index({ stepId: 1, isActive: 1, sortOrder: 1 });

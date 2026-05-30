import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { WorkflowPlatform } from '../workflows/workflow.schema';

export type MultiWorkflowDocument = HydratedDocument<MultiWorkflow>;

@Schema({ _id: false })
export class MultiWorkflowItem {
  @Prop({ required: true, min: 1 })
  order: number;

  @Prop({ type: Types.ObjectId, required: true })
  workflowId: Types.ObjectId;

  @Prop({ required: true, enum: Object.values(WorkflowPlatform) })
  platform: WorkflowPlatform;

  @Prop({ default: true })
  enabled: boolean;
}

export const MultiWorkflowItemSchema = SchemaFactory.createForClass(MultiWorkflowItem);

@Schema({ timestamps: true, collection: 'multi_workflows' })
export class MultiWorkflow {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ default: 'Multi workflow mặc định', trim: true })
  name: string;

  @Prop({ default: true, index: true })
  isDefault: boolean;

  @Prop({ type: [MultiWorkflowItemSchema], default: [] })
  items: MultiWorkflowItem[];
}

export const MultiWorkflowSchema = SchemaFactory.createForClass(MultiWorkflow);
MultiWorkflowSchema.index({ userId: 1, isDefault: 1 });

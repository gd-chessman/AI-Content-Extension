import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type StepDocument = HydratedDocument<Step>;

export enum StepActionType {
  CUSTOM = 'custom',
  EXTRACT_CONTENT = 'extract_content',
  EXTRACT_VIDEO_1 = 'extract_video_1',
  EXTRACT_VIDEO_2 = 'extract_video_2',
  EXTRACT_IMAGE_1 = 'extract_image_1',
  EXTRACT_IMAGE_2 = 'extract_image_2',
  REWRITE_CONTENT = 'rewrite_content',
  TRANSLATE_CONTENT = 'translate_content',
  GENERATE_IMAGE = 'generate_image',
  GENERATE_VIDEO = 'generate_video',
  FILL_CHATGPT = 'fill_chatgpt',
  FILL_GROK = 'fill_grok',
  COPY_TO_CLIPBOARD = 'copy_to_clipboard',
  PUSH_GGSHEET = 'push_ggsheet',
  EXTRACT_GGSHEET_ROW = 'extract_ggsheet_row',
  DELAY = 'delay',
  CONDITION = 'condition',
  WEBHOOK = 'webhook',
}

@Schema({ timestamps: true })
export class Step {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  workflowId: Types.ObjectId;

  @Prop({ required: true, min: 1 })
  stepNo: number;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: true, trim: true })
  instruction: string;

  @Prop({ default: '', trim: true })
  prompt: string;

  @Prop({
    default: StepActionType.CUSTOM,
    enum: Object.values(StepActionType),
    trim: true,
    index: true,
  })
  actionType: StepActionType;

  @Prop({ type: Object, default: {} })
  inputSchema: Record<string, unknown>;

  @Prop({ type: Object, default: {} })
  outputSchema: Record<string, unknown>;

  @Prop({ default: true })
  isActive: boolean;
}

export const StepSchema = SchemaFactory.createForClass(Step);
StepSchema.index({ workflowId: 1, stepNo: 1 }, { unique: true });
StepSchema.index({ workflowId: 1, isActive: 1, stepNo: 1 });

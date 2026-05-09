import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type WorkflowDocument = HydratedDocument<Workflow>;

export enum WorkflowStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  ARCHIVED = 'archived',
}

export enum WorkflowPlatform {
  CHATGPT = 'chatgpt',
  GROK = 'grok',
  FACEBOOK = 'facebook',
  WEBBLOG = 'webblog',
  GGSHEET = 'ggsheet',
  MULTI = 'multi',
}

export enum WorkflowCategory {
  CONTENT_PIPELINE = 'content_pipeline',
  EXTRACTION = 'extraction',
  GENERATION = 'generation',
  AI_VIDEO_CREATION = 'ai_video_creation',
  DISTRIBUTION = 'distribution',
  AUTOMATION = 'automation',
  OTHER = 'other',
}

@Schema({ timestamps: true })
export class Workflow {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ default: '', trim: true })
  description: string;

  @Prop({ default: 1, min: 1 })
  version: number;

  @Prop({ default: WorkflowStatus.DRAFT, enum: Object.values(WorkflowStatus), index: true })
  status: WorkflowStatus;

  @Prop({
    default: WorkflowPlatform.MULTI,
    enum: Object.values(WorkflowPlatform),
    index: true,
  })
  platform: WorkflowPlatform;

  @Prop({
    default: WorkflowCategory.OTHER,
    enum: Object.values(WorkflowCategory),
    index: true,
  })
  category: WorkflowCategory;

  @Prop({ type: Types.ObjectId, required: false, index: true })
  ownerUserId?: Types.ObjectId;
}

export const WorkflowSchema = SchemaFactory.createForClass(Workflow);

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type StoryTopicDocument = HydratedDocument<StoryTopic>;

/** Danh mục chủ đề cho Story (có thể gắn user hoặc dùng chung). */
@Schema({ timestamps: true })
export class StoryTopic {
  @Prop({ type: Types.ObjectId, required: false, index: true })
  userId?: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ default: '', trim: true })
  description: string;

  @Prop({ default: true, index: true })
  isActive: boolean;
}

export const StoryTopicSchema = SchemaFactory.createForClass(StoryTopic);
StoryTopicSchema.index({ userId: 1, name: 1 });
StoryTopicSchema.index({ userId: 1, createdAt: -1 });

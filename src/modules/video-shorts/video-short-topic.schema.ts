import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type VideoShortTopicDocument = HydratedDocument<VideoShortTopic>;

/** Danh mục chủ đề cho VideoShort (có thể gắn user hoặc dùng chung). */
@Schema({ timestamps: true, collection: 'video_short_topics' })
export class VideoShortTopic {
  @Prop({ type: Types.ObjectId, required: false, index: true })
  userId?: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ default: '', trim: true })
  description: string;

  @Prop({ default: true, index: true })
  isActive: boolean;
}

export const VideoShortTopicSchema = SchemaFactory.createForClass(VideoShortTopic);
VideoShortTopicSchema.index({ userId: 1, name: 1 });
VideoShortTopicSchema.index({ userId: 1, createdAt: -1 });

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type VideoSourceDocument = HydratedDocument<VideoSource>;

/** Bản ghi nguồn video (reel / URL) — một nguồn có thể sinh nhiều VideoShort qua videoSourceId. */
@Schema({ timestamps: true, collection: 'video_sources' })
export class VideoSource {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId: Types.ObjectId;

  /** URL reel/video đã chuẩn hoá. */
  @Prop({ required: true, trim: true })
  sourceReelUrl: string;

  @Prop({ default: '', trim: true })
  name: string;

  /** Caption/script lần lấy gần nhất từ nguồn. */
  @Prop({ default: '', trim: true })
  sourceContent: string;

  /** Lượt ghi nhận trên nguồn này — dùng chung cho mọi VideoShort cùng nguồn. */
  @Prop({ default: 0 })
  usageCount: number;

  /** Nguồn bị bỏ qua vĩnh viễn (vd. caption timeout). */
  @Prop({ default: '', trim: true, index: true })
  skipReason: string;
}

export const VideoSourceSchema = SchemaFactory.createForClass(VideoSource);
VideoSourceSchema.index({ userId: 1, createdAt: -1 });
VideoSourceSchema.index(
  { userId: 1, sourceReelUrl: 1 },
  {
    unique: true,
    partialFilterExpression: { sourceReelUrl: { $gt: '' } },
  },
);

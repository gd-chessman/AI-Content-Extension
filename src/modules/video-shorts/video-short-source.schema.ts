import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type VideoShortSourceDocument = HydratedDocument<VideoShortSource>;

/** Bản ghi "nguồn" theo reel — một reel có thể sinh nhiều VideoShort; VideoShort liên kết qua videoShortSourceId. */
@Schema({ timestamps: true, collection: 'video_short_sources' })
export class VideoShortSource {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId: Types.ObjectId;

  /** URL reel đã chuẩn hoá (một nguồn — nhiều VideoShort qua videoShortSourceId). */
  @Prop({ required: true, trim: true })
  sourceReelUrl: string;

  @Prop({ default: '', trim: true })
  name: string;

  /** Nội dung caption/script lần lấy gần nhất từ reel. */
  @Prop({ default: '', trim: true })
  sourceContent: string;

  /** Lượt ghi nhận (copy/vận hành) trên reel nguồn này — dùng chung cho mọi VideoShort cùng nguồn. */
  @Prop({ default: 0 })
  usageCount: number;

  /** Reel bị bỏ qua vĩnh viễn (vd. caption timeout) — không chọn lại trong workflow. */
  @Prop({ default: '', trim: true, index: true })
  skipReason: string;
}

export const VideoShortSourceSchema = SchemaFactory.createForClass(VideoShortSource);
VideoShortSourceSchema.index({ userId: 1, createdAt: -1 });
VideoShortSourceSchema.index(
  { userId: 1, sourceReelUrl: 1 },
  {
    unique: true,
    partialFilterExpression: { sourceReelUrl: { $gt: '' } },
  },
);

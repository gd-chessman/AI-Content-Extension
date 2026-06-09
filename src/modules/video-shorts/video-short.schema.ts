import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type VideoShortDocument = HydratedDocument<VideoShort>;

@Schema({ timestamps: true, collection: 'video_shorts' })
export class VideoShort {
  @Prop({ type: Types.ObjectId, required: false, index: true })
  userId?: Types.ObjectId;

  /** Tham chiếu chủ đề (VideoShortTopic) */
  @Prop({ type: Types.ObjectId, ref: 'VideoShortTopic', required: false, index: true })
  videoShortTopicId?: Types.ObjectId;

  /** Nguồn reel (caption đồng bộ); nhiều VideoShort có thể trỏ cùng một VideoShortSource. */
  @Prop({ type: Types.ObjectId, ref: 'VideoShortSource', required: false, index: true })
  videoShortSourceId?: Types.ObjectId;

  @Prop({ default: '', trim: true })
  name: string;

  @Prop({ default: '', trim: true })
  shortContent: string;

  @Prop({ default: '', trim: true })
  longContent: string;

  /** Link bài viết blog đã đăng */
  @Prop({ default: '', trim: true })
  blogPostUrl: string;

  /** Link bài Facebook Reel đã đăng */
  @Prop({ default: '', trim: true })
  fbReelUrl: string;

  /** Địa chỉ lưu ảnh (path nội bộ hoặc URL lưu trữ, có thể nhiều) */
  @Prop({ type: [String], default: [] })
  imageStorageAddresses: string[];

  /** URL ảnh (có thể nhiều) */
  @Prop({ type: [String], default: [] })
  imageUrls: string[];

  /** Prompt tạo video (có thể nhiều) */
  @Prop({ type: [String], default: [] })
  videoPrompts: string[];

  /** Địa chỉ lưu video (URL/path, có thể nhiều) */
  @Prop({ type: [String], default: [] })
  videoStorageAddresses: string[];
}

export const VideoShortSchema = SchemaFactory.createForClass(VideoShort);
VideoShortSchema.index({ userId: 1, createdAt: -1 });
VideoShortSchema.index({ videoShortTopicId: 1, createdAt: -1 });
VideoShortSchema.index({ userId: 1, videoShortSourceId: 1, createdAt: -1 });

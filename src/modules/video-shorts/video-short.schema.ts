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

  /** Nguồn video (reel); nhiều VideoShort có thể trỏ cùng một VideoSource. */
  @Prop({ type: Types.ObjectId, ref: 'VideoSource', required: false, index: true })
  videoSourceId?: Types.ObjectId;

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
VideoShortSchema.index({ userId: 1, videoSourceId: 1, createdAt: -1 });

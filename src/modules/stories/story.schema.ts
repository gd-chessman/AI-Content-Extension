import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type StoryDocument = HydratedDocument<Story>;

@Schema({ timestamps: true })
export class Story {
  @Prop({ type: Types.ObjectId, required: false, index: true })
  userId?: Types.ObjectId;

  @Prop({ default: '', trim: true })
  name: string;

  @Prop({ default: '', trim: true })
  shortContent: string;

  @Prop({ default: '', trim: true })
  longContent: string;

  /** Nội dung gốc / nguồn (copy từ reel, chat, v.v.) */
  @Prop({ default: '', trim: true })
  sourceContent: string;

  /** Địa chỉ URL reel nguồn (Facebook hoặc nơi lấy nội dung) */
  @Prop({ default: '', trim: true })
  sourceReelUrl: string;

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

export const StorySchema = SchemaFactory.createForClass(Story);
StorySchema.index({ userId: 1, createdAt: -1 });

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ScrapedReelDocument = HydratedDocument<ScrapedReel>;

/**
 * Dữ liệu reel quét sẵn (import thủ công vào MongoDB).
 * Extension đọc bảng này khi bấm «Quét» thay vì scrape DOM Facebook.
 *
 * Import mẫu:
 * {
 *   fanpageUrl: "https://www.facebook.com/example/reels/",
 *   reelUrl: "https://www.facebook.com/reel/123",
 *   title: "",
 *   description: "Caption reel…",
 *   viewsLabel: "1.2M",
 *   viewCount: 1200000,
 *   imageUrl: "https://…",
 *   externalVideoId: "123",
 *   sortOrder: 0
 * }
 */
@Schema({ timestamps: true, collection: 'scraped_reels' })
export class ScrapedReel {
  /** URL fanpage đã chuẩn hoá (…/reels/). */
  @Prop({ required: true, trim: true, index: true })
  fanpageUrl: string;

  /** Tuỳ chọn — để trống = dùng chung mọi user có fanpage trùng URL. */
  @Prop({ type: Types.ObjectId, required: false, index: true })
  userId?: Types.ObjectId;

  @Prop({ required: true, trim: true })
  reelUrl: string;

  @Prop({ default: '', trim: true })
  title: string;

  @Prop({ default: '', trim: true })
  description: string;

  @Prop({ default: '', trim: true })
  viewsLabel: string;

  @Prop({ default: 0, min: 0 })
  viewCount: number;

  @Prop({ default: '', trim: true })
  imageUrl: string;

  @Prop({ default: '', trim: true })
  externalVideoId: string;

  /** Thứ tự hiển thị khi import (nhỏ hơn = trước). */
  @Prop({ default: 0 })
  sortOrder: number;
}

export const ScrapedReelSchema = SchemaFactory.createForClass(ScrapedReel);
ScrapedReelSchema.index({ fanpageUrl: 1, reelUrl: 1 }, { unique: true });
ScrapedReelSchema.index({ fanpageUrl: 1, viewCount: -1, sortOrder: 1 });

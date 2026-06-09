import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type StepDocument = HydratedDocument<Step>;

/** Cách bước hiển thị trên UI extension (tách khỏi `actionType` = hành vi). */
export enum StepDisplayMode {
  VISIBLE = 'visible',
  BACKGROUND = 'background',
}

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
  CHATGPT_REWRITE_CONTENT = 'chatgpt_rewrite_content',
  CHATGPT_EXTRACT_CONTENT_VIDEOS = 'chatgpt_extract_content_videos',
  CHATGPT_EXTRACT_CONTENT_VIDEO = 'chatgpt_extract_content_video',
  CHATGPT_GENERATE_IMAGE = 'chatgpt_generate_image',
  CHATGPT_GENERATE_IMAGES = 'chatgpt_generate_images',
  CHATGPT_EXTRACT_CONTENT = 'chatgpt_extract_content',
  /** Extension ChatGPT — tạo VideoShort + videoPrompts (chạy nền, không mở ChatGPT). */
  CHATGPT_SAVE_VIDEO_SHORT = 'chatgpt_save_video_short',
  FILL_GROK = 'fill_grok',
  /** Grok — đọc VideoShort (imageUrls + videoPrompts), điền Imagine và Enter. */
  GROK_FILL_FROM_VIDEO_SHORT = 'grok_fill_from_video_short',
  /** Grok — chờ video render, lấy link, lưu videoStorageAddresses vào VideoShort. */
  GROK_CAPTURE_VIDEO_LINK = 'grok_capture_video_link',
  COPY_TO_CLIPBOARD = 'copy_to_clipboard',
  PUSH_GGSHEET = 'push_ggsheet',
  EXTRACT_GGSHEET_ROW = 'extract_ggsheet_row',
  DELAY = 'delay',
  CONDITION = 'condition',
  WEBHOOK = 'webhook',
  /** Facebook extension — mở fanpage (URL, pickIndex hoặc nameContains) */
  FACEBOOK_OPEN_FANPAGE = 'facebook_open_fanpage',
  /** Facebook — quét reels (min/max lượt xem, append) */
  FACEBOOK_SCAN_REELS = 'facebook_scan_reels',
  /** Facebook — chọn reel trong danh sách vừa quét */
  FACEBOOK_SELECT_REEL = 'facebook_select_reel',
  /** Facebook — chờ caption/nội dung đủ dài sau khi vào Chi tiết */
  FACEBOOK_WAIT_CONTENT = 'facebook_wait_content',
  /** Facebook — lưu video short (API) */
  FACEBOOK_SAVE_VIDEO_SHORT = 'facebook_save_video_short',
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

  @Prop({
    default: StepDisplayMode.VISIBLE,
    enum: Object.values(StepDisplayMode),
    trim: true,
  })
  displayMode: StepDisplayMode;

  /** Tham số bước (platform-specific). Facebook: xem `facebook-step-input.setup.ts`. */
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

export class CreateStoryDto {
  /** URL reel Facebook */
  sourceReelUrl: string;

  /** Tiêu đề hiển thị (tuỳ chọn, ví dụ tiêu đề reel) */
  name?: string;

  /** StoryTopic id (tuỳ chọn) */
  topicId?: string;
}

/** Đồng bộ / cập nhật story nguồn khi lấy caption từ reel (không tạo Story). */
export class UpsertStorySourceDto {
  sourceContent: string;
  sourceReelUrl: string;
  name?: string;
}

export class PatchStoryDto {
  /** Prompt/script video (VD: Video 1, Video 2). */
  videoPrompts?: string[];
}

export class CreateStoryDto {
  /** URL reel Facebook */
  sourceReelUrl: string;

  /** Tiêu đề hiển thị (tuỳ chọn, ví dụ tiêu đề reel) */
  name?: string;

  /** StoryTopic id (tuỳ chọn) */
  topicId?: string;

  /** Prompt/script video (một hoặc nhiều khối VIDEO) — gửi khi tạo, không cần PATCH sau. */
  videoPrompts?: string[];
}

/** Đồng bộ / cập nhật story nguồn khi lấy caption từ reel (không tạo Story). */
export class UpsertStorySourceDto {
  sourceContent: string;
  sourceReelUrl: string;
  name?: string;
}

export class PatchStoryDto {
  /** Prompt/script video (một hoặc nhiều khối VIDEO). */
  videoPrompts?: string[];
}

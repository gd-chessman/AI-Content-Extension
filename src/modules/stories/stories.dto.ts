export class CreateStoryDto {
  /** Nội dung lấy từ reel (caption, script…) */
  sourceContent: string;

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

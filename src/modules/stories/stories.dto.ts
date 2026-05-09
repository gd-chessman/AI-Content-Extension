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

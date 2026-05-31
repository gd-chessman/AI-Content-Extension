export class CreateStoryDto {
  /** URL reel Facebook */
  sourceReelUrl: string;

  /** Tiêu đề hiển thị (tuỳ chọn, ví dụ tiêu đề reel) */
  name?: string;

  /** StoryTopic id (tuỳ chọn) */
  topicId?: string;

  /** Prompt/script video (một hoặc nhiều khối VIDEO) — gửi khi tạo, không cần PATCH sau. */
  videoPrompts?: string[];

  /** Nội dung ngắn từ bước trích ChatGPT (Tiến trình 4). */
  shortContent?: string;

  /** Nội dung dài từ bước trích ChatGPT. */
  longContent?: string;

  /** URL ảnh trên Cloudinary (client upload trực tiếp, server chỉ lưu link). */
  imageUrls?: string[];
}

/** Đồng bộ / cập nhật story nguồn khi lấy caption từ reel (không tạo Story). */
export class UpsertStorySourceDto {
  sourceContent: string;
  sourceReelUrl: string;
  name?: string;
}

/** Đánh dấu reel bỏ qua — không tạo Story, loại khỏi danh sách reel chưa xử lý. */
export class SkipStorySourceDto {
  sourceReelUrl: string;
  name?: string;
  reason?: string;
}

export class PatchStoryDto {
  /** Prompt/script video (một hoặc nhiều khối VIDEO). */
  videoPrompts?: string[];

  /** URL video Grok (một hoặc nhiều) — extension ghi sau bước capture. */
  videoStorageAddresses?: string[];
}

/** Query GET /stories/my — Nest trả plain object, parse qua `parse()`. */
export class ListMyStoriesQueryDto {
  page?: string;
  limit?: string;
  q?: string;
  /** Client gửi `true` để chỉ lấy story có longContent (WebBlog import). */
  hasLongContent?: string;
  /** Lọc theo bước pipeline: complete, in_progress, missing_chatgpt, … */
  status?: string;

  static parse(raw: ListMyStoriesQueryDto): ListMyStoriesQuery {
    return {
      page: Math.max(1, Number.parseInt(raw.page || '1', 10) || 1),
      limit: Math.min(100, Math.max(1, Number.parseInt(raw.limit || '20', 10) || 20)),
      q: (raw.q || '').trim(),
      hasLongContent: raw.hasLongContent === 'true',
      status: (raw.status || '').trim().toLowerCase(),
    };
  }
}

export type ListMyStoriesQuery = {
  page: number;
  limit: number;
  q: string;
  hasLongContent: boolean;
  status: string;
};

/** Query GET /stories/my/latest-grok-ready */
export class LatestGrokReadyStoryQueryDto {
  /** Tuổi tối đa (ms), mặc định 1 giờ. */
  maxAgeMs?: string;

  static parse(raw: LatestGrokReadyStoryQueryDto): { maxAgeMs: number } {
    const parsed = Number.parseInt(raw.maxAgeMs || '3600000', 10);
    const maxAgeMs = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 60_000), 86_400_000) : 3_600_000;
    return { maxAgeMs };
  }
}

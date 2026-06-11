export class CreateVideoShortDto {
  /** URL reel Facebook */
  sourceReelUrl: string;

  /** Tiêu đề hiển thị (tuỳ chọn, ví dụ tiêu đề reel) */
  name?: string;

  /** VideoShortTopic id (tuỳ chọn) */
  videoShortTopicId?: string;

  /** Prompt/script video (một hoặc nhiều khối VIDEO) — gửi khi tạo, không cần PATCH sau. */
  videoPrompts?: string[];

  /** Nội dung ngắn từ bước trích ChatGPT (Tiến trình 4). */
  shortContent?: string;

  /** Nội dung dài từ bước trích ChatGPT. */
  longContent?: string;

  /** URL ảnh trên Cloudinary (client upload trực tiếp, server chỉ lưu link). */
  imageUrls?: string[];
}

/** Đồng bộ / cập nhật nguồn video khi lấy caption từ reel (không tạo VideoShort). */
export class UpsertVideoSourceDto {
  sourceContent: string;
  sourceReelUrl: string;
  name?: string;
}

/** Đánh dấu reel bỏ qua — không tạo VideoShort, loại khỏi danh sách reel chưa xử lý. */
export class SkipVideoSourceDto {
  sourceReelUrl: string;
  name?: string;
  reason?: string;
}

export class PatchVideoShortDto {
  /** Prompt/script video (một hoặc nhiều khối VIDEO). */
  videoPrompts?: string[];

  /** URL video Grok (một hoặc nhiều) — extension ghi sau bước capture. */
  videoStorageAddresses?: string[];
}

/** Query GET /video-shorts/my — Nest trả plain object, parse qua `parse()`. */
export class ListMyVideoShortsQueryDto {
  page?: string;
  limit?: string;
  q?: string;
  /** Client gửi `true` để chỉ lấy story có longContent (WebBlog import). */
  hasLongContent?: string;
  /** Lọc theo bước pipeline: complete, in_progress, missing_chatgpt, … */
  status?: string;
  /** Từ ngày tạo (YYYY-MM-DD, múi giờ VN). */
  dateFrom?: string;
  /** Đến ngày tạo (YYYY-MM-DD, múi giờ VN). */
  dateTo?: string;

  static parse(raw: ListMyVideoShortsQueryDto): ListMyVideoShortsQuery {
    return {
      page: Math.max(1, Number.parseInt(raw.page || '1', 10) || 1),
      limit: Math.min(100, Math.max(1, Number.parseInt(raw.limit || '20', 10) || 20)),
      q: (raw.q || '').trim(),
      hasLongContent: raw.hasLongContent === 'true',
      status: (raw.status || '').trim().toLowerCase(),
      dateFrom: (raw.dateFrom || '').trim(),
      dateTo: (raw.dateTo || '').trim(),
    };
  }
}

export type ListMyVideoShortsQuery = {
  page: number;
  limit: number;
  q: string;
  hasLongContent: boolean;
  status: string;
  dateFrom: string;
  dateTo: string;
};

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseVnDayStart(date: string): Date | null {
  if (!DATE_ONLY_RE.test(date)) return null;
  const start = new Date(`${date}T00:00:00.000+07:00`);
  return Number.isNaN(start.getTime()) ? null : start;
}

function parseVnDayEnd(date: string): Date | null {
  if (!DATE_ONLY_RE.test(date)) return null;
  const end = new Date(`${date}T23:59:59.999+07:00`);
  return Number.isNaN(end.getTime()) ? null : end;
}

/** Lọc createdAt theo khoảng ngày (lịch VN, UTC+7). */
export function buildVideoShortCreatedAtFilterForRange(
  dateFrom: string,
  dateTo: string,
): { createdAt: { $gte?: Date; $lte?: Date } } | null {
  const from = (dateFrom || '').trim();
  const to = (dateTo || '').trim();
  if (!from && !to) return null;

  const range: { $gte?: Date; $lte?: Date } = {};
  if (from) {
    const start = parseVnDayStart(from);
    if (!start) return null;
    range.$gte = start;
  }
  if (to) {
    const end = parseVnDayEnd(to);
    if (!end) return null;
    range.$lte = end;
  }
  if (range.$gte && range.$lte && range.$gte.getTime() > range.$lte.getTime()) {
    const swapStart = parseVnDayStart(to);
    const swapEnd = parseVnDayEnd(from);
    if (!swapStart || !swapEnd) return null;
    return { createdAt: { $gte: swapStart, $lte: swapEnd } };
  }
  return { createdAt: range };
}

/** Query GET /video-shorts/my/latest-grok-ready */
export class LatestGrokReadyVideoShortQueryDto {
  /** Tuổi tối đa (ms), mặc định 1 giờ. */
  maxAgeMs?: string;

  static parse(raw: LatestGrokReadyVideoShortQueryDto): { maxAgeMs: number } {
    const parsed = Number.parseInt(raw.maxAgeMs || '3600000', 10);
    const maxAgeMs = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 60_000), 86_400_000) : 3_600_000;
    return { maxAgeMs };
  }
}

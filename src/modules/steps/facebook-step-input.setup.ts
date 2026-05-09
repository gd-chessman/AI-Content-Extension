import { BadRequestException } from '@nestjs/common';
import { StepActionType } from './step.schema';

/**
 * Tiêu chí quét reel (Facebook) — đồng bộ ý nghĩa với FE `FacebookScreen` / `executeFacebookWorkflowStep`.
 * Không có UI lưu preset: cấu hình qua `Step.inputSchema` trên API/Mongo.
 */

/** Mặc định min lượt xem khi không khai báo (khớp FE `MIN_VIEW_COUNT`). */
export const FACEBOOK_SCAN_DEFAULT_MIN_VIEWS = 500_000;

/** Gợi ý số reel tối đa mỗi lần quét (FE cố định `MAX_SCAN_RESULTS = 5`). */
export const FACEBOOK_SCAN_MAX_RESULTS_HINT = 5;

/** Mặc định số vòng “quét thêm” khi chọn reel (khớp FE). */
export const FACEBOOK_SELECT_DEFAULT_MAX_APPEND_ROUNDS = 8;

export type FacebookOpenFanpageInput = {
  fanpageUrl?: string;
  nameContains?: string;
  pickIndex?: number;
};

export type FacebookScanReelsInput = {
  minViews?: number;
  maxViews?: number;
  append?: boolean;
  /** Số fanpage **tiếp theo** trong danh sách (sau fanpage đã mở ở bước mở) để thử khi quét trống. */
  fallbackFanpageCount?: number;
};

export type FacebookSelectReelInput = {
  index?: number;
  maxAppendRounds?: number;
};

export type FacebookWaitContentInput = {
  minLength?: number;
  timeoutMs?: number;
};

export type FacebookSaveStoryInput = Record<string, never>;

const FACEBOOK_ACTIONS = new Set<string>([
  StepActionType.FACEBOOK_OPEN_FANPAGE,
  StepActionType.FACEBOOK_SCAN_REELS,
  StepActionType.FACEBOOK_SELECT_REEL,
  StepActionType.FACEBOOK_WAIT_CONTENT,
  StepActionType.FACEBOOK_SAVE_STORY,
]);

export function isFacebookStepAction(actionType: string): boolean {
  return FACEBOOK_ACTIONS.has(actionType);
}

function num(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function intNonNeg(raw: unknown): number | undefined {
  const n = num(raw);
  if (n === undefined) return undefined;
  const i = Math.floor(n);
  return i >= 0 ? i : undefined;
}

function positiveInt(raw: unknown): number | undefined {
  const n = num(raw);
  if (n === undefined) return undefined;
  const i = Math.floor(n);
  return i > 0 ? i : undefined;
}

/** Chuỗi nhận diện fanpage: bắt buộc ít nhất một trong ba. */
export function assertFacebookOpenFanpageInput(input: FacebookOpenFanpageInput): void {
  const url = (input.fanpageUrl || '').trim();
  const name = (input.nameContains || '').trim();
  const pick = input.pickIndex;
  const hasPick = pick !== undefined && Number.isFinite(pick) && pick >= 0;
  if (!url && !name && !hasPick) {
    throw new BadRequestException(
      'facebook_open_fanpage inputSchema: cần ít nhất một trong fanpageUrl, nameContains hoặc pickIndex.',
    );
  }
}

export function sanitizeFacebookOpenFanpageInput(raw: Record<string, unknown>): Record<string, unknown> {
  const fanpageUrl = typeof raw.fanpageUrl === 'string' ? raw.fanpageUrl.trim() : '';
  const nameContains = typeof raw.nameContains === 'string' ? raw.nameContains.trim() : '';
  const pickIndex = intNonNeg(raw.pickIndex)
  const out: FacebookOpenFanpageInput = {}
  if (fanpageUrl) out.fanpageUrl = fanpageUrl
  if (nameContains) out.nameContains = nameContains
  if (pickIndex !== undefined) out.pickIndex = pickIndex
  assertFacebookOpenFanpageInput(out)
  return out as Record<string, unknown>
}

export function sanitizeFacebookScanReelsInput(raw: Record<string, unknown>): Record<string, unknown> {
  let minViews = positiveInt(raw.minViews)
  let maxViews = positiveInt(raw.maxViews)
  if (minViews === undefined) {
    minViews = FACEBOOK_SCAN_DEFAULT_MIN_VIEWS
  }
  if (maxViews !== undefined && maxViews < minViews) {
    throw new BadRequestException('facebook_scan_reels: maxViews phải >= minViews.')
  }
  const append = raw.append === true || raw.append === 'true'
  const out: FacebookScanReelsInput = {
    minViews,
    append,
  }
  if (maxViews !== undefined) out.maxViews = maxViews
  const fc = intNonNeg(raw.fallbackFanpageCount)
  if (fc !== undefined) out.fallbackFanpageCount = fc
  return out as Record<string, unknown>
}

export function sanitizeFacebookSelectReelInput(raw: Record<string, unknown>): Record<string, unknown> {
  const index = intNonNeg(raw.index)
  const maxAppend = intNonNeg(raw.maxAppendRounds)
  const out: FacebookSelectReelInput = {
    index: index ?? 0,
    maxAppendRounds: maxAppend ?? FACEBOOK_SELECT_DEFAULT_MAX_APPEND_ROUNDS,
  }
  return out as Record<string, unknown>
}

export function sanitizeFacebookWaitContentInput(raw: Record<string, unknown>): Record<string, unknown> {
  const minLength = positiveInt(raw.minLength) ?? 30
  const timeoutMs = positiveInt(raw.timeoutMs) ?? 90_000
  const out: FacebookWaitContentInput = { minLength, timeoutMs }
  return out as Record<string, unknown>
}

export function sanitizeFacebookSaveStoryInput(_raw: Record<string, unknown>): Record<string, unknown> {
  return {}
}

/**
 * Chuẩn hoá & kiểm tra `inputSchema` cho bước Facebook trước khi lưu Step.
 */
export function sanitizeFacebookStepInputSchema(
  actionType: StepActionType,
  raw: Record<string, unknown>,
): Record<string, unknown> {
  switch (actionType) {
    case StepActionType.FACEBOOK_OPEN_FANPAGE:
      return sanitizeFacebookOpenFanpageInput(raw)
    case StepActionType.FACEBOOK_SCAN_REELS:
      return sanitizeFacebookScanReelsInput(raw)
    case StepActionType.FACEBOOK_SELECT_REEL:
      return sanitizeFacebookSelectReelInput(raw)
    case StepActionType.FACEBOOK_WAIT_CONTENT:
      return sanitizeFacebookWaitContentInput(raw)
    case StepActionType.FACEBOOK_SAVE_STORY:
      return sanitizeFacebookSaveStoryInput(raw)
    default:
      return raw
  }
}

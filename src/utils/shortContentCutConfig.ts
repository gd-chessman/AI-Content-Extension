/** Cắt nội dung ngắn ChatGPT — chrome.storage.local, tab Cấu hình hồ sơ. */

export type ShortContentCutMode = 'percent' | 'lines'

export const SHORT_CONTENT_CUT_MODE_STORAGE_KEY = 'shortContentCutMode'

export const SHORT_CONTENT_MIN_PERCENT_STORAGE_KEY = 'shortContentMinPercent'
export const SHORT_CONTENT_MAX_PERCENT_STORAGE_KEY = 'shortContentMaxPercent'

export const SHORT_CONTENT_MIN_LINES_STORAGE_KEY = 'shortContentMinLines'
export const SHORT_CONTENT_MAX_LINES_STORAGE_KEY = 'shortContentMaxLines'

export const DEFAULT_SHORT_CONTENT_CUT_MODE: ShortContentCutMode = 'percent'
export const DEFAULT_SHORT_CONTENT_MIN_PERCENT = 25
export const DEFAULT_SHORT_CONTENT_MAX_PERCENT = 45
export const DEFAULT_SHORT_CONTENT_MIN_LINES = 45
export const DEFAULT_SHORT_CONTENT_MAX_LINES = 100

export type ShortContentCutConfig = {
  mode: ShortContentCutMode
  minPercent: number
  maxPercent: number
  minLines: number
  maxLines: number
}

type ChromeStorageLocal = {
  get?: (keys: string | string[], callback: (items: Record<string, unknown>) => void) => void
  set?: (items: Record<string, unknown>, callback?: () => void) => void
}

const getChromeStorageLocal = (): ChromeStorageLocal | undefined =>
  (globalThis as { chrome?: { storage?: { local?: ChromeStorageLocal } } }).chrome?.storage?.local

export function normalizeShortContentCutMode(raw: unknown): ShortContentCutMode {
  return raw === 'lines' ? 'lines' : 'percent'
}

export function normalizeShortContentCutPercents(
  minPercent: number,
  maxPercent: number,
): { minPercent: number; maxPercent: number } {
  let min = Math.round(Number(minPercent))
  let max = Math.round(Number(maxPercent))
  if (!Number.isFinite(min)) min = DEFAULT_SHORT_CONTENT_MIN_PERCENT
  if (!Number.isFinite(max)) max = DEFAULT_SHORT_CONTENT_MAX_PERCENT
  min = Math.min(99, Math.max(1, min))
  max = Math.min(100, Math.max(min + 1, max))
  return { minPercent: min, maxPercent: max }
}

export function normalizeShortContentCutLines(
  minLines: number,
  maxLines: number,
): { minLines: number; maxLines: number } {
  let min = Math.round(Number(minLines))
  let max = Math.round(Number(maxLines))
  if (!Number.isFinite(min)) min = DEFAULT_SHORT_CONTENT_MIN_LINES
  if (!Number.isFinite(max)) max = DEFAULT_SHORT_CONTENT_MAX_LINES
  min = Math.max(1, min)
  max = Math.max(min + 1, max)
  return { minLines: min, maxLines: max }
}

/** Cùng quy tắc `resolvePickShortBounds` khi mode = lines: trim rồi `split('\\n')`. */
export function splitTextLinesLikeShortContentCut(value: string): string[] {
  const normalized = (value || '').replace(/\r/g, '').trim()
  if (!normalized) return []
  return normalized.split('\n')
}

export function countTextLinesLikeShortContentCut(value: string): number {
  return splitTextLinesLikeShortContentCut(value).length
}

/** Nhãn dòng trên GG Sheet — khớp cấu hình cắt ChatGPT. */
export function formatShortContentLineCountLabel(
  lineCount: number,
  config: ShortContentCutConfig,
): string {
  if (lineCount <= 0) return ''
  if (config.mode === 'lines') {
    return `${lineCount} dòng (cấu hình ${config.minLines}–${config.maxLines})`
  }
  return `${lineCount} dòng (${config.minPercent}–${config.maxPercent}% thân bài)`
}

export function normalizeShortContentCutConfig(
  partial: Partial<ShortContentCutConfig> & { mode?: unknown },
): ShortContentCutConfig {
  const mode = normalizeShortContentCutMode(partial.mode)
  const percents = normalizeShortContentCutPercents(
    partial.minPercent ?? DEFAULT_SHORT_CONTENT_MIN_PERCENT,
    partial.maxPercent ?? DEFAULT_SHORT_CONTENT_MAX_PERCENT,
  )
  const lines = normalizeShortContentCutLines(
    partial.minLines ?? DEFAULT_SHORT_CONTENT_MIN_LINES,
    partial.maxLines ?? DEFAULT_SHORT_CONTENT_MAX_LINES,
  )
  return { mode, ...percents, ...lines }
}

/** Inject: [..., mode, min, max] — min/max là % hoặc dòng tùy mode. Legacy: [..., min%, max%]. */
export function appendShortCutInjectArgs(baseArgs: unknown[], config: ShortContentCutConfig): unknown[] {
  const c = normalizeShortContentCutConfig(config)
  const min = c.mode === 'lines' ? c.minLines : c.minPercent
  const max = c.mode === 'lines' ? c.maxLines : c.maxPercent
  return [...baseArgs, c.mode, min, max]
}

export async function getShortContentCutConfigFromStorage(
  storageLocal = getChromeStorageLocal(),
): Promise<ShortContentCutConfig> {
  if (!storageLocal?.get) {
    return normalizeShortContentCutConfig({})
  }

  return new Promise((resolve) => {
    storageLocal.get!(
      [
        SHORT_CONTENT_CUT_MODE_STORAGE_KEY,
        SHORT_CONTENT_MIN_PERCENT_STORAGE_KEY,
        SHORT_CONTENT_MAX_PERCENT_STORAGE_KEY,
        SHORT_CONTENT_MIN_LINES_STORAGE_KEY,
        SHORT_CONTENT_MAX_LINES_STORAGE_KEY,
      ],
      (items) => {
        resolve(
          normalizeShortContentCutConfig({
            mode: items[SHORT_CONTENT_CUT_MODE_STORAGE_KEY],
            minPercent: items[SHORT_CONTENT_MIN_PERCENT_STORAGE_KEY],
            maxPercent: items[SHORT_CONTENT_MAX_PERCENT_STORAGE_KEY],
            minLines: items[SHORT_CONTENT_MIN_LINES_STORAGE_KEY],
            maxLines: items[SHORT_CONTENT_MAX_LINES_STORAGE_KEY],
          }),
        )
      },
    )
  })
}

export async function setShortContentCutConfigInStorage(
  config: ShortContentCutConfig,
  storageLocal = getChromeStorageLocal(),
): Promise<ShortContentCutConfig> {
  const normalized = normalizeShortContentCutConfig(config)
  if (!storageLocal?.set) return normalized

  return new Promise((resolve, reject) => {
    storageLocal.set!(
      {
        [SHORT_CONTENT_CUT_MODE_STORAGE_KEY]: normalized.mode,
        [SHORT_CONTENT_MIN_PERCENT_STORAGE_KEY]: normalized.minPercent,
        [SHORT_CONTENT_MAX_PERCENT_STORAGE_KEY]: normalized.maxPercent,
        [SHORT_CONTENT_MIN_LINES_STORAGE_KEY]: normalized.minLines,
        [SHORT_CONTENT_MAX_LINES_STORAGE_KEY]: normalized.maxLines,
      },
      () => {
        const err = (globalThis as { chrome?: { runtime?: { lastError?: { message?: string } } } }).chrome?.runtime
          ?.lastError
        if (err?.message) reject(new Error(err.message))
        else resolve(normalized)
      },
    )
  })
}

/** @deprecated Dùng getShortContentCutConfigFromStorage */
export async function getShortContentCutPercentsFromStorage(
  storageLocal = getChromeStorageLocal(),
): Promise<{ minPercent: number; maxPercent: number }> {
  const c = await getShortContentCutConfigFromStorage(storageLocal)
  return { minPercent: c.minPercent, maxPercent: c.maxPercent }
}

/** @deprecated Dùng setShortContentCutConfigInStorage */
export async function setShortContentCutPercentsInStorage(
  percents: { minPercent: number; maxPercent: number },
  storageLocal = getChromeStorageLocal(),
) {
  const current = await getShortContentCutConfigFromStorage(storageLocal)
  return setShortContentCutConfigInStorage({ ...current, ...percents }, storageLocal)
}

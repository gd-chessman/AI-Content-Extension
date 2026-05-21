/** % min/max độ dài nội dung ngắn so với thân bài dài — lưu chrome.storage.local, tab Cấu hình hồ sơ. */

export const SHORT_CONTENT_MIN_PERCENT_STORAGE_KEY = 'shortContentMinPercent'
export const SHORT_CONTENT_MAX_PERCENT_STORAGE_KEY = 'shortContentMaxPercent'

export const DEFAULT_SHORT_CONTENT_MIN_PERCENT = 25
export const DEFAULT_SHORT_CONTENT_MAX_PERCENT = 45

export type ShortContentCutPercents = {
  minPercent: number
  maxPercent: number
}

type ChromeStorageLocal = {
  get?: (keys: string | string[], callback: (items: Record<string, unknown>) => void) => void
  set?: (items: Record<string, unknown>, callback?: () => void) => void
}

const getChromeStorageLocal = (): ChromeStorageLocal | undefined =>
  (globalThis as { chrome?: { storage?: { local?: ChromeStorageLocal } } }).chrome?.storage?.local

export function normalizeShortContentCutPercents(
  minPercent: number,
  maxPercent: number,
): ShortContentCutPercents {
  let min = Math.round(Number(minPercent))
  let max = Math.round(Number(maxPercent))
  if (!Number.isFinite(min)) min = DEFAULT_SHORT_CONTENT_MIN_PERCENT
  if (!Number.isFinite(max)) max = DEFAULT_SHORT_CONTENT_MAX_PERCENT
  min = Math.min(99, Math.max(1, min))
  max = Math.min(100, Math.max(min + 1, max))
  return { minPercent: min, maxPercent: max }
}

export function toShortContentCutRatios(percents: ShortContentCutPercents) {
  return {
    minRatio: percents.minPercent / 100,
    maxRatio: percents.maxPercent / 100,
  }
}

export function appendShortCutInjectArgs(
  baseArgs: unknown[],
  percents: ShortContentCutPercents,
): unknown[] {
  return [...baseArgs, percents.minPercent, percents.maxPercent]
}

export async function getShortContentCutPercentsFromStorage(
  storageLocal = getChromeStorageLocal(),
): Promise<ShortContentCutPercents> {
  if (!storageLocal?.get) {
    return normalizeShortContentCutPercents(
      DEFAULT_SHORT_CONTENT_MIN_PERCENT,
      DEFAULT_SHORT_CONTENT_MAX_PERCENT,
    )
  }

  return new Promise((resolve) => {
    storageLocal.get!(
      [SHORT_CONTENT_MIN_PERCENT_STORAGE_KEY, SHORT_CONTENT_MAX_PERCENT_STORAGE_KEY],
      (items) => {
        const minRaw = items[SHORT_CONTENT_MIN_PERCENT_STORAGE_KEY]
        const maxRaw = items[SHORT_CONTENT_MAX_PERCENT_STORAGE_KEY]
        resolve(
          normalizeShortContentCutPercents(
            typeof minRaw === 'number' ? minRaw : DEFAULT_SHORT_CONTENT_MIN_PERCENT,
            typeof maxRaw === 'number' ? maxRaw : DEFAULT_SHORT_CONTENT_MAX_PERCENT,
          ),
        )
      },
    )
  })
}

export async function setShortContentCutPercentsInStorage(
  percents: ShortContentCutPercents,
  storageLocal = getChromeStorageLocal(),
): Promise<ShortContentCutPercents> {
  const normalized = normalizeShortContentCutPercents(percents.minPercent, percents.maxPercent)
  if (!storageLocal?.set) return normalized

  return new Promise((resolve, reject) => {
    storageLocal.set!(
      {
        [SHORT_CONTENT_MIN_PERCENT_STORAGE_KEY]: normalized.minPercent,
        [SHORT_CONTENT_MAX_PERCENT_STORAGE_KEY]: normalized.maxPercent,
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

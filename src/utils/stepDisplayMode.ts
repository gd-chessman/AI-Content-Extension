/** Khớp `StepDisplayMode` backend (`step.schema.ts`). */
export const STEP_DISPLAY_MODE = {
  VISIBLE: 'visible',
  BACKGROUND: 'background',
} as const

export type StepDisplayMode = (typeof STEP_DISPLAY_MODE)[keyof typeof STEP_DISPLAY_MODE]

export function normalizeStepDisplayMode(value?: string): StepDisplayMode {
  const raw = (value || '').trim().toLowerCase()
  return raw === STEP_DISPLAY_MODE.BACKGROUND ? STEP_DISPLAY_MODE.BACKGROUND : STEP_DISPLAY_MODE.VISIBLE
}

export function isBackgroundDisplayMode(value?: string): boolean {
  return normalizeStepDisplayMode(value) === STEP_DISPLAY_MODE.BACKGROUND
}

type ManualChatgptStepLike = {
  displayMode?: string
  hasDbPrompt?: boolean
}

/** Bước cho phép ⚡ chạy nhanh / ✏️ điền prompt thủ công trên màn ChatGPT. */
export function canManualChatgptStep(step: ManualChatgptStepLike): boolean {
  if (isBackgroundDisplayMode(step.displayMode)) return false
  return step.hasDbPrompt === true
}

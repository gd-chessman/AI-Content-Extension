export type GrokProcessStepLike = {
  id: string
  label: string
  stepNo?: number
  actionType?: string
  inputSchema?: Record<string, unknown>
}

export const GROK_STEP_ACTION = {
  FILL_FROM_STORY: 'grok_fill_from_story',
  CAPTURE_VIDEO_LINK: 'grok_capture_video_link',
  FILL_GROK_LEGACY: 'fill_grok',
} as const

export function normalizeGrokActionType(actionType?: string): string {
  return (actionType || '').trim().toLowerCase()
}

export function isGrokFillFromStoryStep(step: GrokProcessStepLike): boolean {
  const action = normalizeGrokActionType(step.actionType)
  return action === GROK_STEP_ACTION.FILL_FROM_STORY || action === GROK_STEP_ACTION.FILL_GROK_LEGACY
}

export function isGrokCaptureVideoLinkStep(step: GrokProcessStepLike): boolean {
  return normalizeGrokActionType(step.actionType) === GROK_STEP_ACTION.CAPTURE_VIDEO_LINK
}

export function readGrokPairIndex(inputSchema?: Record<string, unknown>): number {
  const raw = inputSchema?.index ?? inputSchema?.pairIndex ?? inputSchema?.videoIndex
  const n = Math.floor(Number(raw))
  if (!Number.isFinite(n) || n < 0) return 0
  return n
}

export function readGrokTimeoutMs(inputSchema?: Record<string, unknown>, fallback = 600_000): number {
  const raw = inputSchema?.timeoutMs ?? inputSchema?.timeout
  const n = Math.floor(Number(raw))
  if (!Number.isFinite(n) || n < 5_000) return fallback
  return Math.min(n, 1_800_000)
}

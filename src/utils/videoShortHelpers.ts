import type { VideoShortItem } from '@/services/VideoShortService'

export function formatVideoShortDate(value?: string) {
  if (!value) return '—'
  return new Date(value).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export type VideoShortStats = {
  imageCount: number
  promptCount: number
  videoCount: number
  hasLongContent: boolean
  hasShortContent: boolean
  firstImage: string
}

export function getVideoShortStats(story: VideoShortItem): VideoShortStats {
  return {
    imageCount: (story.imageUrls || []).filter(Boolean).length,
    promptCount: (story.videoPrompts || []).filter(Boolean).length,
    videoCount: (story.videoStorageAddresses || []).filter(Boolean).length,
    hasLongContent: Boolean(story.longContent?.trim()),
    hasShortContent: Boolean(story.shortContent?.trim()),
    firstImage: (story.imageUrls || []).find((u) => u.trim()) || '',
  }
}

export type PipelineStep = {
  key: string
  label: string
  done: boolean
}

export function getPipelineSteps(story: VideoShortItem, stats: VideoShortStats): PipelineStep[] {
  return [
    { key: 'images', label: 'Ảnh', done: stats.imageCount > 0 },
    { key: 'prompts', label: 'Prompt video', done: stats.promptCount > 0 },
    { key: 'videos', label: 'Video', done: stats.videoCount > 0 },
    { key: 'content', label: 'Nội dung', done: stats.hasLongContent },
    { key: 'ggsheet', label: 'GG Sheet', done: Boolean(story.ggsheetPush?.pushed) },
  ]
}

export function pipelineProgress(story: VideoShortItem, stats: VideoShortStats) {
  const steps = getPipelineSteps(story, stats)
  const done = steps.filter((s) => s.done).length
  return { done, total: steps.length, percent: Math.round((done / steps.length) * 100), steps }
}

/** Giá trị gửi GET /video-shorts/my?status=… */
export type VideoShortListStatusFilter =
  | ''
  | 'complete'
  | 'in_progress'
  | 'missing_chatgpt'
  | 'missing_videos'
  | 'ggsheet_pending'
  | 'ggsheet_pushed'

export const STORY_LIST_STATUS_FILTERS: { value: VideoShortListStatusFilter; label: string }[] = [
  { value: '', label: 'Tất cả' },
  { value: 'in_progress', label: 'Đang làm dở' },
  { value: 'complete', label: 'Hoàn tất' },
  { value: 'missing_chatgpt', label: 'Thiếu ChatGPT' },
  { value: 'missing_videos', label: 'Thiếu video' },
  { value: 'ggsheet_pending', label: 'Chưa lên sheet' },
  { value: 'ggsheet_pushed', label: 'Đã lên sheet' },
]

export function getVideoShortListStatusLabel(status: VideoShortListStatusFilter): string {
  return STORY_LIST_STATUS_FILTERS.find((item) => item.value === status)?.label || status
}

/** Còn thiếu ít nhất một đầu ra ChatGPT: ảnh, prompt hoặc nội dung dài. */
export function isChatgptIncomplete(_story: VideoShortItem, stats: VideoShortStats): boolean {
  return stats.imageCount === 0 || stats.promptCount === 0 || !stats.hasLongContent
}

/** Đủ ảnh + prompt để chạy Grok. */
export function isGrokReady(_story: VideoShortItem, stats: VideoShortStats): boolean {
  return stats.promptCount > 0 && stats.imageCount > 0
}

/** Có prompt/ảnh nhưng chưa có video Grok. */
export function isGrokIncomplete(story: VideoShortItem, stats: VideoShortStats): boolean {
  return isGrokReady(story, stats) && stats.videoCount === 0
}

export function isGgSheetPending(story: VideoShortItem): boolean {
  return !story.ggsheetPush?.pushed
}

/** Có nội dung tối thiểu để đẩy lên GG Sheet. */
export function isGgSheetPushable(story: VideoShortItem): boolean {
  const title = (story.name || '').trim()
  const body = (story.shortContent || story.longContent || '').trim()
  return Boolean(title && body && isGgSheetPending(story))
}

/** Xóa đường dẫn video tại vị trí index (giữ nguyên độ dài mảng). */
export function clearVideoStorageAtIndex(addresses: string[] | undefined, index: number): string[] {
  const merged = [...(addresses || [])]
  while (merged.length <= index) merged.push('')
  merged[index] = ''
  return merged
}

/** Đủ ảnh + prompt tại index để chạy lại Grok cho một video. */
export function canRegenerateGrokVideoAtIndex(story: VideoShortItem, index: number): boolean {
  const prompts = (story.videoPrompts || []).map((s) => s.trim()).filter(Boolean)
  const images = (story.imageUrls || []).map((s) => s.trim()).filter(Boolean)
  const prompt = prompts[index] || prompts[0] || ''
  const imageUrl = images[index] || images[0] || ''
  return Boolean(prompt && imageUrl)
}

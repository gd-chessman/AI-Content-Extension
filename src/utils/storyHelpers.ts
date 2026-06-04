import type { StoryItem } from '@/services/StoryService'

export function formatStoryDate(value?: string) {
  if (!value) return '—'
  return new Date(value).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export type StoryStats = {
  imageCount: number
  promptCount: number
  videoCount: number
  hasLongContent: boolean
  hasShortContent: boolean
  firstImage: string
}

export function getStoryStats(story: StoryItem): StoryStats {
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

export function getPipelineSteps(story: StoryItem, stats: StoryStats): PipelineStep[] {
  return [
    { key: 'images', label: 'Ảnh', done: stats.imageCount > 0 },
    { key: 'prompts', label: 'Prompt video', done: stats.promptCount > 0 },
    { key: 'videos', label: 'Video', done: stats.videoCount > 0 },
    { key: 'content', label: 'Nội dung', done: stats.hasLongContent },
    { key: 'ggsheet', label: 'GG Sheet', done: Boolean(story.ggsheetPush?.pushed) },
  ]
}

export function pipelineProgress(story: StoryItem, stats: StoryStats) {
  const steps = getPipelineSteps(story, stats)
  const done = steps.filter((s) => s.done).length
  return { done, total: steps.length, percent: Math.round((done / steps.length) * 100), steps }
}

/** Giá trị gửi GET /stories/my?status=… */
export type StoryListStatusFilter =
  | ''
  | 'complete'
  | 'in_progress'
  | 'missing_chatgpt'
  | 'missing_videos'
  | 'ggsheet_pending'
  | 'ggsheet_pushed'

export const STORY_LIST_STATUS_FILTERS: { value: StoryListStatusFilter; label: string }[] = [
  { value: '', label: 'Tất cả' },
  { value: 'in_progress', label: 'Đang làm dở' },
  { value: 'complete', label: 'Hoàn tất' },
  { value: 'missing_chatgpt', label: 'Thiếu ChatGPT' },
  { value: 'missing_videos', label: 'Thiếu video' },
  { value: 'ggsheet_pending', label: 'Chưa lên sheet' },
  { value: 'ggsheet_pushed', label: 'Đã lên sheet' },
]

export function getStoryListStatusLabel(status: StoryListStatusFilter): string {
  return STORY_LIST_STATUS_FILTERS.find((item) => item.value === status)?.label || status
}

/** Còn thiếu ít nhất một đầu ra ChatGPT: ảnh, prompt hoặc nội dung dài. */
export function isChatgptIncomplete(_story: StoryItem, stats: StoryStats): boolean {
  return stats.imageCount === 0 || stats.promptCount === 0 || !stats.hasLongContent
}

/** Đủ ảnh + prompt để chạy Grok. */
export function isGrokReady(_story: StoryItem, stats: StoryStats): boolean {
  return stats.promptCount > 0 && stats.imageCount > 0
}

/** Có prompt/ảnh nhưng chưa có video Grok. */
export function isGrokIncomplete(story: StoryItem, stats: StoryStats): boolean {
  return isGrokReady(story, stats) && stats.videoCount === 0
}

export function isGgSheetPending(story: StoryItem): boolean {
  return !story.ggsheetPush?.pushed
}

/** Có nội dung tối thiểu để đẩy lên GG Sheet. */
export function isGgSheetPushable(story: StoryItem): boolean {
  const title = (story.name || '').trim()
  const body = (story.shortContent || story.longContent || '').trim()
  return Boolean(title && body && isGgSheetPending(story))
}

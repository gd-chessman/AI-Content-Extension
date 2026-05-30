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

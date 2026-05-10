import axiosClient from '@/utils/axiosClient'

export type StoryItem = {
  _id: string
  id: string
  userId: string
  topicId: string
  /** Story nguồn (reel) — nhiều story có thể cùng một nguồn */
  storySourceId?: string
  name: string
  sourceContent: string
  sourceReelUrl: string
  shortContent?: string
  longContent?: string
  blogPostUrl?: string
  fbReelUrl?: string
  /** Lượt ghi nhận trên story nguồn (reel) — chung cho mọi story cùng nguồn */
  usageCount?: number
  createdAt?: string
  updatedAt?: string
}

export const createStoryFromReel = async (payload: {
  sourceContent: string
  sourceReelUrl: string
  name?: string
  topicId?: string
}) => {
  const response = await axiosClient.post('/stories', payload)
  return response.data as StoryItem
}

export const getMyStories = async () => {
  const response = await axiosClient.get('/stories/my')
  return (response.data || []) as StoryItem[]
}

export type StoryReelCheckResult = {
  /** Đã có bản ghi story nguồn (đã đồng bộ caption từ reel). */
  saved: boolean
  storySourceId?: string
  storyId?: string
  canonicalUrl?: string
  /** Lượt dùng đã ghi nhận trên story nguồn của user (0 nếu chưa có nguồn) */
  myUsageCount: number
  /** Tổng lượt dùng toàn hệ thống cho cùng reel (URL chuẩn) */
  globalUsageCount: number
}

export type IncrementStoryUsageResult = {
  storyId: string
  canonicalUrl: string
  myUsageCount: number
  globalUsageCount: number
}

export const checkStoryReelSaved = async (sourceReelUrl: string) => {
  const response = await axiosClient.get('/stories/check-reel', {
    params: { url: sourceReelUrl },
  })
  return response.data as StoryReelCheckResult
}

export const incrementStoryUsage = async (storyId: string) => {
  const response = await axiosClient.post(`/stories/${storyId}/increment-usage`)
  return response.data as IncrementStoryUsageResult
}

export const syncStorySourceFromReel = async (payload: {
  sourceContent: string
  sourceReelUrl: string
  name?: string
}) => {
  const response = await axiosClient.post('/stories/sources/sync', payload)
  return response.data as {
    _id: string
    id: string
    userId: string
    name: string
    sourceContent: string
    sourceReelUrl: string
    usageCount?: number
    createdAt?: string
    updatedAt?: string
  }
}

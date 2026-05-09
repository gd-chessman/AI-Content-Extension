import axiosClient from '@/utils/axiosClient'

export type StoryItem = {
  _id: string
  id: string
  userId: string
  topicId: string
  name: string
  sourceContent: string
  sourceReelUrl: string
  /** Lượt ghi nhận của user đối với story này */
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
  saved: boolean
  storyId?: string
  canonicalUrl?: string
  /** Lượt dùng đã ghi nhận cho story của user (0 nếu chưa lưu) */
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

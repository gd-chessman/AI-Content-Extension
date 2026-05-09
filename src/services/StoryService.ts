import axiosClient from '@/utils/axiosClient'

export type StoryItem = {
  _id: string
  id: string
  userId: string
  topicId: string
  name: string
  sourceContent: string
  sourceReelUrl: string
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
}

export const checkStoryReelSaved = async (sourceReelUrl: string) => {
  const response = await axiosClient.get('/stories/check-reel', {
    params: { url: sourceReelUrl },
  })
  return response.data as StoryReelCheckResult
}

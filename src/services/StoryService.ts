import axiosClient from '@/utils/axiosClient'

export type StoryItem = {
  _id: string
  userId: string
  topicId: string
  storySourceId?: string
  name: string
  sourceContent: string
  sourceReelUrl: string
  shortContent?: string
  longContent?: string
  blogPostUrl?: string
  fbReelUrl?: string
  usageCount?: number
  videoPrompts?: string[]
  imageUrls?: string[]
  videoStorageAddresses?: string[]
  ggsheetPush?: {
    pushed: boolean
    targetRow?: number
  }
  createdAt?: string
  updatedAt?: string
}

export type StoriesPagination = {
  total: number
  page: number
  limit: number
  totalPages: number
}

export type PaginatedStoriesResponse = {
  items: StoryItem[]
  pagination: StoriesPagination
}

export type GetMyStoriesParams = {
  page?: number
  limit?: number
  q?: string
  hasLongContent?: boolean
  status?: string
}

export const getMyStories = async (params?: GetMyStoriesParams) => {
  const response = await axiosClient.get('/stories/my', {
    params: {
      page: params?.page ?? 1,
      limit: params?.limit ?? 20,
      ...(params?.q?.trim() ? { q: params.q.trim() } : {}),
      ...(params?.hasLongContent ? { hasLongContent: 'true' } : {}),
      ...(params?.status?.trim() ? { status: params.status.trim() } : {}),
    },
  })
  return (response.data || {
    items: [],
    pagination: { total: 0, page: 1, limit: 20, totalPages: 1 },
  }) as PaginatedStoriesResponse
}

export const getStoryById = async (storyId: string) => {
  const response = await axiosClient.get(`/stories/my/${storyId}`)
  return response.data as StoryItem
}

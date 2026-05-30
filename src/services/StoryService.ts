import axiosClient from '@/utils/axiosClient'

export type StoryItem = {
  _id: string
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
  videoPrompts?: string[]
  imageUrls?: string[]
  videoStorageAddresses?: string[]
  createdAt?: string
  updatedAt?: string
}

export const createStoryFromReel = async (payload: {
  sourceReelUrl: string
  name?: string
  topicId?: string
  videoPrompts?: string[]
  shortContent?: string
  longContent?: string
  /** URL ảnh trên Cloudinary (đã upload trực tiếp từ extension). */
  imageUrls?: string[]
}) => {
  const response = await axiosClient.post('/stories', payload)
  return response.data as StoryItem
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
}

export const getMyStories = async (params?: GetMyStoriesParams) => {
  const response = await axiosClient.get('/stories/my', {
    params: {
      page: params?.page ?? 1,
      limit: params?.limit ?? 20,
      ...(params?.q?.trim() ? { q: params.q.trim() } : {}),
      ...(params?.hasLongContent ? { hasLongContent: 'true' } : {}),
    },
  })
  return (response.data || {
    items: [],
    pagination: { total: 0, page: 1, limit: 20, totalPages: 1 },
  }) as PaginatedStoriesResponse
}

/** Một bản ghi StorySource (API đã sắp: mới trước, usageCount thấp trước khi trùng thời điểm). */
export type StorySourceListItem = {
  _id: string
  sourceContent: string
  sourceReelUrl: string
  name: string
  usageCount: number
  createdAt?: string
  updatedAt?: string
}

/** Danh sách story nguồn (caption reel) — thứ tự ưu tiên mới & ít dùng. */
export const getMyStorySources = async () => {
  const response = await axiosClient.get('/stories/sources/my')
  return (response.data || []) as StorySourceListItem[]
}

/** Kết quả GET /stories/sources/check-reel — chỉ phản ánh StorySource. */
export type StorySourceReelCheckResult = {
  saved: boolean
  storySourceId?: string
  canonicalUrl?: string
  myUsageCount: number
  globalUsageCount: number
}

/** @deprecated Dùng StorySourceReelCheckResult */
export type StoryReelCheckResult = StorySourceReelCheckResult

export type IncrementStoryUsageResult = {
  storyId: string
  canonicalUrl: string
  myUsageCount: number
  globalUsageCount: number
}

export const checkStorySourceForReel = async (sourceReelUrl: string) => {
  const response = await axiosClient.get('/stories/sources/check-reel', {
    params: { url: sourceReelUrl },
  })
  return response.data as StorySourceReelCheckResult
}

/** @deprecated Dùng checkStorySourceForReel */
export const checkStoryReelSaved = checkStorySourceForReel

export const incrementStoryUsage = async (storyId: string) => {
  const response = await axiosClient.post(`/stories/${storyId}/increment-usage`)
  return response.data as IncrementStoryUsageResult
}

export const getStoryById = async (storyId: string) => {
  const response = await axiosClient.get(`/stories/my/${storyId}`)
  return response.data as StoryItem
}

/** Story mới nhất có videoPrompts + imageUrls, mặc định không quá 1 giờ. */
export const getLatestGrokReadyStory = async (options?: { maxAgeMs?: number }) => {
  const response = await axiosClient.get('/stories/my/latest-grok-ready', {
    params: {
      maxAgeMs: options?.maxAgeMs ?? 3_600_000,
    },
  })
  return response.data as StoryItem
}

export const patchStory = async (
  storyId: string,
  payload: { videoPrompts?: string[]; videoStorageAddresses?: string[] },
) => {
  const response = await axiosClient.patch(`/stories/${storyId}`, payload)
  return response.data as StoryItem
}

export const syncStorySourceFromReel = async (payload: {
  sourceContent: string
  sourceReelUrl: string
  name?: string
}) => {
  const response = await axiosClient.post('/stories/sources/sync', payload)
  return response.data as {
    _id: string
    userId: string
    name: string
    sourceContent: string
    sourceReelUrl: string
    usageCount?: number
    createdAt?: string
    updatedAt?: string
  }
}

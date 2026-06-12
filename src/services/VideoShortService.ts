import axiosClient from '@/utils/axiosClient'

/** Khớp BE `MIN_SOURCE_CONTENT_LENGTH` — caption reel phải đủ dài mới sync được. */
export const MIN_VIDEO_SOURCE_CONTENT_LENGTH = 256

export type VideoShortItem = {
  _id: string
  userId: string
  videoShortTopicId: string
  /** Nguồn video (reel) — nhiều video ngắn có thể cùng một nguồn */
  videoSourceId?: string
  name: string
  sourceContent: string
  sourceReelUrl: string
  shortContent?: string
  longContent?: string
  blogPostUrl?: string
  fbReelUrl?: string
  /** Lượt ghi nhận trên nguồn reel — chung cho mọi video ngắn cùng nguồn */
  usageCount?: number
  videoPrompts?: string[]
  imageUrls?: string[]
  videoStorageAddresses?: string[]
  createdAt?: string
  updatedAt?: string
}

export const createVideoShortFromReel = async (payload: {
  sourceReelUrl: string
  name?: string
  videoShortTopicId?: string
  videoPrompts?: string[]
  shortContent?: string
  longContent?: string
  /** URL ảnh trên Cloudinary (đã upload trực tiếp từ extension). */
  imageUrls?: string[]
}) => {
  const response = await axiosClient.post('/video-shorts', payload)
  return response.data as VideoShortItem
}

export type VideoShortsPagination = {
  total: number
  page: number
  limit: number
  totalPages: number
}

export type PaginatedVideoShortsResponse = {
  items: VideoShortItem[]
  pagination: VideoShortsPagination
}

export type GetMyVideoShortsParams = {
  page?: number
  limit?: number
  q?: string
  hasLongContent?: boolean
}

export const getMyVideoShorts = async (params?: GetMyVideoShortsParams) => {
  const response = await axiosClient.get('/video-shorts/my', {
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
  }) as PaginatedVideoShortsResponse
}

/** Một bản ghi VideoSource (mới trước, usageCount thấp trước khi trùng thời điểm). */
export type VideoSourceListItem = {
  _id: string
  sourceContent: string
  sourceReelUrl: string
  name: string
  usageCount: number
  skipReason?: string
  createdAt?: string
  updatedAt?: string
}

export const getMyVideoSources = async () => {
  const response = await axiosClient.get('/video-sources/my')
  return (response.data || []) as VideoSourceListItem[]
}

export type VideoSourceReelCheckResult = {
  saved: boolean
  videoSourceId?: string
  canonicalUrl?: string
  myUsageCount: number
  globalUsageCount: number
}

export type IncrementVideoShortUsageResult = {
  videoShortId: string
  canonicalUrl: string
  myUsageCount: number
  globalUsageCount: number
}

export const checkVideoSourceForReel = async (sourceReelUrl: string) => {
  const response = await axiosClient.get('/video-sources/check-reel', {
    params: { url: sourceReelUrl },
  })
  return response.data as VideoSourceReelCheckResult
}

export const incrementVideoShortUsage = async (videoShortId: string) => {
  const response = await axiosClient.post(`/video-shorts/${videoShortId}/increment-usage`)
  return response.data as IncrementVideoShortUsageResult
}

export const getVideoShortById = async (videoShortId: string) => {
  const response = await axiosClient.get(`/video-shorts/my/${videoShortId}`)
  return response.data as VideoShortItem
}

/** Video ngắn mới nhất có videoPrompts + imageUrls, mặc định không quá 1 giờ. */
export const getLatestGrokReadyVideoShort = async (options?: { maxAgeMs?: number }) => {
  const response = await axiosClient.get('/video-shorts/my/latest-grok-ready', {
    params: {
      maxAgeMs: options?.maxAgeMs ?? 3_600_000,
    },
  })
  return response.data as VideoShortItem
}

export const patchVideoShort = async (
  videoShortId: string,
  payload: { videoPrompts?: string[]; videoStorageAddresses?: string[] },
) => {
  const response = await axiosClient.patch(`/video-shorts/${videoShortId}`, payload)
  return response.data as VideoShortItem
}

export const syncVideoSourceFromReel = async (payload: {
  sourceContent: string
  sourceReelUrl: string
  name?: string
}) => {
  const response = await axiosClient.post('/video-sources/sync', payload)
  return response.data as {
    _id: string
    userId: string
    name: string
    sourceContent: string
    sourceReelUrl: string
    usageCount?: number
    skipReason?: string
    createdAt?: string
    updatedAt?: string
  }
}

export const skipVideoSourceFromReel = async (payload: {
  sourceReelUrl: string
  name?: string
  reason?: string
}) => {
  const response = await axiosClient.post('/video-sources/skip', payload)
  return response.data as VideoSourceListItem
}

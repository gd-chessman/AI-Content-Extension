import axiosClient from '@/utils/axiosClient'

export type VideoShortItem = {
  _id: string
  userId: string
  videoShortTopicId: string
  videoSourceId?: string
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
  status?: string
}

export const getMyVideoShorts = async (params?: GetMyVideoShortsParams) => {
  const response = await axiosClient.get('/video-shorts/my', {
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
  }) as PaginatedVideoShortsResponse
}

export const getVideoShortById = async (videoShortId: string) => {
  const response = await axiosClient.get(`/video-shorts/my/${videoShortId}`)
  return response.data as VideoShortItem
}

export const patchVideoShort = async (
  videoShortId: string,
  payload: { videoPrompts?: string[]; videoStorageAddresses?: string[] },
) => {
  const response = await axiosClient.patch(`/video-shorts/${videoShortId}`, payload)
  return response.data as VideoShortItem
}

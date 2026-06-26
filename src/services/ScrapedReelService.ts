import axiosClient from '@/utils/axiosClient'

export type ScrapedReelApiItem = {
  id: string
  reelUrl: string
  title: string
  description: string
  viewsLabel: string
  viewCount: number
  imageUrl: string
}

export type ScrapedReelsApiResponse = {
  fanpageUrl: string
  minViews: number
  maxViews: number | null
  limit: number | null
  totalMatched: number
  items: ScrapedReelApiItem[]
}

export type UpsertScrapedReelsResponse = {
  fanpageUrl: string
  requested: number
  inserted: number
  updated: number
  matched?: number
  skipped: number
}

export const getScrapedReelsFromDb = async (params: {
  fanpageUrl: string
  minViews: number
  maxViews?: number
  limit?: number
  excludeUrls?: string[]
}) => {
  const response = await axiosClient.get<ScrapedReelsApiResponse>('/scraped-reels', {
    params: {
      fanpageUrl: params.fanpageUrl,
      minViews: params.minViews,
      ...(params.maxViews != null && Number.isFinite(params.maxViews) && params.maxViews > 0
        ? { maxViews: params.maxViews }
        : {}),
      ...(params.limit != null ? { limit: params.limit } : {}),
      ...(params.excludeUrls?.length ? { excludeUrls: params.excludeUrls.join(',') } : {}),
    },
  })
  return response.data
}

export const upsertScrapedReelsToDb = async (params: {
  fanpageUrl: string
  items: Array<{
    reelUrl: string
    title?: string
    description?: string
    viewsLabel?: string
    viewCount?: number
    imageUrl?: string
    externalVideoId?: string
  }>
}) => {
  const response = await axiosClient.post<UpsertScrapedReelsResponse>('/scraped-reels/upsert', params)
  return response.data
}

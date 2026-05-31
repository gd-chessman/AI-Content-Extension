import axiosClient from '@/utils/axiosClient'
import type { StoryItem } from '@/services/StoryService'
import { stylizeTitleForDisplay } from '@/utils/textSearchNormalize'

export type GgSheetPushPayload = {
  title: string
  shortContent: string
  fullContent: string
}

export type GgSheetSetting = {
  ggSheetPath?: string
  titleColumn?: string
  shortContentColumn?: string
  fullContentColumn?: string
}

export type GgSheetPushResult = {
  ok: boolean
  targetRow?: number
  updatedRange?: string
  updatedCells?: number
}

export type GgSheetCompareRow = {
  rowNumber: number
  title: string
  shortContent: string
  shortContentPreview: string
  matchStatus: 'matched' | 'sheet_only'
  titleMatch: boolean
  shortMatch: boolean
  story?: {
    id: string
    name: string
    shortContentPreview: string
  }
}

export type GgSheetCompareResult = {
  configured: boolean
  sheetUrl: string
  sheetTitle: string
  columns: { title: string; shortContent: string; full: string }
  summary: {
    sheetRows: number
    matched: number
    sheetOnly: number
    dbOnly: number
  }
  rows: GgSheetCompareRow[]
  unmatchedStories: Array<{
    id: string
    name: string
    shortContentPreview: string
    createdAt?: string
  }>
}

export const getMyGgSheetSetting = async () => {
  const response = await axiosClient.get('/ggsheet/me')
  return response.data as GgSheetSetting
}

export const updateMyGgSheetSetting = async (payload: GgSheetSetting) => {
  const response = await axiosClient.patch('/ggsheet/me', payload)
  return response.data as GgSheetSetting
}

export const compareGgSheetWithStories = async () => {
  const response = await axiosClient.get('/ggsheet/compare')
  return response.data as GgSheetCompareResult
}

export function buildGgSheetPushPayloadFromStory(story: Pick<StoryItem, 'name' | 'shortContent' | 'longContent'>): GgSheetPushPayload {
  return {
    title: stylizeTitleForDisplay((story.name || '').trim()),
    shortContent: (story.shortContent || '').trim(),
    fullContent: (story.longContent || story.shortContent || '').trim(),
  }
}

export const pushGgSheetContent = async (payload: GgSheetPushPayload) => {
  const response = await axiosClient.post('/ggsheet/push', payload)
  return response.data as GgSheetPushResult
}

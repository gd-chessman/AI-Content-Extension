import axiosClient from '@/utils/axiosClient'

export type GgSheetSetting = {
  ggSheetPath?: string
}

export type GgSheetPushPayload = {
  title?: string
  shortContent?: string
  fullContent?: string
}

export type GgSheetPushPreview = {
  sheetId: string
  targetRow: number
  targetRange: string
  sheetUrl: string
  data: Required<GgSheetPushPayload>
}

const GGSHEET_CACHE_KEY = 'ggSheetSettingCache'

const cacheGgSheetSetting = (setting: GgSheetSetting) => {
  try {
    localStorage.setItem(GGSHEET_CACHE_KEY, JSON.stringify(setting || {}))
  } catch {
    // ignore cache error
  }
}

export const getCachedGgSheetSetting = (): GgSheetSetting => {
  try {
    const raw = localStorage.getItem(GGSHEET_CACHE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as GgSheetSetting
    return parsed || {}
  } catch {
    return {}
  }
}

export const getMyGgSheetSetting = async () => {
  const response = await axiosClient.get('/ggsheet/me')
  const setting = response.data as GgSheetSetting
  cacheGgSheetSetting(setting)
  return setting
}

export const updateMyGgSheetSetting = async (payload: GgSheetSetting) => {
  const response = await axiosClient.patch('/ggsheet/me', payload)
  const setting = response.data as GgSheetSetting
  cacheGgSheetSetting(setting)
  return setting
}

export const previewPushGgSheet = async (payload: GgSheetPushPayload) => {
  const response = await axiosClient.post('/ggsheet/push/preview', payload)
  return response.data as GgSheetPushPreview
}

export const pushGgSheet = async (payload: GgSheetPushPayload) => {
  const response = await axiosClient.post('/ggsheet/push', payload)
  return response.data as { ok: boolean; targetRow: number; updatedRange: string; updatedCells: number }
}

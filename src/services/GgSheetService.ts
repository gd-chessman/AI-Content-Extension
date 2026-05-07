import axiosClient from '@/utils/axiosClient'

export type GgSheetSetting = {
  ggSheetPath?: string
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

import axiosClient from '@/utils/axiosClient'

export type UserSettings = {
  adminPath?: string
  ggSheetPath?: string
}

const SETTINGS_CACHE_KEY = 'userSettingsCache'

const cacheSettings = (settings: UserSettings) => {
  try {
    localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(settings || {}))
  } catch {
    // ignore cache error
  }
}

export const getCachedSettings = (): UserSettings => {
  try {
    const raw = localStorage.getItem(SETTINGS_CACHE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as UserSettings
    return parsed || {}
  } catch {
    return {}
  }
}

export const getMySettings = async () => {
  const response = await axiosClient.get('/settings/me')
  const settings = response.data as UserSettings
  cacheSettings(settings)
  return settings
}

export const updateMySettings = async (payload: UserSettings) => {
  const response = await axiosClient.patch('/settings/me', payload)
  const settings = response.data as UserSettings
  cacheSettings(settings)
  return settings
}

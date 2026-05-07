import axiosClient from '@/utils/axiosClient'

export type WebBlogSetting = {
  adminPath?: string
}

const WEBBLOG_CACHE_KEY = 'webBlogSettingCache'

const cacheWebBlogSetting = (setting: WebBlogSetting) => {
  try {
    localStorage.setItem(WEBBLOG_CACHE_KEY, JSON.stringify(setting || {}))
  } catch {
    // ignore cache error
  }
}

export const getCachedWebBlogSetting = (): WebBlogSetting => {
  try {
    const raw = localStorage.getItem(WEBBLOG_CACHE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as WebBlogSetting
    return parsed || {}
  } catch {
    return {}
  }
}

export const getMyWebBlogSetting = async () => {
  const response = await axiosClient.get('/webblog/me')
  const setting = response.data as WebBlogSetting
  cacheWebBlogSetting(setting)
  return setting
}

export const updateMyWebBlogSetting = async (payload: WebBlogSetting) => {
  const response = await axiosClient.patch('/webblog/me', payload)
  const setting = response.data as WebBlogSetting
  cacheWebBlogSetting(setting)
  return setting
}

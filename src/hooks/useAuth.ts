import { create } from 'zustand'
import { getMe } from '@/services/AuthService'

const AUTH_STORAGE_KEY = 'isAuthenticated'

const getInitialAuth = () => {
  try {
    return localStorage.getItem(AUTH_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

const setAuthStorage = (value: boolean) => {
  try {
    localStorage.setItem(AUTH_STORAGE_KEY, value ? 'true' : 'false')
  } catch {
    // ignore storage errors
  }
}

export const useAuth = create<{
  isAuthenticated: boolean
  /** Role từ GET /users/me — `null` khi chưa hydrate hoặc đã đăng xuất */
  role: string | null
  setAuthenticated: (value: boolean) => void
  checkAuth: () => Promise<boolean>
  refreshRoleOnly: () => Promise<void>
}>((set) => ({
  isAuthenticated: getInitialAuth(),
  role: null,
  setAuthenticated: (value) => {
    setAuthStorage(value)
    if (!value) {
      set({ isAuthenticated: false, role: null })
      return
    }
    set({ isAuthenticated: true })
  },
  checkAuth: async () => {
    try {
      const me = await getMe()
      setAuthStorage(true)
      set({ isAuthenticated: true, role: (me?.role as string) || 'user' })
      return true
    } catch {
      setAuthStorage(false)
      set({ isAuthenticated: false, role: null })
      return false
    }
  },
  refreshRoleOnly: async () => {
    try {
      const me = await getMe()
      set({ role: (me?.role as string) || 'user' })
    } catch {
      // giữ nguyên role hiện tại nếu lỗi mạng
    }
  },
}))

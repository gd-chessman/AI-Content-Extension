import { create } from 'zustand'
import { getMe } from '@/services/AuthService'

const AUTH_STORAGE_KEY = 'web_console_authenticated'

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
    // ignore
  }
}

export type AuthUser = {
  id: string
  username: string
  name: string
  role: string
}

export const useAuth = create<{
  isAuthenticated: boolean
  user: AuthUser | null
  setAuthenticated: (value: boolean) => void
  checkAuth: () => Promise<boolean>
  logout: () => void
}>((set) => ({
  isAuthenticated: getInitialAuth(),
  user: null,
  setAuthenticated: (value) => {
    setAuthStorage(value)
    if (!value) {
      set({ isAuthenticated: false, user: null })
      return
    }
    set({ isAuthenticated: true })
  },
  checkAuth: async () => {
    try {
      const me = await getMe()
      setAuthStorage(true)
      set({
        isAuthenticated: true,
        user: {
          id: me._id,
          username: me.username,
          name: (me.name || me.username || '').trim(),
          role: (me.role || 'user').trim(),
        },
      })
      return true
    } catch {
      setAuthStorage(false)
      set({ isAuthenticated: false, user: null })
      return false
    }
  },
  logout: () => {
    setAuthStorage(false)
    set({ isAuthenticated: false, user: null })
  },
}))

export const canUseMultiWorkflow = (role: string | undefined) =>
  role === 'admin' || role === 'user_vip'

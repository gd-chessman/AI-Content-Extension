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
  setAuthenticated: (value: boolean) => void
  checkAuth: () => Promise<boolean>
}>((set) => ({
  isAuthenticated: getInitialAuth(),
  setAuthenticated: (value) => {
    setAuthStorage(value)
    set({ isAuthenticated: value })
  },
  checkAuth: async () => {
    try {
      await getMe()
      setAuthStorage(true)
      set({ isAuthenticated: true })
      return true
    } catch {
      setAuthStorage(false)
      set({ isAuthenticated: false })
      return false
    }
  },
}))

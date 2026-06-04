import axiosClient from '@/utils/axiosClient'

export const loginPassword = async (username: string, password: string) => {
  const response = await axiosClient.post('/auth/login', { username, password })
  return response.data
}

export const logoutSession = async () => {
  const response = await axiosClient.post('/auth/logout')
  return response.data
}

export const getMe = async () => {
  const response = await axiosClient.get('/users/me')
  return response.data as {
    _id: string
    username: string
    name?: string
    role?: string
  }
}

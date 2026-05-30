import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios'

type RetryableRequestConfig = InternalAxiosRequestConfig & { _retry?: boolean }

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:8080'

const axiosClient = axios.create({
  baseURL: `${apiUrl}/api/v1`,
  withCredentials: true,
})

axiosClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetryableRequestConfig | undefined

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true
      try {
        await axios.post(`${apiUrl}/api/v1/auth/refresh`, {}, { withCredentials: true })
        return axiosClient(originalRequest)
      } catch {
        // refresh failed
      }
    }

    return Promise.reject(error)
  },
)

export default axiosClient

import { useState } from 'react'
import { loginPassword } from '@/services/AuthService'
import { useAuth } from '@/hooks/useAuth'

export default function LoginScreen({ onLoginSuccess }: { onLoginSuccess: () => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const setAuthenticated = useAuth((state) => state.setAuthenticated)
  const mapLoginError = (message?: string, status?: number) => {
    if (status === 401) return 'Sai tên đăng nhập hoặc mật khẩu.'
    if (status === 403) return 'Không có quyền truy cập.'
    if (status === 429) return 'Bạn thao tác quá nhanh, vui lòng thử lại sau.'
    if (!message) return 'Đăng nhập thất bại. Vui lòng thử lại.'

    const normalized = message.toLowerCase()
    if (normalized.includes('invalid username or password')) {
      return 'Sai tên đăng nhập hoặc mật khẩu.'
    }
    if (normalized.includes('not allowed by cors')) {
      return 'Nguồn truy cập chưa được cấp quyền (CORS).'
    }
    if (normalized.includes('network error')) {
      return 'Không thể kết nối tới máy chủ.'
    }
    return 'Đăng nhập thất bại. Vui lòng thử lại.'
  }

  const handleLogin = async () => {
    if (isSubmitting) return
    setErrorMessage('')
    setIsSubmitting(true)
    try {
      await loginPassword(username, password)
      setAuthenticated(true)
      onLoginSuccess()
    } catch (error: any) {
      const message = error?.response?.data?.message
      const status = error?.response?.status
      setErrorMessage(mapLoginError(message, status))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="glass-panel flex h-full min-h-0 flex-col rounded-3xl p-4">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center rounded-2xl border border-white/10 bg-black/30 p-4">
        <h1 className="text-2xl font-semibold text-white">Đăng nhập</h1>
        <p className="mt-1 text-xs text-slate-400">Nhập thông tin để sử dụng AI Content Extension.</p>

        <form
          className="mt-5 space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            void handleLogin()
          }}
        >
          <div className="space-y-1.5">
            <label htmlFor="username" className="text-xs font-medium text-slate-300">
              Tên đăng nhập
            </label>
            <input
              id="username"
              type="text"
              placeholder="Nhập tên đăng nhập"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-blue-400/70"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="text-xs font-medium text-slate-300">
              Mật khẩu
            </label>
            <input
              id="password"
              type="password"
              placeholder="Nhập mật khẩu"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-blue-400/70"
            />
          </div>

          {errorMessage ? (
            <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
              {errorMessage}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="primary-blue-btn inline-flex w-full cursor-pointer items-center justify-center rounded-full px-3 py-2 text-sm font-semibold transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSubmitting ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </button>
        </form>
      </div>
    </section>
  )
}


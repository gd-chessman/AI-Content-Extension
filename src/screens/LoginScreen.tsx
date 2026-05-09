import { useState } from 'react'
import { loginPassword } from '@/services/AuthService'
import { useAuth } from '@/hooks/useAuth'
import { FiEye, FiEyeOff, FiLock, FiLogIn, FiUser } from 'react-icons/fi'

export default function LoginScreen({ onLoginSuccess }: { onLoginSuccess: () => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const checkAuth = useAuth((state) => state.checkAuth)
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
      await checkAuth()
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
    <section className="flex h-full min-h-0 flex-col p-4">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center">
        <div className="overflow-hidden rounded-3xl bg-linear-to-b from-slate-900/90 to-slate-950/95 shadow-[0_16px_60px_rgba(15,23,42,0.45)]">
          <div className="border-b border-white/10 bg-linear-to-r from-blue-500/20 via-indigo-500/10 to-cyan-500/20 p-4">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-blue-300/30 bg-blue-500/20 text-blue-100">
              <FiLogIn className="h-5 w-5" />
            </div>
            <h1 className="mt-3 text-2xl font-semibold text-white">Đăng nhập</h1>
            <p className="mt-1 text-xs text-slate-300">Nhập thông tin để sử dụng AI Content Extension.</p>
          </div>

          <form
            className="space-y-4 bg-black/55 p-4 backdrop-blur-[1px]"
            onSubmit={(event) => {
              event.preventDefault()
              void handleLogin()
            }}
          >
            <div className="space-y-1.5">
              <label htmlFor="username" className="text-xs font-medium text-slate-300">
                Tên đăng nhập
              </label>
              <div className="flex items-center rounded-xl border border-white/10 bg-slate-900/80 transition focus-within:border-blue-400/70 focus-within:ring-2 focus-within:ring-blue-500/20">
                <span className="pl-3 text-slate-500">
                  <FiUser className="h-4 w-4" />
                </span>
                <input
                  id="username"
                  type="text"
                  placeholder="Nhập tên đăng nhập"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  className="w-full bg-transparent px-2.5 py-2.5 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="text-xs font-medium text-slate-300">
                Mật khẩu
              </label>
              <div className="flex items-center rounded-xl border border-white/10 bg-slate-900/80 transition focus-within:border-blue-400/70 focus-within:ring-2 focus-within:ring-blue-500/20">
                <span className="pl-3 text-slate-500">
                  <FiLock className="h-4 w-4" />
                </span>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Nhập mật khẩu"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full bg-transparent px-2.5 py-2.5 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="pr-3 text-slate-400 transition hover:text-slate-200"
                  aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  title={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                >
                  {showPassword ? <FiEye className="h-4 w-4" /> : <FiEyeOff className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {errorMessage ? (
              <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
                {errorMessage}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className="primary-blue-btn inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-full px-3 py-2.5 text-sm font-semibold transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <FiLogIn className="h-4 w-4" />
              {isSubmitting ? 'Đang đăng nhập...' : 'Đăng nhập'}
            </button>
          </form>
        </div>
      </div>
    </section>
  )
}


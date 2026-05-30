import { useNavigate, useLocation } from 'react-router-dom'
import { useState } from 'react'
import { FiEye, FiEyeOff, FiLock, FiLogIn, FiUser } from 'react-icons/fi'
import { loginPassword } from '@/services/AuthService'
import { useAuth } from '@/hooks/useAuth'

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const checkAuth = useAuth((state) => state.checkAuth)

  const from =
    (location.state as { from?: string } | null)?.from &&
    (location.state as { from?: string }).from !== '/login'
      ? (location.state as { from?: string }).from!
      : '/overview'

  const handleLogin = async () => {
    if (isSubmitting) return
    setErrorMessage('')
    setIsSubmitting(true)
    try {
      await loginPassword(username, password)
      await checkAuth()
      void navigate(from, { replace: true })
    } catch (error: unknown) {
      const err = error as { response?: { status?: number; data?: { message?: string } } }
      const status = err.response?.status
      if (status === 401) setErrorMessage('Sai tên đăng nhập hoặc mật khẩu.')
      else if (status === 403) setErrorMessage('Không có quyền truy cập.')
      else setErrorMessage('Đăng nhập thất bại. Kiểm tra kết nối backend.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="flex min-h-screen items-center justify-center bg-[var(--app-bg)] p-6 text-[var(--app-text)]">
      <div className="mx-auto w-full max-w-md">
        <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#121212] shadow-[0_16px_60px_rgba(0,0,0,0.55)]">
          <div className="border-b border-white/10 bg-black/40 p-6">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-sky-500/25 bg-sky-500/10 text-sky-400">
              <FiLogIn className="h-5 w-5" />
            </div>
            <h1 className="mt-3 text-2xl font-semibold text-white">Web Console</h1>
            <p className="mt-1 text-xs text-neutral-300">
              Quan sát và điều khiển multi workflow. Extension thực thi trên Chrome.
            </p>
          </div>

          <form
            className="space-y-4 bg-black/55 p-6 backdrop-blur-[1px]"
            onSubmit={(e) => {
              e.preventDefault()
              void handleLogin()
            }}
          >
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-neutral-300">Tên đăng nhập</span>
              <div className="field-input flex items-center rounded-xl">
                <FiUser className="ml-3 h-4 w-4 text-neutral-500" />
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-transparent px-2.5 py-2.5 text-sm text-neutral-100 outline-none placeholder:text-neutral-500"
                  placeholder="Nhập tên đăng nhập"
                  autoComplete="username"
                />
              </div>
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-neutral-300">Mật khẩu</span>
              <div className="field-input flex items-center rounded-xl">
                <FiLock className="ml-3 h-4 w-4 text-neutral-500" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-transparent px-2.5 py-2.5 text-sm text-neutral-100 outline-none placeholder:text-neutral-500"
                  placeholder="Nhập mật khẩu"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="mr-3 text-neutral-400 transition hover:text-neutral-200"
                  aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                >
                  {showPassword ? <FiEye className="h-4 w-4" /> : <FiEyeOff className="h-4 w-4" />}
                </button>
              </div>
            </label>

            {errorMessage ? (
              <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
                {errorMessage}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className="primary-blue-btn inline-flex w-full items-center justify-center gap-2 rounded-full px-3 py-2.5 text-sm transition hover:opacity-90"
            >
              <FiLogIn className="h-4 w-4" />
              {isSubmitting ? 'Đang đăng nhập…' : 'Đăng nhập'}
            </button>
          </form>
        </div>
      </div>
    </section>
  )
}

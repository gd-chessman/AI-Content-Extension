import { useEffect, useState } from 'react'
import { FiSettings, FiUser } from 'react-icons/fi'
import { getMe, logoutSession } from '@/services/AuthService'
import { useAuth } from '@/hooks/useAuth'

export default function ProfileScreen({ onLogout }: { onLogout: () => void }) {
  const [activeTab, setActiveTab] = useState<'overview' | 'config'>('overview')
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [isLoadingProfile, setIsLoadingProfile] = useState(true)
  const [profile, setProfile] = useState<{ username: string; role: string; isActive: boolean } | null>(null)
  const setAuthenticated = useAuth((state) => state.setAuthenticated)
  const getRoleLabel = (role: string) => {
    if (role === 'admin') return 'Quản trị viên'
    if (role === 'user') return 'Người dùng'
    return role
  }

  useEffect(() => {
    const loadProfile = async () => {
      setIsLoadingProfile(true)
      try {
        const data = await getMe()
        setProfile({
          username: data?.username || '',
          role: data?.role || 'user',
          isActive: Boolean(data?.isActive),
        })
      } catch {
        setProfile(null)
      } finally {
        setIsLoadingProfile(false)
      }
    }
    void loadProfile()
  }, [])

  const handleLogout = async () => {
    if (isLoggingOut) return
    setIsLoggingOut(true)
    try {
      await logoutSession()
    } finally {
      setAuthenticated(false)
      onLogout()
      setIsLoggingOut(false)
    }
  }

  return (
    <section className="glass-panel flex h-full min-h-0 flex-col rounded-3xl p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-white">Hồ sơ</h2>
        <button
          type="button"
          onClick={() => void handleLogout()}
          disabled={isLoggingOut}
          className="cursor-pointer rounded-lg border border-rose-400/35 bg-rose-500/15 px-2.5 py-1.5 text-[11px] font-semibold text-rose-200 transition hover:bg-rose-500/25 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoggingOut ? 'Đang đăng xuất...' : 'Đăng xuất'}
        </button>
      </div>

      <div className="mt-3 grid min-h-0 flex-1 grid-cols-[56px_minmax(0,1fr)] gap-3">
        <aside className="rounded-xl border border-white/10 bg-white/5 p-1">
          <div className="flex flex-col items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              title="Tổng quan"
              aria-label="Tổng quan"
              className={`inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-md text-xs font-semibold transition ${
                activeTab === 'overview' ? 'primary-blue-btn' : 'text-slate-300 hover:bg-white/10'
              }`}
            >
              <FiUser className="h-4 w-4 text-emerald-300" />
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('config')}
              title="Cấu hình"
              aria-label="Cấu hình"
              className={`inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-md text-xs font-semibold transition ${
                activeTab === 'config' ? 'primary-blue-btn' : 'text-slate-300 hover:bg-white/10'
              }`}
            >
              <FiSettings className="h-4 w-4 text-amber-300" />
            </button>
          </div>
        </aside>

        <div className="min-h-0 rounded-xl border border-white/10 bg-black/25 p-3 text-xs text-slate-300">
        {activeTab === 'overview' ? (
          <div className="space-y-2">
            <p className="font-semibold text-slate-100">Tổng quan</p>
            <p>Hiển thị thông tin tài khoản và trạng thái sử dụng extension.</p>
            <div className="mt-3 rounded-xl border border-white/10 bg-slate-900/60 p-3">
              <p className="mb-2 text-[11px] font-semibold text-slate-100">Thông tin cá nhân</p>
              {isLoadingProfile ? (
                <p className="text-[11px] text-slate-400">Đang tải thông tin...</p>
              ) : profile ? (
                <div className="space-y-1 text-[11px] text-slate-300">
                  <p>
                    <span className="text-slate-400">Username:</span> {profile.username}
                  </p>
                  <p>
                    <span className="text-slate-400">Vai trò:</span> {getRoleLabel(profile.role)}
                  </p>
                  <p>
                    <span className="text-slate-400">Trạng thái:</span>{' '}
                    {profile.isActive ? 'Đang hoạt động' : 'Đã khóa'}
                  </p>
                </div>
              ) : (
                <p className="text-[11px] text-rose-300">Không tải được thông tin cá nhân.</p>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="font-semibold text-slate-100">Cấu hình</p>
            <p>Hiển thị các tuỳ chỉnh hệ thống và cá nhân hoá.</p>
          </div>
        )}
        </div>
      </div>
    </section>
  )
}

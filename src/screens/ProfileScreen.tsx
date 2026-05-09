import { useEffect, useState } from 'react'
import { FiEdit2, FiLogOut, FiSave, FiSettings, FiUser, FiX } from 'react-icons/fi'
import { getMe, logoutSession, updateMe } from '@/services/AuthService'
import { useAuth } from '@/hooks/useAuth'

export default function ProfileScreen({ onLogout }: { onLogout: () => void }) {
  const [activeTab, setActiveTab] = useState<'overview' | 'config'>('overview')
  const [status, setStatus] = useState('')
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [isLoadingProfile, setIsLoadingProfile] = useState(true)
  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const [isEditingProfile, setIsEditingProfile] = useState(false)
  const [profile, setProfile] = useState<{
    username: string
    name: string
    role: string
    isActive: boolean
    avatarUrl: string
    telegramId: string
    birthDate: string
    gender: 'male' | 'female' | 'other'
  } | null>(null)
  const [nameInput, setNameInput] = useState('')
  const [avatarUrlInput, setAvatarUrlInput] = useState('')
  const [telegramIdInput, setTelegramIdInput] = useState('')
  const [birthDateInput, setBirthDateInput] = useState('')
  const [genderInput, setGenderInput] = useState<'male' | 'female' | 'other'>('other')
  const setAuthenticated = useAuth((state) => state.setAuthenticated)
  const getRoleLabel = (role: string) => {
    if (role === 'admin') return 'Quản trị viên'
    if (role === 'user-vip') return 'Người dùng VIP'
    if (role === 'user') return 'Người dùng'
    return role
  }

  const getGenderLabel = (gender: string) => {
    if (gender === 'male') return 'Nam'
    if (gender === 'female') return 'Nữ'
    return 'Khác'
  }

  const formatBirthDate = (value?: string) => {
    const raw = (value || '').trim()
    if (!raw) return 'Chưa cập nhật'
    const date = new Date(raw)
    if (Number.isNaN(date.getTime())) return 'Chưa cập nhật'
    return date.toLocaleDateString('vi-VN')
  }

  useEffect(() => {
    const loadProfile = async () => {
      setIsLoadingProfile(true)
      try {
        const data = await getMe()
        setProfile({
          username: data?.username || '',
          name: data?.name || '',
          role: data?.role || 'user',
          isActive: Boolean(data?.isActive),
          avatarUrl: data?.avatarUrl || '',
          telegramId: data?.telegramId || '',
          birthDate: data?.birthDate || '',
          gender: (data?.gender as 'male' | 'female' | 'other') || 'other',
        })
        setNameInput(data?.name || '')
        setAvatarUrlInput(data?.avatarUrl || '')
        setTelegramIdInput(data?.telegramId || '')
        setBirthDateInput(data?.birthDate ? new Date(data.birthDate).toISOString().slice(0, 10) : '')
        setGenderInput((data?.gender as 'male' | 'female' | 'other') || 'other')
      } catch {
        setProfile(null)
        setNameInput('')
        setAvatarUrlInput('')
        setTelegramIdInput('')
        setBirthDateInput('')
        setGenderInput('other')
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

  const handleSaveProfile = async () => {
    if (isSavingProfile) return
    setIsSavingProfile(true)
    try {
      const updated = await updateMe({
        name: nameInput.trim(),
        avatarUrl: avatarUrlInput.trim(),
        telegramId: telegramIdInput.trim(),
        birthDate: birthDateInput.trim(),
        gender: genderInput,
      })
      setProfile({
        username: updated?.username || profile?.username || '',
        name: updated?.name || '',
        role: updated?.role || profile?.role || 'user',
        isActive: Boolean(updated?.isActive),
        avatarUrl: updated?.avatarUrl || '',
        telegramId: updated?.telegramId || '',
        birthDate: updated?.birthDate || '',
        gender: (updated?.gender as 'male' | 'female' | 'other') || 'other',
      })
      setIsEditingProfile(false)
      setStatus('Đã lưu thông tin cá nhân.')
    } catch (error: any) {
      const msg = String(error?.response?.data?.message || '').toLowerCase()
      if (msg.includes('avatar url')) {
        setStatus('URL ảnh đại diện không hợp lệ (chỉ chấp nhận http/https).')
      } else if (msg.includes('birth date')) {
        setStatus('Ngày sinh không hợp lệ.')
      } else if (msg.includes('invalid gender')) {
        setStatus('Giới tính không hợp lệ.')
      } else {
        setStatus('Không thể lưu thông tin cá nhân.')
      }
    } finally {
      setIsSavingProfile(false)
    }
  }

  const startEditProfile = () => {
    setAvatarUrlInput(profile?.avatarUrl || '')
    setTelegramIdInput(profile?.telegramId || '')
    setNameInput(profile?.name || '')
    setBirthDateInput(profile?.birthDate ? new Date(profile.birthDate).toISOString().slice(0, 10) : '')
    setGenderInput((profile?.gender as 'male' | 'female' | 'other') || 'other')
    setIsEditingProfile(true)
  }

  const cancelEditProfile = () => {
    setAvatarUrlInput(profile?.avatarUrl || '')
    setTelegramIdInput(profile?.telegramId || '')
    setNameInput(profile?.name || '')
    setBirthDateInput(profile?.birthDate ? new Date(profile.birthDate).toISOString().slice(0, 10) : '')
    setGenderInput((profile?.gender as 'male' | 'female' | 'other') || 'other')
    setIsEditingProfile(false)
  }

  return (
    <section className="glass-panel flex h-full min-h-0 flex-col rounded-3xl p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-white">Hồ sơ</h2>
        <button
          type="button"
          onClick={() => void handleLogout()}
          disabled={isLoggingOut}
          title={isLoggingOut ? 'Đang đăng xuất...' : 'Đăng xuất'}
          aria-label={isLoggingOut ? 'Đang đăng xuất...' : 'Đăng xuất'}
          className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-rose-400/35 bg-rose-500/15 text-rose-200 transition hover:bg-rose-500/25 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoggingOut ? <span className="animate-pulse text-[12px]">…</span> : <FiLogOut className="h-4 w-4" />}
        </button>
      </div>
      {status ? (
        <p className="mt-2 rounded-lg border border-white/10 bg-black/25 px-2.5 py-1.5 text-[11px] text-slate-300">
          {status}
        </p>
      ) : null}

      <div className="mt-3 grid min-h-0 flex-1 grid-cols-[56px_minmax(0,1fr)] gap-3">
        <aside className="rounded-xl border border-white/10 bg-white/5 p-1">
          <div className="flex flex-col items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              title="Tổng quan"
              aria-label="Tổng quan"
              className={`inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-md text-xs font-semibold transition ${
                activeTab === 'overview' ? 'bg-blue-500/20 text-blue-300' : 'text-slate-300 hover:bg-white/10'
              }`}
            >
              <FiUser className={`h-4 w-4 ${activeTab === 'overview' ? 'text-blue-300' : 'text-emerald-300'}`} />
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('config')}
              title="Cấu hình"
              aria-label="Cấu hình"
              className={`inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-md text-xs font-semibold transition ${
                activeTab === 'config' ? 'bg-blue-500/20 text-blue-300' : 'text-slate-300 hover:bg-white/10'
              }`}
            >
              <FiSettings className={`h-4 w-4 ${activeTab === 'config' ? 'text-blue-300' : 'text-amber-300'}`} />
            </button>
          </div>
        </aside>

        <div className="min-h-0 rounded-xl border border-white/10 bg-black/25 p-3 text-xs text-slate-300">
        {activeTab === 'overview' ? (
          <div className="space-y-2">
            <p className="font-semibold text-slate-100">Tổng quan</p>
            <p>Hiển thị thông tin tài khoản và trạng thái sử dụng extension.</p>
            <div className="mt-3 rounded-xl border border-white/10 bg-slate-900/60 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[11px] font-semibold text-slate-100">Thông tin cá nhân</p>
                {isEditingProfile ? (
                  <div className="inline-flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => void cancelEditProfile()}
                      className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-md bg-white/10 text-slate-200 transition hover:bg-white/20"
                      title="Hủy sửa"
                      aria-label="Hủy sửa"
                    >
                      <FiX className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSaveProfile()}
                      disabled={isSavingProfile}
                      className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-md bg-emerald-500/20 text-emerald-100 transition hover:bg-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                      title={isSavingProfile ? 'Đang lưu...' : 'Lưu'}
                      aria-label={isSavingProfile ? 'Đang lưu...' : 'Lưu'}
                    >
                      {isSavingProfile ? <span className="animate-pulse">…</span> : <FiSave className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => void startEditProfile()}
                    className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-md bg-blue-500/20 text-blue-100 transition hover:bg-blue-500/30"
                    title="Sửa thông tin"
                    aria-label="Sửa thông tin"
                  >
                    <FiEdit2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {isLoadingProfile ? (
                <p className="text-[11px] text-slate-400">Đang tải thông tin...</p>
              ) : profile ? (
                <div className="space-y-1 text-[11px] text-slate-300">
                  <div className="mb-2 flex items-center gap-2">
                    {profile.avatarUrl ? (
                      <img
                        src={profile.avatarUrl}
                        alt="Ảnh đại diện"
                        className="h-12 w-12 rounded-full border border-white/10 object-cover"
                      />
                    ) : (
                      <span className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-slate-800/80 text-slate-400">
                        <FiUser className="h-5 w-5" />
                      </span>
                    )}
                    <div>
                      {isEditingProfile ? (
                        <div className="space-y-1.5">
                          <input
                            type="text"
                            value={nameInput}
                            onChange={(event) => setNameInput(event.target.value)}
                            placeholder="Tên hiển thị"
                            className="w-full rounded-md bg-slate-800/80 px-2 py-1 text-[11px] text-slate-100 outline-none placeholder:text-slate-500"
                          />
                          <select
                            value={genderInput}
                            onChange={(event) => setGenderInput((event.target.value as 'male' | 'female' | 'other') || 'other')}
                            className="w-full rounded-md bg-slate-800/80 px-2 py-1 text-[11px] text-slate-100 outline-none"
                          >
                            <option value="male">Nam</option>
                            <option value="female">Nữ</option>
                            <option value="other">Khác</option>
                          </select>
                          <input
                            type="date"
                            value={birthDateInput}
                            onChange={(event) => setBirthDateInput(event.target.value)}
                            className="w-full rounded-md bg-slate-800/80 px-2 py-1 text-[11px] text-slate-100 outline-none"
                          />
                          <input
                            type="text"
                            value={telegramIdInput}
                            onChange={(event) => setTelegramIdInput(event.target.value)}
                            placeholder="Telegram ID"
                            className="w-full rounded-md bg-slate-800/80 px-2 py-1 text-[11px] text-slate-100 outline-none placeholder:text-slate-500"
                          />
                        </div>
                      ) : (
                        <>
                          <p>
                            <span className="text-xs font-semibold text-slate-100">
                              {profile.name || 'Chưa cập nhật'}
                            </span>
                          </p>
                          <p>
                            <span className="text-slate-400">Ngày sinh:</span> {formatBirthDate(profile.birthDate)}
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                  {isEditingProfile ? (
                    <div>
                      <p className="mb-1 text-slate-400">URL ảnh đại diện</p>
                      <input
                        type="text"
                        value={avatarUrlInput}
                        onChange={(event) => setAvatarUrlInput(event.target.value)}
                        placeholder="https://..."
                        className="w-full rounded-md bg-slate-800/80 px-2 py-1.5 text-[11px] text-slate-100 outline-none placeholder:text-slate-500"
                      />
                    </div>
                  ) : null}
                  <p>
                    <span className="text-slate-400">Username:</span> {profile.username}
                  </p>
                  <p>
                    <span className="text-slate-400">Giới tính:</span> {getGenderLabel(profile.gender)}
                  </p>
                  <p>
                    <span className="text-slate-400">Telegram ID:</span> {profile.telegramId || 'Chưa cập nhật'}
                  </p>
                  <p>
                    <span className="text-slate-400">Vai trò:</span> {getRoleLabel(profile.role)}
                  </p>
                  <p>
                    <span className="text-slate-400">Trạng thái:</span>{' '}
                    <span className="inline-flex items-center gap-1.5">
                      {profile.isActive ? (
                        <span className="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.9)]" />
                      ) : null}
                      {profile.isActive ? 'Đang hoạt động' : 'Đã khóa'}
                    </span>
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
            <p>Các tùy chỉnh hồ sơ đã chuyển sang tab Tổng quan (nút sửa thông tin).</p>
          </div>
        )}
        </div>
      </div>
    </section>
  )
}

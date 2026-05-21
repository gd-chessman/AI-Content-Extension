import { useEffect, useState } from 'react'
import { FiEdit2, FiFolder, FiLogOut, FiSave, FiSettings, FiTrash2, FiUser, FiX } from 'react-icons/fi'
import { getMe, logoutSession, updateMe } from '@/services/AuthService'
import { useAuth } from '@/hooks/useAuth'
import {
  clearContentRootDirectoryHandle,
  DEFAULT_STORIES_FOLDER_SEGMENT,
  getStoriesFolderSegmentFromStorage,
  loadContentRootDirectoryHandle,
  persistContentRootDirectoryHandle,
  setStoriesFolderSegmentInStorage,
  WORKSPACE_ROOT_PICKER_ID,
  WORKSPACE_STORY_SUBDIRS,
} from '@/utils/localWorkspacePersistence'
import {
  DEFAULT_SHORT_CONTENT_CUT_MODE,
  DEFAULT_SHORT_CONTENT_MAX_LINES,
  DEFAULT_SHORT_CONTENT_MAX_PERCENT,
  DEFAULT_SHORT_CONTENT_MIN_LINES,
  DEFAULT_SHORT_CONTENT_MIN_PERCENT,
  getShortContentCutConfigFromStorage,
  normalizeShortContentCutConfig,
  setShortContentCutConfigInStorage,
  type ShortContentCutMode,
} from '@/utils/shortContentCutConfig'

type ChromeStorageLocal = {
  get?: (keys: string | string[], callback: (items: Record<string, unknown>) => void) => void
  set?: (items: Record<string, unknown>, callback?: () => void) => void
}

type ChromePartial = {
  storage?: { local?: ChromeStorageLocal }
}

const getChrome = () => (globalThis as { chrome?: ChromePartial }).chrome

export default function ProfileScreen({ onLogout }: { onLogout: () => void }) {
  const [activeTab, setActiveTab] = useState<'overview' | 'config'>('overview')
  const [status, setStatus] = useState('')
  const [workspaceRootLabel, setWorkspaceRootLabel] = useState('')
  const [storiesFolderInput, setStoriesFolderInput] = useState(DEFAULT_STORIES_FOLDER_SEGMENT)
  const [isSavingWorkspaceStories, setIsSavingWorkspaceStories] = useState(false)
  const [shortCutMode, setShortCutMode] = useState<ShortContentCutMode>(DEFAULT_SHORT_CONTENT_CUT_MODE)
  const [shortMinPercentInput, setShortMinPercentInput] = useState(String(DEFAULT_SHORT_CONTENT_MIN_PERCENT))
  const [shortMaxPercentInput, setShortMaxPercentInput] = useState(String(DEFAULT_SHORT_CONTENT_MAX_PERCENT))
  const [shortMinLinesInput, setShortMinLinesInput] = useState(String(DEFAULT_SHORT_CONTENT_MIN_LINES))
  const [shortMaxLinesInput, setShortMaxLinesInput] = useState(String(DEFAULT_SHORT_CONTENT_MAX_LINES))
  const [isSavingShortCutConfig, setIsSavingShortCutConfig] = useState(false)
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

  useEffect(() => {
    if (activeTab !== 'config') return
    void (async () => {
      try {
        const h = await loadContentRootDirectoryHandle()
        setWorkspaceRootLabel(h?.name || '')
      } catch {
        setWorkspaceRootLabel('')
      }
      try {
        const seg = await getStoriesFolderSegmentFromStorage(getChrome()?.storage?.local)
        setStoriesFolderInput(seg)
      } catch {
        setStoriesFolderInput(DEFAULT_STORIES_FOLDER_SEGMENT)
      }
      try {
        const cfg = await getShortContentCutConfigFromStorage(getChrome()?.storage?.local)
        setShortCutMode(cfg.mode)
        setShortMinPercentInput(String(cfg.minPercent))
        setShortMaxPercentInput(String(cfg.maxPercent))
        setShortMinLinesInput(String(cfg.minLines))
        setShortMaxLinesInput(String(cfg.maxLines))
      } catch {
        setShortCutMode(DEFAULT_SHORT_CONTENT_CUT_MODE)
        setShortMinPercentInput(String(DEFAULT_SHORT_CONTENT_MIN_PERCENT))
        setShortMaxPercentInput(String(DEFAULT_SHORT_CONTENT_MAX_PERCENT))
        setShortMinLinesInput(String(DEFAULT_SHORT_CONTENT_MIN_LINES))
        setShortMaxLinesInput(String(DEFAULT_SHORT_CONTENT_MAX_LINES))
      }
    })()
  }, [activeTab])

  const pickWorkspaceRootDirectory = async () => {
    if (!('showDirectoryPicker' in window) || typeof window.showDirectoryPicker !== 'function') {
      setStatus('Trình duyệt không hỗ trợ chọn thư mục (File System Access API).')
      return
    }
    try {
      const handle = await window.showDirectoryPicker({
        id: WORKSPACE_ROOT_PICKER_ID,
        mode: 'readwrite',
      })
      await persistContentRootDirectoryHandle(handle)
      setWorkspaceRootLabel(handle.name)
      setStatus(`Đã đặt thư mục gốc: ${handle.name}`)
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
      const msg = e instanceof Error ? e.message : 'Lỗi không xác định'
      setStatus(`Không chọn được thư mục gốc: ${msg}`)
    }
  }

  const clearWorkspaceRootDirectory = async () => {
    try {
      await clearContentRootDirectoryHandle()
    } catch {
      /* ignore */
    }
    setWorkspaceRootLabel('')
    setStatus('Đã xóa thư mục gốc. Ảnh cắt đôi sẽ chỉ lưu qua Tải xuống của Chrome nếu không cấu hình lại.')
  }

  const saveShortContentCutConfig = async () => {
    if (isSavingShortCutConfig) return
    setIsSavingShortCutConfig(true)
    try {
      const saved = await setShortContentCutConfigInStorage(
        normalizeShortContentCutConfig({
          mode: shortCutMode,
          minPercent: Number(shortMinPercentInput),
          maxPercent: Number(shortMaxPercentInput),
          minLines: Number(shortMinLinesInput),
          maxLines: Number(shortMaxLinesInput),
        }),
        getChrome()?.storage?.local,
      )
      setShortCutMode(saved.mode)
      setShortMinPercentInput(String(saved.minPercent))
      setShortMaxPercentInput(String(saved.maxPercent))
      setShortMinLinesInput(String(saved.minLines))
      setShortMaxLinesInput(String(saved.maxLines))
      const rangeLabel =
        saved.mode === 'lines'
          ? `${saved.minLines} – ${saved.maxLines} dòng`
          : `${saved.minPercent}% – ${saved.maxPercent}% thân bài dài`
      setStatus(`Đã lưu cắt nội dung ngắn (${saved.mode === 'lines' ? 'theo dòng' : 'theo %'}): ${rangeLabel}.`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Lỗi không xác định'
      setStatus(`Không lưu được cấu hình cắt nội dung ngắn: ${msg}`)
    } finally {
      setIsSavingShortCutConfig(false)
    }
  }

  const saveWorkspaceStoriesFolderName = async () => {
    if (isSavingWorkspaceStories) return
    setIsSavingWorkspaceStories(true)
    try {
      await setStoriesFolderSegmentInStorage(getChrome()?.storage?.local, storiesFolderInput)
      const seg = await getStoriesFolderSegmentFromStorage(getChrome()?.storage?.local)
      setStoriesFolderInput(seg)
      setStatus(`Đã lưu tên thư mục stories: ${seg}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Lỗi không xác định'
      setStatus(`Không lưu được tên thư mục: ${msg}`)
    } finally {
      setIsSavingWorkspaceStories(false)
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

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-white/10 bg-black/25 text-xs text-slate-300">
        {activeTab === 'overview' ? (
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain p-3 pr-2">
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
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-3 pr-2">
            <div>
              <p className="font-semibold text-slate-100">Cấu hình lưu trữ cục bộ</p>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                Chọn một thư mục gốc trên máy. Bên trong sẽ dùng cấu trúc:{' '}
                <span className="text-slate-200">
                  [gốc] / [tên thư mục stories] / [tên story] / {WORKSPACE_STORY_SUBDIRS.join(' · ')}
                </span>
                . Ảnh cắt đôi từ ChatGPT được ghi vào <code className="text-emerald-200/90">images</code>; các thư mục{' '}
                <code className="text-emerald-200/90">content</code> và <code className="text-emerald-200/90">info</code>{' '}
                được tạo sẵn để bạn (hoặc bản sau của extension) đặt nội dung và metadata.
              </p>
            </div>

            <div className="rounded-xl border border-white/10 bg-slate-900/50 p-3">
              <p className="mb-2 text-[11px] font-semibold text-slate-100">Thư mục gốc</p>
              <p className="mb-2 text-[10px] text-slate-400">
                Hiện tại:{' '}
                <span className="font-medium text-slate-200">{workspaceRootLabel || 'Chưa chọn'}</span>
              </p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => void pickWorkspaceRootDirectory()}
                  className="inline-flex flex-1 min-w-[140px] cursor-pointer items-center justify-center gap-1.5 rounded-md bg-emerald-500/25 px-2 py-1.5 text-[11px] text-emerald-100 transition hover:bg-emerald-500/35"
                >
                  <FiFolder className="h-3.5 w-3.5 shrink-0" />
                  Chọn thư mục gốc
                </button>
                {workspaceRootLabel ? (
                  <button
                    type="button"
                    onClick={() => void clearWorkspaceRootDirectory()}
                    className="inline-flex cursor-pointer items-center justify-center gap-1 rounded-md border border-rose-400/30 bg-rose-500/10 px-2 py-1.5 text-[11px] text-rose-100 transition hover:bg-rose-500/20"
                  >
                    <FiTrash2 className="h-3.5 w-3.5" />
                    Xóa
                  </button>
                ) : null}
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-slate-900/50 p-3">
              <p className="mb-1 text-[11px] font-semibold text-slate-100">Thư mục chứa các story</p>
              <p className="mb-2 text-[10px] text-slate-400">
                Tên thư mục con ngay dưới thư mục gốc (mặc định <code className="text-slate-200">stories</code>). Mỗi
                story một thư mục con theo tên story trên hệ thống.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={storiesFolderInput}
                  onChange={(event) => setStoriesFolderInput(event.target.value)}
                  placeholder={DEFAULT_STORIES_FOLDER_SEGMENT}
                  className="min-w-0 flex-1 rounded-md border border-white/10 bg-slate-800/80 px-2 py-1.5 text-[11px] text-slate-100 outline-none placeholder:text-slate-500"
                  spellCheck={false}
                />
                <button
                  type="button"
                  onClick={() => void saveWorkspaceStoriesFolderName()}
                  disabled={isSavingWorkspaceStories}
                  className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md bg-blue-500/25 px-2 py-1.5 text-[11px] text-blue-100 transition hover:bg-blue-500/35 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSavingWorkspaceStories ? <span className="animate-pulse">…</span> : <FiSave className="h-3.5 w-3.5" />}
                  Lưu
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-slate-900/50 p-3">
              <p className="mb-1 text-[11px] font-semibold text-slate-100">Cắt nội dung ngắn (ChatGPT)</p>
              <p className="mb-2 text-[10px] leading-relaxed text-slate-400">
                Hai cơ chế: phần trăm thân bài dài (mặc định{' '}
                {DEFAULT_SHORT_CONTENT_MIN_PERCENT}–{DEFAULT_SHORT_CONTENT_MAX_PERCENT}%) hoặc số dòng (
                {DEFAULT_SHORT_CONTENT_MIN_LINES}–{DEFAULT_SHORT_CONTENT_MAX_LINES} dòng). Vẫn ưu tiên cắt tại dấu ? trong
                khoảng min–max.
              </p>
              <div className="mb-2 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setShortCutMode('percent')}
                  className={`cursor-pointer rounded-md px-2 py-1 text-[10px] transition ${
                    shortCutMode === 'percent'
                      ? 'bg-violet-500/30 text-violet-100'
                      : 'bg-white/5 text-slate-400 hover:bg-white/10'
                  }`}
                >
                  Theo %
                </button>
                <button
                  type="button"
                  onClick={() => setShortCutMode('lines')}
                  className={`cursor-pointer rounded-md px-2 py-1 text-[10px] transition ${
                    shortCutMode === 'lines'
                      ? 'bg-violet-500/30 text-violet-100'
                      : 'bg-white/5 text-slate-400 hover:bg-white/10'
                  }`}
                >
                  Theo dòng
                </button>
              </div>
              {shortCutMode === 'percent' ? (
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex min-w-[88px] flex-1 items-center gap-1.5 text-[10px] text-slate-400">
                    Min %
                    <input
                      type="number"
                      min={1}
                      max={98}
                      value={shortMinPercentInput}
                      onChange={(event) => setShortMinPercentInput(event.target.value)}
                      className="w-full min-w-0 rounded-md border border-white/10 bg-slate-800/80 px-2 py-1.5 text-[11px] text-slate-100 outline-none"
                    />
                  </label>
                  <label className="flex min-w-[88px] flex-1 items-center gap-1.5 text-[10px] text-slate-400">
                    Max %
                    <input
                      type="number"
                      min={2}
                      max={100}
                      value={shortMaxPercentInput}
                      onChange={(event) => setShortMaxPercentInput(event.target.value)}
                      className="w-full min-w-0 rounded-md border border-white/10 bg-slate-800/80 px-2 py-1.5 text-[11px] text-slate-100 outline-none"
                    />
                  </label>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex min-w-[88px] flex-1 items-center gap-1.5 text-[10px] text-slate-400">
                    Min dòng
                    <input
                      type="number"
                      min={1}
                      max={9999}
                      value={shortMinLinesInput}
                      onChange={(event) => setShortMinLinesInput(event.target.value)}
                      className="w-full min-w-0 rounded-md border border-white/10 bg-slate-800/80 px-2 py-1.5 text-[11px] text-slate-100 outline-none"
                    />
                  </label>
                  <label className="flex min-w-[88px] flex-1 items-center gap-1.5 text-[10px] text-slate-400">
                    Max dòng
                    <input
                      type="number"
                      min={2}
                      max={9999}
                      value={shortMaxLinesInput}
                      onChange={(event) => setShortMaxLinesInput(event.target.value)}
                      className="w-full min-w-0 rounded-md border border-white/10 bg-slate-800/80 px-2 py-1.5 text-[11px] text-slate-100 outline-none"
                    />
                  </label>
                </div>
              )}
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => void saveShortContentCutConfig()}
                  disabled={isSavingShortCutConfig}
                  className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md bg-violet-500/25 px-2 py-1.5 text-[11px] text-violet-100 transition hover:bg-violet-500/35 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSavingShortCutConfig ? <span className="animate-pulse">…</span> : <FiSave className="h-3.5 w-3.5" />}
                  Lưu
                </button>
              </div>
            </div>
          </div>
        )}
        </div>
      </div>
    </section>
  )
}

import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { FiActivity, FiBookOpen, FiGitBranch, FiLayers, FiLogOut, FiSettings } from 'react-icons/fi'
import { logoutSession } from '@/services/AuthService'
import { canUseMultiWorkflow, useAuth } from '@/hooks/useAuth'

const NAV = [
  { to: '/overview', label: 'Tổng quan', icon: FiActivity, iconClass: 'text-sky-400' },
  { to: '/stories', label: 'Câu chuyện', icon: FiBookOpen, iconClass: 'text-emerald-400' },
  { to: '/workflows', label: 'Quy trình', icon: FiGitBranch, iconClass: 'text-sky-400' },
  { to: '/runs', label: 'Lịch sử chạy', icon: FiLayers, iconClass: 'text-violet-400' },
  { to: '/multi-workflow', label: 'Quy trình đa bước', icon: FiSettings, iconClass: 'text-amber-400' },
] as const

function navLinkClass(isActive: boolean) {
  return [
    'flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition',
    isActive
      ? 'sidebar-link-active'
      : 'border-transparent text-neutral-400 hover:bg-white/10 hover:text-neutral-200',
  ].join(' ')
}

export default function DashboardLayout() {
  const navigate = useNavigate()
  const user = useAuth((state) => state.user)
  const logout = useAuth((state) => state.logout)
  const multiWorkflowAllowed = canUseMultiWorkflow(user?.role)

  const handleLogout = () => {
    void logoutSession().finally(() => {
      logout()
      void navigate('/login', { replace: true })
    })
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--app-bg)] text-[var(--app-text)]">
      <aside className="flex h-full w-60 shrink-0 flex-col border-r border-[var(--app-border)] bg-[var(--app-sidebar)]">
        <div className="border-b border-white/10 p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-neutral-400">Console</p>
          <h1 className="mt-1 text-lg font-semibold text-white">AI Content</h1>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {NAV.map(({ to, label, icon: Icon, iconClass }) => (
            <NavLink key={to} to={to} className={({ isActive }) => navLinkClass(isActive)}>
              <Icon className={`h-4 w-4 shrink-0 ${iconClass}`} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-white/10 p-4">
          <p className="truncate text-sm font-medium text-neutral-200">{user?.name || user?.username}</p>
          <p className="text-xs capitalize text-neutral-500">{user?.role?.replace('_', ' ')}</p>
          <button
            type="button"
            onClick={handleLogout}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--app-border)] bg-white/5 px-3 py-2 text-xs text-neutral-300 transition hover:bg-white/10"
          >
            <FiLogOut className="h-3.5 w-3.5" />
            Đăng xuất
          </button>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--app-bg)]">
        {!multiWorkflowAllowed ? (
          <div className="border-b border-amber-500/30 bg-amber-500/10 px-6 py-3 text-xs text-amber-100">
            Tài khoản cần quyền VIP hoặc Admin để dùng quy trình đa bước. Một số tính năng có thể bị giới hạn.
          </div>
        ) : null}
        <main className="flex-1 overflow-y-auto p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

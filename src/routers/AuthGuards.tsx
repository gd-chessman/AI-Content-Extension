import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

/** Chặn route dashboard khi chưa đăng nhập. */
export function RequireAuth() {
  const isAuthenticated = useAuth((state) => state.isAuthenticated)
  const location = useLocation()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}

/** Trang login — đã đăng nhập thì về dashboard. */
export function GuestOnly() {
  const isAuthenticated = useAuth((state) => state.isAuthenticated)

  if (isAuthenticated) {
    return <Navigate to="/overview" replace />
  }

  return <Outlet />
}

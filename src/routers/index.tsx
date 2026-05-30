import { Navigate, Route, Routes } from 'react-router-dom'
import DashboardLayout from '@/layouts/DashboardLayout'
import LoginPage from '@/pages/LoginPage'
import OverviewPage from '@/pages/OverviewPage'
import MultiWorkflowPage from '@/pages/MultiWorkflowPage'
import RunsPage from '@/pages/RunsPage'
import { GuestOnly, RequireAuth } from '@/routers/AuthGuards'

export default function AppRouter() {
  return (
    <Routes>
      <Route element={<GuestOnly />}>
        <Route path="/login" element={<LoginPage />} />
      </Route>

      <Route element={<RequireAuth />}>
        <Route element={<DashboardLayout />}>
          <Route index element={<Navigate to="/overview" replace />} />
          <Route path="overview" element={<OverviewPage />} />
          <Route path="runs" element={<RunsPage />} />
          <Route path="multi-workflow" element={<MultiWorkflowPage />} />
          <Route path="config" element={<Navigate to="/multi-workflow" replace />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/overview" replace />} />
    </Routes>
  )
}

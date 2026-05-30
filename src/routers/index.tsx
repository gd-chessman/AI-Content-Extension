import { Navigate, Route, Routes } from 'react-router-dom'
import DashboardLayout from '@/layouts/DashboardLayout'
import LoginPage from '@/pages/LoginPage'
import OverviewPage from '@/pages/OverviewPage'
import MultiWorkflowPage from '@/pages/MultiWorkflowPage'
import WorkflowsPage from '@/pages/WorkflowsPage'
import WorkflowDetailPage from '@/pages/WorkflowDetailPage'
import RunsPage from '@/pages/RunsPage'
import StoriesPage from '@/pages/StoriesPage'
import StoryDetailPage from '@/pages/StoryDetailPage'
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
          <Route path="stories" element={<StoriesPage />} />
          <Route path="stories/:id" element={<StoryDetailPage />} />
          <Route path="workflows" element={<WorkflowsPage />} />
          <Route path="workflows/:id" element={<WorkflowDetailPage />} />
          <Route path="runs" element={<RunsPage />} />
          <Route path="multi-workflow" element={<MultiWorkflowPage />} />
          <Route path="config" element={<Navigate to="/multi-workflow" replace />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/overview" replace />} />
    </Routes>
  )
}

import { Navigate, Route, Routes } from 'react-router-dom'
import DashboardLayout from '@/layouts/DashboardLayout'
import LoginPage from '@/pages/LoginPage'
import OverviewPage from '@/pages/OverviewPage'
import MultiWorkflowPage from '@/pages/MultiWorkflowPage'
import WorkflowsPage from '@/pages/WorkflowsPage'
import WorkflowDetailPage from '@/pages/WorkflowDetailPage'
import RunsPage from '@/pages/RunsPage'
import VideoShortsPage from '@/pages/VideoShortsPage'
import VideoShortDetailPage from '@/pages/VideoShortDetailPage'
import GgSheetPage from '@/pages/GgSheetPage'
import WorkflowSchedulesPage from '@/pages/WorkflowSchedulesPage'
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
          <Route path="video-shorts" element={<VideoShortsPage />} />
          <Route path="video-shorts/:id" element={<VideoShortDetailPage />} />
          <Route path="ggsheet" element={<GgSheetPage />} />
          <Route path="workflows" element={<WorkflowsPage />} />
          <Route path="workflows/:id" element={<WorkflowDetailPage />} />
          <Route path="workflow-schedules" element={<WorkflowSchedulesPage />} />
          <Route path="runs" element={<RunsPage />} />
          <Route path="multi-workflow" element={<MultiWorkflowPage />} />
          <Route path="config" element={<Navigate to="/multi-workflow" replace />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/overview" replace />} />
    </Routes>
  )
}

import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FiActivity, FiAlertCircle, FiCheckCircle, FiClock } from 'react-icons/fi'
import EmptyState from '@/components/EmptyState'
import PlatformBadge from '@/components/PlatformBadge'
import StatusBadge from '@/components/StatusBadge'
import { listMultiWorkflowJobs, listMultiWorkflowRuns } from '@/services/MultiWorkflowService'

function StatCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string
  value: number
  icon: ReactNode
  tone: string
}) {
  return (
    <div className="surface-card rounded-2xl p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-muted">{label}</p>
          <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
        </div>
        <div className={`rounded-xl p-2 ${tone}`}>{icon}</div>
      </div>
    </div>
  )
}

export default function OverviewPage() {
  const runsQuery = useQuery({
    queryKey: ['multi-workflow-runs'],
    queryFn: () => listMultiWorkflowRuns({ limit: 20 }),
    refetchInterval: 5000,
  })

  const jobsQuery = useQuery({
    queryKey: ['multi-workflow-jobs-active'],
    queryFn: () => listMultiWorkflowJobs({ limit: 30 }),
    refetchInterval: 5000,
  })

  const runs = runsQuery.data || []
  const jobs = jobsQuery.data || []

  const activeRuns = runs.filter((r) => r.status === 'running' || r.status === 'queued').length
  const processingJobs = jobs.filter((j) => j.status === 'processing').length
  const pendingJobs = jobs.filter((j) => j.status === 'pending').length
  const failedRecent = runs.filter((r) => r.status === 'failed').length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Tổng quan</h1>
        <p className="mt-1 text-sm text-slate-400">
          Trạng thái quy trình đa bước theo thời gian thực — extension trên Chrome sẽ thực thi các tác vụ.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Quy trình đang chạy"
          value={activeRuns}
          icon={<FiActivity className="h-5 w-5 text-sky-400" />}
          tone="bg-sky-500/10"
        />
        <StatCard
          label="Tác vụ đang xử lý"
          value={processingJobs}
          icon={<FiClock className="h-5 w-5 text-amber-400" />}
          tone="bg-amber-500/10"
        />
        <StatCard
          label="Tác vụ chờ extension"
          value={pendingJobs}
          icon={<FiCheckCircle className="h-5 w-5 text-emerald-400" />}
          tone="bg-emerald-500/10"
        />
        <StatCard
          label="Lần chạy lỗi (gần đây)"
          value={failedRecent}
          icon={<FiAlertCircle className="h-5 w-5 text-rose-400" />}
          tone="bg-rose-500/10"
        />
      </div>

      <section className="surface-card rounded-2xl p-4">
        <h2 className="text-sm font-semibold text-slate-200">Lần chạy gần đây</h2>
        {runsQuery.isLoading ? (
          <p className="mt-4 text-sm text-slate-400">Đang tải…</p>
        ) : runs.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title="Chưa có lần chạy nào"
              description="Vào tab Quy trình đa bước để khởi chạy, hoặc lưu reel từ extension Facebook."
            />
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs text-slate-400">
                  <th className="pb-2 pr-4 font-medium">Thời gian</th>
                  <th className="pb-2 pr-4 font-medium">Nguồn reel</th>
                  <th className="pb-2 pr-4 font-medium">Trạng thái</th>
                  <th className="pb-2 font-medium">Bước</th>
                </tr>
              </thead>
              <tbody>
                {runs.slice(0, 8).map((run) => (
                  <tr key={run._id} className="border-b border-white/5">
                    <td className="py-3 pr-4 text-xs text-slate-400">
                      {run.createdAt ? new Date(run.createdAt).toLocaleString('vi-VN') : '—'}
                    </td>
                    <td className="py-3 pr-4 font-mono text-xs text-slate-300">
                      {String(run.videoShortSourceId).slice(-8)}
                    </td>
                    <td className="py-3 pr-4">
                      <StatusBadge status={run.status} />
                    </td>
                    <td className="py-3">
                      <div className="flex flex-wrap gap-1">
                        {run.items.map((item) => (
                          <span key={item.order} title={`${item.platform}: ${item.status}`}>
                            <PlatformBadge platform={item.platform} />
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="surface-card rounded-2xl p-4">
        <h2 className="text-sm font-semibold text-slate-200">Tác vụ đang hoạt động</h2>
        {jobsQuery.isLoading ? (
          <p className="mt-4 text-sm text-slate-400">Đang tải…</p>
        ) : jobs.filter((j) => j.status === 'processing' || j.status === 'pending').length === 0 ? (
          <p className="mt-4 text-sm text-slate-400">Không có tác vụ đang chờ hoặc đang xử lý.</p>
        ) : (
          <div className="mt-4 space-y-2">
            {jobs
              .filter((j) => j.status === 'processing' || j.status === 'pending')
              .slice(0, 10)
              .map((job) => (
                <div
                  key={job._id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/40 px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <PlatformBadge platform={job.platform} />
                    <span className="text-xs text-slate-400">bước {job.order}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={job.status} />
                    <span className="text-[11px] text-slate-500">
                      {job.attempts}/{job.maxAttempts} lần
                    </span>
                  </div>
                </div>
              ))}
          </div>
        )}
      </section>
    </div>
  )
}

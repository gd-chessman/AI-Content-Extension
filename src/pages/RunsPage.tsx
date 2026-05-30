import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FiChevronDown, FiChevronRight } from 'react-icons/fi'
import { useMemo, useState } from 'react'
import EmptyState from '@/components/EmptyState'
import PlatformBadge from '@/components/PlatformBadge'
import StatusBadge from '@/components/StatusBadge'
import {
  cancelMultiWorkflowRun,
  getMultiWorkflowRun,
  listMultiWorkflows,
  listMultiWorkflowRuns,
} from '@/services/MultiWorkflowService'

const TRIGGER_LABELS: Record<string, string> = {
  manual: 'Thủ công',
  web_console: 'Trang web',
  extension: 'Extension',
}

function formatTrigger(raw: unknown) {
  const key = String(raw || 'manual').trim().toLowerCase()
  return TRIGGER_LABELS[key] || key
}

export default function RunsPage() {
  const queryClient = useQueryClient()
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const runsQuery = useQuery({
    queryKey: ['multi-workflow-runs-full'],
    queryFn: () => listMultiWorkflowRuns({ limit: 50 }),
    refetchInterval: 5000,
  })

  const multiWorkflowsQuery = useQuery({
    queryKey: ['multi-workflows'],
    queryFn: listMultiWorkflows,
  })

  const multiWorkflowNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const item of multiWorkflowsQuery.data || []) {
      map.set(item._id, item.name)
    }
    return map
  }, [multiWorkflowsQuery.data])

  const detailQuery = useQuery({
    queryKey: ['multi-workflow-run-detail', expandedId],
    queryFn: () => getMultiWorkflowRun(expandedId!),
    enabled: Boolean(expandedId),
    refetchInterval: expandedId ? 5000 : false,
  })

  const runs = runsQuery.data || []

  const cancelMutation = useMutation({
    mutationFn: (runId: string) => cancelMultiWorkflowRun(runId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['multi-workflow-runs-full'] })
      void queryClient.invalidateQueries({ queryKey: ['multi-workflow-runs'] })
    },
  })

  const isActiveRun = (status: string) => status === 'running' || status === 'queued'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Lịch sử chạy</h1>
        <p className="mt-1 text-sm text-slate-400">Lịch sử và chi tiết từng lần chạy quy trình đa bước.</p>
      </div>

      {runsQuery.isLoading ? (
        <p className="text-sm text-slate-400">Đang tải…</p>
      ) : runs.length === 0 ? (
        <EmptyState title="Chưa có lần chạy nào" description="Khởi chạy quy trình đa bước từ tab Quy trình đa bước." />
      ) : (
        <div className="space-y-2">
          {runs.map((run) => {
            const isOpen = expandedId === run._id
            const detail = isOpen && detailQuery.data?._id === run._id ? detailQuery.data : run

            return (
              <div key={run._id} className="glass-panel overflow-hidden rounded-2xl shadow-2xl shadow-black/40">
                <div className="flex items-center gap-2 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setExpandedId(isOpen ? null : run._id)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left hover:opacity-90"
                  >
                    {isOpen ? (
                      <FiChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
                    ) : (
                      <FiChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={run.status} />
                        <span className="font-mono text-xs text-slate-400">{run._id}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {run.createdAt ? new Date(run.createdAt).toLocaleString('vi-VN') : '—'}
                        {' · '}
                        kích hoạt: {formatTrigger(run.payload?.trigger)}
                        {run.multiWorkflowId ? (
                          <>
                            {' · '}
                            quy trình:{' '}
                            {multiWorkflowNameById.get(run.multiWorkflowId) ||
                              `…${run.multiWorkflowId.slice(-8)}`}
                          </>
                        ) : null}
                      </p>
                    </div>
                  </button>
                  {isActiveRun(run.status) ? (
                    <button
                      type="button"
                      disabled={cancelMutation.isPending && cancelMutation.variables === run._id}
                      onClick={() => cancelMutation.mutate(run._id)}
                      className="shrink-0 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-300 hover:bg-rose-500/20 disabled:opacity-40"
                    >
                      {cancelMutation.isPending && cancelMutation.variables === run._id
                        ? 'Đang hủy…'
                        : 'Hủy'}
                    </button>
                  ) : null}
                </div>

                {isOpen ? (
                  <div className="border-t border-white/8 px-4 py-4">
                    <dl className="grid gap-2 text-xs sm:grid-cols-2">
                      <div>
                        <dt className="text-slate-500">Nguồn reel</dt>
                        <dd className="font-mono text-slate-300">{detail.storySourceId}</dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">Câu chuyện (sau ChatGPT)</dt>
                        <dd className="font-mono text-slate-300">{detail.storyId || '—'}</dd>
                      </div>
                    </dl>

                    <h3 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Các bước quy trình
                    </h3>
                    <div className="space-y-2">
                      {detail.items.map((item) => (
                        <div
                          key={item.order}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/40 px-3 py-2"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-500">#{item.order}</span>
                            <PlatformBadge platform={item.platform} />
                            {!item.enabled ? (
                              <span className="text-[10px] text-slate-500">(tắt)</span>
                            ) : null}
                          </div>
                          <StatusBadge status={item.status} />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

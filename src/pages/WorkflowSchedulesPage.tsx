import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import {
  FiCalendar,
  FiEdit2,
  FiPlay,
  FiPlus,
  FiRefreshCw,
  FiTrash2,
} from 'react-icons/fi'
import { isAxiosError } from 'axios'
import EmptyState from '@/components/EmptyState'
import WorkflowScheduleFormModal from '@/components/WorkflowScheduleFormModal'
import { getExtensionPresence } from '@/services/WorkflowService'
import { listMultiWorkflows } from '@/services/MultiWorkflowService'
import { getUserWorkflows } from '@/services/WorkflowService'
import {
  createWorkflowSchedule,
  deleteWorkflowSchedule,
  listWorkflowSchedules,
  runWorkflowScheduleNow,
  toggleWorkflowSchedule,
  updateWorkflowSchedule,
  type CreateWorkflowSchedulePayload,
  type WorkflowSchedule,
  type WorkflowScheduleLastRunStatus,
} from '@/services/WorkflowScheduleService'

function formatDateTime(iso?: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
}

function statusPill(status?: WorkflowScheduleLastRunStatus | null) {
  if (!status) return 'text-slate-500'
  if (status === 'success') return 'text-emerald-400'
  if (status === 'skipped') return 'text-amber-300'
  return 'text-rose-300'
}

function statusLabel(status?: WorkflowScheduleLastRunStatus | null) {
  if (!status) return 'Chưa chạy'
  if (status === 'success') return 'Thành công'
  if (status === 'skipped') return 'Bỏ qua'
  return 'Lỗi'
}

export default function WorkflowSchedulesPage() {
  const queryClient = useQueryClient()
  const [message, setMessage] = useState('')
  const [modal, setModal] = useState<{ mode: 'create' | 'edit'; schedule?: WorkflowSchedule } | null>(
    null,
  )

  const schedulesQuery = useQuery({
    queryKey: ['workflow-schedules'],
    queryFn: listWorkflowSchedules,
    refetchInterval: (query) => {
      const items = (query.state.data || []) as WorkflowSchedule[]
      return items.some((s) => s.batchStatus === 'running') ? 5000 : false
    },
  })

  const multiWorkflowsQuery = useQuery({
    queryKey: ['multi-workflows'],
    queryFn: listMultiWorkflows,
  })

  const workflowsQuery = useQuery({
    queryKey: ['workflows-all'],
    queryFn: () => getUserWorkflows(),
  })

  const extensionPresenceQuery = useQuery({
    queryKey: ['extension-presence'],
    queryFn: getExtensionPresence,
    refetchInterval: 5000,
  })

  const multiWorkflows = multiWorkflowsQuery.data || []
  const workflows = useMemo(
    () => (workflowsQuery.data || []).filter((w) => w.platform !== 'multi'),
    [workflowsQuery.data],
  )
  const schedules = schedulesQuery.data || []
  const extensionOnline = extensionPresenceQuery.data?.online === true

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['workflow-schedules'] })
  }

  const createMutation = useMutation({
    mutationFn: (payload: CreateWorkflowSchedulePayload) => createWorkflowSchedule(payload),
    onSuccess: () => {
      setModal(null)
      setMessage('Đã tạo lịch quy trình.')
      invalidate()
    },
    onError: (error: unknown) => {
      setMessage(readApiError(error, 'Không thể tạo lịch.'))
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: CreateWorkflowSchedulePayload }) =>
      updateWorkflowSchedule(id, payload),
    onSuccess: () => {
      setModal(null)
      setMessage('Đã lưu lịch.')
      invalidate()
    },
    onError: (error: unknown) => {
      setMessage(readApiError(error, 'Không thể lưu lịch.'))
    },
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      toggleWorkflowSchedule(id, enabled),
    onSuccess: () => {
      setMessage('Đã cập nhật trạng thái lịch.')
      invalidate()
    },
    onError: (error: unknown) => {
      setMessage(readApiError(error, 'Không thể bật/tắt lịch.'))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteWorkflowSchedule(id),
    onSuccess: () => {
      setMessage('Đã xóa lịch.')
      invalidate()
    },
    onError: () => setMessage('Không thể xóa lịch.'),
  })

  const runNowMutation = useMutation({
    mutationFn: (id: string) => runWorkflowScheduleNow(id),
    onSuccess: () => {
      setMessage('Đã kích hoạt chạy ngay.')
      invalidate()
      void queryClient.invalidateQueries({ queryKey: ['multi-workflow-runs'] })
    },
    onError: (error: unknown) => {
      setMessage(readApiError(error, 'Không thể chạy ngay.'))
    },
  })

  const isFormPending = createMutation.isPending || updateMutation.isPending

  const handleSubmit = (payload: CreateWorkflowSchedulePayload) => {
    if (modal?.mode === 'edit' && modal.schedule) {
      updateMutation.mutate({ id: modal.schedule._id, payload })
      return
    }
    createMutation.mutate(payload)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-white">Lịch quy trình</h1>
          <p className="mt-1 text-sm text-slate-400">
            Lập lịch chạy một quy trình đa bước hoặc một quy trình đơn. Có thể cấu hình chạy liên tiếp
            nhiều lần mỗi khi lịch kích hoạt — fail giữa chừng thì dừng hẳn.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModal({ mode: 'create' })}
          disabled={!multiWorkflows.length && !workflows.length}
          className="inline-flex items-center gap-1.5 rounded-xl border border-blue-300/30 bg-blue-500/20 px-4 py-2 text-sm text-blue-100 hover:bg-blue-500/30 disabled:opacity-40"
        >
          <FiPlus className="h-4 w-4" />
          Tạo lịch
        </button>
      </div>

      <div
        className={`rounded-2xl border px-4 py-3 text-xs ${
          extensionOnline
            ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-100'
            : 'border-amber-500/25 bg-amber-500/10 text-amber-100'
        }`}
      >
        Extension: {extensionOnline ? 'đang online' : 'offline'} — quy trình đa bước vẫn được xếp hàng
        khi offline; quy trình đơn sẽ bị bỏ qua nếu extension chưa mở.
      </div>

      {message ? <p className="text-xs text-slate-300">{message}</p> : null}

      {schedulesQuery.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="surface-card h-28 animate-pulse rounded-2xl" />
          ))}
        </div>
      ) : schedules.length === 0 ? (
        <EmptyState
          title="Chưa có lịch quy trình"
          description="Tạo lịch để tự động chạy quy trình đa bước hoặc quy trình đơn theo giờ đã đặt."
          action={
            multiWorkflows.length || workflows.length ? (
              <button
                type="button"
                onClick={() => setModal({ mode: 'create' })}
                className="inline-flex items-center gap-1.5 rounded-xl border border-blue-300/30 bg-blue-500/20 px-4 py-2 text-sm text-blue-100 hover:bg-blue-500/30"
              >
                Tạo lịch đầu tiên
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          {schedules.map((schedule) => (
            <article key={schedule._id} className="surface-card rounded-2xl p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <FiCalendar className="h-4 w-4 text-blue-300" />
                    <h2 className="text-sm font-semibold text-white">{schedule.name}</h2>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] ${
                        schedule.enabled
                          ? 'bg-blue-500/15 text-blue-200'
                          : 'bg-white/5 text-slate-500'
                      }`}
                    >
                      {schedule.enabled ? 'Đang bật' : 'Đã tắt'}
                    </span>
                  </div>

                  <p className="mt-2 text-xs text-slate-400">
                    {schedule.targetType === 'multi_workflow' ? 'Đa bước' : 'Đơn'} ·{' '}
                    {schedule.targetName || '—'}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">{schedule.scheduleSummary}</p>

                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
                    <span>Lần tới: {formatDateTime(schedule.nextRunAt)}</span>
                    <span>Lần trước: {formatDateTime(schedule.lastRunAt)}</span>
                    {(schedule.consecutiveRuns || 1) > 1 ? (
                      <span className="text-blue-300">
                        Batch: {schedule.batchCompletedRuns || 0}/{schedule.consecutiveRuns}
                        {schedule.batchStatus === 'running' ? ' (đang chạy)' : ''}
                      </span>
                    ) : null}
                    <span className={statusPill(schedule.lastRunStatus)}>
                      {statusLabel(schedule.lastRunStatus)}
                      {schedule.lastRunMessage ? ` · ${schedule.lastRunMessage}` : ''}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      toggleMutation.mutate({ id: schedule._id, enabled: !schedule.enabled })
                    }
                    disabled={toggleMutation.isPending}
                    className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-white/5 disabled:opacity-40"
                  >
                    <FiRefreshCw className="h-3.5 w-3.5" />
                    {schedule.enabled ? 'Tắt' : 'Bật'}
                  </button>
                  <button
                    type="button"
                    onClick={() => runNowMutation.mutate(schedule._id)}
                    disabled={runNowMutation.isPending}
                    className="inline-flex items-center gap-1 rounded-lg border border-blue-300/30 bg-blue-500/10 px-2.5 py-1.5 text-xs text-blue-100 hover:bg-blue-500/20 disabled:opacity-40"
                  >
                    <FiPlay className="h-3.5 w-3.5" />
                    Chạy ngay
                  </button>
                  <button
                    type="button"
                    onClick={() => setModal({ mode: 'edit', schedule })}
                    className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-white/5"
                  >
                    <FiEdit2 className="h-3.5 w-3.5" />
                    Sửa
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm('Xóa lịch này?')) deleteMutation.mutate(schedule._id)
                    }}
                    disabled={deleteMutation.isPending}
                    className="inline-flex items-center gap-1 rounded-lg border border-rose-500/25 px-2.5 py-1.5 text-xs text-rose-300 hover:bg-rose-500/10 disabled:opacity-40"
                  >
                    <FiTrash2 className="h-3.5 w-3.5" />
                    Xóa
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {modal ? (
        <WorkflowScheduleFormModal
          open
          initial={modal.mode === 'edit' ? modal.schedule : null}
          multiWorkflows={multiWorkflows}
          workflows={workflows}
          onClose={() => setModal(null)}
          onSubmit={handleSubmit}
          isPending={isFormPending}
        />
      ) : null}
    </div>
  )
}

function readApiError(error: unknown, fallback: string) {
  if (isAxiosError(error)) {
    const raw = error.response?.data?.message
    if (typeof raw === 'string' && raw.trim()) return raw
    if (Array.isArray(raw) && raw.length) return raw.join(' ')
  }
  return fallback
}

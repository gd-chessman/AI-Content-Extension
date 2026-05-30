import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  FiArrowDown,
  FiArrowUp,
  FiEdit2,
  FiPlay,
  FiPlus,
  FiSave,
  FiStar,
  FiTrash2,
  FiX,
} from 'react-icons/fi'
import { isAxiosError } from 'axios'
import EmptyState from '@/components/EmptyState'
import PlatformBadge from '@/components/PlatformBadge'
import {
  cancelMultiWorkflowRun,
  createMultiWorkflow,
  createMultiWorkflowRun,
  deleteMultiWorkflow,
  listMultiWorkflowRuns,
  listMultiWorkflows,
  setDefaultMultiWorkflow,
  updateMultiWorkflowById,
  type MultiWorkflow,
  type MultiWorkflowItem,
  type MultiWorkflowRun,
} from '@/services/MultiWorkflowService'
import { getUserWorkflows, type WorkflowItem } from '@/services/WorkflowService'

type EditableItem = MultiWorkflowItem & { key: string }

const newKey = () => `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

function toEditableItems(configItems: MultiWorkflowItem[]): EditableItem[] {
  return (configItems || []).map((item) => ({
    ...item,
    workflowId: String(item.workflowId),
    key: newKey(),
  }))
}

type ConfigFormModalProps = {
  mode: 'create' | 'edit'
  initialName?: string
  initialItems?: MultiWorkflowItem[]
  workflows: WorkflowItem[]
  isPending: boolean
  onClose: () => void
  onSubmit: (payload: { name: string; items: MultiWorkflowItem[] }) => void
}

function ConfigFormModal({
  mode,
  initialName = '',
  initialItems,
  workflows,
  isPending,
  onClose,
  onSubmit,
}: ConfigFormModalProps) {
  const [formName, setFormName] = useState(initialName)
  const [formItems, setFormItems] = useState(() => toEditableItems(initialItems ?? []))
  const [error, setError] = useState('')

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const workflowMap = useMemo(() => {
    const map = new Map<string, WorkflowItem>()
    for (const w of workflows) map.set(w._id, w)
    return map
  }, [workflows])

  const availableToAdd = useMemo(() => {
    const used = new Set(formItems.map((i) => i.workflowId))
    return workflows.filter((w) => !used.has(w._id))
  }, [formItems, workflows])

  const reorder = (index: number, direction: -1 | 1) => {
    const next = [...formItems]
    const target = index + direction
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    setFormItems(next)
  }

  const removeItem = (index: number) => {
    setFormItems((prev) => prev.filter((_, i) => i !== index))
  }

  const addWorkflow = (workflowId: string) => {
    const wf = workflowMap.get(workflowId)
    if (!wf?.platform) return
    setFormItems((prev) => [
      ...prev,
      {
        key: newKey(),
        order: prev.length + 1,
        workflowId,
        platform: wf.platform as MultiWorkflowItem['platform'],
        enabled: true,
      },
    ])
  }

  const handleSubmit = () => {
    const trimmed = formName.trim()
    if (!trimmed) {
      setError('Vui lòng nhập tên cấu hình.')
      return
    }
    if (!formItems.length) {
      setError('Thêm ít nhất một workflow.')
      return
    }
    setError('')
    onSubmit({
      name: trimmed,
      items: formItems.map((item, index) => ({
        order: index + 1,
        workflowId: item.workflowId,
        platform: item.platform,
        enabled: item.enabled,
      })),
    })
  }

  const title = mode === 'create' ? 'Tạo multi workflow mới' : 'Sửa multi workflow'
  const subtitle =
    mode === 'create'
      ? 'Đặt tên và chọn các workflow theo thứ tự chạy.'
      : 'Cập nhật tên và danh sách workflow.'
  const submitLabel = mode === 'create' ? 'Tạo cấu hình' : 'Lưu cấu hình'
  const SubmitIcon = mode === 'create' ? FiPlus : FiSave

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="config-form-title"
    >
      <div
        className="absolute inset-0 z-0 bg-black/70 backdrop-blur-sm"
        aria-hidden
        onClick={onClose}
      />

      <div
        className="relative z-10 flex max-h-[min(90vh,720px)] w-full max-w-lg flex-col rounded-2xl border border-white/10 bg-[#121212] shadow-2xl shadow-black/60"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div>
            <h2 id="config-form-title" className="text-base font-semibold text-white">
              {title}
            </h2>
            <p className="mt-1 text-xs text-slate-400">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/10 p-1.5 text-slate-400 hover:bg-white/5 hover:text-white"
            aria-label="Đóng"
          >
            <FiX className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div>
            <label className="text-xs font-medium text-slate-400">Tên cấu hình</label>
            <input
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="Ví dụ: Facebook → ChatGPT"
              autoFocus
              className="mt-1 w-full rounded-xl field-input px-3 py-2 text-sm text-neutral-100 outline-none placeholder:text-neutral-500"
            />
          </div>

          <div>
            <p className="text-xs font-medium text-slate-400">Workflow ({formItems.length})</p>
            {formItems.length === 0 ? (
              <p className="mt-2 rounded-xl border border-dashed border-white/10 px-3 py-4 text-center text-xs text-slate-500">
                Chưa có workflow — thêm từ danh sách bên dưới.
              </p>
            ) : (
              <div className="mt-2 space-y-2">
                {formItems.map((item, index) => {
                  const wf = workflowMap.get(item.workflowId)
                  return (
                    <div
                      key={item.key}
                      className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2"
                    >
                      <span className="w-5 text-center text-xs text-slate-500">{index + 1}</span>
                      <PlatformBadge platform={item.platform} />
                      <span className="min-w-0 flex-1 truncate text-xs text-slate-200">
                        {wf?.name || item.workflowId}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => reorder(index, -1)}
                          disabled={index === 0}
                          className="rounded-lg border border-sky-500/20 p-1 text-sky-400 hover:bg-sky-500/10 disabled:opacity-30"
                          aria-label="Lên"
                        >
                          <FiArrowUp className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => reorder(index, 1)}
                          disabled={index === formItems.length - 1}
                          className="rounded-lg border border-sky-500/20 p-1 text-sky-400 hover:bg-sky-500/10 disabled:opacity-30"
                          aria-label="Xuống"
                        >
                          <FiArrowDown className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeItem(index)}
                          className="rounded-lg border border-rose-500/20 p-1 text-rose-300 hover:bg-rose-500/10"
                          aria-label="Xóa"
                        >
                          <FiTrash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {availableToAdd.length > 0 ? (
            <div>
              <p className="text-xs font-medium text-slate-400">Thêm workflow</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {availableToAdd.map((wf) => (
                  <button
                    key={wf._id}
                    type="button"
                    onClick={() => addWorkflow(wf._id)}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-200 hover:bg-white/[0.06]"
                  >
                    <FiPlus className="h-3.5 w-3.5" />
                    {wf.platform && <PlatformBadge platform={wf.platform} />}
                    {wf.name}
                  </button>
                ))}
              </div>
            </div>
          ) : formItems.length > 0 ? (
            <p className="text-xs text-slate-500">Đã thêm hết workflow khả dụng.</p>
          ) : workflows.length === 0 ? (
            <p className="text-xs text-amber-300">Chưa có workflow active — tạo workflow trước.</p>
          ) : null}

          {error ? (
            <p className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-white/10 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="rounded-xl border border-white/10 px-4 py-2 text-xs text-slate-300 hover:bg-white/5 disabled:opacity-40"
          >
            Hủy
          </button>
          <button
            type="button"
            disabled={isPending || !formName.trim() || formItems.length === 0}
            onClick={handleSubmit}
            className="primary-btn inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs disabled:opacity-40"
          >
            <SubmitIcon className="h-3.5 w-3.5" />
            {isPending ? 'Đang xử lý…' : submitLabel}
          </button>
        </div>
      </div>
    </div>
  )
}


export default function MultiWorkflowPage() {
  const queryClient = useQueryClient()
  const [message, setMessage] = useState('')
  const [modal, setModal] = useState<{ mode: 'create' | 'edit'; workflow?: MultiWorkflow } | null>(
    null,
  )

  const multiWorkflowsQuery = useQuery({
    queryKey: ['multi-workflows'],
    queryFn: listMultiWorkflows,
  })

  const activeRunsQuery = useQuery({
    queryKey: ['multi-workflow-runs'],
    queryFn: () => listMultiWorkflowRuns({ limit: 30 }),
    refetchInterval: 5000,
  })

  const userWorkflowsQuery = useQuery({
    queryKey: ['workflows-all'],
    queryFn: () => getUserWorkflows(),
  })

  const multiWorkflows = multiWorkflowsQuery.data || []
  const userWorkflows = userWorkflowsQuery.data || []

  const activeRunByConfigId = useMemo(() => {
    const map = new Map<string, MultiWorkflowRun>()
    for (const run of activeRunsQuery.data || []) {
      if (run.status !== 'running' && run.status !== 'queued') continue
      if (run.multiWorkflowId) map.set(run.multiWorkflowId, run)
    }
    return map
  }, [activeRunsQuery.data])

  const invalidateMultiWorkflows = () => {
    void queryClient.invalidateQueries({ queryKey: ['multi-workflows'] })
  }

  const createMutation = useMutation({
    mutationFn: (payload: { name: string; items: MultiWorkflowItem[] }) =>
      createMultiWorkflow(payload),
    onSuccess: () => {
      setModal(null)
      setMessage('Đã tạo multi workflow.')
      invalidateMultiWorkflows()
    },
    onError: () => setMessage('Tạo thất bại.'),
  })

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string
      payload: { name: string; items: MultiWorkflowItem[] }
    }) => updateMultiWorkflowById(id, payload),
    onSuccess: () => {
      setModal(null)
      setMessage('Đã lưu.')
      invalidateMultiWorkflows()
    },
    onError: () => setMessage('Lưu thất bại.'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteMultiWorkflow(id),
    onSuccess: () => {
      setMessage('Đã xóa.')
      invalidateMultiWorkflows()
    },
    onError: (error: unknown) => {
      if (isAxiosError(error) && error.response?.status === 400) {
        setMessage('Không thể xóa multi workflow duy nhất.')
        return
      }
      setMessage('Xóa thất bại.')
    },
  })

  const setDefaultMutation = useMutation({
    mutationFn: (id: string) => setDefaultMultiWorkflow(id),
    onSuccess: () => {
      setMessage('Đã đặt mặc định.')
      invalidateMultiWorkflows()
    },
    onError: () => setMessage('Không thể đặt mặc định.'),
  })

  const runMutation = useMutation({
    mutationFn: (multiWorkflowId: string) =>
      createMultiWorkflowRun({ multiWorkflowId, trigger: 'web_console' }),
    onSuccess: () => {
      setMessage(
        'Đã gửi lệnh chạy. Mở extension Chrome (tab Facebook/ChatGPT) để thực thi.',
      )
      void queryClient.invalidateQueries({ queryKey: ['multi-workflow-runs'] })
      void queryClient.invalidateQueries({ queryKey: ['multi-workflow-jobs-active'] })
    },
    onError: (error: unknown) => {
      if (isAxiosError(error) && error.response?.status === 409) {
        setMessage('Multi workflow này đang chạy — đợi xong hoặc hủy run hiện tại.')
        return
      }
      if (isAxiosError(error) && error.response?.status === 400) {
        setMessage('Bộ này chưa có workflow nào được bật.')
        return
      }
      setMessage('Không thể khởi chạy multi workflow.')
    },
  })

  const cancelRunMutation = useMutation({
    mutationFn: (runId: string) => cancelMultiWorkflowRun(runId),
    onSuccess: () => {
      setMessage('Đã hủy multi workflow run.')
      void queryClient.invalidateQueries({ queryKey: ['multi-workflow-runs'] })
      void queryClient.invalidateQueries({ queryKey: ['multi-workflow-runs-full'] })
    },
    onError: () => setMessage('Không thể hủy run — có thể đã kết thúc.'),
  })

  const isFormPending = createMutation.isPending || updateMutation.isPending

  if (multiWorkflowsQuery.isLoading) {
    return <p className="text-sm text-slate-400">Đang tải…</p>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-white">Multi workflow</h1>
          <p className="mt-0.5 text-sm text-slate-400">{multiWorkflows.length} bộ</p>
        </div>
        <button
          type="button"
          onClick={() => setModal({ mode: 'create' })}
          className="primary-btn inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs"
        >
          <FiPlus className="h-3.5 w-3.5" />
          Tạo mới
        </button>
      </div>

      {message ? (
        <p className="text-xs text-slate-300">{message}</p>
      ) : null}

      {multiWorkflows.length === 0 ? (
        <EmptyState title="Chưa có multi workflow" description="Bấm Tạo mới để thêm bộ multi workflow." />
      ) : (
        <ul className="divide-y divide-white/10 rounded-xl border border-white/10 bg-[#121212]">
          {multiWorkflows.map((workflow) => {
            const enabledItems = (workflow.items || []).filter((i) => i.enabled)
            const activeRun = activeRunByConfigId.get(workflow._id)
            return (
              <li
                key={workflow._id}
                className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm hover:bg-white/[0.02]"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-white">{workflow.name}</span>
                    {workflow.isDefault ? (
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-400">
                        <FiStar className="h-3 w-3" />
                        Mặc định
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1">
                    {enabledItems.length === 0 ? (
                      <span className="text-xs text-slate-500">Chưa có bước nào bật</span>
                    ) : (
                      enabledItems.map((item, idx) => (
                        <span key={`${workflow._id}-${item.order}`} className="inline-flex items-center gap-1">
                          {idx > 0 ? <span className="text-slate-600">→</span> : null}
                          <PlatformBadge platform={item.platform} />
                        </span>
                      ))
                    )}
                    <span className="ml-1 text-xs text-slate-500">· {enabledItems.length} bước</span>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  {activeRun ? (
                    <button
                      type="button"
                      disabled={cancelRunMutation.isPending && cancelRunMutation.variables === activeRun._id}
                      onClick={() => {
                        setMessage('')
                        cancelRunMutation.mutate(activeRun._id)
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-xs text-rose-300 hover:bg-rose-500/20 disabled:opacity-40"
                      title="Hủy run đang chạy"
                    >
                      {cancelRunMutation.isPending && cancelRunMutation.variables === activeRun._id
                        ? 'Đang hủy…'
                        : 'Hủy'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={
                        enabledItems.length === 0 ||
                        (runMutation.isPending && runMutation.variables === workflow._id)
                      }
                      onClick={() => {
                        setMessage('')
                        runMutation.mutate(workflow._id)
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/25 px-2.5 py-1.5 text-xs text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-40"
                      title="Chạy trên extension"
                    >
                      <FiPlay className="h-3.5 w-3.5" />
                      {runMutation.isPending && runMutation.variables === workflow._id
                        ? 'Đang gửi…'
                        : 'Run'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setModal({ mode: 'edit', workflow })}
                    className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white"
                    title="Sửa"
                  >
                    <FiEdit2 className="h-3.5 w-3.5" />
                  </button>
                  {!workflow.isDefault ? (
                    <button
                      type="button"
                      disabled={setDefaultMutation.isPending}
                      onClick={() => {
                        setMessage('')
                        setDefaultMutation.mutate(workflow._id)
                      }}
                      className="rounded-lg p-2 text-amber-400 hover:bg-amber-500/10"
                      title="Đặt mặc định"
                    >
                      <FiStar className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                  {multiWorkflows.length > 1 ? (
                    <button
                      type="button"
                      disabled={deleteMutation.isPending}
                      onClick={() => {
                        if (!window.confirm(`Xóa "${workflow.name}"?`)) return
                        setMessage('')
                        deleteMutation.mutate(workflow._id)
                      }}
                      className="rounded-lg p-2 text-rose-400 hover:bg-rose-500/10"
                      title="Xóa"
                    >
                      <FiTrash2 className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {modal ? (
        <ConfigFormModal
          key={modal.mode === 'edit' && modal.workflow ? modal.workflow._id : 'create'}
          mode={modal.mode}
          initialName={modal.workflow?.name ?? ''}
          initialItems={modal.workflow?.items}
          workflows={userWorkflows}
          isPending={isFormPending}
          onClose={() => setModal(null)}
          onSubmit={(payload) => {
            setMessage('')
            if (modal.mode === 'edit' && modal.workflow) {
              updateMutation.mutate({ id: modal.workflow._id, payload })
            } else {
              createMutation.mutate(payload)
            }
          }}
        />
      ) : null}
    </div>
  )
}

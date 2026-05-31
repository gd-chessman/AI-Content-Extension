import { useEffect, useState } from 'react'
import { FiSave, FiX } from 'react-icons/fi'
import type { MultiWorkflow } from '@/services/MultiWorkflowService'
import type {
  CreateWorkflowSchedulePayload,
  WorkflowSchedule,
  WorkflowScheduleKind,
  WorkflowScheduleTargetType,
} from '@/services/WorkflowScheduleService'
import type { WorkflowItem } from '@/services/WorkflowService'

const inputClass =
  'field-input w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-500'

const WEEKDAY_OPTIONS = [
  { value: 1, label: 'T2' },
  { value: 2, label: 'T3' },
  { value: 3, label: 'T4' },
  { value: 4, label: 'T5' },
  { value: 5, label: 'T6' },
  { value: 6, label: 'T7' },
  { value: 0, label: 'CN' },
]

function toLocalDatetimeInputValue(iso?: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromLocalDatetimeInputValue(value: string) {
  if (!value.trim()) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString()
}

export default function WorkflowScheduleFormModal({
  open,
  onClose,
  initial,
  multiWorkflows,
  workflows,
  onSubmit,
  isPending,
}: {
  open: boolean
  onClose: () => void
  initial?: WorkflowSchedule | null
  multiWorkflows: MultiWorkflow[]
  workflows: WorkflowItem[]
  onSubmit: (payload: CreateWorkflowSchedulePayload) => void
  isPending: boolean
}) {
  const [name, setName] = useState('')
  const [targetType, setTargetType] = useState<WorkflowScheduleTargetType>('multi_workflow')
  const [multiWorkflowId, setMultiWorkflowId] = useState('')
  const [workflowId, setWorkflowId] = useState('')
  const [scheduleKind, setScheduleKind] = useState<WorkflowScheduleKind>('daily')
  const [runAtLocal, setRunAtLocal] = useState('')
  const [timeOfDay, setTimeOfDay] = useState('08:00')
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([1, 2, 3, 4, 5])
  const [enabled, setEnabled] = useState(true)
  const [consecutiveRuns, setConsecutiveRuns] = useState(1)

  useEffect(() => {
    if (!open) return
    setName(initial?.name || '')
    setTargetType(initial?.targetType || 'multi_workflow')
    setMultiWorkflowId(initial?.multiWorkflowId || multiWorkflows[0]?._id || '')
    setWorkflowId(initial?.workflowId || workflows[0]?._id || '')
    setScheduleKind(initial?.scheduleKind || 'daily')
    setRunAtLocal(toLocalDatetimeInputValue(initial?.runAt))
    setTimeOfDay(initial?.timeOfDay || '08:00')
    setDaysOfWeek(initial?.daysOfWeek?.length ? initial.daysOfWeek : [1, 2, 3, 4, 5])
    setEnabled(initial?.enabled !== false)
    setConsecutiveRuns(initial?.consecutiveRuns && initial.consecutiveRuns > 0 ? initial.consecutiveRuns : 1)
  }, [open, initial, multiWorkflows, workflows])

  if (!open) return null

  const toggleDay = (day: number) => {
    setDaysOfWeek((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b),
    )
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    const payload: CreateWorkflowSchedulePayload = {
      name: name.trim(),
      enabled,
      targetType,
      scheduleKind,
      timezone: 'Asia/Ho_Chi_Minh',
      consecutiveRuns: Math.min(100, Math.max(1, Math.floor(consecutiveRuns) || 1)),
    }

    if (targetType === 'multi_workflow') {
      payload.multiWorkflowId = multiWorkflowId
    } else {
      payload.workflowId = workflowId
    }

    if (scheduleKind === 'once') {
      payload.runAt = fromLocalDatetimeInputValue(runAtLocal)
    } else {
      payload.timeOfDay = timeOfDay
      if (scheduleKind === 'weekly') {
        payload.daysOfWeek = daysOfWeek
      }
    }

    onSubmit(payload)
  }

  const title = initial ? 'Sửa lịch quy trình' : 'Tạo lịch quy trình'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="workflow-schedule-form-title"
    >
      <div className="absolute inset-0 z-0 bg-black/70 backdrop-blur-sm" aria-hidden onClick={onClose} />

      <div
        className="relative z-10 flex max-h-[min(90vh,720px)] w-full max-w-lg flex-col rounded-2xl border border-white/10 bg-[#121212] shadow-2xl shadow-black/60"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div>
            <h2 id="workflow-schedule-form-title" className="text-base font-semibold text-white">
              {title}
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              Chọn một quy trình đa bước hoặc một quy trình đơn — không chọn cả hai.
            </p>
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

        <form className="flex-1 space-y-4 overflow-y-auto px-5 py-4" onSubmit={handleSubmit}>
          <div>
            <label className="text-xs font-medium text-slate-300">Tên lịch</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ví dụ: Pipeline sáng thứ 2–6"
              required
              className={`${inputClass} mt-1.5`}
            />
          </div>

          <div>
            <p className="text-xs font-medium text-slate-300">Loại mục tiêu</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(
                [
                  ['multi_workflow', 'Quy trình đa bước'],
                  ['workflow', 'Quy trình đơn'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTargetType(value)}
                  className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                    targetType === value
                      ? 'border-blue-300/30 bg-blue-500/20 text-blue-100 ring-1 ring-blue-300/25'
                      : 'border-white/10 bg-black/20 text-slate-400 hover:border-blue-300/20 hover:bg-blue-500/10'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {targetType === 'multi_workflow' ? (
            <div>
              <label className="text-xs font-medium text-slate-300">Quy trình đa bước</label>
              <select
                value={multiWorkflowId}
                onChange={(e) => setMultiWorkflowId(e.target.value)}
                required
                className={`${inputClass} mt-1.5`}
              >
                {multiWorkflows.map((item) => (
                  <option key={item._id} value={item._id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="text-xs font-medium text-slate-300">Quy trình</label>
              <select
                value={workflowId}
                onChange={(e) => setWorkflowId(e.target.value)}
                required
                className={`${inputClass} mt-1.5`}
              >
                {workflows.map((item) => (
                  <option key={item._id} value={item._id}>
                    {item.name}
                    {item.platform ? ` (${item.platform})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <p className="text-xs font-medium text-slate-300">Kiểu lịch</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(
                [
                  ['once', 'Một lần'],
                  ['daily', 'Hàng ngày'],
                  ['weekly', 'Hàng tuần'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setScheduleKind(value)}
                  className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                    scheduleKind === value
                      ? 'border-blue-300/30 bg-blue-500/20 text-blue-100 ring-1 ring-blue-300/25'
                      : 'border-white/10 bg-black/20 text-slate-400 hover:border-blue-300/20 hover:bg-blue-500/10'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {scheduleKind === 'once' ? (
            <div>
              <label className="text-xs font-medium text-slate-300">Thời gian chạy</label>
              <input
                type="datetime-local"
                value={runAtLocal}
                onChange={(e) => setRunAtLocal(e.target.value)}
                required
                className={`${inputClass} mt-1.5`}
              />
            </div>
          ) : (
            <div>
              <label className="text-xs font-medium text-slate-300">Giờ chạy (HH:mm)</label>
              <input
                type="time"
                value={timeOfDay}
                onChange={(e) => setTimeOfDay(e.target.value)}
                required
                className={`${inputClass} mt-1.5`}
              />
            </div>
          )}

          {scheduleKind === 'weekly' ? (
            <div>
              <p className="text-xs font-medium text-slate-300">Ngày trong tuần</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {WEEKDAY_OPTIONS.map((day) => (
                  <button
                    key={day.value}
                    type="button"
                    onClick={() => toggleDay(day.value)}
                    className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                      daysOfWeek.includes(day.value)
                        ? 'border-blue-300/30 bg-blue-500/20 text-blue-100 ring-1 ring-blue-300/25'
                        : 'border-white/10 bg-black/20 text-slate-400 hover:border-blue-300/20 hover:bg-blue-500/10'
                    }`}
                  >
                    {day.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div>
            <label className="text-xs font-medium text-slate-300">Số lần chạy liên tiếp</label>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Mỗi lần lịch kích hoạt sẽ chạy nối tiếp N lần — lần trước xong mới chạy lần sau. Fail thì
              dừng hẳn.
            </p>
            <input
              type="number"
              min={1}
              max={100}
              value={consecutiveRuns}
              onChange={(e) => setConsecutiveRuns(Number(e.target.value))}
              className={`${inputClass} mt-1.5`}
            />
          </div>

          <label className="inline-flex items-center gap-2 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="rounded border-white/20 bg-black/30"
            />
            Bật lịch ngay sau khi lưu
          </label>

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-xl border border-blue-300/30 bg-blue-500/20 px-4 py-2 text-sm text-blue-100 hover:bg-blue-500/30 disabled:opacity-40"
            >
              <FiSave className="h-4 w-4" />
              {isPending ? 'Đang lưu…' : initial ? 'Lưu lịch' : 'Tạo lịch'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-400 hover:bg-white/5 hover:text-slate-200"
            >
              Hủy
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

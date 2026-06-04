import { useQuery } from '@tanstack/react-query'
import { FiArrowLeft, FiClock, FiCode, FiList } from 'react-icons/fi'
import { Link, useParams } from 'react-router-dom'
import EmptyState from '@/components/EmptyState'
import PlatformBadge from '@/components/PlatformBadge'
import { getUserWorkflowDetail } from '@/services/WorkflowService'
import {
  formatActionType,
  formatDisplayMode,
  formatWorkflowCategory,
  formatWorkflowDate,
} from '@/utils/workflowHelpers'

function StepCard({
  step,
  isLast,
}: {
  step: {
    stepNo: number
    title: string
    instruction: string
    prompt?: string
    actionType?: string
    displayMode?: string
    inputSchema?: Record<string, unknown>
  }
  isLast: boolean
}) {
  const hasInput =
    step.inputSchema && Object.keys(step.inputSchema).length > 0

  return (
    <div className="relative flex gap-4">
      {!isLast ? (
        <div className="absolute left-[15px] top-10 bottom-0 w-px bg-white/10" aria-hidden />
      ) : null}

      <div className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-violet-500/40 bg-violet-500/15 text-xs font-bold text-violet-200">
        {step.stepNo}
      </div>

      <div className="min-w-0 flex-1 pb-6">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="text-sm font-semibold text-white">{step.title}</h3>
            <span className="rounded-md bg-white/5 px-2 py-0.5 text-[10px] text-slate-400">
              {formatDisplayMode(step.displayMode)}
            </span>
          </div>

          {step.instruction?.trim() ? (
            <p className="mt-2 text-xs leading-relaxed text-slate-400">{step.instruction}</p>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1 rounded-md border border-sky-500/25 bg-sky-500/10 px-2 py-0.5 text-[10px] text-sky-200">
              <FiCode className="h-3 w-3" />
              {formatActionType(step.actionType)}
            </span>
          </div>

          {step.prompt?.trim() ? (
            <div className="mt-3">
              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Prompt</p>
              <pre className="mt-1 max-h-48 overflow-auto rounded-xl border border-white/10 bg-black/30 p-3 text-xs whitespace-pre-wrap text-slate-300">
                {step.prompt}
              </pre>
            </div>
          ) : null}

          {hasInput ? (
            <details className="mt-3">
              <summary className="cursor-pointer text-[10px] font-medium text-slate-500 hover:text-slate-300">
                Tham số bước (inputSchema)
              </summary>
              <pre className="mt-2 max-h-40 overflow-auto rounded-xl border border-white/10 bg-black/30 p-3 text-[10px] whitespace-pre-wrap text-slate-400">
                {JSON.stringify(step.inputSchema, null, 2)}
              </pre>
            </details>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export default function WorkflowDetailPage() {
  const { id = '' } = useParams()

  const workflowQuery = useQuery({
    queryKey: ['workflows', 'detail', id],
    queryFn: () => getUserWorkflowDetail(id),
    enabled: Boolean(id.trim()),
  })

  const workflow = workflowQuery.data
  const steps = (workflow?.steps || []).slice().sort((a, b) => a.stepNo - b.stepNo)

  if (!id.trim()) {
    return (
      <EmptyState
        title="Thiếu mã quy trình"
        description="Quay lại danh sách quy trình để chọn một quy trình."
      />
    )
  }

  if (workflowQuery.isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-white/5" />
        <div className="surface-card h-48 animate-pulse rounded-2xl" />
        <div className="surface-card h-64 animate-pulse rounded-2xl" />
      </div>
    )
  }

  if (workflowQuery.isError || !workflow) {
    return (
      <div className="space-y-4">
        <Link
          to="/workflows"
          className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"
        >
          <FiArrowLeft className="h-4 w-4" />
          Quay lại danh sách
        </Link>
        <EmptyState
          title="Không tìm thấy quy trình"
          description="Quy trình có thể đã bị ẩn hoặc chưa được kích hoạt."
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link
        to="/workflows"
        className="inline-flex w-fit items-center gap-2 rounded-lg border border-white/10 px-3 py-1.5 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white"
      >
        <FiArrowLeft className="h-4 w-4" />
        Quy trình
      </Link>

      <div className="surface-card overflow-hidden rounded-2xl p-5 sm:p-6">
        <div className="flex flex-wrap items-start gap-3">
          {workflow.platform ? <PlatformBadge platform={workflow.platform} /> : null}
          <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
            Đang hoạt động
          </span>
        </div>

        <h1 className="mt-3 text-2xl font-semibold text-white">{workflow.name}</h1>

        {workflow.description?.trim() ? (
          <p className="mt-2 text-sm leading-relaxed text-slate-400">{workflow.description}</p>
        ) : null}

        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <dt className="text-[10px] text-slate-500">Danh mục</dt>
            <dd className="mt-1 text-xs text-slate-200">{formatWorkflowCategory(workflow.category)}</dd>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <dt className="text-[10px] text-slate-500">Phiên bản</dt>
            <dd className="mt-1 text-xs text-slate-200">v{workflow.version ?? 1}</dd>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <dt className="text-[10px] text-slate-500">Số bước</dt>
            <dd className="mt-1 text-xs text-slate-200">{steps.length} bước</dd>
          </div>
        </dl>

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
          {workflow.createdAt ? (
            <span className="inline-flex items-center gap-1">
              <FiClock className="h-3 w-3" />
              Tạo: {formatWorkflowDate(workflow.createdAt)}
            </span>
          ) : null}
          {workflow.updatedAt ? (
            <span>Cập nhật: {formatWorkflowDate(workflow.updatedAt)}</span>
          ) : null}
        </div>
      </div>

      <section className="surface-card overflow-hidden rounded-2xl">
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3 sm:px-5">
          <FiList className="h-4 w-4 text-violet-400" />
          <h2 className="text-sm font-semibold text-white">Các bước</h2>
          <span className="ml-auto rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-slate-400">
            {steps.length}
          </span>
        </div>

        <div className="p-4 sm:p-5">
          {steps.length === 0 ? (
            <p className="text-sm text-slate-500">Quy trình chưa có bước nào.</p>
          ) : (
            steps.map((step, index) => (
              <StepCard key={step._id} step={step} isLast={index === steps.length - 1} />
            ))
          )}
        </div>
      </section>
    </div>
  )
}

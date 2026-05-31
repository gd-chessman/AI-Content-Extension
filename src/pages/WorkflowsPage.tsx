import { useQuery } from '@tanstack/react-query'
import { FiChevronRight, FiLayers } from 'react-icons/fi'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import EmptyState from '@/components/EmptyState'
import PlatformBadge from '@/components/PlatformBadge'
import { getUserWorkflows, type WorkflowItem, type WorkflowPlatform } from '@/services/WorkflowService'
import { formatWorkflowCategory, formatWorkflowDate, PLATFORM_FILTER_OPTIONS } from '@/utils/workflowHelpers'

function WorkflowCard({ workflow }: { workflow: WorkflowItem }) {
  const excerpt = (workflow.description || '').trim().slice(0, 140)

  return (
    <Link
      to={`/workflows/${workflow._id}`}
      className="group surface-card flex h-full flex-col rounded-2xl p-4 transition-all hover:border-violet-500/30 hover:shadow-lg hover:shadow-violet-950/20"
    >
      <div className="flex items-start justify-between gap-2">
        {workflow.platform ? <PlatformBadge platform={workflow.platform} /> : null}
        <FiChevronRight className="h-4 w-4 shrink-0 text-slate-600 transition group-hover:text-violet-400" />
      </div>

      <h2 className="mt-3 line-clamp-2 text-sm font-semibold text-white">{workflow.name}</h2>

      {excerpt ? (
        <p className="mt-2 line-clamp-3 flex-1 text-xs leading-relaxed text-slate-400">
          {excerpt}
          {excerpt.length >= 140 ? '…' : ''}
        </p>
      ) : (
        <p className="mt-2 flex-1 text-xs italic text-slate-600">Chưa có mô tả.</p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-white/10 pt-3 text-[10px] text-slate-500">
        <span>{formatWorkflowCategory(workflow.category)}</span>
        {workflow.version ? (
          <>
            <span>·</span>
            <span>v{workflow.version}</span>
          </>
        ) : null}
        {workflow.updatedAt ? (
          <>
            <span>·</span>
            <span>{formatWorkflowDate(workflow.updatedAt)}</span>
          </>
        ) : null}
      </div>
    </Link>
  )
}

export default function WorkflowsPage() {
  const [platform, setPlatform] = useState<WorkflowPlatform | 'all'>('all')

  const workflowsQuery = useQuery({
    queryKey: ['workflows', 'user', platform],
    queryFn: () =>
      getUserWorkflows(platform === 'all' ? undefined : { platform: platform as WorkflowPlatform }),
  })

  const items = (workflowsQuery.data || []).filter((w) => w.platform !== 'multi')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Quy trình</h1>
        <p className="mt-1 text-sm text-slate-400">
          Các quy trình con (Facebook, ChatGPT, Grok…) — dùng trong quy trình đa bước hoặc extension.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {PLATFORM_FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setPlatform(opt.value)}
            className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
              platform === opt.value
                ? 'border-blue-300/30 bg-blue-500/20 text-blue-100 ring-1 ring-blue-300/25'
                : 'border-white/10 bg-black/20 text-slate-400 hover:border-blue-300/20 hover:bg-blue-500/10 hover:text-slate-200'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {workflowsQuery.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="surface-card h-40 animate-pulse rounded-2xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title="Chưa có quy trình nào"
          description="Quy trình active sẽ hiện ở đây sau khi được cấu hình trên hệ thống."
        />
      ) : (
        <>
          <p className="text-xs text-slate-500">
            {items.length} quy trình
            {platform !== 'all'
              ? ` · ${PLATFORM_FILTER_OPTIONS.find((o) => o.value === platform)?.label}`
              : ''}
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((workflow) => (
              <WorkflowCard key={workflow._id} workflow={workflow} />
            ))}
          </div>
        </>
      )}

      <div className="surface-card rounded-2xl border-dashed p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-violet-500/10 p-2 text-violet-400">
            <FiLayers className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-medium text-white">Ghép nhiều quy trình?</p>
            <p className="mt-1 text-xs text-slate-400">
              Dùng{' '}
              <Link to="/multi-workflow" className="text-violet-300 hover:underline">
                Quy trình đa bước
              </Link>{' '}
              để nối Facebook → ChatGPT → Grok và chạy tuần tự trên extension.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

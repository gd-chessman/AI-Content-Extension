import type { WorkflowPlatform } from '@/services/WorkflowService'

/** Badge nhỏ — màu theo platform (giống extension), không phải nền sidebar. */
const PLATFORM_STYLES: Record<WorkflowPlatform, string> = {
  facebook: 'bg-blue-500/15 text-blue-300 border-blue-500/25',
  chatgpt: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25',
  grok: 'bg-zinc-500/20 text-zinc-200 border-zinc-500/30',
  ggsheet: 'bg-green-500/15 text-green-300 border-green-500/25',
  webblog: 'bg-amber-500/15 text-amber-300 border-amber-500/25',
  multi: 'bg-violet-500/15 text-violet-300 border-violet-500/25',
}

const PLATFORM_LABELS: Record<WorkflowPlatform, string> = {
  facebook: 'Facebook',
  chatgpt: 'ChatGPT',
  grok: 'Grok',
  ggsheet: 'GG Sheet',
  webblog: 'WebBlog',
  multi: 'Đa bước',
}

export default function PlatformBadge({ platform }: { platform: WorkflowPlatform }) {
  const style = PLATFORM_STYLES[platform] || PLATFORM_STYLES.multi
  const label = PLATFORM_LABELS[platform] || platform

  return (
    <span className={`inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${style}`}>
      {label}
    </span>
  )
}

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/25',
  queued: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/25',
  processing: 'bg-sky-500/15 text-sky-300 border-sky-500/25',
  running: 'bg-sky-500/15 text-sky-300 border-sky-500/25',
  completed: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25',
  failed: 'bg-rose-500/15 text-rose-300 border-rose-500/25',
  cancelled: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/25',
  skipped: 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20',
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Chờ',
  queued: 'Chờ extension',
  processing: 'Đang xử lý',
  running: 'Đang chạy',
  completed: 'Hoàn thành',
  failed: 'Lỗi',
  cancelled: 'Đã hủy',
  skipped: 'Bỏ qua',
}

export default function StatusBadge({ status }: { status: string }) {
  const key = (status || '').trim().toLowerCase()
  const style = STATUS_STYLES[key] || STATUS_STYLES.pending
  const label = STATUS_LABELS[key] || status

  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${style}`}>
      {label}
    </span>
  )
}

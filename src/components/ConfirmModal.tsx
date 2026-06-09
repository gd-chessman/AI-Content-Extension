import { FiX } from 'react-icons/fi'

type ConfirmModalProps = {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'danger' | 'default'
  loading?: boolean
  onConfirm: () => void
  onClose: () => void
}

export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = 'Xác nhận',
  cancelLabel = 'Hủy',
  tone = 'default',
  loading = false,
  onConfirm,
  onClose,
}: ConfirmModalProps) {
  if (!open) return null

  const confirmClass =
    tone === 'danger'
      ? 'border-rose-500/40 bg-rose-500/15 text-rose-50 hover:bg-rose-500/25'
      : 'border-violet-500/40 bg-violet-500/15 text-violet-50 hover:bg-violet-500/25'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
    >
      <div className="absolute inset-0 z-0 bg-black/70 backdrop-blur-sm" aria-hidden onClick={loading ? undefined : onClose} />

      <div
        className="relative z-10 w-full max-w-md rounded-2xl border border-white/10 bg-[#121212] p-5 shadow-2xl shadow-black/60"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="confirm-modal-title" className="text-base font-semibold text-white">
              {title}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">{message}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-lg border border-white/10 p-1.5 text-slate-400 hover:bg-white/5 hover:text-white disabled:opacity-40"
            aria-label="Đóng"
          >
            <FiX className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-300 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`rounded-xl border px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${confirmClass}`}
          >
            {loading ? 'Đang xử lý…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

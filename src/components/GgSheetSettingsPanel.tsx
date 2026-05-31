import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FiSave, FiSettings, FiX } from 'react-icons/fi'
import { isAxiosError } from 'axios'
import {
  updateMyGgSheetSetting,
  type GgSheetSetting,
} from '@/services/GgSheetService'

const inputClass =
  'field-input w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-500'

const columnInputClass =
  'field-input w-full rounded-xl px-3 py-2.5 text-sm uppercase text-white outline-none placeholder:text-slate-500'

function FieldLabel({ children, hint }: { children: string; hint?: string }) {
  return (
    <div className="mb-1.5">
      <label className="text-xs font-medium text-slate-300">{children}</label>
      {hint ? <p className="mt-0.5 text-[11px] text-slate-500">{hint}</p> : null}
    </div>
  )
}

export default function GgSheetSettingsPanel({
  open,
  onClose,
  initial,
}: {
  open: boolean
  onClose: () => void
  initial?: GgSheetSetting
}) {
  const queryClient = useQueryClient()
  const [sheetPath, setSheetPath] = useState('')
  const [titleColumn, setTitleColumn] = useState('')
  const [shortColumn, setShortColumn] = useState('')
  const [fullColumn, setFullColumn] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!open) return
    setSheetPath((initial?.ggSheetPath || '').trim())
    setTitleColumn((initial?.titleColumn || '').trim())
    setShortColumn((initial?.shortContentColumn || '').trim())
    setFullColumn((initial?.fullContentColumn || '').trim())
    setMessage('')
  }, [open, initial])

  const saveMutation = useMutation({
    mutationFn: async () => {
      const ggSheetPath = sheetPath.trim()
      const title = titleColumn.trim().toUpperCase()
      const shortContentColumn = shortColumn.trim().toUpperCase()
      const fullContentColumn = fullColumn.trim().toUpperCase()
      if (ggSheetPath && !title && !shortContentColumn && !fullContentColumn) {
        throw new Error('Phải cấu hình ít nhất một cột khi đã có đường dẫn sheet.')
      }
      return updateMyGgSheetSetting({
        ggSheetPath,
        titleColumn: title,
        shortContentColumn,
        fullContentColumn,
      })
    },
    onSuccess: () => {
      setMessage('Đã lưu cấu hình GG Sheet.')
      void queryClient.invalidateQueries({ queryKey: ['ggsheet'] })
      onClose()
    },
    onError: (error: unknown) => {
      if (isAxiosError(error)) {
        const raw = String(error.response?.data?.message || '').toLowerCase()
        if (raw.includes('invalid url')) {
          setMessage('Đường dẫn không hợp lệ — chỉ chấp nhận http/https.')
          return
        }
        if (raw.includes('invalid sheet column')) {
          setMessage('Cột không hợp lệ — chỉ dùng chữ cái A–Z (vd: B, AA).')
          return
        }
        if (raw.includes('at least one target column')) {
          setMessage('Phải cấu hình ít nhất một cột.')
          return
        }
      }
      setMessage(error instanceof Error ? error.message : 'Không thể lưu cấu hình.')
    },
  })

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ggsheet-settings-title"
    >
      <div
        className="absolute inset-0 z-0 bg-black/70 backdrop-blur-sm"
        aria-hidden
        onClick={onClose}
      />

      <div
        className="relative z-10 flex max-h-[min(90vh,640px)] w-full max-w-lg flex-col rounded-2xl border border-white/10 bg-[#121212] shadow-2xl shadow-black/60"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <FiSettings className="h-4 w-4 text-blue-300" />
              <h2 id="ggsheet-settings-title" className="text-base font-semibold text-white">
                Cài đặt GG Sheet
              </h2>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Đường dẫn sheet và các cột ghi tiêu đề / nội dung.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/10 p-1.5 text-slate-400 hover:bg-white/5 hover:text-white"
            aria-label="Đóng cài đặt"
          >
            <FiX className="h-4 w-4" />
          </button>
        </div>

        <form
          className="flex-1 space-y-4 overflow-y-auto px-5 py-4"
          onSubmit={(event) => {
            event.preventDefault()
            setMessage('')
            saveMutation.mutate()
          }}
        >
        <div>
          <FieldLabel hint="URL đầy đủ tới Google Spreadsheet (có thể kèm ?gid= tab).">
            Đường dẫn Google Sheet
          </FieldLabel>
          <input
            type="url"
            value={sheetPath}
            onChange={(e) => setSheetPath(e.target.value)}
            placeholder="https://docs.google.com/spreadsheets/d/..."
            className={inputClass}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <FieldLabel hint="Cột ghi tiêu đề — vd: B">Cột tiêu đề</FieldLabel>
            <input
              type="text"
              value={titleColumn}
              onChange={(e) => setTitleColumn(e.target.value.toUpperCase())}
              placeholder="B"
              maxLength={3}
              className={columnInputClass}
            />
          </div>
          <div>
            <FieldLabel hint="Cột nội dung ngắn — vd: C">Cột nội dung ngắn</FieldLabel>
            <input
              type="text"
              value={shortColumn}
              onChange={(e) => setShortColumn(e.target.value.toUpperCase())}
              placeholder="C"
              maxLength={3}
              className={columnInputClass}
            />
          </div>
          <div>
            <FieldLabel hint="Cột nội dung dài — vd: G">Cột nội dung dài</FieldLabel>
            <input
              type="text"
              value={fullColumn}
              onChange={(e) => setFullColumn(e.target.value.toUpperCase())}
              placeholder="G"
              maxLength={3}
              className={columnInputClass}
            />
          </div>
        </div>

        <p className="text-[11px] text-slate-500">
          Để trống cột nào thì hệ thống không ghi/đọc cột đó. Đối chiếu cần ít nhất cột tiêu đề và
          nội dung ngắn. Share sheet cho service account Google với quyền Editor.
        </p>

        {message ? <p className="text-xs text-slate-300">{message}</p> : null}

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="submit"
              disabled={saveMutation.isPending}
              className="inline-flex items-center gap-1.5 rounded-xl border border-blue-300/30 bg-blue-500/20 px-4 py-2 text-sm text-blue-100 hover:bg-blue-500/30 disabled:opacity-40"
            >
              <FiSave className="h-4 w-4" />
              {saveMutation.isPending ? 'Đang lưu…' : 'Lưu cài đặt'}
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

/** Nút mở panel cài đặt — dùng chung header trang GG Sheet. */
export function GgSheetSettingsButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-300 hover:border-blue-300/30 hover:bg-blue-500/10 hover:text-blue-100"
    >
      <FiSettings className="h-3.5 w-3.5" />
      Cài đặt
    </button>
  )
}

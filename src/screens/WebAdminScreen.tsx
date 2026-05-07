import { useEffect, useRef, useState } from 'react'
import { FiAlertTriangle, FiCheck, FiCopy, FiInfo, FiSave, FiSettings } from 'react-icons/fi'
import { getMySettings, updateMySettings } from '@/services/SettingsService'

type WebAdminPayload = {
  title?: string
  longContent?: string
  image1?: string
  image2?: string
}

const toEditorHtml = (raw: string) => {
  const source = (raw || '').trim()
  if (!source) return ''
  const blocks = source.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean)
  return blocks
    .map((block) => {
      if (/<(?:p|img|div|br|h\d|ul|ol|li|blockquote)\b/i.test(block)) return block
      const escaped = block
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
      return `<p>${escaped}</p>`
    })
    .join('')
}

const htmlToPlainText = (html: string) => {
  if (!html) return ''
  const div = document.createElement('div')
  div.innerHTML = html
  return (div.textContent || div.innerText || '').trim()
}

export default function WebAdminScreen() {
  const [title, setTitle] = useState('')
  const [longContent, setLongContent] = useState('')
  const [image1, setImage1] = useState('')
  const [image2, setImage2] = useState('')
  const [status, setStatus] = useState('Đợi dữ liệu từ ChatGPT để điền WebAdmin.')
  const [copiedField, setCopiedField] = useState<'title' | 'content' | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [webPathInput, setWebPathInput] = useState('')
  const contentEditorRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await getMySettings()
        setWebPathInput(settings?.adminPath || '')
      } catch {
        setWebPathInput('')
      }
    }
    void loadSettings()
  }, [])

  useEffect(() => {
    const onFill = (event: Event) => {
      const custom = event as CustomEvent<WebAdminPayload>
      const payload = custom.detail || {}
      setTitle((payload.title || '').trim())
      setLongContent((payload.longContent || '').trim())
      setImage1(payload.image1 || '')
      setImage2(payload.image2 || '')
      setStatus('Đã nhận dữ liệu WebAdmin từ ChatGPT.')
    }
    window.addEventListener('fill-webadmin-from-chatgpt', onFill as EventListener)
    return () => window.removeEventListener('fill-webadmin-from-chatgpt', onFill as EventListener)
  }, [])

  const statusLower = status.toLowerCase()
  const statusTone = statusLower.includes('không thể') || statusLower.includes('không') || statusLower.includes('lỗi')
    ? 'error'
    : statusLower.includes('đã ')
      ? 'success'
      : 'info'

  const copyText = async (field: 'title' | 'content') => {
    const value = field === 'title' ? title : longContent
    if (!value.trim()) return
    try {
      if (field === 'content') {
        const editorEl = contentEditorRef.current
        const htmlSource = editorEl?.innerHTML?.trim() || toEditorHtml(value)
        const wrapper = document.createElement('div')
        wrapper.innerHTML = htmlSource
        wrapper.querySelectorAll('img').forEach((img) => {
          img.setAttribute('width', '420')
          const prevStyle = img.getAttribute('style') || ''
          img.setAttribute('style', `${prevStyle};width:420px;max-width:100%;height:auto;`)
        })
        const html = wrapper.innerHTML
        const plain = htmlToPlainText(html)
        if ('ClipboardItem' in window && navigator.clipboard?.write) {
          await navigator.clipboard.write([
            new ClipboardItem({
              'text/html': new Blob([html], { type: 'text/html' }),
              'text/plain': new Blob([plain], { type: 'text/plain' }),
            }),
          ])
        } else {
          await navigator.clipboard.writeText(plain || value)
        }
      } else {
        await navigator.clipboard.writeText(value)
      }
      setCopiedField(field)
      window.setTimeout(() => setCopiedField((prev) => (prev === field ? null : prev)), 1200)
    } catch {
      setStatus('Không thể sao chép. Hãy thử lại.')
    }
  }

  const saveWebPath = async () => {
    try {
      await updateMySettings({ adminPath: webPathInput.trim() })
      setStatus('Đã lưu cấu hình đường dẫn WebAdmin.')
      setShowSettings(false)
    } catch {
      setStatus('Không thể lưu cấu hình đường dẫn WebAdmin.')
    }
  }

  return (
    <section className="glass-panel flex h-full min-h-0 flex-col rounded-3xl p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-white">WebAdmin</h2>
        <button
          type="button"
          onClick={() => setShowSettings((prev) => !prev)}
          className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg bg-blue-500/20 text-blue-100 transition hover:bg-blue-500/30"
          title="Cài đặt đường dẫn web"
          aria-label="Cài đặt đường dẫn web"
        >
          <FiSettings className="h-3.5 w-3.5" />
        </button>
      </div>
      {showSettings ? (
        <div className="mt-2 rounded-xl border border-blue-300/30 bg-blue-500/10 p-2">
          <p className="text-[10px] text-slate-300">Đường dẫn WebAdmin</p>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="text"
              value={webPathInput}
              onChange={(event) => setWebPathInput(event.target.value)}
              placeholder="https://your-webadmin-url.com"
              className="w-full rounded-lg bg-slate-900/80 px-2 py-1.5 text-[11px] text-slate-100 outline-none placeholder:text-slate-500"
            />
            <button
              type="button"
              onClick={saveWebPath}
              className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-100 transition hover:bg-emerald-500/30"
              title="Lưu cấu hình"
              aria-label="Lưu cấu hình"
            >
              <FiSave className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ) : null}
      <p
        className={`mt-2 inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-[11px] ${
          statusTone === 'success'
            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
            : statusTone === 'error'
              ? 'border-rose-500/30 bg-rose-500/10 text-rose-100'
              : 'border-white/10 bg-black/40 text-slate-300'
        }`}
      >
        {statusTone === 'success' ? (
          <FiCheck className="h-3.5 w-3.5" />
        ) : statusTone === 'error' ? (
          <FiAlertTriangle className="h-3.5 w-3.5" />
        ) : (
          <FiInfo className="h-3.5 w-3.5" />
        )}
        {status}
      </p>

      <div className="mt-2 grid min-h-0 flex-1 grid-rows-[auto_1fr] gap-2 overflow-hidden">
        <div className="rounded-2xl border border-white/10 bg-black/25 p-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-slate-500">Tiêu đề thường</p>
            <button
              type="button"
              onClick={() => void copyText('title')}
              disabled={!title.trim()}
              title="Sao chép tiêu đề"
              aria-label="Sao chép tiêu đề"
              className="inline-flex cursor-pointer items-center rounded-md bg-blue-500/20 px-2 py-1 text-[10px] font-semibold text-blue-100 transition hover:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {copiedField === 'title' ? <FiCheck className="h-3.5 w-3.5" /> : <FiCopy className="h-3.5 w-3.5" />}
            </button>
          </div>
          <textarea
            readOnly
            value={title}
            className="mt-1 h-14 w-full resize-none rounded-xl bg-slate-900/80 px-2 py-1.5 text-[11px] text-slate-100 outline-none"
          />
        </div>

        <div className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto] gap-2 overflow-hidden">
          <div className="rounded-2xl border border-white/10 bg-black/25 p-2 min-h-0">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] text-slate-500">Nội dung dài (đã chèn ảnh 1/2 ngẫu nhiên)</p>
              <button
                type="button"
                onClick={() => void copyText('content')}
                disabled={!longContent.trim()}
                title="Sao chép nội dung"
                aria-label="Sao chép nội dung"
                className="inline-flex cursor-pointer items-center rounded-md bg-blue-500/20 px-2 py-1 text-[10px] font-semibold text-blue-100 transition hover:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {copiedField === 'content' ? <FiCheck className="h-3.5 w-3.5" /> : <FiCopy className="h-3.5 w-3.5" />}
              </button>
            </div>
            <div
              ref={contentEditorRef}
              contentEditable
              suppressContentEditableWarning
              onBlur={(event) => setLongContent(event.currentTarget.innerHTML.trim())}
              className="mt-1 h-[calc(100%-24px)] min-h-0 w-full overflow-y-auto rounded-xl bg-slate-900/80 px-2 py-1.5 text-[11px] text-slate-100 outline-none"
              dangerouslySetInnerHTML={{ __html: toEditorHtml(longContent) }}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-2xl border border-white/10 bg-black/25 p-1.5">
              <p className="mb-1 text-[10px] text-slate-500">Ảnh 1</p>
              {image1 ? <img src={image1} alt="Ảnh 1" className="h-20 w-full rounded-md object-contain" /> : <p className="text-[10px] text-slate-500">Chưa có</p>}
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/25 p-1.5">
              <p className="mb-1 text-[10px] text-slate-500">Ảnh 2</p>
              {image2 ? <img src={image2} alt="Ảnh 2" className="h-20 w-full rounded-md object-contain" /> : <p className="text-[10px] text-slate-500">Chưa có</p>}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

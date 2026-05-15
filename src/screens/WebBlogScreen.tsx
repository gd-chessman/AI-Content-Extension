import { useEffect, useRef, useState } from 'react'
import {
  FiAlertTriangle,
  FiCheck,
  FiCopy,
  FiFolder,
  FiGlobe,
  FiInfo,
  FiRotateCcw,
  FiSave,
  FiSettings,
} from 'react-icons/fi'
import { getMyWebBlogSetting, updateMyWebBlogSetting } from '@/services/WebBlogService'
import { injectImagesIntoLongContent } from '@/utils/chatgptContentProcessing'
import {
  getStoriesFolderSegmentFromStorage,
  listLocalStoryFolders,
  loadContentRootDirectoryHandle,
  loadLocalStoryBundle,
  type LocalStoryFolderEntry,
} from '@/utils/localWorkspacePersistence'
import translate from 'translate'

const getChrome = () => (globalThis as { chrome?: { storage?: { local?: unknown } } }).chrome

type WebBlogPayload = {
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

const translateInChunks = async (source: string) => {
  const value = (source || '').trim()
  if (!value) return ''

  // Keep request size small to avoid translator payload limits.
  const MAX_CHUNK = 1800
  const blocks = value
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean)

  const chunks: string[] = []
  let current = ''
  for (const block of blocks) {
    if (!current) {
      current = block
      continue
    }
    const next = `${current}\n\n${block}`
    if (next.length <= MAX_CHUNK) {
      current = next
    } else {
      chunks.push(current)
      current = block
    }
  }
  if (current) chunks.push(current)
  if (chunks.length === 0) chunks.push(value.slice(0, MAX_CHUNK))

  const out: string[] = []
  for (const chunk of chunks) {
    // eslint-disable-next-line no-await-in-loop
    const translated = await translate(chunk, { to: 'vi' })
    out.push((translated || '').trim())
  }
  return out.join('\n\n').trim()
}

export default function WebBlogScreen() {
  const [title, setTitle] = useState('')
  const [longContent, setLongContent] = useState('')
  const [originalTitle, setOriginalTitle] = useState('')
  const [originalLongContent, setOriginalLongContent] = useState('')
  const [image1, setImage1] = useState('')
  const [image2, setImage2] = useState('')
  const [status, setStatus] = useState('Đợi dữ liệu từ ChatGPT để điền WebBlog.')
  const [copiedField, setCopiedField] = useState<'title' | 'content' | null>(null)
  const [isTranslatingTitle, setIsTranslatingTitle] = useState(false)
  const [isTranslatingContent, setIsTranslatingContent] = useState(false)
  const [isTitleTranslated, setIsTitleTranslated] = useState(false)
  const [isContentTranslated, setIsContentTranslated] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [webPathInput, setWebPathInput] = useState('')
  const [showLocalImport, setShowLocalImport] = useState(false)
  const [localStoryEntries, setLocalStoryEntries] = useState<LocalStoryFolderEntry[]>([])
  const [selectedLocalFolder, setSelectedLocalFolder] = useState('')
  const [isLoadingLocalList, setIsLoadingLocalList] = useState(false)
  const [isImportingLocal, setIsImportingLocal] = useState(false)
  const contentEditorRef = useRef<HTMLDivElement | null>(null)

  const applyWebBlogPayload = (payload: {
    title?: string
    longContent?: string
    image1?: string
    image2?: string
  }) => {
    const nextTitle = (payload.title || '').trim()
    const nextLongContent = (payload.longContent || '').trim()
    setTitle(nextTitle)
    setLongContent(nextLongContent)
    setOriginalTitle(nextTitle)
    setOriginalLongContent(nextLongContent)
    setIsTitleTranslated(false)
    setIsContentTranslated(false)
    setImage1(payload.image1 || '')
    setImage2(payload.image2 || '')
  }

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await getMyWebBlogSetting()
        setWebPathInput(settings?.adminPath || '')
      } catch {
        setWebPathInput('')
      }
    }
    void loadSettings()
  }, [])

  useEffect(() => {
    const onFill = (event: Event) => {
      const custom = event as CustomEvent<WebBlogPayload>
      const payload = custom.detail || {}
      applyWebBlogPayload(payload)
      setStatus('Đã nhận dữ liệu WebBlog từ ChatGPT.')
    }
    window.addEventListener('fill-webblog-from-chatgpt', onFill as EventListener)
    return () => window.removeEventListener('fill-webblog-from-chatgpt', onFill as EventListener)
  }, [])

  const openLocalImportPicker = async () => {
    setShowLocalImport(true)
    setIsLoadingLocalList(true)
    setLocalStoryEntries([])
    setSelectedLocalFolder('')
    try {
      const root = await loadContentRootDirectoryHandle()
      if (!root) {
        setStatus('Chưa chọn thư mục gốc workspace. Vào Hồ sơ → Cấu hình → Chọn thư mục gốc.')
        setShowLocalImport(false)
        return
      }
      const storiesSeg = await getStoriesFolderSegmentFromStorage(
        getChrome()?.storage?.local as Parameters<typeof getStoriesFolderSegmentFromStorage>[0],
      )
      const entries = await listLocalStoryFolders(root, storiesSeg)
      if (!entries.length) {
        setStatus('Chưa có story nào đã lưu trong workspace local.')
        setShowLocalImport(false)
        return
      }
      setLocalStoryEntries(entries)
      setSelectedLocalFolder(entries[0].folderName)
      setStatus(`Chọn story đã lưu (${entries.length} mục) rồi bấm Nhập.`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setStatus(`Không đọc được danh sách local: ${msg}`)
      setShowLocalImport(false)
    } finally {
      setIsLoadingLocalList(false)
    }
  }

  const importFromLocalWorkspace = async () => {
    const folder = selectedLocalFolder.trim()
    if (!folder) {
      setStatus('Chọn một story trong danh sách local.')
      return
    }
    setIsImportingLocal(true)
    try {
      const root = await loadContentRootDirectoryHandle()
      if (!root) {
        setStatus('Chưa chọn thư mục gốc workspace. Vào Hồ sơ → Cấu hình.')
        return
      }
      const storiesSeg = await getStoriesFolderSegmentFromStorage(
        getChrome()?.storage?.local as Parameters<typeof getStoriesFolderSegmentFromStorage>[0],
      )
      const bundle = await loadLocalStoryBundle(root, storiesSeg, folder, injectImagesIntoLongContent)
      applyWebBlogPayload({
        title: bundle.title,
        longContent: bundle.longContentWithImages,
        image1: bundle.image1,
        image2: bundle.image2,
      })
      setShowLocalImport(false)
      const imgNote =
        bundle.image1 && bundle.image2
          ? ' (đã chèn ảnh 1/2 vào nội dung dài)'
          : bundle.image1 || bundle.image2
            ? ' (chỉ có một ảnh — chưa chèn đủ cặp)'
            : ''
      setStatus(`Đã nhập từ local: «${bundle.title}»${imgNote}.`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setStatus(`Nhập từ local thất bại: ${msg}`)
    } finally {
      setIsImportingLocal(false)
    }
  }

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
      await updateMyWebBlogSetting({ adminPath: webPathInput.trim() })
      setStatus('Đã lưu cấu hình đường dẫn WebBlog.')
      setShowSettings(false)
    } catch {
      setStatus('Không thể lưu cấu hình đường dẫn WebBlog.')
    }
  }

  const translateField = async (field: 'title' | 'content') => {
    if (field === 'title' && isTitleTranslated) {
      setTitle(originalTitle)
      setIsTitleTranslated(false)
      setStatus('Đã quay về tiêu đề gốc.')
      return
    }
    if (field === 'content' && isContentTranslated) {
      setLongContent(originalLongContent)
      setIsContentTranslated(false)
      setStatus('Đã quay về nội dung gốc.')
      return
    }

    const source = field === 'title' ? title.trim() : longContent.trim()
    if (!source) return
    if (field === 'title') setIsTranslatingTitle(true)
    else setIsTranslatingContent(true)
    try {
      let next = ''
      if (field === 'title') {
        next = await translateInChunks(source)
      } else {
        // Long content may include HTML/images; translate text only to avoid payload overflow.
        const editorEl = contentEditorRef.current
        const htmlSource = editorEl?.innerHTML?.trim() || toEditorHtml(source)
        const plainText = htmlToPlainText(htmlSource)
        next = await translateInChunks(plainText)
      }
      if (!next) {
        setStatus('Không nhận được bản dịch.')
        return
      }
      if (field === 'title') setTitle(next)
      else setLongContent(next)
      if (field === 'title') setIsTitleTranslated(true)
      else setIsContentTranslated(true)
      setStatus(field === 'title' ? 'Đã dịch tiêu đề thường.' : 'Đã dịch nội dung dài.')
    } catch {
      setStatus(field === 'title' ? 'Dịch tiêu đề thất bại.' : 'Dịch nội dung dài thất bại.')
    } finally {
      if (field === 'title') setIsTranslatingTitle(false)
      else setIsTranslatingContent(false)
    }
  }

  return (
    <section className="glass-panel flex h-full min-h-0 flex-col rounded-3xl p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-white">WebBlog</h2>
        <div className="inline-flex items-center gap-1">
          <button
            type="button"
            onClick={() => void openLocalImportPicker()}
            disabled={isLoadingLocalList || isImportingLocal}
            className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg bg-teal-500/20 text-teal-100 transition hover:bg-teal-500/30 disabled:cursor-not-allowed disabled:opacity-40"
            title="Nhập tiêu đề, nội dung dài và ảnh từ workspace đã lưu (ChatGPT → Lưu local)"
            aria-label="Nhập từ local"
          >
            <FiFolder className="h-3.5 w-3.5" />
          </button>
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
      </div>
      {showLocalImport ? (
        <div className="mt-2 rounded-xl border border-teal-300/30 bg-teal-500/10 p-2">
          <p className="text-[10px] text-slate-300">Nhập từ workspace local</p>
          {isLoadingLocalList ? (
            <p className="mt-1 text-[10px] text-slate-400">Đang tải danh sách story…</p>
          ) : (
            <>
              <select
                value={selectedLocalFolder}
                onChange={(e) => setSelectedLocalFolder(e.target.value)}
                className="mt-1 w-full rounded-lg bg-slate-900/80 px-2 py-1.5 text-[11px] text-slate-100 outline-none"
              >
                {localStoryEntries.map((entry) => (
                  <option key={entry.folderName} value={entry.folderName}>
                    {entry.displayName}
                    {entry.savedAt ? ` — ${new Date(entry.savedAt).toLocaleString('vi-VN')}` : ''}
                  </option>
                ))}
              </select>
              <div className="mt-2 flex justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowLocalImport(false)}
                  className="cursor-pointer rounded-lg bg-white/10 px-2 py-1 text-[10px] text-slate-300 transition hover:bg-white/15"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={() => void importFromLocalWorkspace()}
                  disabled={!selectedLocalFolder || isImportingLocal}
                  className="cursor-pointer rounded-lg bg-teal-500/30 px-2 py-1 text-[10px] font-semibold text-teal-50 transition hover:bg-teal-500/40 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isImportingLocal ? 'Đang nhập…' : 'Nhập'}
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}
      {showSettings ? (
        <div className="mt-2 rounded-xl border border-blue-300/30 bg-blue-500/10 p-2">
          <p className="text-[10px] text-slate-300">Đường dẫn WebBlog</p>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="text"
              value={webPathInput}
              onChange={(event) => setWebPathInput(event.target.value)}
              placeholder="https://your-webblog-url.com"
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
            <div className="inline-flex items-center gap-1">
              <button
                type="button"
                onClick={() => void translateField('title')}
                disabled={!title.trim() || isTranslatingTitle}
                title={
                  isTranslatingTitle
                    ? 'Đang xử lý...'
                    : isTitleTranslated
                      ? 'Quay về tiêu đề gốc'
                      : 'Dịch tiêu đề'
                }
                aria-label="Dịch tiêu đề"
                className="relative inline-flex cursor-pointer items-center rounded-md bg-violet-500/20 px-2 py-1 text-[10px] font-semibold text-violet-100 transition hover:bg-violet-500/30 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isTranslatingTitle ? (
                  <span className="animate-pulse">…</span>
                ) : isTitleTranslated ? (
                  <FiRotateCcw className="h-3.5 w-3.5" />
                ) : (
                  <FiGlobe className="h-3.5 w-3.5" />
                )}
                {isTitleTranslated ? (
                  <span className="absolute -right-1 -top-1 rounded-full bg-violet-500 px-1 text-[7px] leading-none text-white">
                    VI
                  </span>
                ) : null}
              </button>
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
              <div className="inline-flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => void translateField('content')}
                  disabled={!longContent.trim() || isTranslatingContent}
                  title={
                    isTranslatingContent
                      ? 'Đang xử lý...'
                      : isContentTranslated
                        ? 'Quay về nội dung gốc'
                        : 'Dịch nội dung dài'
                  }
                  aria-label="Dịch nội dung dài"
                  className="relative inline-flex cursor-pointer items-center rounded-md bg-violet-500/20 px-2 py-1 text-[10px] font-semibold text-violet-100 transition hover:bg-violet-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isTranslatingContent ? (
                    <span className="animate-pulse">…</span>
                  ) : isContentTranslated ? (
                    <FiRotateCcw className="h-3.5 w-3.5" />
                  ) : (
                    <FiGlobe className="h-3.5 w-3.5" />
                  )}
                  {isContentTranslated ? (
                    <span className="absolute -right-1 -top-1 rounded-full bg-violet-500 px-1 text-[7px] leading-none text-white">
                      VI
                    </span>
                  ) : null}
                </button>
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

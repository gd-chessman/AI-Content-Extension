import { useEffect, useState } from 'react'
import { FiAlertTriangle, FiCheck, FiCopy, FiDownload, FiInfo, FiSave, FiSend, FiSettings, FiX } from 'react-icons/fi'
import {
  extractGgSheetRow,
  getMyGgSheetSetting,
  previewPushGgSheet,
  pushGgSheet,
  updateMyGgSheetSetting,
  type GgSheetPushPreview,
} from '@/services/GgSheetService'

type BrowserTab = { id?: number; url?: string; active?: boolean }
type ExtensionChrome = {
  tabs?: {
    query?: (
      queryInfo: { url?: string[]; currentWindow?: boolean; active?: boolean },
      callback: (tabs: BrowserTab[]) => void,
    ) => void
    create?: (createProperties: { url: string; active?: boolean }, callback?: (tab: BrowserTab) => void) => void
    update?: (tabId: number, updateProperties: { url?: string; active?: boolean }, callback?: (tab: BrowserTab) => void) => void
  }
  scripting?: {
    executeScript?: (injection: {
      target: { tabId: number }
      func: (...args: unknown[]) => unknown
      args?: unknown[]
    }) => Promise<Array<{ result?: unknown }>>
  }
}

type CollectedData = {
  title: string
  shortContent: string
  fullContent: string
}

const formatPreviewLines = (value: string, maxLines: number) => {
  const lines = (value || '')
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length <= maxLines) return lines.join('\n')
  if (maxLines <= 2) return `${lines[0] || ''}\n...`

  const headCount = Math.floor((maxLines - 1) / 2)
  const tailCount = maxLines - headCount - 1
  const head = lines.slice(0, headCount)
  const tail = lines.slice(lines.length - tailCount)
  return [...head, '...', ...tail].join('\n')
}

const CHATGPT_URL = 'https://chatgpt.com/'
const CHATGPT_PATTERNS = ['*://chatgpt.com/*', '*://chat.openai.com/*']
const extractSheetId = (url: string) => url.match(/\/spreadsheets\/d\/([^/]+)/)?.[1] || ''

export default function GgSheetScreen() {
  const [activeTab, setActiveTab] = useState<'collect' | 'extract'>('collect')
  const [sheetUrl, setSheetUrl] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [sheetPathInput, setSheetPathInput] = useState('')
  const [titleColumnInput, setTitleColumnInput] = useState('')
  const [shortColumnInput, setShortColumnInput] = useState('')
  const [fullColumnInput, setFullColumnInput] = useState('')
  const [status, setStatus] = useState('Sẵn sàng gom dữ liệu từ ChatGPT và đẩy lên GG Sheet.')
  const statusLower = status.toLowerCase()
  const statusTone = statusLower.includes('không thể') || statusLower.includes('không tìm thấy') || statusLower.includes('thất bại') || statusLower.includes('lỗi')
    ? 'error'
    : statusLower.includes('đang ')
      ? 'loading'
      : statusLower.includes('đã ')
        ? 'success'
        : 'info'
  const [data, setData] = useState<CollectedData>({ title: '', shortContent: '', fullContent: '' })
  const [isSaving, setIsSaving] = useState(false)
  const [previewData, setPreviewData] = useState<GgSheetPushPreview | null>(null)
  const [showPreviewModal, setShowPreviewModal] = useState(false)
  const [extractRowInput, setExtractRowInput] = useState('')
  const [isExtracting, setIsExtracting] = useState(false)
  const sheetId = extractSheetId(sheetUrl)
  const isSheetConfigured = Boolean(sheetId)

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await getMyGgSheetSetting()
        const configured = (settings?.ggSheetPath || '').trim()
        setSheetPathInput(configured)
        setTitleColumnInput((settings?.titleColumn || '').trim())
        setShortColumnInput((settings?.shortContentColumn || '').trim())
        setFullColumnInput((settings?.fullContentColumn || '').trim())
        if (configured) setSheetUrl(configured)
      } catch {
        setSheetUrl('')
        setSheetPathInput('')
        setTitleColumnInput('')
        setShortColumnInput('')
        setFullColumnInput('')
      }
    }
    void loadSettings()
  }, [])

  const saveSheetPath = async () => {
    try {
      const next = sheetPathInput.trim()
      const titleColumn = titleColumnInput.trim().toUpperCase()
      const shortContentColumn = shortColumnInput.trim().toUpperCase()
      const fullContentColumn = fullColumnInput.trim().toUpperCase()
      if (next && !titleColumn && !shortContentColumn && !fullContentColumn) {
        setStatus('Phải cấu hình ít nhất 1 cột trước khi lưu.')
        return
      }
      await updateMyGgSheetSetting({
        ggSheetPath: next,
        titleColumn,
        shortContentColumn,
        fullContentColumn,
      })
      setSheetUrl(next)
      setShowSettings(false)
      setStatus('Đã lưu cấu hình đường dẫn GG Sheet.')
    } catch (error: any) {
      const raw = String(error?.response?.data?.message || '').toLowerCase()
      if (raw.includes('invalid url format') || raw.includes('url must use http or https')) {
        setStatus('Đường dẫn GG Sheet không hợp lệ. Chỉ chấp nhận http/https.')
        return
      }
      if (raw.includes('invalid sheet column format')) {
        setStatus('Cột không hợp lệ. Chỉ nhập chữ cái cột như A, B, AA hoặc để trống.')
        return
      }
      if (raw.includes('at least one target column is required')) {
        setStatus('Phải cấu hình ít nhất 1 cột trước khi lưu.')
        return
      }
      setStatus('Không thể lưu cấu hình đường dẫn GG Sheet.')
    }
  }

  const mapGgSheetErrorMessage = (error: any, fallback: string) => {
    const raw = String(error?.response?.data?.message || '').toLowerCase()
    if (!raw) return fallback
    if (raw.includes('permission denied') || raw.includes('does not have permission')) {
      return 'Google Sheet chưa cấp quyền cho tài khoản service. Hãy share sheet cho GOOGLE_SERVICE_ACCOUNT_EMAIL với quyền Editor.'
    }
    if (raw.includes('not found') || raw.includes('check ggsheetpath')) {
      return 'Không tìm thấy Google Sheet. Hãy kiểm tra lại đường dẫn ggSheetPath.'
    }
    if (raw.includes('service account is not configured')) {
      return 'Backend chưa cấu hình Google Service Account.'
    }
    if (raw.includes('no data to push')) {
      return 'Không có dữ liệu để đẩy lên GG Sheet.'
    }
    if (raw.includes('duplicate title and short content')) {
      return 'Tiêu đề và nội dung ngắn đã tồn tại trong sheet. Không thể ghi trùng dữ liệu.'
    }
    if (raw.includes('no target columns configured')) {
      return 'Bạn chưa cấu hình cột ghi dữ liệu. Hãy nhập ít nhất 1 cột trong phần cài đặt GG Sheet.'
    }
    return fallback
  }

  const getChrome = () => (globalThis as { chrome?: ExtensionChrome }).chrome
  const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms))

  const queryTabs = (pattern?: string[], currentWindow = false, active = false) =>
    new Promise<BrowserTab[]>((resolve) => {
      const extensionChrome = getChrome()
      const queryInfo: { url?: string[]; currentWindow?: boolean; active?: boolean } = {}
      if (pattern && pattern.length > 0) queryInfo.url = pattern
      if (currentWindow) queryInfo.currentWindow = true
      if (active) queryInfo.active = true
      extensionChrome?.tabs?.query?.(queryInfo, (tabs) => resolve(tabs || []))
    })

  const createTab = (url: string) =>
    new Promise<BrowserTab | null>((resolve) => {
      const extensionChrome = getChrome()
      extensionChrome?.tabs?.create?.({ url, active: true }, (tab) => resolve(tab || null))
    })

  const updateTab = (tabId: number, url?: string) =>
    new Promise<BrowserTab | null>((resolve) => {
      const extensionChrome = getChrome()
      extensionChrome?.tabs?.update?.(tabId, url ? { url, active: true } : { active: true }, (tab) => resolve(tab || null))
    })

  const getOrOpenTab = async (patterns: string[], url: string) => {
    const currentActive = await queryTabs(undefined, true, true)
    const activeTab = currentActive[0]
    const activeMatch = Boolean(activeTab?.url && patterns.some((p) => new RegExp(p.replace(/\*/g, '.*')).test(activeTab.url || '')))
    const activeTabs = activeMatch ? [activeTab] : await queryTabs(patterns, true, true)
    const allTabs = activeTabs.length > 0 ? activeTabs : await queryTabs(patterns)
    let target: BrowserTab | null | undefined = allTabs[0]

    if (!target?.id) {
      target = await createTab(url)
      await sleep(700)
      return target
    }

    target = await updateTab(target.id)
    await sleep(300)
    return target
  }

  const collectFromChatgpt = async () => {
    const extensionChrome = getChrome()
    if (!extensionChrome?.scripting?.executeScript || !extensionChrome?.tabs?.query) {
      setStatus('Môi trường hiện tại không hỗ trợ gom dữ liệu từ ChatGPT.')
      return null
    }

    setStatus('Đang gom dữ liệu từ output Tiến trình 4 trong ChatGPT...')
    const target = await getOrOpenTab(CHATGPT_PATTERNS, CHATGPT_URL)
    if (!target?.id) {
      setStatus('Không mở được tab ChatGPT để gom dữ liệu.')
      return null
    }

    const result = await extensionChrome.scripting.executeScript({
      target: { tabId: target.id },
      func: (() => {
        const normalize = (text: string) => text.replace(/\r/g, '').trim()
        const splitParagraphs = (text: string) =>
          normalize(text)
            .split(/\n\s*\n/)
            .map((block) => block.trim())
            .filter(Boolean)
        const getLargestCodeBlock = (text: string) => {
          const matches = Array.from(text.matchAll(/```(?:[a-zA-Z0-9_-]+)?\n?([\s\S]*?)```/g))
          if (matches.length === 0) return ''
          return matches
            .map((m) => (m[1] || '').trim())
            .sort((a, b) => b.length - a.length)[0]
        }
        const cleanTitleEnd = (value: string) => value.trim().replace(/[.!?…,:;\-\s]+$/g, '')
        const stylizeTitle = (title: string) => {
          const upper = title.toUpperCase()
          const plain = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
          const styled = '𝑨𝑩𝑪𝑫𝑬𝑭𝑮𝑯𝑰𝑱𝑲𝑳𝑴𝑵𝑶𝑷𝑸𝑹𝑺𝑻𝑼𝑽𝑾𝑿𝒀𝒁'
          const styledChars = Array.from(styled)
          return upper
            .split('')
            .map((char) => {
              const index = plain.indexOf(char)
              return index >= 0 ? (styledChars[index] || char) : char
            })
            .join('')
        }
        const pickTitle = (text: string) => {
          const normalized = normalize(text)
          if (!normalized) return ''
          const titleLine = normalized.match(/(?:^|\n)\s*title\s*[:\-]\s*([^\n]+)/i)
          if (titleLine?.[1]) return cleanTitleEnd(titleLine[1])
          const headingLine = normalized.match(/(?:^|\n)\s*#{1,6}\s*([^\n]+)/)
          if (headingLine?.[1]) return cleanTitleEnd(headingLine[1])
          const paragraphs = splitParagraphs(normalized)
          return cleanTitleEnd((paragraphs[0] || '').split('\n')[0] || '')
        }
        const pickFull = (text: string) => {
          const normalized = normalize(text)
          if (!normalized) return ''
          const blockContent = getLargestCodeBlock(normalized)
          const base = blockContent || normalized
          const paragraphs = splitParagraphs(base)
          if (paragraphs.length <= 1) return base
          const firstWords = (paragraphs[0].match(/\S+/g) || []).length
          if (firstWords <= 26) return paragraphs.slice(1).join('\n\n').trim()
          return base
        }
        const pickShort = (text: string) => {
          const full = pickFull(text)
          const MIN_LEN = 1000
          const MAX_SCAN = 3600
          if (!full) return ''
          const searchSpace = full.slice(0, MAX_SCAN)
          const questionWindow = searchSpace.slice(MIN_LEN)
          const lastQuestionAfterMin = questionWindow.lastIndexOf('?')
          if (lastQuestionAfterMin >= 0) {
            return searchSpace.slice(0, MIN_LEN + lastQuestionAfterMin + 1).trim()
          }

          const qIndex = searchSpace.indexOf('?')
          if (qIndex >= 0) {
            const untilQ = full.slice(0, qIndex + 1).trim()
            if (untilQ.length >= MIN_LEN) return untilQ
            const rest = full.slice(qIndex + 1)
            const nextBreak = [rest.indexOf('\n'), rest.search(/[.!?]/)]
              .filter((idx) => idx >= 0)
              .sort((a, b) => a - b)[0]
            if (nextBreak >= 0) return full.slice(0, qIndex + 1 + nextBreak + 1).trim()
            return untilQ
          }
          const lastLine = searchSpace.lastIndexOf('\n')
          if (lastLine >= MIN_LEN) return searchSpace.slice(0, lastLine).trim()
          const lastSentence = Math.max(searchSpace.lastIndexOf('.'), searchSpace.lastIndexOf('!'))
          if (lastSentence >= MIN_LEN) return searchSpace.slice(0, lastSentence + 1).trim()
          return searchSpace.trim()
        }

        const turns = Array.from(document.querySelectorAll<HTMLElement>('[data-message-author-role]')).filter(
          (el) => (el.innerText || '').trim().length > 0,
        )
        if (!turns.length) return null

        const step4Hint =
          /tiến trình\s*4|step\s*4|title|tiêu đề|nội dung ngắn|nội dung dài|full[-\s]*length|twist ending|happy ending|story/i

        let latestUserIndex = -1
        for (let i = turns.length - 1; i >= 0; i -= 1) {
          const role = (turns[i].getAttribute('data-message-author-role') || '').toLowerCase()
          if (role === 'user') {
            latestUserIndex = i
            break
          }
        }
        if (latestUserIndex < 0) return null

        const latestUserText = normalize(turns[latestUserIndex].innerText || '')
        if (!step4Hint.test(latestUserText)) return null

        let raw = ''
        let matchedAssistantNode: HTMLElement | null = null
        for (let i = latestUserIndex + 1; i < turns.length; i += 1) {
          const role = (turns[i].getAttribute('data-message-author-role') || '').toLowerCase()
          if (role === 'assistant') {
            raw = normalize(turns[i].innerText || '')
            if (raw) {
              matchedAssistantNode = turns[i]
              break
            }
          }
        }
        if (!raw) return null
        matchedAssistantNode?.scrollIntoView({ block: 'start', behavior: 'instant' })
        const plainTitle = pickTitle(raw)
        return { title: stylizeTitle(plainTitle), shortContent: pickShort(raw), fullContent: pickFull(raw) }
      }) as (...args: unknown[]) => unknown,
    })

    const extracted = (result?.[0]?.result as CollectedData | null) || null
    if (!extracted?.title && !extracted?.shortContent && !extracted?.fullContent) {
      setStatus('Không tìm thấy output phù hợp từ Tiến trình 4 trong ChatGPT.')
      return null
    }

    setData({
      title: extracted.title || '',
      shortContent: extracted.shortContent || '',
      fullContent: extracted.fullContent || '',
    })
    setStatus('Đã gom dữ liệu xong. Bạn có thể đẩy lên GG Sheet.')
    return extracted
  }

  const openPushPreview = async (values: CollectedData) => {
    setIsSaving(true)
    setStatus('Đang kiểm tra dòng đẩy dữ liệu trên GG Sheet...')
    try {
      const preview = await previewPushGgSheet(values)
      setPreviewData(preview)
      setShowPreviewModal(true)
      setStatus(`Sẵn sàng đẩy dữ liệu lên dòng ${preview.targetRow}. Xác nhận để tiếp tục.`)
    } catch (error: any) {
      setStatus(mapGgSheetErrorMessage(error, 'Không thể kiểm tra trước khi đẩy GG Sheet.'))
    } finally {
      setIsSaving(false)
    }
  }

  const confirmPushToSheet = async () => {
    if (!previewData) return
    setIsSaving(true)
    setStatus('Đang đẩy dữ liệu lên GG Sheet...')
    try {
      const result = await pushGgSheet(previewData.data)
      setShowPreviewModal(false)
      setPreviewData(null)
      setStatus(`Đã ghi dữ liệu vào GG Sheet tại dòng ${result.targetRow} (B, C, G).`)
    } catch (error: any) {
      setStatus(mapGgSheetErrorMessage(error, 'Đẩy dữ liệu lên GG Sheet thất bại.'))
    } finally {
      setIsSaving(false)
    }
  }

  const pushToSheet = async () => {
    if (!sheetId) {
      setStatus('Chưa cấu hình đường dẫn GG Sheet. Hãy vào cài đặt và lưu ggSheetPath trước.')
      return
    }
    if (!data.title && !data.shortContent && !data.fullContent) {
      setStatus('Chưa có dữ liệu. Hãy bấm nút gom dữ liệu trước.')
      return
    }

    await openPushPreview(data)
  }

  const extractFromSheetRow = async () => {
    const row = Number(extractRowInput.trim())
    if (!Number.isFinite(row) || row <= 0) {
      setStatus('Hàng trích xuất không hợp lệ. Vui lòng nhập số dương.')
      return
    }
    setIsExtracting(true)
    setStatus(`Đang trích xuất dữ liệu từ hàng ${row}...`)
    try {
      const extracted = await extractGgSheetRow(row)
      setData({
        title: extracted?.data?.title || '',
        shortContent: extracted?.data?.shortContent || '',
        fullContent: extracted?.data?.fullContent || '',
      })
      setStatus(`Đã trích xuất dữ liệu từ hàng ${row}.`)
    } catch (error: any) {
      const raw = String(error?.response?.data?.message || '').toLowerCase()
      if (raw.includes('row must be a positive number')) {
        setStatus('Hàng trích xuất không hợp lệ. Vui lòng nhập số dương.')
        return
      }
      if (raw.includes('no target columns configured for extract')) {
        setStatus('Bạn chưa cấu hình cột để trích xuất. Hãy nhập ít nhất 1 cột trong cài đặt.')
        return
      }
      setStatus(mapGgSheetErrorMessage(error, 'Không thể trích xuất dữ liệu từ GG Sheet.'))
    } finally {
      setIsExtracting(false)
    }
  }

  const copyExtractedContentForFacebookReel = async () => {
    const title = (data.title || '').trim()
    const shortContent = (data.shortContent || '').trim()
    const cta = 'SAY YES IF YOU WANT TO READ THE FULL STORY 👇👇👇'
    if (!title && !shortContent) {
      setStatus('Chưa có nội dung để sao chép cho Facebook Reel.')
      return
    }
    const value = [title, shortContent, cta].filter(Boolean).join('\n\n')
    try {
      await navigator.clipboard.writeText(value)
      setStatus('Đã sao chép nội dung cho Facebook Reel.')
    } catch {
      setStatus('Không thể sao chép nội dung cho Facebook Reel.')
    }
  }

  useEffect(() => {
    const onCollectFromChatgpt = () => {
      void collectFromChatgpt()
    }
    window.addEventListener('run-ggsheet-collect-from-chatgpt', onCollectFromChatgpt as EventListener)
    return () => window.removeEventListener('run-ggsheet-collect-from-chatgpt', onCollectFromChatgpt as EventListener)
  }, [])

  return (
    <section className="glass-panel relative flex h-full min-h-0 flex-col gap-2 rounded-3xl p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white">GG Sheet</h2>
        <button
          type="button"
          onClick={() => setShowSettings((prev) => !prev)}
          className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg bg-blue-500/20 text-blue-100 transition hover:bg-blue-500/30"
          title="Cài đặt đường dẫn GG Sheet"
          aria-label="Cài đặt đường dẫn GG Sheet"
        >
          <FiSettings className="h-3.5 w-3.5" />
        </button>
      </div>
      {showSettings ? (
        <div className="mt-2 rounded-xl border border-blue-300/30 bg-blue-500/10 p-2">
          <p className="text-[10px] text-slate-300">Đường dẫn GG Sheet</p>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="text"
              value={sheetPathInput}
              onChange={(event) => setSheetPathInput(event.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/..."
              className="w-full rounded-lg bg-slate-900/80 px-2 py-1.5 text-[11px] text-slate-100 outline-none placeholder:text-slate-500"
            />
            <button
              type="button"
              onClick={() => void saveSheetPath()}
              className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-100 transition hover:bg-emerald-500/30"
              title="Lưu cấu hình"
              aria-label="Lưu cấu hình"
            >
              <FiSave className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <div>
              <p className="text-[10px] text-slate-300">Cột tiêu đề</p>
              <input
                type="text"
                value={titleColumnInput}
                onChange={(event) => setTitleColumnInput(event.target.value)}
                placeholder="B"
                className="mt-1 w-full rounded-lg bg-slate-900/80 px-2 py-1.5 text-[11px] uppercase text-slate-100 outline-none placeholder:text-slate-500"
              />
            </div>
            <div>
              <p className="text-[10px] text-slate-300">Cột nội dung ngắn</p>
              <input
                type="text"
                value={shortColumnInput}
                onChange={(event) => setShortColumnInput(event.target.value)}
                placeholder="C"
                className="mt-1 w-full rounded-lg bg-slate-900/80 px-2 py-1.5 text-[11px] uppercase text-slate-100 outline-none placeholder:text-slate-500"
              />
            </div>
            <div>
              <p className="text-[10px] text-slate-300">Cột nội dung dài</p>
              <input
                type="text"
                value={fullColumnInput}
                onChange={(event) => setFullColumnInput(event.target.value)}
                placeholder="G"
                className="mt-1 w-full rounded-lg bg-slate-900/80 px-2 py-1.5 text-[11px] uppercase text-slate-100 outline-none placeholder:text-slate-500"
              />
            </div>
          </div>
          <p className="mt-1 text-[10px] text-slate-400">Để trống cột nào thì hệ thống sẽ không ghi vào cột đó.</p>
        </div>
      ) : null}
      <div className="rounded-xl border border-white/10 bg-white/5 p-2">
        <p
          className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] ${
            statusTone === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
              : statusTone === 'error'
                ? 'border-rose-500/30 bg-rose-500/10 text-rose-100'
                : statusTone === 'loading'
                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-100'
                  : 'border-white/10 bg-black/25 text-slate-300'
          }`}
        >
          {statusTone === 'success' ? (
            <FiCheck className="h-3.5 w-3.5" />
          ) : statusTone === 'error' ? (
            <FiAlertTriangle className="h-3.5 w-3.5" />
          ) : statusTone === 'loading' ? (
            <FiSend className="h-3.5 w-3.5 animate-pulse" />
          ) : (
            <FiInfo className="h-3.5 w-3.5" />
          )}
          {status}
        </p>
      </div>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-1.5 backdrop-blur">
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => setActiveTab('collect')}
            className={`cursor-pointer rounded-xl px-2 py-2 text-xs font-semibold transition ${
              activeTab === 'collect' ? 'primary-blue-btn' : 'bg-transparent text-slate-400 hover:bg-white/10'
            }`}
          >
            Gom
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('extract')}
            className={`cursor-pointer rounded-xl px-2 py-2 text-xs font-semibold transition ${
              activeTab === 'extract' ? 'primary-blue-btn' : 'bg-transparent text-slate-400 hover:bg-white/10'
            }`}
          >
            Trích xuất
          </button>
        </div>
      </section>

      {activeTab === 'collect' ? (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={!isSheetConfigured || isSaving}
            onClick={() => void collectFromChatgpt()}
            className="inline-flex cursor-pointer items-center justify-center gap-1 rounded-lg bg-blue-500/20 px-2 py-1.5 text-xs text-blue-100 transition hover:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <FiDownload className="h-3.5 w-3.5" />
            Gom dữ liệu
          </button>
          <button
            type="button"
            disabled={!isSheetConfigured || isSaving}
            onClick={() => void pushToSheet()}
            className="inline-flex cursor-pointer items-center justify-center gap-1 rounded-lg bg-emerald-500/20 px-2 py-1.5 text-xs text-emerald-100 transition hover:bg-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <FiSave className="h-3.5 w-3.5" />
            Đẩy sheet
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-white/10 bg-white/5 p-2">
          <p className="text-[10px] text-slate-400">Nhập số hàng cần trích xuất</p>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="number"
              min={1}
              value={extractRowInput}
              onChange={(event) => setExtractRowInput(event.target.value)}
              placeholder="Ví dụ: 12"
              className="w-full rounded-lg bg-slate-900/80 px-2 py-1.5 text-[11px] text-slate-100 outline-none placeholder:text-slate-500"
            />
            <button
              type="button"
              disabled={!isSheetConfigured || isExtracting}
              onClick={() => void extractFromSheetRow()}
              className="inline-flex h-7 cursor-pointer items-center justify-center gap-1 rounded-lg bg-violet-500/20 px-2 text-[11px] text-violet-100 transition hover:bg-violet-500/30 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <FiDownload className="h-3.5 w-3.5" />
              Lấy
            </button>
          </div>
          <button
            type="button"
            onClick={() => void copyExtractedContentForFacebookReel()}
            className="mt-2 inline-flex h-7 cursor-pointer items-center justify-center gap-1 rounded-lg bg-blue-500/20 px-2 text-[11px] text-blue-100 transition hover:bg-blue-500/30"
          >
            <FiCopy className="h-3.5 w-3.5" />
            Sao chép nội dung cho Facebook Reel
          </button>
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 overflow-auto rounded-xl border border-white/10 bg-white/5 p-2.5">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Tiêu đề</p>
          <p className="mt-1 whitespace-pre-wrap rounded-lg border border-white/10 bg-black/20 p-2 text-[11px] text-slate-100">
            {data.title || '...'}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Nội dung ngắn</p>
          <p className="mt-1 whitespace-pre-wrap rounded-lg border border-white/10 bg-black/20 p-2 text-[11px] text-slate-100">
            {data.shortContent || '...'}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Nội dung dài (link bài báo)</p>
          <p className="mt-1 whitespace-pre-wrap rounded-lg border border-white/10 bg-black/20 p-2 text-[11px] text-slate-100">
            {data.fullContent || '...'}
          </p>
        </div>
      </div>
      {showPreviewModal && previewData ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 p-3">
          <div className="w-full max-w-md rounded-2xl border border-blue-300/40 bg-slate-950/95 p-3">
            <p className="text-sm font-semibold text-white">Xác nhận đẩy GG Sheet</p>
            <p className="mt-2 text-[11px] text-slate-300">
              Dữ liệu sẽ được ghi vào dòng <span className="font-semibold text-emerald-200">{previewData.targetRow}</span> ({previewData.targetRange})
            </p>
            <p className="mt-1 text-[10px] text-slate-400">
              Cột ghi: Tiêu đề {previewData.columns.title || 'bỏ qua'} | Ngắn {previewData.columns.shortContent || 'bỏ qua'} | Dài {previewData.columns.full || 'bỏ qua'}
            </p>
            <div className="mt-2 space-y-1 rounded-xl border border-white/10 bg-black/25 p-2 text-[11px] text-slate-200">
              <p><span className="text-slate-400">Tiêu đề:</span> {previewData.data.title || '...'}</p>
              <p className="whitespace-pre-wrap">
                <span className="text-slate-400">Nội dung ngắn:</span>{' '}
                {previewData.data.shortContent ? formatPreviewLines(previewData.data.shortContent, 5) : '...'}
              </p>
              <p className="whitespace-pre-wrap">
                <span className="text-slate-400">Nội dung dài:</span>{' '}
                {previewData.data.fullContent ? formatPreviewLines(previewData.data.fullContent, 8) : '...'}
              </p>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowPreviewModal(false)
                  setPreviewData(null)
                }}
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 text-slate-200 transition hover:bg-white/20"
                title="Hủy"
                aria-label="Hủy"
              >
                <FiX className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => void confirmPushToSheet()}
                disabled={isSaving}
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/25 text-emerald-100 transition hover:bg-emerald-500/35 disabled:opacity-50"
                title="Xác nhận đẩy"
                aria-label="Xác nhận đẩy"
              >
                <FiCheck className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

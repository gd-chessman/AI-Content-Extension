import { useEffect, useState, type ReactNode } from 'react'
import {
  FiAlertTriangle,
  FiCheck,
  FiCopy,
  FiDownload,
  FiGlobe,
  FiInfo,
  FiRotateCcw,
  FiSave,
  FiSend,
  FiSettings,
  FiX,
} from 'react-icons/fi'
import translate from 'translate'
import {
  extractGgSheetRow,
  getMyGgSheetSetting,
  previewPushGgSheet,
  pushGgSheet,
  updateMyGgSheetSetting,
  type GgSheetPushPreview,
} from '@/services/GgSheetService'
import { chatgptExtractContent } from '@/utils/chatgptExtractContent'
import { CHATGPT_EXTRACT_CONTENT_PROMPT_HINT_KEY } from '@/utils/chatgptWorkflowSteps'
import {
  chatgptScrollHighlightStep4ContentPageScript,
  chatgptWarmThreadScrollContainersPageScript,
} from '@/utils/chatgptContentProcessing'
import { normalizeStyledTextToPlain, stylizeTitleForDisplay } from '@/utils/textSearchNormalize'
import {
  appendShortCutInjectArgs,
  countTextLinesLikeShortContentCut,
  formatShortContentLineCountLabel,
  getShortContentCutConfigFromStorage,
  normalizeShortContentCutConfig,
  splitTextLinesLikeShortContentCut,
  type ShortContentCutConfig,
} from '@/utils/shortContentCutConfig'

type BrowserTab = { id?: number; url?: string; active?: boolean }
type ExtensionChrome = {
  storage?: {
    local?: {
      get?: (keys: string | string[], callback: (items: Record<string, unknown>) => void) => void
      set?: (items: Record<string, unknown>, callback?: () => void) => void
    }
  }
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

/** Rút gọn preview modal: đầu + ... + cuối khi quá nhiều dòng (cùng quy tắc đếm dòng ChatGPT). */
const formatPreviewLines = (value: string, maxLines: number) => {
  const lines = splitTextLinesLikeShortContentCut(value)

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

type DataField = keyof CollectedData
type GgSheetTab = 'collect' | 'extract'

const EMPTY_COLLECTED_DATA: CollectedData = { title: '', shortContent: '', fullContent: '' }
const EMPTY_TRANSLATED_FIELDS: Record<DataField, boolean> = {
  title: false,
  shortContent: false,
  fullContent: false,
}

const translateInChunks = async (source: string) => {
  const value = (source || '').trim()
  if (!value) return ''

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

function GgsheetContentScrollBox({
  maxHeightClass,
  children,
  roomyEnd = false,
}: {
  maxHeightClass: string
  children: ReactNode
  roomyEnd?: boolean
}) {
  return (
    <div className={`mt-1 flex ${maxHeightClass} flex-col overflow-hidden rounded-lg border border-white/10 bg-black/20`}>
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 pt-2 text-[11px] leading-normal text-slate-100">
        <div className={`whitespace-pre-wrap ${roomyEnd ? 'pb-10' : 'pb-6'}`}>{children}</div>
        <span className={`block shrink-0 ${roomyEnd ? 'h-6' : 'h-4'}`} aria-hidden />
      </div>
    </div>
  )
}

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
  const [collectData, setCollectData] = useState<CollectedData>(EMPTY_COLLECTED_DATA)
  const [extractData, setExtractData] = useState<CollectedData>(EMPTY_COLLECTED_DATA)
  const [collectOriginalData, setCollectOriginalData] = useState<CollectedData>(EMPTY_COLLECTED_DATA)
  const [extractOriginalData, setExtractOriginalData] = useState<CollectedData>(EMPTY_COLLECTED_DATA)
  const [collectTranslatedFields, setCollectTranslatedFields] = useState<Record<DataField, boolean>>(EMPTY_TRANSLATED_FIELDS)
  const [extractTranslatedFields, setExtractTranslatedFields] = useState<Record<DataField, boolean>>(EMPTY_TRANSLATED_FIELDS)
  const [collectTranslatingField, setCollectTranslatingField] = useState<DataField | null>(null)
  const [extractTranslatingField, setExtractTranslatingField] = useState<DataField | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [previewData, setPreviewData] = useState<GgSheetPushPreview | null>(null)
  const [showPreviewModal, setShowPreviewModal] = useState(false)
  const [extractRowInput, setExtractRowInput] = useState('')
  const [isExtracting, setIsExtracting] = useState(false)
  const [copiedReelContent, setCopiedReelContent] = useState(false)
  const [shortContentCutConfig, setShortContentCutConfig] = useState<ShortContentCutConfig>(() =>
    normalizeShortContentCutConfig({}),
  )
  const sheetId = extractSheetId(sheetUrl)
  const isSheetConfigured = Boolean(sheetId)
  const data = activeTab === 'collect' ? collectData : extractData
  const translatedFields = activeTab === 'collect' ? collectTranslatedFields : extractTranslatedFields
  const translatingField = activeTab === 'collect' ? collectTranslatingField : extractTranslatingField

  const shortContentLineCountLabel = data.shortContent.trim()
    ? formatShortContentLineCountLabel(
        countTextLinesLikeShortContentCut(data.shortContent),
        shortContentCutConfig,
      )
    : ''

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const extensionChrome = getChrome()
        const cutConfig = await getShortContentCutConfigFromStorage(extensionChrome?.storage?.local)
        setShortContentCutConfig(cutConfig)

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

  const resetTranslationState = (tab: GgSheetTab) => {
    if (tab === 'collect') {
      setCollectOriginalData(EMPTY_COLLECTED_DATA)
      setCollectTranslatedFields(EMPTY_TRANSLATED_FIELDS)
      setCollectTranslatingField(null)
      return
    }
    setExtractOriginalData(EMPTY_COLLECTED_DATA)
    setExtractTranslatedFields(EMPTY_TRANSLATED_FIELDS)
    setExtractTranslatingField(null)
  }

  const applyTabData = (tab: GgSheetTab, next: CollectedData) => {
    resetTranslationState(tab)
    if (tab === 'collect') {
      setCollectData(next)
      return
    }
    setExtractData(next)
  }

  const translateDataField = async (field: DataField) => {
    const tab = activeTab
    const tabData = tab === 'collect' ? collectData : extractData
    const tabOriginalData = tab === 'collect' ? collectOriginalData : extractOriginalData
    const tabTranslatedFields = tab === 'collect' ? collectTranslatedFields : extractTranslatedFields
    const tabTranslatingField = tab === 'collect' ? collectTranslatingField : extractTranslatingField
    const setTabData = tab === 'collect' ? setCollectData : setExtractData
    const setTabOriginalData = tab === 'collect' ? setCollectOriginalData : setExtractOriginalData
    const setTabTranslatedFields = tab === 'collect' ? setCollectTranslatedFields : setExtractTranslatedFields
    const setTabTranslatingField = tab === 'collect' ? setCollectTranslatingField : setExtractTranslatingField

    if (tabTranslatedFields[field]) {
      setTabData((prev) => ({ ...prev, [field]: tabOriginalData[field] }))
      setTabTranslatedFields((prev) => ({ ...prev, [field]: false }))
      setStatus('Đã khôi phục nội dung gốc.')
      return
    }

    const source = (tabData[field] || '').trim()
    if (!source || tabTranslatingField) return

    if (!(tabOriginalData[field] || '').trim()) {
      setTabOriginalData((prev) => ({ ...prev, [field]: source }))
    }

    const fieldLabel =
      field === 'title' ? 'tiêu đề' : field === 'shortContent' ? 'nội dung ngắn' : 'nội dung dài'

    setTabTranslatingField(field)
    setStatus(`Đang dịch ${fieldLabel}...`)
    try {
      const plainSource = normalizeStyledTextToPlain(source).trim()
      if (!plainSource) {
        setStatus(`Không có chữ để dịch ${fieldLabel}.`)
        return
      }
      const translated = await translateInChunks(plainSource)
      if (!translated) {
        setStatus(`Không nhận được bản dịch ${fieldLabel}.`)
        return
      }
      const nextValue = field === 'title' ? stylizeTitleForDisplay(translated) : translated
      setTabData((prev) => ({ ...prev, [field]: nextValue }))
      setTabTranslatedFields((prev) => ({ ...prev, [field]: true }))
      setStatus(`Đã dịch ${fieldLabel} sang tiếng Việt.`)
    } catch {
      setStatus(`Dịch ${fieldLabel} thất bại. Hãy thử lại.`)
    } finally {
      setTabTranslatingField(null)
    }
  }

  const renderTranslateButton = (field: DataField, ariaBase: string) => {
    const isTranslated = translatedFields[field]
    const isTranslating = translatingField === field
    const disabled = !(data[field] || '').trim() || (translatingField !== null && !isTranslating)

    return (
      <button
        type="button"
        onClick={() => void translateDataField(field)}
        disabled={disabled}
        title={
          isTranslating
            ? 'Đang dịch...'
            : isTranslated
              ? `Quay về ${ariaBase} gốc`
              : `Dịch ${ariaBase}`
        }
        aria-label={isTranslated ? `Quay về ${ariaBase} gốc` : `Dịch ${ariaBase}`}
        className="relative inline-flex cursor-pointer items-center rounded-md bg-violet-500/20 px-2 py-1 text-[10px] font-semibold text-violet-100 transition hover:bg-violet-500/30 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {isTranslating ? (
          <span className="animate-pulse">…</span>
        ) : isTranslated ? (
          <FiRotateCcw className="h-3.5 w-3.5" />
        ) : (
          <FiGlobe className="h-3.5 w-3.5" />
        )}
        {isTranslated ? (
          <span className="absolute -right-1 -top-1 rounded-full bg-violet-500 px-1 text-[7px] leading-none text-white">
            VI
          </span>
        ) : null}
      </button>
    )
  }

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
    setActiveTab('collect')
    const extensionChrome = getChrome()
    if (!extensionChrome?.scripting?.executeScript || !extensionChrome?.tabs?.query) {
      setStatus('Môi trường hiện tại không hỗ trợ gom dữ liệu từ ChatGPT.')
      return null
    }

    const promptHint = (localStorage.getItem(CHATGPT_EXTRACT_CONTENT_PROMPT_HINT_KEY) || '').trim()
    if (promptHint.length < 30) {
      setStatus('Chưa có prompt bước trích nội dung. Hãy mở ChatGPT, chọn workflow và tải bước trước khi gom.')
      return null
    }

    setStatus('Đang gom dữ liệu từ output bước trích nội dung trong ChatGPT...')
    const cutConfig = await getShortContentCutConfigFromStorage(extensionChrome?.storage?.local)
    setShortContentCutConfig(cutConfig)
    const target = await getOrOpenTab(CHATGPT_PATTERNS, CHATGPT_URL)
    if (!target?.id) {
      setStatus('Không mở được tab ChatGPT để gom dữ liệu.')
      return null
    }

    await extensionChrome.scripting.executeScript({
      target: { tabId: target.id },
      func: chatgptWarmThreadScrollContainersPageScript as (...args: unknown[]) => unknown,
    })
    await sleep(140)

    await extensionChrome.scripting.executeScript({
      target: { tabId: target.id },
      func: chatgptScrollHighlightStep4ContentPageScript as (...args: unknown[]) => unknown,
      args: appendShortCutInjectArgs(['collect', promptHint], cutConfig),
    })
    await sleep(500)

    const result = await extensionChrome.scripting.executeScript({
      target: { tabId: target.id },
      func: chatgptExtractContent as (...args: unknown[]) => unknown,
      args: appendShortCutInjectArgs(['collect', promptHint], cutConfig),
    })

    const extracted = (result?.[0]?.result as CollectedData | null) || null
    if (!extracted?.title && !extracted?.shortContent && !extracted?.fullContent) {
      setStatus('Không tìm thấy output phù hợp từ bước trích nội dung trên ChatGPT.')
      return null
    }

    applyTabData('collect', {
      title: extracted.title || '',
      shortContent: extracted.shortContent || '',
      fullContent: extracted.fullContent || '',
    })
    setStatus('Đã gom dữ liệu xong. Bạn có thể đẩy lên GG Sheet.')
    return extracted
  }

  /** Bật tab trình duyệt trỏ tới Google Sheet đã cấu hình (hoặc mở tab mới nếu chưa có). */
  const focusBrowserTabOnConfiguredSheet = () => {
    const raw = (sheetUrl || '').trim()
    if (!raw) return
    const extensionChrome = (globalThis as { chrome?: ExtensionChrome }).chrome
    if (!extensionChrome?.tabs?.query || !extensionChrome.tabs.update || !extensionChrome.tabs.create) return

    let urlToOpen = raw
    try {
      if (!/^https?:\/\//i.test(raw)) {
        urlToOpen = new URL(`https://${raw}`).href
      }
    } catch {
      return
    }

    const sid = extractSheetId(urlToOpen)
    const patterns: string[] = sid
      ? [`*://docs.google.com/spreadsheets/d/${sid}/*`]
      : (() => {
          try {
            return [`${new URL(urlToOpen).origin}/*`]
          } catch {
            return []
          }
        })()
    if (!patterns.length) return

    extensionChrome.tabs.query({ url: patterns, currentWindow: true }, (tabs) => {
      const list = tabs || []
      const existing = list.find((t) => t.active && t.id) || list.find((t) => t.id)
      if (existing?.id) {
        extensionChrome.tabs?.update?.(existing.id, { active: true })
        return
      }
      extensionChrome.tabs?.create?.({ url: urlToOpen, active: true })
    })
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
    if (!collectData.title && !collectData.shortContent && !collectData.fullContent) {
      setStatus('Chưa có dữ liệu. Hãy bấm nút gom dữ liệu trước.')
      return
    }

    focusBrowserTabOnConfiguredSheet()
    await openPushPreview(collectData)
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
      applyTabData('extract', {
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
    const title = (extractData.title || '').trim()
    const shortContent = (extractData.shortContent || '').trim()
    const cta = 'SAY YES IF YOU WANT TO READ THE FULL STORY 👇👇👇'
    if (!title && !shortContent) {
      setStatus('Chưa có nội dung để sao chép cho Facebook Reel.')
      return
    }
    const value = [title, shortContent, cta].filter(Boolean).join('\n\n')
    try {
      await navigator.clipboard.writeText(value)
      setCopiedReelContent(true)
      window.setTimeout(() => setCopiedReelContent(false), 1200)
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
            className={`mt-2 inline-flex h-7 cursor-pointer items-center justify-center gap-1 rounded-lg px-2 text-[11px] transition ${
              copiedReelContent
                ? 'bg-emerald-500/25 text-emerald-100'
                : 'bg-blue-500/20 text-blue-100 hover:bg-blue-500/30'
            }`}
          >
            {copiedReelContent ? <FiCheck className="h-3.5 w-3.5" /> : <FiCopy className="h-3.5 w-3.5" />}
            Sao chép nội dung cho Facebook Reel
          </button>
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[auto_auto_minmax(0,1fr)] gap-2 overflow-hidden rounded-xl border border-white/10 bg-white/5 p-2.5">
        <div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Tiêu đề</p>
            {renderTranslateButton('title', 'tiêu đề')}
          </div>
          <p className="mt-1 whitespace-pre-wrap rounded-lg border border-white/10 bg-black/20 p-2 text-[11px] text-slate-100">
            {data.title || '...'}
          </p>
        </div>
        <div className="min-h-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Nội dung ngắn
              {shortContentLineCountLabel ? (
                <span className="ml-1.5 font-normal normal-case text-slate-500">
                  ({shortContentLineCountLabel})
                </span>
              ) : null}
            </p>
            {renderTranslateButton('shortContent', 'nội dung ngắn')}
          </div>
          <GgsheetContentScrollBox maxHeightClass="max-h-36">{data.shortContent || '...'}</GgsheetContentScrollBox>
        </div>
        <div className="flex min-h-0 flex-col">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Nội dung dài (link bài báo)
              {data.fullContent.trim() ? (
                <span className="ml-1.5 font-normal normal-case text-slate-500">
                  ({countTextLinesLikeShortContentCut(data.fullContent)} dòng ChatGPT)
                </span>
              ) : null}
            </p>
            {renderTranslateButton('fullContent', 'nội dung dài')}
          </div>
          <GgsheetContentScrollBox maxHeightClass="min-h-0 max-h-52 flex-1" roomyEnd>
            {data.fullContent || '...'}
          </GgsheetContentScrollBox>
        </div>
      </div>
      {showPreviewModal && previewData ? (
        <div
          className="absolute inset-0 z-20 overflow-y-auto overscroll-contain bg-black/50 p-3"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ggsheet-push-preview-title"
        >
          <div className="flex min-h-full items-center justify-center py-2 sm:py-4">
            <div className="flex min-h-0 w-full max-w-md max-h-[min(88dvh,calc(100vh-1.5rem))] flex-col overflow-hidden rounded-2xl border border-blue-300/40 bg-slate-950/95 shadow-xl">
              <div className="shrink-0 border-b border-white/10 p-3 pb-2">
                <p id="ggsheet-push-preview-title" className="text-sm font-semibold text-white">
                  Xác nhận đẩy GG Sheet
                </p>
                <p className="mt-2 wrap-break-word text-[11px] text-slate-300">
                  Dữ liệu sẽ được ghi vào dòng{' '}
                  <span className="font-semibold text-emerald-200">{previewData.targetRow}</span> ({previewData.targetRange})
                </p>
                <p className="mt-1 wrap-break-word text-[10px] text-slate-400">
                  Cột ghi: Tiêu đề {previewData.columns.title || 'bỏ qua'} | Ngắn{' '}
                  {previewData.columns.shortContent || 'bỏ qua'} | Dài {previewData.columns.full || 'bỏ qua'}
                </p>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
                <div className="space-y-3 rounded-xl border border-white/10 bg-black/25 p-2 text-[11px]">
                  <div>
                    <p className="font-semibold text-blue-400">Tiêu đề</p>
                    <p className="mt-1 whitespace-pre-wrap wrap-break-word text-slate-200">
                      {previewData.data.title || '...'}
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold text-blue-400">Nội dung ngắn</p>
                    <p className="mt-1 max-h-36 overflow-y-auto whitespace-pre-wrap wrap-break-word text-slate-200">
                      {previewData.data.shortContent
                        ? formatPreviewLines(previewData.data.shortContent, 5)
                        : '...'}
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold text-blue-400">Nội dung dài</p>
                    <p className="mt-1 max-h-52 overflow-y-auto whitespace-pre-wrap wrap-break-word text-slate-200">
                      {previewData.data.fullContent
                        ? formatPreviewLines(previewData.data.fullContent, 8)
                        : '...'}
                    </p>
                  </div>
                </div>
              </div>
              <div className="shrink-0 border-t border-white/10 p-3 pt-2">
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowPreviewModal(false)
                      setPreviewData(null)
                    }}
                    className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg bg-white/10 text-slate-200 transition hover:bg-white/20"
                    title="Hủy"
                    aria-label="Hủy"
                  >
                    <FiX className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void confirmPushToSheet()}
                    disabled={isSaving}
                    className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg bg-emerald-500/25 text-emerald-100 transition hover:bg-emerald-500/35 disabled:cursor-not-allowed disabled:opacity-50"
                    title="Xác nhận đẩy"
                    aria-label="Xác nhận đẩy"
                  >
                    <FiCheck className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

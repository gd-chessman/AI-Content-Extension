import { useEffect, useState } from 'react'
import { FiAlertTriangle, FiCheck, FiDownload, FiInfo, FiSave, FiSend, FiSettings } from 'react-icons/fi'
import { getMyGgSheetSetting, updateMyGgSheetSetting } from '@/services/GgSheetService'

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

const CHATGPT_URL = 'https://chatgpt.com/'
const CHATGPT_PATTERNS = ['*://chatgpt.com/*', '*://chat.openai.com/*']
const extractSheetId = (url: string) => url.match(/\/spreadsheets\/d\/([^/]+)/)?.[1] || ''
const toTsvRow = (values: CollectedData) =>
  [values.title || '', values.shortContent || '', '', '', '', values.fullContent || '']
    .map((cell) => String(cell).replace(/\r/g, ' ').replace(/\t/g, ' ').trim())
    .join('\t')

export default function GgSheetScreen() {
  const [sheetUrl, setSheetUrl] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [sheetPathInput, setSheetPathInput] = useState('')
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
  const sheetId = extractSheetId(sheetUrl)
  const isSheetConfigured = Boolean(sheetId)
  const isValidSheetUrl = (url?: string) => Boolean(sheetId && url && url.includes(sheetId))

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await getMyGgSheetSetting()
        const configured = (settings?.ggSheetPath || '').trim()
        setSheetPathInput(configured)
        if (configured) setSheetUrl(configured)
      } catch {
        setSheetUrl('')
        setSheetPathInput('')
      }
    }
    void loadSettings()
  }, [])

  const saveSheetPath = async () => {
    try {
      const next = sheetPathInput.trim()
      await updateMyGgSheetSetting({ ggSheetPath: next })
      setSheetUrl(next)
      setShowSettings(false)
      setStatus('Đã lưu cấu hình đường dẫn GG Sheet.')
    } catch {
      setStatus('Không thể lưu cấu hình đường dẫn GG Sheet.')
    }
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

  const getOrOpenSheetTab = async () => {
    if (!sheetId) return null
    const allTabs = await queryTabs(undefined)
    let sheetTabs = allTabs.filter((tab) => isValidSheetUrl(tab.url))
    if (sheetTabs.length === 0) {
      // Fallback query explicitly scoped to Google domains.
      const googleTabs = await queryTabs(['*://docs.google.com/*'])
      sheetTabs = googleTabs.filter((tab) => isValidSheetUrl(tab.url))
      if (sheetTabs.length === 0) {
        // Relaxed fallback: any opened Google Sheets tab.
        sheetTabs = googleTabs.filter((tab) => (tab.url || '').includes('docs.google.com/spreadsheets'))
      }
    }
    let target: BrowserTab | null | undefined = sheetTabs.find((tab) => tab.active) || sheetTabs[0]

    if (!target?.id) {
      return null
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
          const MIN_LEN = 260
          const MAX_SCAN = 1200
          if (!full) return ''
          const searchSpace = full.slice(0, MAX_SCAN)
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

        const assistantNodes = Array.from(document.querySelectorAll<HTMLElement>('[data-message-author-role="assistant"], article'))
          .filter((el) => (el.innerText || '').trim().length > 0)
          .reverse()
        const candidateNode =
          assistantNodes.find((el) => {
            const text = (el.innerText || '').toLowerCase()
            return text.length > 1200 || /full-length english story|title|twist ending|happy ending/i.test(text)
          }) || assistantNodes[0]
        if (!candidateNode) return null
        candidateNode.scrollIntoView({ block: 'start', behavior: 'instant' })
        const raw = normalize(candidateNode.innerText || '')
        if (!raw) return null
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

  const getNextRow = async () => {
    if (!sheetId) return 2
    try {
      const query = encodeURIComponent('select B where B is not null')
      const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?gid=0&headers=1&tq=${query}`
      const response = await fetch(url)
      const text = await response.text()
      const jsonText = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)
      const payload = JSON.parse(jsonText) as { table?: { rows?: Array<{ c?: Array<{ v?: string | number | null }> }> } }
      const rows = payload?.table?.rows || []
      const nonEmpty = rows.filter((row) => {
        const value = row?.c?.[0]?.v
        return typeof value === 'string' ? value.trim().length > 0 : value !== null && value !== undefined
      }).length
      return Math.max(2, nonEmpty + 2)
    } catch {
      return 2
    }
  }

  const writeRowToSheet = async (row: number, values: CollectedData) => {
    const extensionChrome = getChrome()
    if (!extensionChrome?.scripting?.executeScript || !extensionChrome?.tabs?.query) {
      return { ok: false, failedColumns: ['B', 'C', 'G'] }
    }
    const target = await getOrOpenSheetTab()
    if (!target?.id) return { ok: false, failedColumns: ['B', 'C', 'G'] }

    // One-shot paste payload for B:G (B=title, C=short, D/E/F empty, G=full)
    const tsvRow = toTsvRow(values)

    try {
      await navigator.clipboard.writeText(tsvRow)
    } catch {
      return {
        ok: false,
        failedColumns: ['B', 'C', 'G'],
      }
    }

    const result = await extensionChrome.scripting.executeScript({
      target: { tabId: target.id },
      func: (async (targetRow: number) => {
        const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
        const focusTargetCell = async () => {
          const url = new URL(window.location.href)
          url.hash = `gid=0&range=B${targetRow}`
          if (url.hash !== window.location.hash) {
            window.location.hash = url.hash
          }
          await sleep(600)

          const selectedCell =
            (document.querySelector('[role="gridcell"][aria-selected="true"]') as HTMLElement | null) ||
            (document.querySelector('[role="gridcell"][tabindex="0"]') as HTMLElement | null)
          if (!selectedCell) return false
          selectedCell.click()
          selectedCell.focus()
          await sleep(120)
          return true
        }

        const pasteFromClipboard = async () => {
          const active = (document.activeElement as HTMLElement | null) || document.body
          active.focus()
          active.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', code: 'KeyV', ctrlKey: true, bubbles: true }))
          active.dispatchEvent(new KeyboardEvent('keyup', { key: 'v', code: 'KeyV', ctrlKey: true, bubbles: true }))
          active.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', code: 'KeyV', metaKey: true, bubbles: true }))
          active.dispatchEvent(new KeyboardEvent('keyup', { key: 'v', code: 'KeyV', metaKey: true, bubbles: true }))
          await sleep(240)
          return true
        }

        let ok = false
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const focused = await focusTargetCell()
          if (!focused) {
            await sleep(220)
            continue
          }
          ok = await pasteFromClipboard()
          if (ok) break
          await sleep(220)
        }

        return {
          ok,
          failedColumns: ok ? [] : ['B', 'C', 'G'],
        }
      }) as (...args: unknown[]) => unknown,
      args: [row],
    })

    const payload = (result?.[0]?.result as { ok?: boolean; failedColumns?: string[] } | undefined) || {}
    return {
      ok: Boolean(payload.ok),
      failedColumns: payload.failedColumns || [],
    }
  }

  const focusSheetRowForManualPaste = async (row: number, values: CollectedData) => {
    const extensionChrome = getChrome()
    if (!extensionChrome?.tabs?.query || !extensionChrome?.tabs?.update) return false
    const target = await getOrOpenSheetTab()
    if (!target?.id) return false

    try {
      await navigator.clipboard.writeText(toTsvRow(values))
    } catch {
      return false
    }

    const rawUrl = target.url || sheetUrl
    const base = rawUrl.split('#')[0] || rawUrl
    const focused = await updateTab(target.id, `${base}#gid=0&range=B${row}`)
    return Boolean(focused?.id)
  }

  const copyRowForManualPaste = async (values: CollectedData) => {
    const text = toTsvRow(values)
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      try {
        const textarea = document.createElement('textarea')
        textarea.value = text
        textarea.setAttribute('readonly', 'true')
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        textarea.style.pointerEvents = 'none'
        textarea.style.left = '-9999px'
        document.body.appendChild(textarea)
        textarea.focus()
        textarea.select()
        const ok = document.execCommand('copy')
        document.body.removeChild(textarea)
        return ok
      } catch {
        return false
      }
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

    setIsSaving(true)
    setStatus('Đang tính dòng tiếp theo và ghi dữ liệu lên GG Sheet...')
    const nextRow = await getNextRow()
    const existingSheetTab = await getOrOpenSheetTab()
    if (!existingSheetTab?.id) {
      setIsSaving(false)
      setStatus('Không tìm thấy tab Google Sheets đang mở. Hãy mở sẵn 1 tab sheet rồi thử lại.')
      return
    }
    const writeResult = await writeRowToSheet(nextRow, data)
    setIsSaving(false)

    if (!writeResult.ok) {
      const failedInfo =
        writeResult.failedColumns.length > 0 ? ` Cột lỗi: ${writeResult.failedColumns.join(', ')}.` : ''
      const copied = await copyRowForManualPaste(data)
      const focused = await focusSheetRowForManualPaste(nextRow, data)
      setStatus(
        focused
          ? `Không ghi tự động được.${failedInfo} Đã copy dữ liệu và mở ô B${nextRow}. Bấm Cmd+V để dán.`
          : copied
            ? `Không ghi tự động được.${failedInfo} Đã copy dữ liệu vào clipboard. Vào sheet và dán tại ô B${nextRow}.`
            : `Không ghi được lên GG Sheet.${failedInfo} Đồng thời không copy được clipboard, hãy thử lại.`,
      )
      return
    }

    setStatus(`Đã ghi dữ liệu vào GG Sheet tại dòng ${nextRow} (cột B, C, G).`)
  }

  const collectAndPush = async () => {
    if (!sheetId) {
      setStatus('Chưa cấu hình đường dẫn GG Sheet. Hãy vào cài đặt và lưu ggSheetPath trước.')
      return
    }
    setIsSaving(true)
    const collected = await collectFromChatgpt()
    if (!collected) {
      setIsSaving(false)
      return
    }
    const nextRow = await getNextRow()
    const existingSheetTab = await getOrOpenSheetTab()
    if (!existingSheetTab?.id) {
      setIsSaving(false)
      setStatus('Đã gom dữ liệu nhưng chưa thấy tab Google Sheets đang mở. Hãy mở tab sheet rồi thử lại.')
      return
    }
    const writeResult = await writeRowToSheet(nextRow, collected)
    setIsSaving(false)
    if (writeResult.ok) {
      setStatus(`Đã gom và đẩy dữ liệu lên GG Sheet dòng ${nextRow} (B, C, G).`)
      return
    }

    const copied = await copyRowForManualPaste(collected)
    const focused = await focusSheetRowForManualPaste(nextRow, collected)
    setStatus(
      focused
        ? `Gom xong nhưng ghi tự động thất bại ở cột ${writeResult.failedColumns.join(', ')}. Đã copy sẵn dữ liệu và mở ô B${nextRow}, bấm Cmd+V để hoàn tất.`
        : copied
          ? `Gom xong nhưng ghi tự động thất bại ở cột ${writeResult.failedColumns.join(', ')}. Đã copy dữ liệu, hãy dán vào ô B${nextRow}.`
          : `Gom xong nhưng ghi lên GG Sheet thất bại${writeResult.failedColumns.length ? ` ở cột ${writeResult.failedColumns.join(', ')}` : ''}.`,
    )
  }

  useEffect(() => {
    const onCollectFromChatgpt = () => {
      void collectFromChatgpt()
    }
    window.addEventListener('run-ggsheet-collect-from-chatgpt', onCollectFromChatgpt as EventListener)
    return () => window.removeEventListener('run-ggsheet-collect-from-chatgpt', onCollectFromChatgpt as EventListener)
  }, [])

  return (
    <section className="glass-panel flex h-full min-h-0 flex-col gap-2 rounded-3xl p-3">
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
        <button
          type="button"
          disabled={!isSheetConfigured || isSaving}
          onClick={() => void collectAndPush()}
          className="col-span-2 inline-flex cursor-pointer items-center justify-center gap-1 rounded-lg bg-violet-500/20 px-2 py-1.5 text-xs text-violet-100 transition hover:bg-violet-500/30 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <FiSend className="h-3.5 w-3.5" />
          Gom + đẩy tự động
        </button>
      </div>

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
    </section>
  )
}

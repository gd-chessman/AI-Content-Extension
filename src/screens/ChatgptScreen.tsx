import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  FiAlignLeft,
  FiAlertTriangle,
  FiCheck,
  FiCopy,
  FiDownload,
  FiEdit3,
  FiFileText,
  FiFilm,
  FiImage,
  FiInfo,
  FiItalic,
  FiPlay,
  FiRefreshCw,
  FiScissors,
  FiSquare,
  FiType,
} from 'react-icons/fi'
import { IoFlash } from 'react-icons/io5'
import { RiAdminFill } from 'react-icons/ri'
import { SiGooglesheets, SiX } from 'react-icons/si'
import { useAuth } from '@/hooks/useAuth'
import {
  createWorkflowRunEventSource,
  createStepRun,
  createWorkflowRun,
  getUserWorkflowDetail,
  getUserWorkflows,
  type WorkflowRunStreamEvent,
  updateStepRun,
  updateWorkflowRun,
} from '@/services/WorkflowService'

type BrowserTab = { id?: number; url?: string; active?: boolean; windowId?: number }
type ExtensionChrome = {
  runtime?: {
    id?: string
    lastError?: { message?: string }
    sendMessage?: (
      message: unknown,
      responseCallback?: (response: { ok?: boolean; error?: string }) => void,
    ) => void
  }
  storage?: {
    local?: {
      get?: (keys: string | string[], callback: (items: Record<string, unknown>) => void) => void
      set?: (items: Record<string, unknown>, callback?: () => void) => void
    }
  }
  downloads?: {
    download?: (
      options: {
        url: string
        filename?: string
        conflictAction?: 'uniquify' | 'overwrite' | 'prompt'
        saveAs?: boolean
      },
      callback?: () => void,
    ) => void
  }
  tabs?: {
    query?: (
      queryInfo: { url?: string[]; currentWindow?: boolean; active?: boolean },
      callback: (tabs: BrowserTab[]) => void,
    ) => void
    create?: (createProperties: { url: string; active?: boolean }, callback?: (tab: BrowserTab) => void) => void
    update?: (tabId: number, updateProperties: { url?: string; active?: boolean }, callback?: (tab: BrowserTab) => void) => void
    captureVisibleTab?: (
      windowId?: number,
      options?: { format?: 'jpeg' | 'png'; quality?: number },
      callback?: (dataUrl: string) => void,
    ) => void
  }
  scripting?: {
    executeScript?: (injection: {
      target: { tabId: number }
      func: (...args: unknown[]) => unknown
      args?: unknown[]
    }) => Promise<Array<{ result?: unknown }>>
  }
}

const CHATGPT_URL = 'https://chatgpt.com/'
const CHATGPT_PATTERNS = ['*://chatgpt.com/*', '*://chat.openai.com/*']

const SAVED_SPLIT_IMAGE_HASHES_KEY = 'savedSplitImageCopyHashes'
const SAVED_SPLIT_IMAGE_HASHES_MAX = 150
const SPLIT_IMAGE_DOWNLOAD_FOLDER = 'chatgpt-images'
const FACEBOOK_REEL_MEMORY_KEY = 'facebookReelCopiedContent'

const hashDataUrl = (dataUrl: string) => {
  let h = 5381
  const stride = Math.max(1, Math.floor(dataUrl.length / 12000))
  for (let i = 0; i < dataUrl.length; i += stride) {
    h = ((h << 5) + h) ^ dataUrl.charCodeAt(i)
  }
  return `${(h >>> 0).toString(16)}_${dataUrl.length}`
}

type ProcessStep = {
  id: string
  label: string
  prompt: string
  workflowId: string
  workflowPlatform: string
  backendStepId: string
  stepNo: number
  actionType: string
  inputSchema: Record<string, unknown>
}

export default function ChatgptScreen() {
  const refreshRoleOnly = useAuth((s) => s.refreshRoleOnly)
  const role = useAuth((s) => s.role)
  const canUseWorkflow = role === 'user-vip' || role === 'admin'

  useEffect(() => {
    void refreshRoleOnly()
  }, [refreshRoleOnly])

  const [status, setStatus] = useState('Chọn một tiến trình để gửi prompt tự động vào ChatGPT.')
  const [selectedStepId, setSelectedStepId] = useState('')
  const [splitImages, setSplitImages] = useState<{ left: string; right: string } | null>(null)
  const [copiedPart, setCopiedPart] = useState<'left' | 'right' | null>(null)
  const [copiedTool, setCopiedTool] = useState<string | null>(null)
  const [isWorkflowRunning, setIsWorkflowRunning] = useState(false)
  const [isWorkflowStopping, setIsWorkflowStopping] = useState(false)
  const workflowStopRef = useRef(false)
  const lockedWorkflowTabIdRef = useRef<number>(0)
  const runningWorkflowRunIdRef = useRef('')
  const { data: processSteps = [], isLoading: isLoadingProcessSteps } = useQuery<ProcessStep[]>({
    queryKey: ['chatgpt-process-steps'],
    queryFn: async () => {
      const workflows = await getUserWorkflows({ platform: 'chatgpt' })
      const target = workflows[0] || null
      if (!target?._id) return []
      const detail = await getUserWorkflowDetail(target._id)
      return (detail.steps || [])
        .slice()
        .sort((a, b) => (a.stepNo || 0) - (b.stepNo || 0))
        .map((step) => ({
          id: `step-${step.stepNo}`,
          label: (step.title || '').trim() || `Tiến trình ${step.stepNo}`,
          prompt: (step.prompt || step.instruction || '').trim(),
          workflowId: target._id,
          workflowPlatform: (target.platform || 'multi').trim().toLowerCase(),
          backendStepId: (step._id || '').trim(),
          stepNo: Number(step.stepNo) || 0,
          actionType: (step.actionType || 'custom').trim(),
          inputSchema: (step.inputSchema || {}) as Record<string, unknown>,
        }))
        .filter((step) => step.prompt && step.backendStepId && step.workflowId)
    },
    staleTime: 60_000,
  })

  const getChrome = () => (globalThis as { chrome?: ExtensionChrome }).chrome

  useEffect(() => {
    if (!processSteps.length) {
      setSelectedStepId('')
      return
    }
    setSelectedStepId((prev) => (processSteps.some((step) => step.id === prev) ? prev : processSteps[0].id))
  }, [processSteps])

  const queryTabs = (pattern?: string[], currentWindow = false, active = false) =>
    new Promise<BrowserTab[]>((resolve) => {
      const extensionChrome = getChrome()
      const query = extensionChrome?.tabs?.query
      if (!query) {
        resolve([])
        return
      }
      query({ url: pattern, currentWindow, active }, (tabs) => resolve(tabs || []))
    })

  const createTab = (url: string) =>
    new Promise<BrowserTab | null>((resolve) => {
      const extensionChrome = getChrome()
      const create = extensionChrome?.tabs?.create
      if (!create) {
        resolve(null)
        return
      }
      create({ url, active: true }, (tab) => resolve(tab || null))
    })

  const updateTab = (tabId: number, url?: string) =>
    new Promise<BrowserTab | null>((resolve) => {
      const extensionChrome = getChrome()
      const update = extensionChrome?.tabs?.update
      if (!update) {
        resolve(null)
        return
      }
      update(
        tabId,
        url ? { url, active: true } : { active: true },
        (tab) => resolve(tab || null),
      )
    })

  const captureVisibleTab = (windowId?: number) =>
    new Promise<string | null>((resolve) => {
      const extensionChrome = getChrome()
      const capture = extensionChrome?.tabs?.captureVisibleTab
      if (!capture) {
        resolve(null)
        return
      }
      capture(windowId, { format: 'png' }, (dataUrl) => {
        const maybeError = extensionChrome?.runtime?.lastError?.message || ''
        if (maybeError) {
          resolve(null)
          return
        }
        if (!dataUrl || !String(dataUrl).startsWith('data:image/')) {
          resolve(null)
          return
        }
        resolve(dataUrl)
      })
    })

  const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms))

  const injectPrompt = async (tabId: number, prompt: string, autoSend: boolean) => {
    const extensionChrome = getChrome()
    if (!extensionChrome?.scripting?.executeScript) return false

    const result = await extensionChrome.scripting.executeScript({
      target: { tabId },
      func: (async (message: string, shouldSend: boolean) => {
        const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
        const needle = message.slice(0, 32).trim()

        const triggerInput = (el: HTMLElement) => {
          el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: message }))
          el.dispatchEvent(new Event('change', { bubbles: true }))
        }

        const isVisible = (el: Element | null): el is HTMLElement => {
          if (!(el instanceof HTMLElement)) return false
          const rect = el.getBoundingClientRect()
          const style = window.getComputedStyle(el)
          return rect.width > 50 && rect.height > 20 && style.visibility !== 'hidden' && style.display !== 'none'
        }

        const candidateSelectors = [
          '#prompt-textarea',
          'textarea[data-testid="prompt-textarea"]',
          'textarea[placeholder*="Message"]',
          'textarea[placeholder*="Send"]',
          'textarea',
          'div[data-testid="prompt-textarea"][contenteditable="true"]',
          'div#prompt-textarea[contenteditable="true"]',
          'div[role="textbox"][contenteditable="true"]',
          'div.ProseMirror[contenteditable="true"]',
          'div[contenteditable="true"]',
        ]

        const getBestInput = () => {
          const candidates = candidateSelectors.flatMap((selector) =>
            Array.from(document.querySelectorAll<HTMLElement>(selector)),
          )
          const visibles = candidates.filter((el) => isVisible(el))
          if (visibles.length === 0) return null

          // Prefer element near bottom center where ChatGPT composer usually is.
          const scored = visibles.map((el) => {
            const rect = el.getBoundingClientRect()
            const centerX = rect.left + rect.width / 2
            const centerY = rect.top + rect.height / 2
            const distanceX = Math.abs(centerX - window.innerWidth / 2)
            const distanceY = Math.abs(centerY - window.innerHeight * 0.86)
            const sizeScore = rect.width * rect.height
            const score = sizeScore - distanceX * 25 - distanceY * 35
            return { el, score }
          })
          scored.sort((a, b) => b.score - a.score)
          return scored[0].el
        }

        const sendMessage = async (target: HTMLElement) => {
          if (!shouldSend) return true

          for (let i = 0; i < 5; i += 1) {
            const sendButton =
              (document.querySelector('button[data-testid="send-button"]') as HTMLButtonElement | null) ||
              (document.querySelector('button[aria-label*="Send"]') as HTMLButtonElement | null) ||
              (document.querySelector('button[aria-label*="Gửi"]') as HTMLButtonElement | null)

            if (sendButton && !sendButton.disabled) {
              sendButton.click()
              return true
            }

            await sleep(120)
          }

          target.dispatchEvent(
            new KeyboardEvent('keydown', {
              key: 'Enter',
              code: 'Enter',
              bubbles: true,
            }),
          )
          target.dispatchEvent(
            new KeyboardEvent('keyup', {
              key: 'Enter',
              code: 'Enter',
              bubbles: true,
            }),
          )
          return true
        }

        const writeTextarea = async (textarea: HTMLTextAreaElement) => {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
          setter?.call(textarea, message)
          triggerInput(textarea)
          textarea.focus()
          if (!(textarea.value || '').includes(needle)) return false
          return await sendMessage(textarea)
        }

        const writeEditable = async (editable: HTMLElement) => {
          editable.click()
          editable.focus()
          const range = document.createRange()
          range.selectNodeContents(editable)
          const selection = window.getSelection()
          selection?.removeAllRanges()
          selection?.addRange(range)
          document.execCommand('selectAll', false)
          document.execCommand('insertText', false, message)

          if ((editable.innerText || '').trim().length === 0) {
            editable.textContent = message
          }
          triggerInput(editable)
          editable.focus()
          if (!(editable.innerText || editable.textContent || '').includes(needle)) return false
          return await sendMessage(editable)
        }

        for (let attempt = 0; attempt < 5; attempt += 1) {
          const input = getBestInput()
          if (input instanceof HTMLTextAreaElement) {
            if (await writeTextarea(input)) return true
          } else if (input) {
            if (await writeEditable(input)) return true
          }

          await sleep(180)
        }

        return false
      }) as (...args: unknown[]) => unknown,
      args: [prompt, autoSend],
    })

    return Boolean(result?.[0]?.result)
  }

  const pickChatgptTab = async (preferredTabId?: number) => {
    if (preferredTabId) {
      const tab = await updateTab(preferredTabId)
      if (tab?.id) {
        if (!tab.url?.includes('chatgpt.com')) {
          return await updateTab(tab.id, CHATGPT_URL)
        }
        return tab
      }
    }

    const currentActive = await queryTabs(undefined, true, true)
    const activeTab = currentActive[0]
    const isActiveChatgpt = Boolean(activeTab?.url && /chatgpt\.com|chat\.openai\.com/i.test(activeTab.url))

    const activeTabs = isActiveChatgpt ? [activeTab] : await queryTabs(CHATGPT_PATTERNS, true, true)
    const allTabs = activeTabs.length > 0 ? activeTabs : await queryTabs(CHATGPT_PATTERNS)
    let target: BrowserTab | null | undefined = allTabs[0]

    if (!target?.id) {
      target = await createTab(CHATGPT_URL)
    } else if (!target.url?.includes('chatgpt.com')) {
      target = await updateTab(target.id, CHATGPT_URL)
    } else {
      target = await updateTab(target.id)
    }

    return target || null
  }

  const runProcess = async (
    step: { label: string; prompt: string },
    options?: { autoSend?: boolean; fast?: boolean; preferredTabId?: number; forceNewChat?: boolean },
  ) => {
    const autoSend = Boolean(options?.autoSend)
    const fastMode = Boolean(options?.fast)
    const preferredTabId = options?.preferredTabId
    const forceNewChat = Boolean(options?.forceNewChat)
    const extensionChrome = getChrome()
    if (!extensionChrome?.tabs?.query || !extensionChrome.tabs.create || !extensionChrome.tabs.update || !extensionChrome.scripting?.executeScript) {
      setStatus('Môi trường hiện tại không hỗ trợ tự động gửi vào ChatGPT.')
      return false
    }

    setStatus(`${step.label}: Đang mở ChatGPT và chuẩn bị xử lý...`)
    const target = await pickChatgptTab(preferredTabId)

    if (!target?.id) {
      setStatus(`${step.label}: Không thể mở tab ChatGPT.`)
      return false
    }

    if (forceNewChat) {
      setStatus(`${step.label}: Đang tạo đoạn chat mới...`)
      const switched = await extensionChrome.scripting.executeScript({
        target: { tabId: target.id },
        func: (async () => {
          const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
          const isVisible = (el: Element | null): el is HTMLElement => {
            if (!(el instanceof HTMLElement)) return false
            const rect = el.getBoundingClientRect()
            const style = window.getComputedStyle(el)
            return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden'
          }

          const clickNewChatButton = () => {
            const candidates = Array.from(document.querySelectorAll<HTMLElement>('button, a, [role="button"]'))
              .filter((el) => isVisible(el))
              .sort((a, b) => {
                const ra = a.getBoundingClientRect()
                const rb = b.getBoundingClientRect()
                return ra.top - rb.top
              })
            const isMatch = (el: HTMLElement) => {
              const text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase()
              const aria = (el.getAttribute('aria-label') || '').toLowerCase()
              const title = (el.getAttribute('title') || '').toLowerCase()
              const href = (el.getAttribute('href') || '').toLowerCase()
              return (
                /new chat|chat mới|cuộc trò chuyện mới/.test(text) ||
                /new chat|chat mới|cuộc trò chuyện mới/.test(aria) ||
                /new chat|chat mới|cuộc trò chuyện mới/.test(title) ||
                href === '/' ||
                href.startsWith('/?')
              )
            }
            const target = candidates.find((el) => isMatch(el))
            if (!target) return false
            target.click()
            return true
          }

          if (!clickNewChatButton()) {
            // Fallback: try navigate to root and wait a bit
            window.location.href = 'https://chatgpt.com/'
            return false
          }
          await sleep(250)
          return true
        }) as (...args: unknown[]) => unknown,
      })
      const ok = Boolean(switched?.[0]?.result)
      if (!ok) {
        await sleep(800)
      } else {
        await sleep(320)
      }
    }

    setStatus(`${step.label}: Đã mở ChatGPT, đang điền prompt...`)

    let filled = false
    const attempts = fastMode ? 3 : 5
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (attempt > 0) {
        await sleep(fastMode ? 120 : 220)
      }
      filled = await injectPrompt(target.id, step.prompt, autoSend)
      if (filled) break
    }

    if (!filled && autoSend) {
      await sleep(280)
      filled = await injectPrompt(target.id, step.prompt, true)
    }

    setStatus(
      filled
        ? autoSend
          ? `${step.label}: Đã điền và gửi prompt trên ChatGPT.`
          : `${step.label}: Đã điền prompt vào ChatGPT (chưa gửi).`
        : `${step.label}: Không tìm thấy khung chat để xử lý.`,
    )
    return filled
  }

  const runFastProcess = async (step: ProcessStep) => {
    if (step.id === 'step-2') {
      setSplitImages(null)
      setCopiedPart(null)
    }

    if (step.id !== 'step-1') {
      return await runProcess(step, { autoSend: true, fast: true, preferredTabId: lockedWorkflowTabIdRef.current || undefined })
    }

    let mergedPrompt = step.prompt
    const fromStorage = localStorage.getItem(FACEBOOK_REEL_MEMORY_KEY)?.trim() || ''
    if (fromStorage) {
      mergedPrompt = `${step.prompt}\n\n${fromStorage}`
    }

    return await runProcess(
      { ...step, prompt: mergedPrompt },
      { autoSend: true, fast: true, preferredTabId: lockedWorkflowTabIdRef.current || undefined, forceNewChat: true },
    )
  }

  const runFillProcess = async (step: ProcessStep) => {
    if (step.id === 'step-2') {
      setSplitImages(null)
      setCopiedPart(null)
    }

    if (step.id !== 'step-1') {
      return await runProcess(step, { autoSend: false, fast: false })
    }

    let mergedPrompt = step.prompt
    const fromStorage = localStorage.getItem(FACEBOOK_REEL_MEMORY_KEY)?.trim() || ''
    if (fromStorage) {
      mergedPrompt = `${step.prompt}\n\n${fromStorage}`
    }

    return await runProcess({ ...step, prompt: mergedPrompt }, { autoSend: false, fast: false, forceNewChat: true })
  }

  const waitForChatgptResponseDone = async (stepLabel: string, timeoutMs = 240_000, preferredTabId?: number) => {
    const extensionChrome = getChrome()
    if (!extensionChrome?.tabs?.query || !extensionChrome.scripting?.executeScript) {
      setStatus(`${stepLabel}: Không hỗ trợ theo dõi phản hồi ChatGPT.`)
      return false
    }

    const target = await pickChatgptTab(preferredTabId)
    if (!target?.id) {
      setStatus(`${stepLabel}: Không tìm thấy tab ChatGPT để chờ phản hồi.`)
      return false
    }
    await sleep(220)

    setStatus(`${stepLabel}: Đang đợi ChatGPT phản hồi xong...`)
    const result = await extensionChrome.scripting.executeScript({
      target: { tabId: target.id },
      func: (async (maxWaitMs: number) => {
        const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
        const pollMs = 650
        const stableMs = 2200
        const startedAt = Date.now()

        const isVisible = (el: Element | null): el is HTMLElement => {
          if (!(el instanceof HTMLElement)) return false
          const rect = el.getBoundingClientRect()
          const style = window.getComputedStyle(el)
          return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden'
        }

        const isGenerating = () => {
          const stopBtn =
            (document.querySelector('button[data-testid="stop-button"]') as HTMLButtonElement | null) ||
            (document.querySelector('button[aria-label*="Stop"]') as HTMLButtonElement | null) ||
            (document.querySelector('button[aria-label*="Dừng"]') as HTMLButtonElement | null)
          if (stopBtn && !stopBtn.disabled && isVisible(stopBtn)) return true
          return Boolean(document.querySelector('[data-testid="conversation-turn-loading"]'))
        }

        const getAssistantSignature = () => {
          const turns = Array.from(document.querySelectorAll<HTMLElement>('[data-message-author-role="assistant"]')).filter(
            (el) => (el.innerText || '').trim().length > 0,
          )
          const lastText = (turns[turns.length - 1]?.innerText || '').replace(/\s+/g, ' ').trim()
          const compact = lastText.slice(0, 180)
          return {
            count: turns.length,
            text: compact,
            textLen: lastText.length,
          }
        }

        const initial = getAssistantSignature()
        let prev = initial
        let stableSince = Date.now()
        let observedProgress = false

        while (Date.now() - startedAt < maxWaitMs) {
          const current = getAssistantSignature()
          const generatingNow = isGenerating()
          const changed =
            current.count !== initial.count || current.textLen !== initial.textLen || current.text !== initial.text

          if (changed || generatingNow) observedProgress = true
          if (
            current.count !== prev.count ||
            current.textLen !== prev.textLen ||
            current.text !== prev.text ||
            generatingNow
          ) {
            stableSince = Date.now()
          }

          if (!generatingNow && observedProgress && Date.now() - stableSince >= stableMs) {
            return { ok: true, reason: 'done', elapsedMs: Date.now() - startedAt }
          }

          prev = current
          await sleep(pollMs)
        }

        return {
          ok: false,
          reason: observedProgress ? 'timeout' : 'no_response',
          elapsedMs: Date.now() - startedAt,
        }
      }) as (...args: unknown[]) => unknown,
      args: [timeoutMs],
    })

    const payload = (result?.[0]?.result || null) as { ok?: boolean; reason?: string } | null
    if (payload?.ok) {
      setStatus(`${stepLabel}: ChatGPT đã phản hồi xong, tiếp tục bước kế tiếp.`)
      return true
    }

    if (payload?.reason === 'timeout') {
      setStatus(`${stepLabel}: Hết thời gian chờ phản hồi ChatGPT.`)
      return false
    }
    if (payload?.reason === 'no_response') {
      setStatus(`${stepLabel}: Chưa thấy phản hồi mới từ ChatGPT.`)
      return false
    }
    setStatus(`${stepLabel}: Không thể xác nhận trạng thái phản hồi ChatGPT.`)
    return false
  }

  const getAssistantImageCount = async (preferredTabId?: number) => {
    const extensionChrome = getChrome()
    if (!extensionChrome?.scripting?.executeScript) return 0
    const target = await pickChatgptTab(preferredTabId)
    if (!target?.id) return 0

    const result = await extensionChrome.scripting.executeScript({
      target: { tabId: target.id },
      func: (() => {
        const all = Array.from(document.querySelectorAll<HTMLImageElement>('[data-message-author-role="assistant"] img'))
        return all.filter((img) => {
          const src = (img.getAttribute('src') || '').trim()
          if (!src) return false
          if (src.startsWith('data:')) return false
          return true
        }).length
      }) as (...args: unknown[]) => unknown,
    })
    return Number(result?.[0]?.result || 0)
  }

  const waitForGeneratedImageDone = async (stepLabel: string, baselineCount: number, timeoutMs = 360_000, preferredTabId?: number) => {
    const extensionChrome = getChrome()
    if (!extensionChrome?.tabs?.query || !extensionChrome.scripting?.executeScript) {
      setStatus(`${stepLabel}: Không hỗ trợ theo dõi tạo ảnh ChatGPT.`)
      return false
    }
    const target = await pickChatgptTab(preferredTabId)
    if (!target?.id) {
      setStatus(`${stepLabel}: Không tìm thấy tab ChatGPT để chờ tạo ảnh.`)
      return false
    }

    setStatus(`${stepLabel}: Đang đợi ChatGPT tạo ảnh xong...`)
    const result = await extensionChrome.scripting.executeScript({
      target: { tabId: target.id },
      func: (async (baseCount: number, maxWaitMs: number) => {
        const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
        const pollMs = 700
        const stableMs = 1800
        const settleAfterDetectMs = 3200
        const startedAt = Date.now()
        let stableSince = Date.now()
        let imageDetected = false
        let firstDetectAt = 0
        let lastCount = baseCount
        let assistantChanged = false

        const isVisible = (el: Element | null): el is HTMLElement => {
          if (!(el instanceof HTMLElement)) return false
          const rect = el.getBoundingClientRect()
          const style = window.getComputedStyle(el)
          return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden'
        }

        const isGenerating = () => {
          const stopBtn =
            (document.querySelector('button[data-testid="stop-button"]') as HTMLButtonElement | null) ||
            (document.querySelector('button[aria-label*="Stop"]') as HTMLButtonElement | null) ||
            (document.querySelector('button[aria-label*="Dừng"]') as HTMLButtonElement | null)
          if (stopBtn && !stopBtn.disabled && isVisible(stopBtn)) return true
          return Boolean(document.querySelector('[data-testid="conversation-turn-loading"]'))
        }

        const countAssistantImages = () => {
          const all = Array.from(
            document.querySelectorAll<HTMLImageElement>(
              '[data-message-author-role="assistant"] img, article img, main img',
            ),
          )
          return all.filter((img) => {
            const src = (img.getAttribute('src') || '').trim()
            if (!src) return false
            if (src.startsWith('data:')) return false
            const alt = (img.getAttribute('alt') || '').toLowerCase()
            if (alt.includes('avatar') || alt.includes('profile')) return false
            const w = img.naturalWidth || img.width || 0
            const h = img.naturalHeight || img.height || 0
            // Ignore tiny icons/avatars.
            if (w > 0 && h > 0 && (w < 96 || h < 96)) return false
            return true
          }).length
        }

        const getAssistantSignature = () => {
          const turns = Array.from(document.querySelectorAll<HTMLElement>('[data-message-author-role="assistant"]')).filter(
            (el) => (el.innerText || '').trim().length > 0,
          )
          const lastText = (turns[turns.length - 1]?.innerText || '').replace(/\s+/g, ' ').trim()
          return {
            count: turns.length,
            textLen: lastText.length,
          }
        }

        const initialSig = getAssistantSignature()
        let prevSig = initialSig

        while (Date.now() - startedAt < maxWaitMs) {
          const currentCount = countAssistantImages()
          const generatingNow = isGenerating()
          const currentSig = getAssistantSignature()
          if (currentCount > baseCount) {
            imageDetected = true
            if (!firstDetectAt) firstDetectAt = Date.now()
          }
          if (currentSig.count !== initialSig.count || currentSig.textLen !== initialSig.textLen) {
            assistantChanged = true
          }

          if (
            currentCount !== lastCount ||
            generatingNow ||
            currentSig.count !== prevSig.count ||
            currentSig.textLen !== prevSig.textLen
          ) {
            stableSince = Date.now()
          }

          // Success condition A: image count increased and DOM stabilized.
          if (imageDetected && Date.now() - stableSince >= stableMs) {
            return { ok: true, reason: 'image_done', imageCount: currentCount }
          }
          // Success condition A2: no detectable new img element, but assistant output changed
          // and UI stabilized (covers alternate render paths).
          if (assistantChanged && Date.now() - stableSince >= stableMs) {
            return { ok: true, reason: 'assistant_done', imageCount: currentCount }
          }
          // Success condition B: image detected and enough settle time passed,
          // even if UI still reports generating (avoid stuck waiting).
          if (imageDetected && firstDetectAt && Date.now() - firstDetectAt >= settleAfterDetectMs && !generatingNow) {
            return { ok: true, reason: 'image_done_settle', imageCount: currentCount }
          }

          lastCount = currentCount
          prevSig = currentSig
          await sleep(pollMs)
        }

        return { ok: false, reason: imageDetected ? 'timeout_after_image' : 'no_new_image', imageCount: lastCount }
      }) as (...args: unknown[]) => unknown,
      args: [baselineCount, timeoutMs],
    })

    const payload = (result?.[0]?.result || null) as { ok?: boolean; reason?: string } | null
    if (payload?.ok) {
      setStatus(`${stepLabel}: Ảnh đã tạo xong, tiếp tục bước kế tiếp.`)
      return true
    }
    if (payload?.reason === 'no_new_image') {
      setStatus(`${stepLabel}: Không thấy ảnh mới được tạo.`)
      return false
    }
    if (payload?.reason === 'timeout_after_image') {
      setStatus(`${stepLabel}: Đã có ảnh mới nhưng hết thời gian chờ hoàn tất.`)
      return false
    }
    setStatus(`${stepLabel}: Không thể xác nhận trạng thái tạo ảnh.`)
    return false
  }

  const executeWorkflowStep = async (step: ProcessStep) => {
    // User-required behavior: every workflow step in ChatGPT screen
    // runs exactly like "Chạy nhanh", then waits for response completion.
    const action = (step.actionType || '').trim().toLowerCase()
    const isGenerateImageStep = action === 'generate_image'
    const baselineImageCount = isGenerateImageStep ? await getAssistantImageCount(lockedWorkflowTabIdRef.current || undefined) : 0

    const sent = await runFastProcess(step)
    if (!sent) {
      throw new Error(`${step.label}: Không điền/gửi được prompt vào ChatGPT.`)
    }

    const done = isGenerateImageStep
      ? await waitForGeneratedImageDone(step.label, baselineImageCount, 360_000, lockedWorkflowTabIdRef.current || undefined)
      : await waitForChatgptResponseDone(step.label, 240_000, lockedWorkflowTabIdRef.current || undefined)
    if (!done) {
      throw new Error(
        isGenerateImageStep
          ? `${step.label}: ChatGPT chưa tạo ảnh hoàn tất.`
          : `${step.label}: ChatGPT chưa phản hồi hoàn tất.`,
      )
    }
    return {
      mode: 'forced_fast_per_step',
      actionType: step.actionType || 'custom',
      workflowPlatform: step.workflowPlatform,
      promptSent: sent,
      responseCompleted: done,
    }
  }

  const stopWorkflowRun = () => {
    workflowStopRef.current = true
    setIsWorkflowStopping(true)
    setStatus('Đang dừng workflow sau khi hoàn tất bước hiện tại...')
  }

  const runWorkflow = async (options?: { runId?: string; workflowId?: string; source?: string }) => {
    if (!canUseWorkflow) {
      setStatus('Workflow chỉ dành cho tài khoản VIP hoặc quản trị viên.')
      return
    }
    if (!processSteps.length || isWorkflowRunning) return
    const extensionChrome = getChrome()
    if (!extensionChrome?.tabs?.query || !extensionChrome?.scripting?.executeScript) {
      setStatus('Workflow chỉ chạy được trong extension Chrome đã cấp quyền Tabs + Scripting.')
      return
    }
    const firstStep = processSteps[0]
    if (!firstStep?.workflowId) {
      setStatus('Chưa tìm thấy workflowId để bắt đầu chạy workflow.')
      return
    }
    if (options?.workflowId && options.workflowId !== firstStep.workflowId) {
      setStatus('Workflow từ SSE không khớp workflow đang load ở màn hình ChatGPT.')
      return
    }

    setIsWorkflowRunning(true)
    setIsWorkflowStopping(false)
    workflowStopRef.current = false

    let workflowRunId = options?.runId || ''
    runningWorkflowRunIdRef.current = workflowRunId
    try {
      const lockedTab = await pickChatgptTab()
      lockedWorkflowTabIdRef.current = lockedTab?.id || 0
      if (!lockedWorkflowTabIdRef.current) {
        setStatus('Không thể khóa tab ChatGPT cho workflow.')
        return
      }

      if (!workflowRunId) {
        setStatus(`Đang tạo workflow run (${processSteps.length} bước)...`)
        const run = await createWorkflowRun({
          workflowId: firstStep.workflowId,
          payload: { source: options?.source || 'chatgpt_screen', totalSteps: processSteps.length },
        })
        workflowRunId = run._id
        runningWorkflowRunIdRef.current = workflowRunId
      } else {
        await updateWorkflowRun(workflowRunId, {
          status: 'running',
          progress: 0,
          currentStepNo: 0,
          startedAt: new Date().toISOString(),
          finishedAt: null,
          result: {},
          error: { code: '', message: '', details: {} },
        })
      }

      for (let index = 0; index < processSteps.length; index += 1) {
        const step = processSteps[index]
        const stepNo = step.stepNo || index + 1
        const progress = Math.round((index / processSteps.length) * 100)

        await updateWorkflowRun(workflowRunId, {
          status: 'running',
          currentStepNo: stepNo,
          progress,
        })

        setSelectedStepId(step.id)
        setStatus(`Workflow: đang chạy ${step.label} (${index + 1}/${processSteps.length})...`)

        const stepRun = await createStepRun({
          workflowRunId,
          workflowId: step.workflowId,
          stepId: step.backendStepId,
          stepNo,
          stepTitle: step.label,
          status: 'running',
          input: {
            actionType: step.actionType,
            promptLength: step.prompt.length,
            inputSchema: step.inputSchema || {},
          },
        })

        try {
          const output = await executeWorkflowStep(step)
          await updateStepRun(stepRun._id, {
            status: 'completed',
            output: output as Record<string, unknown>,
            finishedAt: new Date().toISOString(),
          })
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Step execution failed.'
          await updateStepRun(stepRun._id, {
            status: 'failed',
            error: { message: errorMessage },
            finishedAt: new Date().toISOString(),
          })
          await updateWorkflowRun(workflowRunId, {
            status: 'failed',
            progress,
            currentStepNo: stepNo,
            error: { code: 'STEP_FAILED', message: errorMessage, details: { stepId: step.id, stepNo } },
            finishedAt: new Date().toISOString(),
          })
          throw error
        }

        if (workflowStopRef.current) {
          await updateWorkflowRun(workflowRunId, {
            status: 'cancelled',
            progress: Math.round(((index + 1) / processSteps.length) * 100),
            currentStepNo: stepNo,
            finishedAt: new Date().toISOString(),
          })
          setStatus(`Workflow đã dừng ở ${step.label}.`)
          return
        }
      }

      await updateWorkflowRun(workflowRunId, {
        status: 'completed',
        progress: 100,
        currentStepNo: processSteps[processSteps.length - 1]?.stepNo || processSteps.length,
        result: { completedSteps: processSteps.length },
        finishedAt: new Date().toISOString(),
      })
      setStatus(`Workflow chạy xong ${processSteps.length}/${processSteps.length} bước.`)
    } catch (error) {
      if (!workflowRunId) {
        setStatus('Không thể tạo workflow run trên backend.')
      } else if (!workflowStopRef.current) {
        const errorMessage = error instanceof Error ? error.message : 'Workflow execution failed.'
        setStatus(`Workflow thất bại: ${errorMessage}`)
      }
    } finally {
      workflowStopRef.current = false
      lockedWorkflowTabIdRef.current = 0
      runningWorkflowRunIdRef.current = ''
      setIsWorkflowRunning(false)
      setIsWorkflowStopping(false)
    }
  }

  useEffect(() => {
    const onRunStep1FromFacebook = (event: Event) => {
      const customEvent = event as CustomEvent<{ reelContent?: string }>
      const reelContent = customEvent.detail?.reelContent?.trim() || ''
      const step1Prompt = processSteps.find((step) => step.id === 'step-1')?.prompt || ''
      if (!step1Prompt) {
        setStatus('Chưa tải được prompt Tiến trình 1 từ backend.')
        return
      }
      const mergedPrompt = `${step1Prompt}\n\nStory:\n${reelContent}`
      void runProcess({ label: 'Tiến trình 1', prompt: mergedPrompt }, { autoSend: false, fast: false, forceNewChat: true })
    }

    window.addEventListener('run-chatgpt-step1-from-facebook', onRunStep1FromFacebook as EventListener)
    return () => {
      window.removeEventListener('run-chatgpt-step1-from-facebook', onRunStep1FromFacebook as EventListener)
    }
  }, [processSteps])

  useEffect(() => {
    if (!canUseWorkflow || !processSteps.length) return
    const eventSource = createWorkflowRunEventSource()

    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(String(event.data || '{}')) as WorkflowRunStreamEvent
        if (payload?.type !== 'workflow_run_created') return
        const run = payload.run
        if (!run?._id || !run?.workflowId) return
        if ((run.status || '').toLowerCase() !== 'queued') return
        if (run.workflowId !== processSteps[0]?.workflowId) return
        if (isWorkflowRunning) return
        if (runningWorkflowRunIdRef.current === run._id) return
        setStatus(`SSE: nhận lệnh chạy workflow từ backend (${run._id}).`)
        void runWorkflow({ runId: run._id, workflowId: run.workflowId, source: 'sse' })
      } catch {
        // ignore malformed SSE payload
      }
    }

    eventSource.onerror = () => {
      // keep silent to avoid noisy UI when stream reconnects
    }

    return () => {
      eventSource.close()
    }
  }, [canUseWorkflow, processSteps, isWorkflowRunning])

  const splitCapturedImage = async (
    screenshotDataUrl: string,
    rect: { x: number; y: number; width: number; height: number; viewportWidth?: number; viewportHeight?: number },
  ) => {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Không thể đọc ảnh chụp màn hình.'))
      img.src = screenshotDataUrl
    })

    const viewportWidth = rect.viewportWidth && rect.viewportWidth > 0 ? rect.viewportWidth : image.width
    const viewportHeight = rect.viewportHeight && rect.viewportHeight > 0 ? rect.viewportHeight : image.height
    const scaleX = image.width / viewportWidth
    const scaleY = image.height / viewportHeight

    const sourceX = Math.max(0, Math.round(rect.x * scaleX))
    const sourceY = Math.max(0, Math.round(rect.y * scaleY))
    const sourceW = Math.max(2, Math.round(rect.width * scaleX))
    const sourceH = Math.max(2, Math.round(rect.height * scaleY))
    const halfW = Math.max(1, Math.floor(sourceW / 2))

    const makePart = (sx: number, sw: number) => {
      const canvas = document.createElement('canvas')
      canvas.width = sw
      canvas.height = sourceH
      const ctx = canvas.getContext('2d')
      if (!ctx) return ''
      ctx.drawImage(image, sx, sourceY, sw, sourceH, 0, 0, sw, sourceH)
      return canvas.toDataURL('image/png')
    }

    const left = makePart(sourceX, halfW)
    const right = makePart(sourceX + halfW, sourceW - halfW)
    return { left, right }
  }

  const saveCopiedSplitImageIfNew = async (dataUrl: string, part: 'left' | 'right', imageBlob: Blob) => {
    const extensionChrome = getChrome()
    if (!extensionChrome) {
      return { saved: false as const, skipped: false as const, reason: 'not_extension' as const }
    }
    const runtime = extensionChrome.runtime
    const sendMessage = runtime?.sendMessage
    if (!runtime?.id) {
      return { saved: false as const, skipped: false as const, reason: 'not_extension' as const }
    }
    const hashKey = `${part}:${hashDataUrl(dataUrl)}`
    const storage = extensionChrome?.storage?.local
    if (!storage?.get || !storage?.set) {
      return { saved: false as const, skipped: false as const, reason: 'no_storage' as const }
    }

    const existing = await new Promise<string[]>((resolve) => {
      storage.get?.([SAVED_SPLIT_IMAGE_HASHES_KEY], (items) => {
        const raw = items[SAVED_SPLIT_IMAGE_HASHES_KEY]
        resolve(Array.isArray(raw) ? (raw as string[]) : [])
      })
    })

    if (existing.includes(hashKey)) {
      return { saved: false, skipped: true, reason: 'duplicate' as const }
    }

    const safeHash = hashKey.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40)
    const filename = `${SPLIT_IMAGE_DOWNLOAD_FOLDER}/part-${part === 'left' ? '1' : '2'}-${safeHash}.png`
    const baseFileName = filename.includes('/') ? filename.split('/').pop() || 'image.png' : filename

    /** Fallback khi `chrome.downloads` không có (một số bản Chrome / side panel): tải qua thẻ `<a download>`. */
    const tryAnchorDownloadBlob = () => {
      const objectUrl = URL.createObjectURL(imageBlob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = baseFileName
      a.rel = 'noopener'
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 5000)
    }

    const tryAnchorDownloadDataUrl = () => {
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = baseFileName
      a.rel = 'noopener'
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    }

    const tryPageDownloadBlob = () =>
      new Promise<void>((resolve, reject) => {
        const d = extensionChrome.downloads?.download
        if (!d) {
          reject(new Error('no_downloads_api'))
          return
        }
        const objectUrl = URL.createObjectURL(imageBlob)
        d({ url: objectUrl, filename, saveAs: false, conflictAction: 'uniquify' }, () => {
          const err = runtime.lastError
          window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500)
          if (err?.message) reject(new Error(err.message))
          else resolve()
        })
      })

    const tryPageDownloadDataUrl = () =>
      new Promise<void>((resolve, reject) => {
        const d = extensionChrome.downloads?.download
        if (!d) {
          reject(new Error('no_downloads_api'))
          return
        }
        d({ url: dataUrl, filename, saveAs: false, conflictAction: 'uniquify' }, () => {
          const err = runtime.lastError
          if (err?.message) reject(new Error(err.message))
          else resolve()
        })
      })

    const tryBackgroundMessage = (payload: unknown) =>
      new Promise<{ ok: boolean; error?: string }>((resolve, reject) => {
        if (!sendMessage) {
          reject(new Error('no_receiver'))
          return
        }
        sendMessage(payload, (res) => {
          const le = runtime.lastError
          if (le?.message) reject(new Error(le.message))
          else {
            const body = res as { ok?: boolean; error?: string } | undefined
            resolve({ ok: Boolean(body?.ok), error: body?.error })
          }
        })
      })

    const runDownload = async () => {
      const hasDownloadsApi = Boolean(extensionChrome.downloads?.download)

      if (hasDownloadsApi) {
        try {
          await tryPageDownloadBlob()
          return
        } catch {
          /* thử anchor + background + data URL */
        }
      } else {
        tryAnchorDownloadBlob()
        return
      }

      tryAnchorDownloadBlob()

      if (sendMessage) {
        try {
          const buffer = await imageBlob.arrayBuffer()
          const r = await tryBackgroundMessage({
            type: 'DOWNLOAD_ARRAY_BUFFER',
            buffer,
            filename,
            mimeType: imageBlob.type || 'image/png',
          })
          if (r.ok) return
        } catch {
          /* fall through */
        }
        try {
          const r = await tryBackgroundMessage({ type: 'DOWNLOAD_DATA_URL', dataUrl, filename })
          if (r.ok) return
        } catch {
          /* fall through */
        }
      }

      try {
        await tryPageDownloadDataUrl()
        return
      } catch {
        /* fall through */
      }

      tryAnchorDownloadDataUrl()
    }

    await runDownload()

    const next = [...existing.filter((k) => k !== hashKey), hashKey].slice(-SAVED_SPLIT_IMAGE_HASHES_MAX)
    await new Promise<void>((resolve) => storage.set?.({ [SAVED_SPLIT_IMAGE_HASHES_KEY]: next }, () => resolve()))

    return { saved: true, skipped: false, reason: 'ok' as const }
  }

  const copyImageDataUrl = async (dataUrl: string, label: string, part: 'left' | 'right') => {
    try {
      const response = await fetch(dataUrl)
      const blob = await response.blob()
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
      setCopiedPart(part)
      window.setTimeout(() => setCopiedPart((prev) => (prev === part ? null : prev)), 1200)

      let saveNote = ''
      try {
        const saveResult = await saveCopiedSplitImageIfNew(dataUrl, part, blob)
        if (saveResult.skipped) saveNote = ' Ảnh này đã được lưu trước đó, không lưu lại.'
        else if (saveResult.saved)
          saveNote = ` Đã lưu file: Downloads/${SPLIT_IMAGE_DOWNLOAD_FOLDER}/… (PNG).`
        else if (saveResult.reason === 'not_extension')
          saveNote =
            ' Lưu file cần mở extension đã cài (icon puzzle → AI Content Extension), không mở giao diện bằng tab localhost. Sau khi thêm quyền Downloads, vào chrome://extensions và bấm Tải lại.'
        else if (saveResult.reason === 'no_storage')
          saveNote = ' (Không lưu file: thiếu chrome.storage trong môi trường này.)'
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Lỗi không xác định'
        saveNote = ` Không lưu được file: ${msg}`
      }

      setStatus(`Đã sao chép ${label} vào clipboard.${saveNote}`)
    } catch {
      setStatus(`Không thể sao chép ${label}. Hãy thử lại.`)
    }
  }

  const extractVideoContentFromStep2 = async (part: 1 | 2, options?: { copyToClipboard?: boolean }) => {
    const copyToClipboard = options?.copyToClipboard !== false
    const extensionChrome = getChrome()
    if (!extensionChrome?.tabs?.query || !extensionChrome.scripting?.executeScript) {
      setStatus('Môi trường hiện tại không hỗ trợ lấy nội dung VIDEO.')
      return ''
    }

    if (copyToClipboard) {
      setStatus(`Đang lấy nội dung VIDEO ${part} từ Tiến trình 2...`)
    }

    const currentActive = await queryTabs(undefined, true, true)
    const activeTab = currentActive[0]
    const isActiveChatgpt = Boolean(activeTab?.url && /chatgpt\.com|chat\.openai\.com/i.test(activeTab.url))
    const activeTabs = isActiveChatgpt ? [activeTab] : await queryTabs(CHATGPT_PATTERNS, true, true)
    const allTabs = activeTabs.length > 0 ? activeTabs : await queryTabs(CHATGPT_PATTERNS)
    let target: BrowserTab | null | undefined = allTabs[0]

    if (!target?.id) {
      setStatus('Không tìm thấy tab ChatGPT để lấy nội dung VIDEO.')
      return ''
    }

    target = await updateTab(target.id)
    await sleep(240)

    if (!target?.id) {
      setStatus('Không thể kích hoạt tab ChatGPT để lấy nội dung VIDEO.')
      return ''
    }

    const result = await extensionChrome.scripting.executeScript({
      target: { tabId: target.id },
      func: ((videoPart: number) => {
        const normalize = (text: string) => text.replace(/\r/g, '')

        const extractByHeading = (source: string, headingRegex: RegExp, stopRegexes: RegExp[]) => {
          const match = source.match(headingRegex)
          if (!match || match.index === undefined) return ''
          const start = match.index + match[0].length
          const tail = source.slice(start)

          let end = tail.length
          for (const rg of stopRegexes) {
            const m = tail.match(rg)
            if (m && m.index !== undefined) {
              end = Math.min(end, m.index)
            }
          }

          return tail.slice(0, end).trim()
        }
        const trimVideoTail = (raw: string) => {
          const source = (raw || '').trim()
          if (!source) return ''

          const startMarkers = [
            /(?:^|\n)\s*🎬\s*scene\s*1\b/i,
            /(?:^|\n)\s*scene\s*1\b/i,
          ]
          let start = 0
          for (const rg of startMarkers) {
            const m = source.match(rg)
            if (m && m.index !== undefined) {
              start = m.index
              break
            }
          }
          const normalizedSource = source.slice(start).trim()

          const stopMarkers = [
            /(?:^|\n)\s*structure\s*:\s*3\s*scenes\b/i,
            /(?:^|\n)\s*🎯\s*production\s*notes\b/i,
            /(?:^|\n)\s*🎯\s*notes?\s*for\s*ai\s*generation\b/i,
            /(?:^|\n)\s*(?:🔥\s*)?notes?\s*for\s*ai\s*video\s*tools\b/i,
            /(?:^|\n)\s*⚡\s*cinematic\s*rules\b/i,
            /(?:^|\n)\s*cinematic\s*rules\b/i,
            /(?:^|\n)\s*(?:🔁\s*)?continuity\s*notes\b/i,
            /(?:^|\n)\s*if\s+you\s+want\s+next\b/i,
            /(?:^|\n)\s*if\s+you\s+want[, ]+i\s+can\s+next\b/i,
            /(?:^|\n)\s*just\s+tell\s+me\b/i,
            /(?:^|\n)\s*✅\s*/i,
            /(?:^|\n)\s*i\s+can\s+generate\b/i,
            /(?:^|\n)\s*or\s+convert\b/i,
            /(?:^|\n)\s*facebook\s*$/i,
            /(?:^|\n)\s*chatgpt\s*$/i,
            /(?:^|\n)\s*(?:🎬\s*)?idea\s*\d+\b/i,
            /(?:^|\n)\s*(?:🖼️\s*)?image\s*\d+\b/i,
            /(?:^|\n)\s*(?:🎥\s*)?video\s*\d+\b/i,
            // Generic fallback: cut at an uppercase heading line (e.g. "NOTES FOR AI GENERATION").
            /(?:^|\n)\s*[A-Z][A-Z0-9&/,'’()\-]*(?:\s+[A-Z0-9&/,'’()\-]+){1,}\s*$/m,
          ]

          let end = normalizedSource.length
          for (const rg of stopMarkers) {
            const m = normalizedSource.match(rg)
            if (m && m.index !== undefined && m.index > 0) {
              end = Math.min(end, m.index)
            }
          }

          return normalizedSource.slice(0, end).trim()
        }
        const compactLines = (raw: string) => {
          const source = (raw || '').replace(/\r/g, '').trim()
          if (!source) return ''
          return source
            .split('\n')
            .map((line) => line.replace(/\s+/g, ' ').trim())
            .filter(Boolean)
            .join('\n')
        }
        const trimToSceneScript = (raw: string) => {
          const source = (raw || '').replace(/\r/g, '').trim()
          if (!source) return ''
          const lines = source.split('\n')
          const out: string[] = []
          let started = false
          const isSceneLine = (line: string) => /^(?:🎬\s*)?scene\b/i.test(line)
          const isHardStop = (line: string) =>
            /^(?:🎯|🔥|⚡|✅|🔁)/.test(line) ||
            /^(?:notes?|production\s+notes?|cinematic\s+rules?)\b/i.test(line) ||
            /^if\s+you\s+want\b/i.test(line) ||
            /^i\s+can\s+generate\b/i.test(line) ||
            /^or\s+convert\b/i.test(line) ||
            /^(?:idea|image|video)\s*\d+\b/i.test(line) ||
            /^(?:facebook|chatgpt)\s*$/i.test(line) ||
            /^[A-Z][A-Z0-9&/,'’()\-]*(?:\s+[A-Z0-9&/,'’()\-]+){1,}\s*$/.test(line)

          for (const lineRaw of lines) {
            const line = lineRaw.trim()
            if (!line) continue
            if (!started) {
              if (!isSceneLine(line)) continue
              started = true
              out.push(line)
              continue
            }
            if (isHardStop(line)) break
            out.push(line)
          }
          return out.join('\n').trim()
        }

        const assistantNodes = Array.from(
          document.querySelectorAll<HTMLElement>('[data-message-author-role="assistant"], article'),
        )
          .filter((el) => (el.innerText || '').trim().length > 0)
          .reverse()

        const candidateNode =
          assistantNodes.find((el) => /idea\s*1|idea\s*2|video\s*1|video\s*2/i.test(el.innerText || '')) ||
          assistantNodes[0]
        if (!candidateNode) return ''

        // Scroll to the relevant assistant response block first.
        candidateNode.scrollIntoView({ block: 'start', behavior: 'instant' })

        // Then attempt to scroll closer to the exact section heading.
        const headingNodes = Array.from(candidateNode.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6, p, strong'))
        const getText = (node: HTMLElement) => (node.innerText || '').replace(/\s+/g, ' ').trim()
        const findHeading = (regex: RegExp) =>
          headingNodes
            .filter((node) => regex.test(getText(node)))
            .sort((a, b) => getText(a).length - getText(b).length)[0]

        // VIDEO 2 is usually inside IDEA 2, so scroll to IDEA 2 first for better accuracy.
        if (videoPart === 2) {
          const idea2Heading = findHeading(/\bidea\s*2\b/i)
          idea2Heading?.scrollIntoView({ block: 'start', behavior: 'instant' })
        }

        const targetHeading = findHeading(new RegExp(`\\bvideo\\s*${videoPart}\\b`, 'i'))
        targetHeading?.scrollIntoView({ block: 'start', behavior: 'instant' })

        const text = normalize(candidateNode.innerText || '')

        // Strategy A: extract inside IDEA block (common format).
        const idea1Block = extractByHeading(
          text,
          /(?:^|\n)\s*#{0,6}\s*(?:🎬\s*)?idea\s*1\b[^\n]*\n/i,
          [/(?:^|\n)\s*#{0,6}\s*(?:🎬\s*)?idea\s*2\b[^\n]*\n/i, /(?:^|\n)\s*#{0,6}\s*🔁\s*continuity\s*notes\b/i],
        )
        const idea2Block = extractByHeading(
          text,
          /(?:^|\n)\s*#{0,6}\s*(?:🎬\s*)?idea\s*2\b[^\n]*\n/i,
          [/(?:^|\n)\s*#{0,6}\s*🔁\s*continuity\s*notes\b/i],
        )

        const pickIdeaVideo = (ideaBlock: string, n: number) => {
          if (!ideaBlock) return ''
          const headingStopsForVideo1 = [
            /(?:^|\n)\s*#{1,6}\s*(?:🎬\s*)?idea\s*2\b/i,
            /(?:^|\n)\s*#{1,6}\s*(?:🖼️\s*)?image\s*2\b/i,
            /(?:^|\n)\s*#{1,6}\s*(?:🎥\s*)?video\s*2\b/i,
            /(?:^|\n)\s*#{1,6}\s*🔁\s*continuity\s*notes\b/i,
          ]
          const headingStopsForVideo2 = [
            /(?:^|\n)\s*#{1,6}\s*🔁\s*continuity\s*notes\b/i,
            /(?:^|\n)\s*#{1,6}\s*(?:🎬\s*)?idea\s*3\b/i,
            /(?:^|\n)\s*#{1,6}\s*(?:🎥\s*)?video\s*3\b/i,
          ]
          const plainLineStopsForVideo1 = [
            /(?:^|\n)\s*(?:🖼️\s*)?image\s*2\b[^\n]*/i,
            /(?:^|\n)\s*(?:🎬\s*)?idea\s*2\b[^\n]*/i,
            /(?:^|\n)\s*(?:🔥\s*)?notes?\s*for\s*ai\s*video\s*tools\b[^\n]*/i,
            /(?:^|\n)\s*(?:🔁\s*)?continuity\s*notes\b[^\n]*/i,
          ]
          const plainLineStopsForVideo2 = [
            /(?:^|\n)\s*(?:🔥\s*)?notes?\s*for\s*ai\s*video\s*tools\b[^\n]*/i,
            /(?:^|\n)\s*(?:🔁\s*)?continuity\s*notes\b[^\n]*/i,
            /(?:^|\n)\s*(?:🎬\s*)?idea\s*3\b[^\n]*/i,
            /(?:^|\n)\s*(?:🖼️\s*)?image\s*3\b[^\n]*/i,
          ]

          const directVideo = extractByHeading(
            ideaBlock,
            new RegExp(`(?:^|\\n)\\s*#{0,6}\\s*(?:🎥\\s*)?video\\s*${n}\\b[^\\n]*\\n`, 'i'),
            [...(n === 1 ? headingStopsForVideo1 : headingStopsForVideo2), ...(n === 1 ? plainLineStopsForVideo1 : plainLineStopsForVideo2)],
          )
          return trimVideoTail(directVideo || ideaBlock.trim())
        }

        // Strategy B: generic video heading fallback.
        const genericVideo = extractByHeading(
          text,
          new RegExp(`(?:^|\\n)\\s*(?:\\*{0,2})?(?:#{0,6}\\s*)?(?:🎥\\s*)?video\\s*${videoPart}\\b[^\\n]*\\n`, 'i'),
          [
            new RegExp(`(?:^|\\n)\\s*(?:\\*{0,2})?(?:#{0,6}\\s*)?(?:🎥\\s*)?video\\s*${videoPart === 1 ? 2 : 3}\\b`, 'i'),
            /(?:^|\n)\s*#{1,6}\s*(?:🎬\s*)?idea\s*\d+\b/i,
            /(?:^|\n)\s*#{1,6}\s*(?:🖼️\s*)?image\s*\d+\b/i,
            /(?:^|\n)\s*#{1,6}\s*🔁\s*continuity\s*notes\b/i,
            /(?:^|\n)\s*(?:🔥\s*)?notes?\s*for\s*ai\s*video\s*tools\b[^\n]*/i,
            /(?:^|\n)\s*(?:🔁\s*)?continuity\s*notes\b[^\n]*/i,
            /(?:^|\n)\s*(?:🖼️\s*)?image\s*\d+\b[^\n]*/i,
            /(?:^|\n)\s*(?:🎬\s*)?idea\s*\d+\b[^\n]*/i,
          ],
        )

        if (videoPart === 1) {
          return compactLines(trimToSceneScript(trimVideoTail(pickIdeaVideo(idea1Block, 1) || genericVideo)))
        }
        return compactLines(trimToSceneScript(trimVideoTail(pickIdeaVideo(idea2Block, 2) || genericVideo)))
      }) as (...args: unknown[]) => unknown,
      args: [part],
    })

    const extracted = ((result?.[0]?.result as string | undefined) || '').trim()
    if (!extracted) {
      if (copyToClipboard) {
        setStatus(`Không tìm thấy nội dung VIDEO ${part}. Hãy đảm bảo đã có output Tiến trình 2 trong hội thoại.`)
      }
      return ''
    }

    if (copyToClipboard) {
      try {
        await navigator.clipboard.writeText(extracted)
        const toolId = `video-${part}`
        setCopiedTool(toolId)
        window.setTimeout(() => setCopiedTool((prev) => (prev === toolId ? null : prev)), 1200)
        setStatus(`Đã lấy và sao chép nội dung VIDEO ${part} vào clipboard.`)
      } catch {
        setStatus(`Đã lấy nội dung VIDEO ${part} nhưng sao chép thất bại.`)
      }
    }
    return extracted
  }

  const fillGrokWithVideoImage = async (part: 1 | 2) => {
    setStatus(`Đang lấy ảnh ${part} (Tiến trình 3) và nội dung VIDEO ${part} (Tiến trình 2)...`)

    const imageDataUrl = part === 1 ? splitImages?.left : splitImages?.right
    if (!imageDataUrl) {
      setStatus(`Chưa có ảnh ${part} từ Tiến trình 3. Hãy bấm nút cắt ảnh trước.`)
      return
    }

    const prompt = await extractVideoContentFromStep2(part, { copyToClipboard: false })
    if (!prompt) {
      setStatus(`Không tìm thấy nội dung VIDEO ${part} trong output Tiến trình 2.`)
      return
    }

    window.dispatchEvent(new CustomEvent('switch-main-tab', { detail: { tabId: 'grok' } }))
    window.setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent('fill-grok-from-chatgpt-video1-image', {
          detail: { prompt, imageDataUrl, part },
        }),
      )
    }, 120)

    setStatus(`Đã chuyển Grok: dùng ảnh ${part} (Tiến trình 3) + VIDEO ${part} (Tiến trình 2), không Enter.`)
  }

  const extractStep4Content = async (
    kind: 'title_plain' | 'title_styled' | 'content_short' | 'content_full',
    options?: { copyToClipboard?: boolean },
  ) => {
    const copyToClipboard = options?.copyToClipboard !== false
    const extensionChrome = getChrome()
    if (!extensionChrome?.tabs?.query || !extensionChrome.scripting?.executeScript) {
      const kindLabel =
        kind === 'title_plain'
          ? 'tiêu đề'
          : kind === 'title_styled'
            ? 'tiêu đề font kiểu'
            : kind === 'content_short'
              ? 'nội dung ngắn'
              : 'nội dung toàn bộ'
      if (copyToClipboard) {
        setStatus(`Môi trường hiện tại không hỗ trợ lấy ${kindLabel} Tiến trình 4.`)
      }
      return ''
    }

    const kindLabel =
      kind === 'title_plain'
        ? 'tiêu đề'
        : kind === 'title_styled'
          ? 'tiêu đề font kiểu'
          : kind === 'content_short'
            ? 'nội dung ngắn'
            : 'nội dung toàn bộ'

    if (copyToClipboard) {
      setStatus(`Đang lấy ${kindLabel} từ Tiến trình 4...`)
    }

    const currentActive = await queryTabs(undefined, true, true)
    const activeTab = currentActive[0]
    const isActiveChatgpt = Boolean(activeTab?.url && /chatgpt\.com|chat\.openai\.com/i.test(activeTab.url))
    const activeTabs = isActiveChatgpt ? [activeTab] : await queryTabs(CHATGPT_PATTERNS, true, true)
    const allTabs = activeTabs.length > 0 ? activeTabs : await queryTabs(CHATGPT_PATTERNS)
    let target: BrowserTab | null | undefined = allTabs[0]

    if (!target?.id) {
      if (copyToClipboard) {
        setStatus('Không tìm thấy tab ChatGPT để lấy dữ liệu Tiến trình 4.')
      }
      return ''
    }

    target = await updateTab(target.id)
    await sleep(240)

    if (!target?.id) {
      if (copyToClipboard) {
        setStatus('Không thể kích hoạt tab ChatGPT để lấy dữ liệu Tiến trình 4.')
      }
      return ''
    }

    const result = await extensionChrome.scripting.executeScript({
      target: { tabId: target.id },
      func: ((extractKind: 'title_plain' | 'title_styled' | 'content_short' | 'content_full') => {
        const normalize = (text: string) => text.replace(/\r/g, '').trim()
        const getLargestCodeBlock = (text: string) => {
          const matches = Array.from(text.matchAll(/```(?:[a-zA-Z0-9_-]+)?\n?([\s\S]*?)```/g))
          if (matches.length === 0) return ''
          return matches
            .map((m) => (m[1] || '').trim())
            .sort((a, b) => b.length - a.length)[0]
        }

        const splitParagraphs = (text: string) =>
          normalize(text)
            .split(/\n\s*\n/)
            .map((block) => block.trim())
            .filter(Boolean)

        const pickTitle = (text: string) => {
          const cleanTitleEnd = (value: string) => value.trim().replace(/[.!?…,:;\-\s]+$/g, '')
          const normalized = normalize(text)
          if (!normalized) return ''

          const titleLine = normalized.match(/(?:^|\n)\s*title\s*[:\-]\s*([^\n]+)/i)
          if (titleLine?.[1]) return cleanTitleEnd(titleLine[1])

          const headingLine = normalized.match(/(?:^|\n)\s*#{1,6}\s*([^\n]+)/)
          if (headingLine?.[1]) return cleanTitleEnd(headingLine[1])

          const paragraphs = splitParagraphs(normalized)
          const firstBlock = paragraphs[0] || ''
          const sentenceMatches = Array.from(firstBlock.matchAll(/[^.!?]+[.!?]+/g)).map((m) => (m[0] || '').trim())
          if (sentenceMatches.length >= 2) {
            return cleanTitleEnd(`${sentenceMatches[0]} ${sentenceMatches[1]}`)
          }
          if (firstBlock) return cleanTitleEnd(firstBlock.split('\n')[0] || '')
          return ''
        }

        const pickContent = (text: string) => {
          const normalized = normalize(text)
          if (!normalized) return ''

          const blockContent = getLargestCodeBlock(normalized)
          const base = blockContent || normalized
          const paragraphs = splitParagraphs(base)
          if (paragraphs.length <= 1) return base

          const firstWords = (paragraphs[0].match(/\S+/g) || []).length
          if (firstWords <= 26) {
            return paragraphs.slice(1).join('\n\n').trim()
          }
          return base
        }

        const pickShortContent = (text: string) => {
          const full = pickContent(text)
          if (!full) return ''

          const MIN_LEN = 1000
          const MAX_SCAN = 3600
          const normalized = full.replace(/\r/g, '').trim()
          if (!normalized) return ''

          const searchSpace = normalized.slice(0, MAX_SCAN)
          const questionWindow = searchSpace.slice(MIN_LEN)
          const lastQuestionAfterMin = questionWindow.lastIndexOf('?')

          if (lastQuestionAfterMin >= 0) {
            return searchSpace.slice(0, MIN_LEN + lastQuestionAfterMin + 1).trim()
          }

          const questionIndex = searchSpace.indexOf('?')

          if (questionIndex >= 0) {
            const untilQuestion = normalized.slice(0, questionIndex + 1).trim()
            if (untilQuestion.length >= MIN_LEN) return untilQuestion

            // If first '?' is too early, extend to the next line/sentence ending.
            const rest = normalized.slice(questionIndex + 1)
            const nextBreakCandidates = [rest.indexOf('\n'), rest.search(/[.!?]/)]
              .filter((idx) => idx >= 0)
              .sort((a, b) => a - b)
            if (nextBreakCandidates.length > 0) {
              const extended = normalized.slice(0, questionIndex + 1 + nextBreakCandidates[0] + 1).trim()
              if (extended) return extended
            }
            return untilQuestion
          }

          // Fallback: no '?' within limit => cut at a clean line/sentence boundary.
          const limited = searchSpace
          const lastLineBreak = limited.lastIndexOf('\n')
          if (lastLineBreak >= MIN_LEN) return limited.slice(0, lastLineBreak).trim()

          const lastSentenceEnd = Math.max(limited.lastIndexOf('.'), limited.lastIndexOf('!'))
          if (lastSentenceEnd >= MIN_LEN) return limited.slice(0, lastSentenceEnd + 1).trim()

          return limited.trim()
        }

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

        const turns = Array.from(document.querySelectorAll<HTMLElement>('[data-message-author-role]')).filter(
          (el) => (el.innerText || '').trim().length > 0,
        )
        if (!turns.length) return ''

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
        if (latestUserIndex < 0) return ''

        const latestUserText = normalize(turns[latestUserIndex].innerText || '')
        if (!step4Hint.test(latestUserText)) {
          return ''
        }

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
        if (!raw) return ''
        matchedAssistantNode?.scrollIntoView({ block: 'start', behavior: 'instant' })

        if (extractKind === 'title_plain') return pickTitle(raw)
        if (extractKind === 'title_styled') return stylizeTitle(pickTitle(raw))
        if (extractKind === 'content_short') return pickShortContent(raw)
        return pickContent(raw)
      }) as (...args: unknown[]) => unknown,
      args: [kind],
    })

    const extracted = ((result?.[0]?.result as string | undefined) || '').trim()
    if (!extracted) {
      if (copyToClipboard) {
        setStatus(`Không tìm thấy ${kindLabel} từ output Tiến trình 4.`)
      }
      return ''
    }

    if (copyToClipboard) {
      try {
        await navigator.clipboard.writeText(extracted)
        const toolId = `step4-${kind}`
        setCopiedTool(toolId)
        window.setTimeout(() => setCopiedTool((prev) => (prev === toolId ? null : prev)), 1200)
        setStatus(`Đã lấy và sao chép ${kindLabel} Tiến trình 4 vào clipboard.`)
      } catch {
        setStatus(`Đã lấy ${kindLabel} Tiến trình 4 nhưng sao chép thất bại.`)
      }
    }
    return extracted
  }

  const injectImagesIntoLongContent = (content: string, image1: string, image2: string) => {
    const base = (content || '').trim()
    if (!base) return ''

    const sentenceUnits = base
      .split(/(?<=[.!?])\s+/)
      .map((unit) => unit.trim())
      .filter(Boolean)
    const units = sentenceUnits.length >= 6 ? sentenceUnits : base.split('\n').map((line) => line.trim()).filter(Boolean)
    if (units.length < 3) {
      return `${base}\n\n<p><img src="${image1}" alt="Ảnh 1" /></p>\n\n<p><img src="${image2}" alt="Ảnh 2" /></p>`
    }

    const n = units.length
    const start = Math.max(1, Math.floor(n * 0.2))
    const end = Math.min(n - 2, Math.ceil(n * 0.8))
    const range = Array.from({ length: Math.max(0, end - start + 1) }, (_, i) => start + i)
    const minGap = Math.max(2, Math.floor(n * 0.2))

    const pick = (arr: number[]) => arr[Math.floor(Math.random() * arr.length)]
    let i1 = range.length > 0 ? pick(range) : Math.max(1, Math.floor(n * 0.35))
    let i2Candidates = range.filter((idx) => Math.abs(idx - i1) >= minGap)
    if (i2Candidates.length === 0) {
      i2Candidates = range.filter((idx) => Math.abs(idx - i1) >= 2)
    }
    const i2 = i2Candidates.length > 0 ? pick(i2Candidates) : Math.min(n - 2, i1 + minGap)
    const [firstIdx, secondIdx] = [i1, i2].sort((a, b) => a - b)

    const image1Block = `<p><img src="${image1}" alt="Ảnh 1" /></p>`
    const image2Block = `<p><img src="${image2}" alt="Ảnh 2" /></p>`

    const out: string[] = []
    units.forEach((unit, idx) => {
      out.push(unit)
      if (idx === firstIdx) out.push(image1Block)
      if (idx === secondIdx) out.push(image2Block)
    })
    return out.join('\n\n')
  }

  const pushStep4ToWebBlog = async () => {
    if (!splitImages?.left || !splitImages?.right) {
      setStatus('Chưa có ảnh 1/2 từ Tiến trình 3. Hãy cắt ảnh trước khi gửi WebBlog.')
      return
    }

    setStatus('Đang lấy tiêu đề thường + nội dung dài và ghép ảnh ngẫu nhiên cho WebBlog...')
    const titlePlain = await extractStep4Content('title_plain', { copyToClipboard: false })
    const fullContent = await extractStep4Content('content_full', { copyToClipboard: false })
    if (!titlePlain || !fullContent) {
      setStatus('Không lấy đủ dữ liệu Tiến trình 4 để gửi WebBlog.')
      return
    }

    const contentWithImages = injectImagesIntoLongContent(fullContent, splitImages.left, splitImages.right)
    window.dispatchEvent(new CustomEvent('switch-main-tab', { detail: { tabId: 'webblog' } }))
    window.setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent('fill-webblog-from-chatgpt', {
          detail: {
            title: titlePlain,
            longContent: contentWithImages,
            image1: splitImages.left,
            image2: splitImages.right,
          },
        }),
      )
    }, 120)
    setStatus('Đã gửi dữ liệu sang WebBlog (tiêu đề + nội dung dài có chèn ảnh 1/2).')
  }

  const runGgSheetCollectTool = () => {
    window.dispatchEvent(new CustomEvent('switch-main-tab', { detail: { tabId: 'ggsheet' } }))
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('run-ggsheet-collect-from-chatgpt'))
    }, 120)
    setStatus('Đã chuyển sang GGSheet và bắt đầu gom dữ liệu từ ChatGPT.')
  }

  const extractAndSplitLatestImageFromStep3 = async () => {
    const extensionChrome = getChrome()
    if (!extensionChrome?.tabs?.query || !extensionChrome.scripting?.executeScript || !extensionChrome.tabs.captureVisibleTab) {
      setStatus('Môi trường hiện tại không hỗ trợ công cụ xử lý ảnh.')
      return
    }

    setStatus('Đang lấy ảnh mới nhất từ hội thoại và cắt đôi...')

    const currentActive = await queryTabs(undefined, true, true)
    const activeTab = currentActive[0]
    const isActiveChatgpt = Boolean(activeTab?.url && /chatgpt\.com|chat\.openai\.com/i.test(activeTab.url))

    const activeTabs = isActiveChatgpt ? [activeTab] : await queryTabs(CHATGPT_PATTERNS, true, true)
    const allTabs = activeTabs.length > 0 ? activeTabs : await queryTabs(CHATGPT_PATTERNS)
    let target: BrowserTab | null | undefined = allTabs[0]

    if (!target?.id) {
      target = await createTab(CHATGPT_URL)
      await sleep(900)
    } else {
      target = await updateTab(target.id)
      await sleep(450)
    }

    if (!target?.id) {
      setStatus('Không tìm thấy tab ChatGPT để lấy ảnh.')
      return
    }

    const locateResult = await extensionChrome.scripting.executeScript({
      target: { tabId: target.id },
      func: (async () => {
        const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
        const isVisible = (el: HTMLElement) => {
          const rect = el.getBoundingClientRect()
          const style = window.getComputedStyle(el)
          return rect.width > 120 && rect.height > 120 && style.display !== 'none' && style.visibility !== 'hidden'
        }

        const imageCandidates = Array.from(document.querySelectorAll<HTMLImageElement>('article img, [data-message-author-role] img, main img'))
          .filter((img) => isVisible(img))
          .map((img) => {
            const rect = img.getBoundingClientRect()
            const score = rect.width * rect.height + rect.top
            return { img, rect, score }
          })
          .sort((a, b) => b.score - a.score)

        const candidate = imageCandidates[0]
        if (!candidate) return null

        candidate.img.scrollIntoView({ block: 'center', behavior: 'instant' })
        await sleep(120)
        candidate.img.click()
        await sleep(260)

        const modalCandidates = Array.from(document.querySelectorAll<HTMLImageElement>('img'))
          .filter((img) => isVisible(img))
          .map((img) => {
            const rect = img.getBoundingClientRect()
            const score = rect.width * rect.height
            return { img, rect, score }
          })
          .sort((a, b) => b.score - a.score)

        const selected = modalCandidates[0] || candidate
        const rect = selected.rect
        return {
          x: Math.max(0, rect.left),
          y: Math.max(0, rect.top),
          width: rect.width,
          height: rect.height,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          openedModal: true,
        }
      }) as (...args: unknown[]) => unknown,
    })

    const rect =
      (locateResult?.[0]?.result as {
        x: number
        y: number
        width: number
        height: number
        viewportWidth?: number
        viewportHeight?: number
        openedModal?: boolean
      } | null) || null
    if (!rect || rect.width < 2 || rect.height < 2) {
      setStatus('Không tìm thấy ảnh phù hợp từ hội thoại (tiến trình 3).')
      return
    }

    const tryWindowIds = Array.from(new Set<number | undefined>([target.windowId, undefined]))
    let screenshotDataUrl: string | null = null
    for (let attempt = 0; attempt < 4 && !screenshotDataUrl; attempt += 1) {
      // Ensure ChatGPT tab stays active before capture, MV3 can occasionally race here.
      if (target.id) {
        await updateTab(target.id)
      }
      if (attempt > 0) {
        await sleep(120 + attempt * 120)
      }
      for (const windowId of tryWindowIds) {
        // eslint-disable-next-line no-await-in-loop
        const shot = await captureVisibleTab(windowId)
        if (shot) {
          screenshotDataUrl = shot
          break
        }
      }
    }
    if (!screenshotDataUrl) {
      setStatus('Không thể chụp ảnh màn hình tab ChatGPT.')
      return
    }

    try {
      const parts = await splitCapturedImage(screenshotDataUrl, rect)
      if (!parts.left || !parts.right) {
        setStatus('Không thể tách ảnh thành 2 phần.')
        return
      }
      setSplitImages(parts)
      setStatus('Đã lấy và cắt đôi ảnh thành công. Có thể sao chép ảnh 1/2.')

      if (rect.openedModal) {
        await extensionChrome.scripting.executeScript({
          target: { tabId: target.id },
          func: (() => {
            const closeButton =
              (document.querySelector('button[aria-label*="Close"]') as HTMLButtonElement | null) ||
              (document.querySelector('button[aria-label*="Đóng"]') as HTMLButtonElement | null)
            closeButton?.click()
            document.dispatchEvent(
              new KeyboardEvent('keydown', {
                key: 'Escape',
                code: 'Escape',
                bubbles: true,
              }),
            )
            document.dispatchEvent(
              new KeyboardEvent('keyup', {
                key: 'Escape',
                code: 'Escape',
                bubbles: true,
              }),
            )
          }) as (...args: unknown[]) => unknown,
        })
      }
    } catch {
      setStatus('Xử lý ảnh thất bại. Hãy thử lại.')
    }
  }

  const selectedStep = processSteps.find((step) => step.id === selectedStepId) || null
  const statusLower = status.toLowerCase()
  const statusTone = statusLower.includes('không thể') || statusLower.includes('không tìm thấy') || statusLower.includes('thất bại') || statusLower.includes('lỗi')
    ? 'error'
    : statusLower.includes('đang ')
      ? 'loading'
      : statusLower.includes('đã ')
        ? 'success'
        : 'info'

  return (
    <section className="glass-panel flex h-full min-h-0 flex-col rounded-3xl p-4">
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_92px] gap-3">
        <div className="flex min-h-0 flex-col rounded-2xl border border-white/10 bg-black/30 p-3">
          <h2 className="text-sm font-semibold text-white">{selectedStep?.label || 'Tiến trình'}</h2>
          <p className="mt-1 text-[11px] text-slate-400">Nội dung chi tiết tiến trình đang chọn.</p>
          {!canUseWorkflow && !isLoadingProcessSteps && processSteps.length > 0 ? (
            <p className="mt-1 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[10px] text-amber-100">
              Bạn có thể dùng ⚡ và ✏️ để chạy thủ công từng bước. Chạy workflow tự động liên tiếp mọi bước chỉ có với VIP.
            </p>
          ) : null}
          <textarea
            readOnly
            value={
              isLoadingProcessSteps
                ? 'Đang tải dữ liệu workflow...'
                : selectedStep?.prompt || 'Chưa có dữ liệu workflow/steps từ backend.'
            }
            className="mt-2 min-h-[180px] flex-1 w-full resize-none rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2 text-[11px] text-slate-200 outline-none"
          />
          <p
            className={`mt-2 shrink-0 rounded-xl border px-3 py-2 text-[11px] ${
              statusTone === 'success'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
                : statusTone === 'error'
                  ? 'border-rose-500/30 bg-rose-500/10 text-rose-100'
                  : statusTone === 'loading'
                    ? 'border-amber-500/30 bg-amber-500/10 text-amber-100'
                    : 'border-white/10 bg-black/40 text-slate-300'
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              {statusTone === 'success' ? (
                <FiCheck className="h-3.5 w-3.5" />
              ) : statusTone === 'error' ? (
                <FiAlertTriangle className="h-3.5 w-3.5" />
              ) : statusTone === 'loading' ? (
                <FiScissors className="h-3.5 w-3.5 animate-pulse" />
              ) : (
                <FiInfo className="h-3.5 w-3.5" />
              )}
              {status}
            </span>
          </p>
        </div>

        <aside className="flex min-h-0 flex-col rounded-2xl border border-white/10 bg-black/30 p-2">
          {canUseWorkflow ? (
            <div className="mb-2 shrink-0 rounded-xl border border-white/10 bg-white/5 p-1.5">
              {isWorkflowRunning ? (
                <button
                  type="button"
                  onClick={stopWorkflowRun}
                  disabled={isWorkflowStopping}
                  className="inline-flex h-8 w-full cursor-pointer items-center justify-center rounded-lg bg-rose-500/20 text-rose-100 transition hover:bg-rose-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                  title={isWorkflowStopping ? 'Đang dừng…' : 'Dừng workflow'}
                  aria-label={isWorkflowStopping ? 'Đang dừng workflow' : 'Dừng workflow'}
                >
                  {isWorkflowStopping ? (
                    <FiRefreshCw className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <FiSquare className="h-4 w-4" aria-hidden />
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void runWorkflow()}
                  disabled={!processSteps.length || isLoadingProcessSteps}
                  className="inline-flex h-8 w-full cursor-pointer items-center justify-center rounded-lg bg-violet-500/20 text-violet-100 transition hover:bg-violet-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                  title="Chạy toàn bộ workflow"
                  aria-label="Chạy workflow"
                >
                  <FiPlay className="h-4 w-4" aria-hidden />
                </button>
              )}
            </div>
          ) : null}
          <div className="min-h-0 space-y-1.5 overflow-y-auto pr-0.5">
            {processSteps.map((step) => (
              <div key={step.id} className="rounded-xl border border-white/10 bg-white/5 p-1.5">
                <button
                  type="button"
                  onClick={() => setSelectedStepId(step.id)}
                  className={`inline-flex h-8 w-full cursor-pointer items-center justify-center gap-1 rounded-lg transition ${
                    selectedStepId === step.id
                      ? 'bg-blue-500/25 text-blue-100 ring-1 ring-blue-300/40'
                      : 'bg-white/10 text-slate-200 hover:bg-white/20'
                  }`}
                  title={`Xem chi tiết ${step.label}`}
                >
                  <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-500 px-1 text-[9px] font-bold leading-none text-white">
                    {step.id.replace('step-', '')}
                  </span>
                </button>
                <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedStepId(step.id)
                      void runFastProcess(step)
                    }}
                    disabled={isLoadingProcessSteps || !step.prompt}
                    className="inline-flex h-7 w-full cursor-pointer items-center justify-center rounded-md bg-emerald-500/25 text-emerald-100 transition hover:bg-emerald-500/35 disabled:cursor-not-allowed disabled:opacity-40"
                    title={step.id === 'step-1' ? 'Tiến trình 1 + bản nhớ tạm mới nhất, tự Enter' : 'Chạy nhanh và tự Enter'}
                  >
                    <IoFlash className="h-3.5 w-3.5 text-emerald-300" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedStepId(step.id)
                      void runFillProcess(step)
                    }}
                    disabled={isLoadingProcessSteps || !step.prompt}
                    className="inline-flex h-7 w-full cursor-pointer items-center justify-center rounded-md bg-amber-500/20 text-amber-100 transition hover:bg-amber-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                    title={step.id === 'step-1' ? 'Tiến trình 1 + bản nhớ tạm mới nhất, không Enter' : 'Điền prompt, không Enter'}
                  >
                    <FiEdit3 className="h-3.5 w-3.5 text-amber-300" />
                  </button>
                </div>
              </div>
            ))}
            {!isLoadingProcessSteps && processSteps.length === 0 ? (
              <p className="rounded-xl border border-white/10 bg-white/5 px-2 py-2 text-[10px] text-slate-400">
                Chưa có workflow/steps cho ChatGPT. Hãy tạo dữ liệu.
              </p>
            ) : null}
          </div>

          <div className="mt-2 shrink-0 rounded-xl border border-white/10 bg-white/5 p-2">
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => void extractAndSplitLatestImageFromStep3()}
                className="col-span-2 inline-flex cursor-pointer items-center justify-center rounded-md bg-blue-500/25 px-2 py-1.5 text-blue-100 transition hover:bg-blue-500/35"
                title="Lấy ảnh từ tiến trình 3 và cắt đôi"
              >
                <FiScissors className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => void (splitImages ? copyImageDataUrl(splitImages.left, 'ảnh 1', 'left') : Promise.resolve())}
                disabled={!splitImages}
                className="inline-flex cursor-pointer items-center justify-center rounded-md bg-emerald-500/25 px-2 py-1.5 text-emerald-100 transition hover:bg-emerald-500/35 disabled:cursor-not-allowed disabled:opacity-40"
                title="Sao chép ảnh 1"
              >
                <span className="relative inline-flex items-center justify-center">
                  <FiImage className="h-3.5 w-3.5" />
                  <span className="absolute -right-2 -top-2 inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-emerald-500 px-0.5 text-[8px] font-bold leading-none text-white">
                    1
                  </span>
                  <span className="absolute -left-2 -bottom-2 inline-flex h-2.5 min-w-2.5 items-center justify-center rounded-full bg-emerald-600 px-0 text-[6px] font-bold leading-none text-white">
                    {copiedPart === 'left' ? <FiCheck className="h-2 w-2" /> : <FiCopy className="h-2 w-2" />}
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => void (splitImages ? copyImageDataUrl(splitImages.right, 'ảnh 2', 'right') : Promise.resolve())}
                disabled={!splitImages}
                className="inline-flex cursor-pointer items-center justify-center rounded-md bg-emerald-500/25 px-2 py-1.5 text-emerald-100 transition hover:bg-emerald-500/35 disabled:cursor-not-allowed disabled:opacity-40"
                title="Sao chép ảnh 2"
              >
                <span className="relative inline-flex items-center justify-center">
                  <FiImage className="h-3.5 w-3.5" />
                  <span className="absolute -right-2 -top-2 inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-emerald-500 px-0.5 text-[8px] font-bold leading-none text-white">
                    2
                  </span>
                  <span className="absolute -left-2 -bottom-2 inline-flex h-2.5 min-w-2.5 items-center justify-center rounded-full bg-emerald-600 px-0 text-[6px] font-bold leading-none text-white">
                    {copiedPart === 'right' ? <FiCheck className="h-2 w-2" /> : <FiCopy className="h-2 w-2" />}
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => void extractVideoContentFromStep2(1)}
                className="inline-flex cursor-pointer items-center justify-center rounded-md bg-blue-500/20 px-2 py-1.5 text-blue-100 transition hover:bg-blue-500/30"
                title="Lấy nội dung VIDEO 1 (Tiến trình 2)"
              >
                <span className="relative inline-flex items-center justify-center">
                  <FiFilm className="h-3.5 w-3.5" />
                  <span className="absolute -right-2 -top-2 inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-blue-500 px-0.5 text-[8px] font-bold leading-none text-white">
                    1
                  </span>
                  <span className="absolute -left-2 -bottom-2 inline-flex h-2.5 min-w-2.5 items-center justify-center rounded-full bg-blue-600 px-0 text-[6px] font-bold leading-none text-white">
                    {copiedTool === 'video-1' ? <FiCheck className="h-2 w-2" /> : <FiCopy className="h-2 w-2" />}
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => void extractVideoContentFromStep2(2)}
                className="inline-flex cursor-pointer items-center justify-center rounded-md bg-blue-500/20 px-2 py-1.5 text-blue-100 transition hover:bg-blue-500/30"
                title="Lấy nội dung VIDEO 2 (Tiến trình 2)"
              >
                <span className="relative inline-flex items-center justify-center">
                  <FiFilm className="h-3.5 w-3.5" />
                  <span className="absolute -right-2 -top-2 inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-blue-500 px-0.5 text-[8px] font-bold leading-none text-white">
                    2
                  </span>
                  <span className="absolute -left-2 -bottom-2 inline-flex h-2.5 min-w-2.5 items-center justify-center rounded-full bg-blue-600 px-0 text-[6px] font-bold leading-none text-white">
                    {copiedTool === 'video-2' ? <FiCheck className="h-2 w-2" /> : <FiCopy className="h-2 w-2" />}
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => void extractStep4Content('title_plain')}
                className="inline-flex cursor-pointer items-center justify-center rounded-md bg-violet-500/20 px-2 py-1.5 text-violet-100 transition hover:bg-violet-500/30"
                title="Lấy tiêu đề thường (Tiến trình 4)"
              >
                <span className="relative inline-flex items-center justify-center">
                  <FiType className="h-3.5 w-3.5" />
                  <span className="absolute -left-2 -bottom-2 inline-flex h-2.5 min-w-2.5 items-center justify-center rounded-full bg-violet-600 px-0 text-[6px] font-bold leading-none text-white">
                    {copiedTool === 'step4-title_plain' ? <FiCheck className="h-2 w-2" /> : <FiCopy className="h-2 w-2" />}
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => void extractStep4Content('title_styled')}
                className="inline-flex cursor-pointer items-center justify-center rounded-md bg-violet-500/20 px-2 py-1.5 text-violet-100 transition hover:bg-violet-500/30"
                title="Lấy tiêu đề font kiểu (Tiến trình 4)"
              >
                <span className="relative inline-flex items-center justify-center">
                  <FiItalic className="h-3.5 w-3.5" />
                  <span className="absolute -left-2 -bottom-2 inline-flex h-2.5 min-w-2.5 items-center justify-center rounded-full bg-violet-600 px-0 text-[6px] font-bold leading-none text-white">
                    {copiedTool === 'step4-title_styled' ? <FiCheck className="h-2 w-2" /> : <FiCopy className="h-2 w-2" />}
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => void extractStep4Content('content_short')}
                className="inline-flex cursor-pointer items-center justify-center rounded-md bg-fuchsia-500/20 px-2 py-1.5 text-fuchsia-100 transition hover:bg-fuchsia-500/30"
                title="Lấy nội dung ngắn có dấu hỏi (Tiến trình 4)"
              >
                <span className="relative inline-flex items-center justify-center">
                  <FiAlignLeft className="h-3.5 w-3.5" />
                  <span className="absolute -left-2 -bottom-2 inline-flex h-2.5 min-w-2.5 items-center justify-center rounded-full bg-fuchsia-600 px-0 text-[6px] font-bold leading-none text-white">
                    {copiedTool === 'step4-content_short' ? <FiCheck className="h-2 w-2" /> : <FiCopy className="h-2 w-2" />}
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => void extractStep4Content('content_full')}
                className="inline-flex cursor-pointer items-center justify-center rounded-md bg-fuchsia-500/20 px-2 py-1.5 text-fuchsia-100 transition hover:bg-fuchsia-500/30"
                title="Lấy nội dung toàn bộ (Tiến trình 4)"
              >
                <span className="relative inline-flex items-center justify-center">
                  <FiFileText className="h-3.5 w-3.5" />
                  <span className="absolute -left-2 -bottom-2 inline-flex h-2.5 min-w-2.5 items-center justify-center rounded-full bg-fuchsia-600 px-0 text-[6px] font-bold leading-none text-white">
                    {copiedTool === 'step4-content_full' ? <FiCheck className="h-2 w-2" /> : <FiCopy className="h-2 w-2" />}
                  </span>
                </span>
              </button>
            </div>
          </div>
        </aside>
      </div>
      <div className="mt-3 rounded-2xl border border-white/10 bg-black/30 p-2">
        <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-8">
        <button
          type="button"
          onClick={() => void fillGrokWithVideoImage(1)}
          className="inline-flex h-8 cursor-pointer items-center justify-center rounded-lg bg-sky-500/20 px-2 text-sky-100 transition hover:bg-sky-500/30"
          title="Lấy ảnh 1 (VIDEO 1) và tự điền vào Grok"
        >
          <span className="relative inline-flex items-center justify-center gap-1">
            <SiX className="h-3 w-3" />
            <FiImage className="h-3 w-3" />
            <span className="absolute -right-2 -top-2 inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-sky-500 px-0.5 text-[8px] font-bold leading-none text-white">
              1
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => void fillGrokWithVideoImage(2)}
          className="inline-flex h-8 cursor-pointer items-center justify-center rounded-lg bg-sky-500/20 px-2 text-sky-100 transition hover:bg-sky-500/30"
          title="Lấy ảnh 2 (VIDEO 2) và tự điền vào Grok"
        >
          <span className="relative inline-flex items-center justify-center gap-1">
            <SiX className="h-3 w-3" />
            <FiImage className="h-3 w-3" />
            <span className="absolute -right-2 -top-2 inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-sky-500 px-0.5 text-[8px] font-bold leading-none text-white">
              2
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => void pushStep4ToWebBlog()}
          className="inline-flex h-8 cursor-pointer items-center justify-center rounded-lg bg-amber-500/20 px-2 text-amber-100 transition hover:bg-amber-500/30"
          title="Gửi tiêu đề + nội dung dài có chèn ảnh sang WebBlog"
        >
          <span className="relative inline-flex items-center justify-center gap-1">
            <RiAdminFill className="h-3 w-3" />
            <FiFileText className="h-3 w-3" />
          </span>
        </button>
        <button
          type="button"
          onClick={runGgSheetCollectTool}
          className="inline-flex h-8 cursor-pointer items-center justify-center rounded-lg bg-green-500/20 px-2 text-green-100 transition hover:bg-green-500/30"
          title="Gom dữ liệu GGSheet từ ChatGPT"
        >
          <span className="relative inline-flex items-center justify-center gap-1">
            <SiGooglesheets className="h-3 w-3" />
            <FiDownload className="h-3 w-3" />
          </span>
        </button>
        </div>
      </div>
    </section>
  )
}

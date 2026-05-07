import { useEffect, useState } from 'react'
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

const GROK_URL = 'https://grok.com/imagine/saved'
const GROK_PATTERNS = ['*://grok.com/imagine*']

const parseGrokPath = (raw?: string) => {
  if (!raw) return null
  try {
    const u = new URL(raw)
    if (u.hostname !== 'grok.com') return null
    return u.pathname.replace(/\/+$/, '')
  } catch {
    return null
  }
}

const isPreferredGrokUrl = (raw?: string) => {
  const path = parseGrokPath(raw)
  return path === '/imagine' || path === '/imagine/saved'
}

const isSavedGrokUrl = (raw?: string) => parseGrokPath(raw) === '/imagine/saved'
const isImagineRootUrl = (raw?: string) => parseGrokPath(raw) === '/imagine'

const isSupportedGrokUrl = (raw?: string) => {
  const path = parseGrokPath(raw)
  if (!path) return false
  return path === '/imagine' || path === '/imagine/saved' || path.startsWith('/imagine/post')
}

const isImaginePostUrl = (raw?: string) => {
  const path = parseGrokPath(raw)
  return Boolean(path && path.startsWith('/imagine/post'))
}

const shouldRedirectPostToImagine = (raw?: string) => {
  const path = parseGrokPath(raw)
  return Boolean(path && path.startsWith('/imagine/post/') && path !== '/imagine/post')
}

const getChrome = () => (globalThis as { chrome?: ExtensionChrome }).chrome

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms))

const queryTabs = (urlPatterns?: string[], currentWindow?: boolean, active?: boolean) =>
  new Promise<BrowserTab[]>((resolve) => {
    const extensionChrome = getChrome()
    extensionChrome?.tabs?.query?.({ url: urlPatterns, currentWindow, active }, (tabs) => resolve(tabs || []))
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

async function injectPromptToGrok(tabId: number, prompt: string, imageDataUrl?: string) {
  const extensionChrome = getChrome()
  if (!extensionChrome?.scripting?.executeScript) return false

  const result = await extensionChrome.scripting.executeScript({
    target: { tabId },
    func: (async (message: string, imageUrl?: string) => {
      const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms))
      const needle = message.slice(0, 32).trim()
      const isVisible = (el: Element | null): el is HTMLElement => {
        if (!(el instanceof HTMLElement)) return false
        const rect = el.getBoundingClientRect()
        const style = window.getComputedStyle(el)
        return rect.width > 40 && rect.height > 20 && style.display !== 'none' && style.visibility !== 'hidden'
      }

      const selectors = [
        'textarea',
        'div[contenteditable="true"][role="textbox"]',
        'div[contenteditable="true"]',
      ]
      const getBestInput = () => {
        const candidates = selectors.flatMap((selector) => Array.from(document.querySelectorAll<HTMLElement>(selector)))
        const visibles = candidates.filter((el) => isVisible(el))
        if (visibles.length === 0) return null
        const scored = visibles.map((el) => {
          const rect = el.getBoundingClientRect()
          const centerX = rect.left + rect.width / 2
          const centerY = rect.top + rect.height / 2
          const distanceX = Math.abs(centerX - window.innerWidth / 2)
          const distanceY = Math.abs(centerY - window.innerHeight * 0.86)
          const score = rect.width * rect.height - distanceX * 20 - distanceY * 35
          return { el, score }
        })
        scored.sort((a, b) => b.score - a.score)
        return scored[0].el
      }

      const input = getBestInput()
      if (!input) return { foundInput: false, wroteText: false, pastedImage: false }

      const pasteImageFirst = async (targetInput: HTMLElement) => {
        if (!imageUrl) return true
        try {
          const clearExistingImages = async () => {
            // Best-effort: remove existing attachments/thumbnails if any.
            const removeRegex = /(remove|delete|clear|xóa|xoá|gỡ|discard)/i
            const pickClickable = () =>
              Array.from(document.querySelectorAll<HTMLElement>('button,[role="button"]')).filter((el) => {
                const label = (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || '').trim()
                if (!label) return false
                if (!removeRegex.test(label)) return false
                const style = window.getComputedStyle(el)
                return style.display !== 'none' && style.visibility !== 'hidden'
              })

            for (let round = 0; round < 6; round += 1) {
              const buttons = pickClickable()
              if (buttons.length === 0) break
              // Click a few times; UI may re-render attachments list.
              buttons.slice(0, 6).forEach((btn) => {
                try {
                  btn.click()
                } catch {
                  // ignore
                }
              })
              await sleep(140)
            }
          }

          await clearExistingImages()

          const response = await fetch(imageUrl)
          const blob = await response.blob()
          const file = new File([blob], 'chatgpt-step3-image-1.png', { type: blob.type || 'image/png' })

          const dt = new DataTransfer()
          dt.items.add(file)

          const imageInput = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="file"]')).find((el) => {
            if (el.disabled) return false
            return /image/i.test(el.accept || '') || el.multiple
          })
          if (imageInput) {
            imageInput.files = dt.files
            imageInput.dispatchEvent(new Event('change', { bubbles: true }))
            await sleep(220)
            return true
          }

          const pasteEvent = new ClipboardEvent('paste', {
            bubbles: true,
            cancelable: true,
            clipboardData: dt,
          })
          targetInput.dispatchEvent(pasteEvent)

          const dropEvent = new DragEvent('drop', {
            bubbles: true,
            cancelable: true,
            dataTransfer: dt,
          })
          targetInput.dispatchEvent(dropEvent)
          await sleep(220)
          return true
        } catch {
          return false
        }
      }

      const triggerInput = (el: HTMLElement) => {
        el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: message }))
        el.dispatchEvent(new Event('change', { bubbles: true }))
      }

      const pastedImage = await pasteImageFirst(input)

      const writeText = (targetInput: HTMLElement) => {
        if (targetInput instanceof HTMLTextAreaElement) {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
          setter?.call(targetInput, message)
          triggerInput(targetInput)
          targetInput.focus()
          const caret = message.length
          targetInput.setSelectionRange(caret, caret)
          return (targetInput.value || '').includes(needle)
        }

        const range = document.createRange()
        range.selectNodeContents(targetInput)
        const selection = window.getSelection()
        selection?.removeAllRanges()
        selection?.addRange(range)
        document.execCommand('selectAll', false)
        document.execCommand('insertText', false, message)
        triggerInput(targetInput)
        targetInput.focus()
        const finalSelection = window.getSelection()
        if (finalSelection) {
          const caretRange = document.createRange()
          caretRange.selectNodeContents(targetInput)
          caretRange.collapse(false)
          finalSelection.removeAllRanges()
          finalSelection.addRange(caretRange)
        }
        return (targetInput.innerText || targetInput.textContent || '').includes(needle)
      }

      for (let attempt = 0; attempt < 4; attempt += 1) {
        const currentInput = getBestInput()
        if (!currentInput) {
          await sleep(120)
          continue
        }
        if (writeText(currentInput)) return { foundInput: true, wroteText: true, pastedImage }
        await sleep(140)
      }
      return { foundInput: true, wroteText: false, pastedImage }
    }) as (...args: unknown[]) => unknown,
    args: [prompt, imageDataUrl],
  })

  const payload = result?.[0]?.result as { foundInput?: boolean; wroteText?: boolean; pastedImage?: boolean } | undefined
  if (!payload) return false
  return payload
}

async function waitForGrokComposer(tabId: number, options?: { allowPost?: boolean }) {
  const extensionChrome = getChrome()
  if (!extensionChrome?.scripting?.executeScript) return false

  const allowPost = options?.allowPost !== false
  const attempts = 14
  for (let i = 0; i < attempts; i += 1) {
    // give Grok time to hydrate
    // eslint-disable-next-line no-await-in-loop
    await sleep(i === 0 ? 120 : 220)
    // eslint-disable-next-line no-await-in-loop
    const r = await extensionChrome.scripting.executeScript({
      target: { tabId },
      func: ((canUsePost: boolean) => {
        const path = location.pathname.replace(/\/+$/, '')
        const okPath = path === '/imagine' || path === '/imagine/saved' || (canUsePost && path === '/imagine/post')
        if (!okPath) return { ok: false, path, hasInput: false }

        const isVisible = (el: Element | null): el is HTMLElement => {
          if (!(el instanceof HTMLElement)) return false
          const rect = el.getBoundingClientRect()
          const style = window.getComputedStyle(el)
          return rect.width > 40 && rect.height > 20 && style.display !== 'none' && style.visibility !== 'hidden'
        }
        const selectors = [
          'textarea',
          'div[contenteditable="true"][role="textbox"]',
          'div[contenteditable="true"]',
        ]
        const candidates = selectors.flatMap((selector) => Array.from(document.querySelectorAll<HTMLElement>(selector)))
        const hasInput = candidates.some((el) => isVisible(el))
        return { ok: okPath, path, hasInput }
      }) as (...args: unknown[]) => unknown,
      args: [allowPost],
    })

    const payload = r?.[0]?.result as { ok?: boolean; path?: string; hasInput?: boolean } | undefined
    if (payload?.ok && payload?.hasInput) return true
  }
  return false
}

export default function GrokScreen() {
  const [status, setStatus] = useState('Đợi dữ liệu từ ChatGPT để điền vào Grok.')
  const [lastPrompt, setLastPrompt] = useState('')

  useEffect(() => {
    const onFillFromChatgpt = async (event: Event) => {
      const custom = event as CustomEvent<{ prompt?: string; imageDataUrl?: string; part?: 1 | 2 }>
      const prompt = custom.detail?.prompt?.trim() || ''
      const imageDataUrl = custom.detail?.imageDataUrl || ''
      const part = custom.detail?.part === 2 ? 2 : 1
      if (!prompt) {
        setStatus('Không có nội dung để điền vào Grok.')
        return
      }

      setLastPrompt(prompt)
      setStatus('Đang mở Grok và điền nội dung...')

      const extensionChrome = getChrome()
      if (!extensionChrome?.tabs?.query || !extensionChrome.tabs.update || !extensionChrome.tabs.create) {
        setStatus('Môi trường hiện tại không hỗ trợ tự động điền Grok.')
        return
      }

      // Luôn ưu tiên dùng tab Grok đã tồn tại trong cửa sổ hiện tại (kể cả /imagine/post),
      // tránh mở tab mới khi user đang ở ChatGPT.
      const grokTabsRaw = await queryTabs(GROK_PATTERNS, true)
      const grokTabs = grokTabsRaw.filter((t) => isSupportedGrokUrl(t.url))

      const pickBest = (tabs: BrowserTab[]) => {
        const saved = tabs.find((t) => isSavedGrokUrl(t.url))
        if (saved) return saved
        const imagineRoot = tabs.find((t) => isImagineRootUrl(t.url))
        if (imagineRoot) return imagineRoot
        const post = tabs.find((t) => isImaginePostUrl(t.url))
        if (post) return post
        return tabs[0] || null
      }

      let target: BrowserTab | null | undefined = pickBest(grokTabs)

      if (target?.id && target.url && isImaginePostUrl(target.url) && shouldRedirectPostToImagine(target.url)) {
        target = await updateTab(target.id, GROK_URL)
      } else if (target?.id && target.url && isPreferredGrokUrl(target.url)) {
        target = await updateTab(target.id)
      } else if (target?.id) {
        // Nếu là /imagine/post (root) thì chạy trên tab đó luôn.
        target = await updateTab(target.id)
      }

      if (!target?.id) {
        target = await createTab(GROK_URL)
      } else if (!isSupportedGrokUrl(target.url || '')) {
        target = await updateTab(target.id, GROK_URL)
      } else {
        target = await updateTab(target.id)
      }

      if (!target?.id) {
        setStatus('Không thể mở tab Grok.')
        return
      }

      // Nếu vừa redirect (đặc biệt từ /imagine/post/... về /imagine) cần đợi Grok hydrate xong rồi mới inject.
      const ready = await waitForGrokComposer(target.id, { allowPost: true })
      if (!ready) {
        setStatus('Đã mở Grok nhưng chưa thấy ô nhập sẵn sàng để dán.')
        return
      }

      const r = await injectPromptToGrok(target.id, prompt, imageDataUrl)
      setStatus(
        typeof r === 'object' && r?.foundInput
          ? r.wroteText
            ? imageDataUrl
              ? `Đã paste ảnh ${part} + điền VIDEO ${part} vào Grok (không Enter).`
              : 'Đã điền nội dung vào Grok (không Enter).'
            : imageDataUrl
              ? `Đã paste ảnh ${part}. Text có thể đã vào nhưng xác nhận chưa chắc (Grok hay re-render).`
              : 'Text có thể đã vào nhưng xác nhận chưa chắc (Grok hay re-render).'
          : 'Không tìm thấy ô nhập của Grok.',
      )
    }

    window.addEventListener('fill-grok-from-chatgpt-video1-image', onFillFromChatgpt as EventListener)
    return () => window.removeEventListener('fill-grok-from-chatgpt-video1-image', onFillFromChatgpt as EventListener)
  }, [])

  return (
    <section className="glass-panel flex h-full min-h-0 flex-col rounded-3xl p-4">
      <h2 className="text-sm font-semibold text-white">Grok</h2>
      <p className="mt-1 text-[11px] text-slate-400">Tự động nhận prompt ảnh từ ChatGPT và điền vào ô nhập Grok.</p>
      <p className="mt-2 shrink-0 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-[11px] text-slate-300">
        {status}
      </p>
      <div className="mt-2 flex min-h-0 flex-1 flex-col rounded-xl border border-white/10 bg-slate-900/70 p-2">
        <p className="shrink-0 text-[10px] text-slate-500">Nội dung gần nhất</p>
        <div className="mt-1 min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap text-[11px] text-slate-200">
          {lastPrompt || 'Chưa có dữ liệu.'}
        </div>
      </div>
    </section>
  )
}

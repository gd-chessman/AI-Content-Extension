/**
 * Script chạy trong ngữ cảnh trang ChatGPT qua chrome.scripting.executeScript.
 * Mỗi hàm tự chứa — không import từ app bundle.
 */

export type ChatgptWaitAssistantResponsePageResult = {
  ok: boolean
  reason: 'done' | 'timeout' | 'no_response'
  elapsedMs: number
}

/** Điền prompt vào composer; gửi nếu shouldSend. */
export async function chatgptInjectPromptPageScript(message: string, shouldSend: boolean): Promise<boolean> {
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
}

/** Chờ phản hồi assistant ổn định (không generating) sau khi có tiến triển. */
export async function chatgptWaitAssistantResponseDonePageScript(maxWaitMs: number): Promise<ChatgptWaitAssistantResponsePageResult> {
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
}

/** Bấm New chat; nếu không tìm thấy thì chuyển về chatgpt.com. Trả true nếu đã click nút. */
export async function chatgptOpenNewChatPageScript(): Promise<boolean> {
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
    const targetEl = candidates.find((el) => isMatch(el))
    if (!targetEl) return false
    targetEl.click()
    return true
  }

  if (!clickNewChatButton()) {
    window.location.href = 'https://chatgpt.com/'
    return false
  }
  await sleep(250)
  return true
}

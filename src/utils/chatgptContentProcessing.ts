/**
 * Tiện ích xử lý nội dung ChatGPT: chèn ảnh vào bài dài, nhãn loại bước 4, trích khối VIDEO.
 * Các hàm `*PageScript` dùng với chrome.scripting.executeScript (tự chứa, không import).
 */

import type { ChatgptExtractContentClipboardKind } from './chatgptExtractContent'

/** Khoảng trống phía trên khi cuộn tới nội dung trên ChatGPT (tránh dính header). */
export const CHATGPT_SCROLL_TOP_INSET_PX = 96

/** Tách theo đoạn/dòng — giữ nguyên xuống dòng trong từng đoạn (format ChatGPT). */
function splitLongContentUnits(base: string): string[] {
  const normalized = (base || '').replace(/\r\n/g, '\n')
  if (!normalized.trim()) return []

  const paragraphs = normalized.split(/\n\n/)
  if (paragraphs.length >= 2) return paragraphs

  const lines = normalized.split('\n')
  if (lines.length >= 2) return lines

  return [normalized]
}

/** Chèn một ảnh vào vùng trên–giữa nội dung dài (~22%–42% chiều dài). */
export function injectSingleImageIntoLongContent(content: string, imageUrl: string): string {
  const base = (content || '').trim()
  const imageSrc = (imageUrl || '').trim()
  if (!imageSrc) return base
  if (!base) return `<p><img src="${imageSrc}" alt="Ảnh 1" /></p>`

  const units = splitLongContentUnits(base)
  const imageBlock = `<p><img src="${imageSrc}" alt="Ảnh 1" /></p>`
  if (units.length < 2) {
    return `${base}\n\n${imageBlock}`
  }

  const n = units.length
  const upperMidStart = Math.max(0, Math.floor(n * 0.22))
  const upperMidEnd = Math.min(n - 1, Math.max(upperMidStart, Math.floor(n * 0.42)))
  const insertIdx = Math.floor((upperMidStart + upperMidEnd) / 2)

  const out: string[] = []
  units.forEach((unit, idx) => {
    out.push(unit)
    if (idx === insertIdx) out.push(imageBlock)
  })
  return out.join('\n\n')
}

export function injectImagesIntoLongContent(content: string, image1: string, image2: string): string {
  const base = (content || '').trim()
  if (!base) return ''

  const units = splitLongContentUnits(base)
  if (units.length < 3) {
    return `${base}\n\n<p><img src="${image1}" alt="Ảnh 1" /></p>\n\n<p><img src="${image2}" alt="Ảnh 2" /></p>`
  }

  const n = units.length
  const start = Math.max(1, Math.floor(n * 0.2))
  const end = Math.min(n - 2, Math.ceil(n * 0.8))
  const range = Array.from({ length: Math.max(0, end - start + 1) }, (_, i) => start + i)
  const minGap = Math.max(2, Math.floor(n * 0.2))

  const pick = (arr: number[]) => arr[Math.floor(Math.random() * arr.length)]
  const i1 = range.length > 0 ? pick(range) : Math.max(1, Math.floor(n * 0.35))
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

/** Câu/dòng có nhắc công cụ video AI — loại khỏi output VIDEO 1/2. */
const CHATGPT_VIDEO_TOOL_MENTION_RE = /\b(?:Runway|Kling|Pika|Luma|Veo|Grok)\b/i

export function lineMentionsChatgptVideoTool(line: string): boolean {
  return CHATGPT_VIDEO_TOOL_MENTION_RE.test((line || '').replace(/\s+/g, ' ').trim())
}

export function elementMentionsChatgptVideoTool(el: HTMLElement): boolean {
  return (el.innerText || '').split('\n').some((raw) => {
    const line = raw.replace(/\s+/g, ' ').trim()
    return line.length > 0 && lineMentionsChatgptVideoTool(line)
  })
}

export function stripChatgptVideoToolMentionSentences(raw: string): string {
  const source = (raw || '').replace(/\r/g, '')
  if (!source.trim()) return ''

  const lineHasVideoTool = lineMentionsChatgptVideoTool

  return source
    .split('\n')
    .map((line) => {
      const trimmed = line.trim()
      if (!trimmed) return ''
      const sentences = trimmed
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter(Boolean)
      if (sentences.length <= 1) {
        return lineHasVideoTool(trimmed) ? '' : line
      }
      const kept = sentences.filter((s) => !lineHasVideoTool(s))
      return kept.join(' ').trim()
    })
    .filter((line) => line.trim().length > 0)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function getChatgptStep4ContentKindLabel(kind: ChatgptExtractContentClipboardKind): string {
  switch (kind) {
    case 'title_plain':
      return 'tiêu đề'
    case 'title_styled':
      return 'tiêu đề font kiểu'
    case 'content_short':
      return 'nội dung ngắn'
    default:
      return 'nội dung toàn bộ'
  }
}

/** Cuộn container thread (không kéo bubble cuối vào giữa/đáy viewport) — chỉ để lazy-load nội dung dài. */
export function chatgptWarmThreadScrollContainersPageScript(): void {
  const scrollToMax = (el: HTMLElement | null | undefined) => {
    if (!el) return
    try {
      el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight)
    } catch {
      /* ignore */
    }
  }
  document.querySelectorAll<HTMLElement>('main, [role="log"], section').forEach((el) => {
    const oy = window.getComputedStyle(el).overflowY
    if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') && el.scrollHeight > el.clientHeight + 40) {
      scrollToMax(el)
    }
  })
}

/** Cuộn tới tiêu đề VIDEO 1/2 trong bubble assistant mới nhất; trả về true nếu tìm thấy. */
export function chatgptScrollToVideoBlockPageScript(videoPart: number): boolean {
  const part = videoPart === 2 ? 2 : 1
  const TOP_INSET_PX = 96

  const scrollElementWithTopInset = (el: HTMLElement) => {
    const prevScrollMarginTop = el.style.scrollMarginTop
    el.style.scrollMarginTop = `${TOP_INSET_PX}px`
    el.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'instant' })

    const alignInScrollParent = (scrollParent: HTMLElement) => {
      const er = el.getBoundingClientRect()
      const pr = scrollParent.getBoundingClientRect()
      const delta = er.top - pr.top - TOP_INSET_PX
      if (Math.abs(delta) > 2) scrollParent.scrollTop += delta
    }

    let alignedMain = false
    let parent: HTMLElement | null = el.parentElement
    while (parent && parent !== document.body) {
      const oy = window.getComputedStyle(parent).overflowY
      if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') && parent.scrollHeight > parent.clientHeight + 8) {
        alignInScrollParent(parent)
        if (parent.matches('main, [role="log"]')) alignedMain = true
      }
      parent = parent.parentElement
    }

    if (!alignedMain) {
      const main = document.querySelector<HTMLElement>('main, [role="log"]')
      if (main && main.scrollHeight > main.clientHeight + 8) alignInScrollParent(main)
    }

    if (!alignedMain) {
      const rect = el.getBoundingClientRect()
      window.scrollTo({ top: Math.max(0, window.scrollY + rect.top - TOP_INSET_PX), behavior: 'instant' })
    }

    window.requestAnimationFrame(() => {
      el.style.scrollMarginTop = prevScrollMarginTop
    })
  }

  const findNewestAssistantTurnWithVideo = (p: number): HTMLElement | null => {
    const partRe = new RegExp(`(?:🎬|🎥)?\\s*VIDEO\\s*${p}\\b`, 'i')
    const assistants = Array.from(
      document.querySelectorAll<HTMLElement>('[data-message-author-role="assistant"]'),
    ).filter((el) => Boolean((el.innerText || '').trim()))
    for (let i = assistants.length - 1; i >= 0; i -= 1) {
      if (partRe.test(assistants[i].innerText || '')) return assistants[i]
    }
    return null
  }

  const findVideoHeaderElement = (root: HTMLElement, p: number): HTMLElement | null => {
    const headerRe = new RegExp(`^(?:\\s*(?:🎬|🎥)\\s*)?VIDEO\\s*${p}\\b`, 'i')
    const headerRePlain = new RegExp(`^\\s*VIDEO\\s*${p}\\b`, 'i')
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    let textNode: Text | null
    while ((textNode = walker.nextNode() as Text | null)) {
      const chunks = (textNode.textContent || '').split('\n')
      for (const chunk of chunks) {
        const line = chunk.replace(/\s+/g, ' ').trim()
        if (!line) continue
        if (!headerRe.test(line) && !headerRePlain.test(line)) continue
        let el: HTMLElement | null = textNode.parentElement
        while (el && el !== root) {
          const tag = el.tagName
          if (/^(P|LI|H[1-6]|PRE|BLOCKQUOTE|DIV)$/i.test(tag) && el.offsetHeight > 4) return el
          el = el.parentElement
        }
        return textNode.parentElement
      }
    }
    return null
  }

  const isVideoBlockStopLine = (line: string, p: number) => {
    const t = line.trim()
    if (/^={10,}$/.test(t)) return true
    if (/^AI GENERATION SETTINGS\b/i.test(t)) return true
    if (/^STYLE TAGS\b/i.test(t)) return true
    if (/^NEGATIVE PROMPT\b/i.test(t)) return true
    if (/^Apply to all assets\b/i.test(t)) return true
    if (/^This structure ensures\b/i.test(t)) return true
    if (/^These\s+(?:\d+\s+)?prompts\s+are\s+optimized\b/i.test(t)) return true
    if (/^(?:Facebook|ChatGPT|Grok|GGSheet|WebBlog)\s*$/i.test(t)) return true
    if (p === 1) {
      if (/^🖼️\s*IMAGE\s*2\b/i.test(t)) return true
      if (/^🎬\s*IMAGE\s*2\b/i.test(t)) return true
      if (/^IMAGE\s*2\b/i.test(t)) return true
      if (/^(?:🎬|🎥)\s*VIDEO\s*2\b/i.test(t)) return true
      if (/^VIDEO\s*2\b/i.test(t)) return true
    }
    if (p === 2) {
      if (/^✅/.test(t)) return true
      if (/CONTINUITY\s+NOTES\b/i.test(t)) return true
      if (/^CONTINUITY\b/i.test(t)) return true
    }
    if (/^🔥/.test(t)) return true
    if (/^If you want\b/i.test(t)) return true
    if (/\b(?:Runway|Kling|Pika|Luma|Veo|Grok)\b/i.test(t)) return true
    return false
  }

  const isVideoHeaderLine = (line: string, p: number) => {
    const t = line.trim()
    return (
      new RegExp(`^(?:\\s*(?:🎬|🎥)\\s*)?VIDEO\\s*${p}\\b`, 'i').test(t) ||
      new RegExp(`^\\s*VIDEO\\s*${p}\\b`, 'i').test(t)
    )
  }

  const firstLineOf = (el: HTMLElement) =>
    (el.innerText || '')
      .split('\n')
      .map((l) => l.replace(/\s+/g, ' ').trim())
      .find(Boolean) || ''

  const elementHasVideoToolMention = (el: HTMLElement) =>
    (el.innerText || '').split('\n').some((raw) => {
      const line = raw.replace(/\s+/g, ' ').trim()
      return line.length > 0 && /\b(?:Runway|Kling|Pika|Luma|Veo|Grok)\b/i.test(line)
    })

  const isStopElement = (el: HTMLElement, p: number) => {
    if (elementHasVideoToolMention(el)) return true
    const line = firstLineOf(el)
    return Boolean(line) && isVideoBlockStopLine(line, p) && !isVideoHeaderLine(line, p)
  }

  const collectContentElementsAfterHeader = (root: HTMLElement, headerEl: HTMLElement, p: number): HTMLElement[] => {
    const direct: HTMLElement[] = []
    let sib: Element | null = headerEl.nextElementSibling
    while (sib && root.contains(sib)) {
      const he = sib as HTMLElement
      if (isStopElement(he, p)) break
      direct.push(he)
      sib = sib.nextElementSibling
    }
    if (direct.length > 0) {
      return direct.filter((el) => !elementHasVideoToolMention(el))
    }

    const content = new Set<HTMLElement>()
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    let started = false
    let passedHeaderLine = false
    let textNode: Text | null
    while ((textNode = walker.nextNode() as Text | null)) {
      if (!started) {
        if (headerEl.contains(textNode)) started = true
        else if (headerEl.compareDocumentPosition(textNode) & Node.DOCUMENT_POSITION_FOLLOWING) started = true
        if (!started) continue
      }
      for (const raw of (textNode.textContent || '').split('\n')) {
        const line = raw.replace(/\s+/g, ' ').trim()
        if (!line) continue
        if (isVideoHeaderLine(line, p)) {
          passedHeaderLine = true
          continue
        }
        if (!passedHeaderLine) continue
        if (isVideoBlockStopLine(line, p) || /\b(?:Runway|Kling|Pika|Luma|Veo|Grok)\b/i.test(line)) {
          return [...content].filter((el) => !elementHasVideoToolMention(el))
        }
        const host =
          textNode.parentElement?.closest<HTMLElement>('p, li, pre, blockquote, h1, h2, h3, h4, h5, h6') ||
          textNode.parentElement
        if (
          host &&
          root.contains(host) &&
          host !== root &&
          host !== headerEl &&
          !headerEl.contains(host) &&
          !elementHasVideoToolMention(host)
        ) {
          content.add(host)
        }
      }
    }
    return [...content].filter((el) => !elementHasVideoToolMention(el))
  }

  const areConsecutiveSiblings = (elements: HTMLElement[]) => {
    if (elements.length < 2) return true
    const parent = elements[0].parentElement
    if (!parent || !elements.every((el) => el.parentElement === parent)) return false
    const indexOf = (el: HTMLElement) => [...parent.children].indexOf(el)
    const indices = elements.map(indexOf).sort((a, b) => a - b)
    for (let i = 1; i < indices.length; i += 1) {
      if (indices[i] !== indices[i - 1] + 1) return false
    }
    return true
  }

  const HIGHLIGHT_MS = 5000
  const HIGHLIGHT_MARK = 'data-ai-content-ext-video-highlight'
  const CONTENT_WRAP_ATTR = 'data-ai-content-ext-video-content-wrap'
  const HIGHLIGHT_STYLE_KEYS = ['outline', 'outlineOffset', 'boxShadow', 'backgroundColor', 'borderRadius'] as const

  const unwrapContentHighlight = () => {
    document.querySelectorAll<HTMLElement>(`[${CONTENT_WRAP_ATTR}]`).forEach((wrap) => {
      const parent = wrap.parentElement
      if (!parent) return
      while (wrap.firstChild) parent.insertBefore(wrap.firstChild, wrap)
      wrap.remove()
    })
  }

  const wrapConsecutiveContentSiblings = (elements: HTMLElement[]): HTMLElement | null => {
    if (!elements.length) return null
    if (elements.length === 1) return elements[0]
    if (!areConsecutiveSiblings(elements)) return null
    const parent = elements[0].parentElement
    if (!parent) return null

    const wrap = document.createElement('div')
    wrap.setAttribute(CONTENT_WRAP_ATTR, '1')
    parent.insertBefore(wrap, elements[0])
    for (const el of elements) wrap.appendChild(el)
    return wrap
  }

  const resolveSingleContentHighlightHost = (
    root: HTMLElement,
    headerEl: HTMLElement,
    contentEls: HTMLElement[],
  ): HTMLElement | null => {
    if (!contentEls.length) return null
    if (contentEls.length === 1) return contentEls[0]

    const wrapped = wrapConsecutiveContentSiblings(contentEls)
    if (wrapped) return wrapped

    const contentTextLen = contentEls.reduce((sum, el) => sum + (el.innerText || '').length, 0)
    let candidate: HTMLElement | null = contentEls[0]
    while (candidate && root.contains(candidate)) {
      if (candidate.contains(headerEl)) {
        candidate = candidate.parentElement
        continue
      }
      const allInside = contentEls.every((el) => candidate!.contains(el))
      if (allInside) {
        const hostLen = (candidate.innerText || '').length
        if (hostLen <= contentTextLen * 1.35) return candidate
      }
      candidate = candidate.parentElement
    }
    return contentEls[0]
  }

  const removeHighlights = () => {
    unwrapContentHighlight()
    document.querySelectorAll<HTMLElement>(`[${HIGHLIGHT_MARK}]`).forEach((el) => {
      for (const key of HIGHLIGHT_STYLE_KEYS) {
        const attr = `data-ai-content-ext-prev-${key}`
        const prev = el.getAttribute(attr)
        if (prev !== null) {
          el.style[key] = prev
          el.removeAttribute(attr)
        }
      }
      el.removeAttribute(HIGHLIGHT_MARK)
    })
  }

  const applyDomHighlight = (el: HTMLElement, kind: 'block' | 'header') => {
    if (el.hasAttribute(HIGHLIGHT_MARK)) return
    el.setAttribute(HIGHLIGHT_MARK, kind)
    for (const key of HIGHLIGHT_STYLE_KEYS) {
      el.setAttribute(`data-ai-content-ext-prev-${key}`, el.style[key] || '')
    }
    if (kind === 'header') {
      el.style.outline = '3px solid rgba(96, 165, 250, 1)'
      el.style.outlineOffset = '2px'
      el.style.boxShadow = '0 0 14px rgba(59, 130, 246, 0.45)'
      el.style.backgroundColor = 'rgba(59, 130, 246, 0.12)'
      el.style.borderRadius = '6px'
      return
    }
    el.style.outline = '2px solid rgba(59, 130, 246, 0.65)'
    el.style.outlineOffset = '4px'
    el.style.boxShadow = '0 0 0 6px rgba(59, 130, 246, 0.14)'
    el.style.backgroundColor = 'rgba(59, 130, 246, 0.06)'
    el.style.borderRadius = '10px'
  }

  const turn = findNewestAssistantTurnWithVideo(part)
  if (!turn) return false

  const headerEl = findVideoHeaderElement(turn, part) || turn
  scrollElementWithTopInset(headerEl)

  removeHighlights()

  applyDomHighlight(headerEl, 'header')
  const contentElements = collectContentElementsAfterHeader(turn, headerEl, part).filter(
    (el) => el !== headerEl && !headerEl.contains(el),
  )
  const contentHost = resolveSingleContentHighlightHost(turn, headerEl, contentElements)
  if (contentHost) applyDomHighlight(contentHost, 'block')

  window.setTimeout(() => removeHighlights(), HIGHLIGHT_MS)

  return true
}

/** Cuộn + khung sáng bước trích nội dung: args[0]=kind, args[1]=promptHint, args[2]=minPercent?, args[3]=maxPercent?. */
export function chatgptScrollHighlightStep4ContentPageScript(...injectArgs: unknown[]): boolean {
  const kind = String(injectArgs[0] ?? '')
  const promptHint =
    typeof injectArgs[1] === 'string'
      ? injectArgs[1]
      : typeof injectArgs[2] === 'string'
        ? injectArgs[2]
        : ''
  const readShortCutRatiosFromInject = () => {
    const dMin = 25
    const dMax = 45
    let minP = dMin
    let maxP = dMax
    const a = injectArgs[2]
    const b = injectArgs[3]
    if (typeof a === 'number' && typeof b === 'number' && a >= 1 && b > a && b <= 100) {
      minP = a
      maxP = b
    }
    return { minRatio: minP / 100, maxRatio: maxP / 100 }
  }
  const extractKind = kind as
    | 'title_plain'
    | 'title_styled'
    | 'content_short'
    | 'content_full'
    | 'collect'
    | string
  const TOP_INSET_PX = 96
  const HIGHLIGHT_MS = 5000
  const HIGHLIGHT_MARK = 'data-ai-content-ext-video-highlight'
  const CONTENT_WRAP_ATTR = 'data-ai-content-ext-video-content-wrap'
  const HIGHLIGHT_STYLE_KEYS = ['outline', 'outlineOffset', 'boxShadow', 'backgroundColor', 'borderRadius'] as const

  const normalize = (text: string) => text.replace(/\r/g, '').trim()
  const splitParagraphs = (text: string) =>
    normalize(text)
      .split(/\n\s*\n/)
      .map((block) => block.trim())
      .filter(Boolean)

  const scrollElementWithTopInset = (el: HTMLElement) => {
    const prevScrollMarginTop = el.style.scrollMarginTop
    el.style.scrollMarginTop = `${TOP_INSET_PX}px`
    el.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'instant' })

    const alignInScrollParent = (scrollParent: HTMLElement) => {
      const er = el.getBoundingClientRect()
      const pr = scrollParent.getBoundingClientRect()
      const delta = er.top - pr.top - TOP_INSET_PX
      if (Math.abs(delta) > 2) scrollParent.scrollTop += delta
    }

    let alignedMain = false
    let parent: HTMLElement | null = el.parentElement
    while (parent && parent !== document.body) {
      const oy = window.getComputedStyle(parent).overflowY
      if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') && parent.scrollHeight > parent.clientHeight + 8) {
        alignInScrollParent(parent)
        if (parent.matches('main, [role="log"]')) alignedMain = true
      }
      parent = parent.parentElement
    }

    if (!alignedMain) {
      const main = document.querySelector<HTMLElement>('main, [role="log"]')
      if (main && main.scrollHeight > main.clientHeight + 8) alignInScrollParent(main)
    }

    if (!alignedMain) {
      const rect = el.getBoundingClientRect()
      window.scrollTo({ top: Math.max(0, window.scrollY + rect.top - TOP_INSET_PX), behavior: 'instant' })
    }

    window.requestAnimationFrame(() => {
      el.style.scrollMarginTop = prevScrollMarginTop
    })
  }

  const blockHostFromTextNode = (root: HTMLElement, textNode: Text): HTMLElement | null => {
    const host =
      textNode.parentElement?.closest<HTMLElement>('p, li, pre, blockquote, h1, h2, h3, h4, h5, h6') ||
      textNode.parentElement
    if (!host || !root.contains(host) || host === root) return null
    if (host.getAttribute('data-message-author-role') === 'assistant') return null
    return host
  }

  const elementHasVideoToolMention = (el: HTMLElement) =>
    (el.innerText || '').split('\n').some((raw) => {
      const line = raw.replace(/\s+/g, ' ').trim()
      return line.length > 0 && /\b(?:Runway|Kling|Pika|Luma|Veo|Grok)\b/i.test(line)
    })

  const unwrapContentHighlight = () => {
    document.querySelectorAll<HTMLElement>(`[${CONTENT_WRAP_ATTR}]`).forEach((wrap) => {
      const parent = wrap.parentElement
      if (!parent) return
      while (wrap.firstChild) parent.insertBefore(wrap.firstChild, wrap)
      wrap.remove()
    })
  }

  const removeHighlights = () => {
    unwrapContentHighlight()
    document.querySelectorAll<HTMLElement>(`[${HIGHLIGHT_MARK}]`).forEach((el) => {
      for (const key of HIGHLIGHT_STYLE_KEYS) {
        const attr = `data-ai-content-ext-prev-${key}`
        const prev = el.getAttribute(attr)
        if (prev !== null) {
          el.style[key] = prev
          el.removeAttribute(attr)
        }
      }
      el.removeAttribute(HIGHLIGHT_MARK)
    })
  }

  const applyDomHighlight = (
    el: HTMLElement,
    highlightKind: 'block' | 'block-short' | 'block-full' | 'header',
  ) => {
    if (el.getAttribute(HIGHLIGHT_MARK) === highlightKind) return
    el.setAttribute(HIGHLIGHT_MARK, highlightKind)
    for (const key of HIGHLIGHT_STYLE_KEYS) {
      el.setAttribute(`data-ai-content-ext-prev-${key}`, el.style[key] || '')
    }
    if (highlightKind === 'header') {
      el.style.outline = '3px solid rgba(96, 165, 250, 1)'
      el.style.outlineOffset = '2px'
      el.style.boxShadow = '0 0 14px rgba(59, 130, 246, 0.45)'
      el.style.backgroundColor = 'rgba(59, 130, 246, 0.12)'
      el.style.borderRadius = '6px'
      return
    }
    if (highlightKind === 'block-short') {
      el.style.outline = '2px solid rgba(34, 197, 94, 0.85)'
      el.style.outlineOffset = '4px'
      el.style.boxShadow = '0 0 0 6px rgba(34, 197, 94, 0.14)'
      el.style.backgroundColor = 'rgba(34, 197, 94, 0.06)'
      el.style.borderRadius = '10px'
      return
    }
    el.style.outline = '2px solid rgba(59, 130, 246, 0.65)'
    el.style.outlineOffset = '4px'
    el.style.boxShadow = '0 0 0 6px rgba(59, 130, 246, 0.14)'
    el.style.backgroundColor = 'rgba(59, 130, 246, 0.06)'
    el.style.borderRadius = '10px'
  }

  const areConsecutiveSiblings = (elements: HTMLElement[]) => {
    if (elements.length < 2) return true
    const parent = elements[0].parentElement
    if (!parent || !elements.every((el) => el.parentElement === parent)) return false
    const indexOf = (el: HTMLElement) => [...parent.children].indexOf(el)
    const indices = elements.map(indexOf).sort((a, b) => a - b)
    for (let i = 1; i < indices.length; i += 1) {
      if (indices[i] !== indices[i - 1] + 1) return false
    }
    return true
  }

  const wrapConsecutiveContentSiblings = (elements: HTMLElement[]): HTMLElement | null => {
    if (!elements.length) return null
    if (elements.length === 1) return elements[0]
    if (!areConsecutiveSiblings(elements)) return null
    const parent = elements[0].parentElement
    if (!parent) return null
    const wrap = document.createElement('div')
    wrap.setAttribute(CONTENT_WRAP_ATTR, '1')
    parent.insertBefore(wrap, elements[0])
    for (const el of elements) wrap.appendChild(el)
    return wrap
  }

  const resolveSingleContentHighlightHostStep4 = (
    root: HTMLElement,
    headerEl: HTMLElement,
    contentEls: HTMLElement[],
  ): HTMLElement | null => {
    if (!contentEls.length) return null
    if (contentEls.length === 1) return contentEls[0]
    const wrapped = wrapConsecutiveContentSiblings(contentEls)
    if (wrapped) return wrapped
    const contentTextLen = contentEls.reduce((sum, el) => sum + (el.innerText || '').length, 0)
    let candidate: HTMLElement | null = contentEls[0]
    while (candidate && root.contains(candidate)) {
      if (candidate.contains(headerEl)) {
        candidate = candidate.parentElement
        continue
      }
      if (contentEls.every((el) => candidate!.contains(el))) {
        const hostLen = (candidate.innerText || '').length
        if (hostLen <= contentTextLen * 1.35) return candidate
      }
      candidate = candidate.parentElement
    }
    return contentEls[0]
  }

  const getLargestCodeBlock = (text: string) => {
    const matches = Array.from(text.matchAll(/```(?:[a-zA-Z0-9_-]+)?\n?([\s\S]*?)```/g))
    if (!matches.length) return ''
    return matches
      .map((m) => (m[1] || '').trim())
      .sort((a, b) => b.length - a.length)[0]
  }

  const pickFullBodyOnly = (text: string) => {
    const normalized = normalize(text)
    if (!normalized) return ''
    const base = getLargestCodeBlock(normalized) || normalized
    const paragraphs = splitParagraphs(base)
    if (paragraphs.length <= 1) return base
    const firstWords = (paragraphs[0].match(/\S+/g) || []).length
    if (firstWords <= 26) return paragraphs.slice(1).join('\n\n').trim()
    return base
  }

  const SHORT_SECTION_HEADER =
    /(?:^|\n)\s*(?:#{1,6}\s*)?(?:\*\*)?(?:short\s*content|nội dung ngắn|bản ngắn|phiên bản ngắn)(?:\*\*)?\s*[:\-]?\s*(?:\n|$)/i
  const LONG_SECTION_HEADER =
    /(?:^|\n)\s*(?:#{1,6}\s*)?(?:\*\*)?(?:full[\s-]*length|long\s*content|nội dung dài|bản đầy đủ|full\s*version)(?:\*\*)?\s*[:\-]?\s*(?:\n|$)/i

  const { minRatio: SHORT_MIN_RATIO, maxRatio: SHORT_MAX_SCAN_RATIO } = readShortCutRatiosFromInject()
  const SHORT_TO_FULL_MAX_RATIO = SHORT_MAX_SCAN_RATIO

  const capShortToMaxRatioOfFull = (shortText: string, fullText: string, maxRatio = SHORT_TO_FULL_MAX_RATIO) => {
    const short = (shortText || '').trim()
    const full = (fullText || '').trim()
    if (!short || !full) return short
    const maxLen = Math.floor(full.length * maxRatio)
    if (short.length <= maxLen) return short

    let cut = short.slice(0, maxLen)
    const minKeep = Math.floor(maxLen * 0.45)

    const lastPara = cut.lastIndexOf('\n\n')
    if (lastPara >= minKeep) return cut.slice(0, lastPara).trim()

    const lastLine = cut.lastIndexOf('\n')
    if (lastLine >= minKeep) return cut.slice(0, lastLine).trim()

    const lastSentence = Math.max(cut.lastIndexOf('.'), cut.lastIndexOf('!'), cut.lastIndexOf('?'))
    if (lastSentence >= minKeep) return cut.slice(0, lastSentence + 1).trim()

    return cut.trim()
  }

  const finalizeShortContent = (shortCandidate: string, sourceText: string) =>
    capShortToMaxRatioOfFull(shortCandidate, pickFullBodyOnly(sourceText), SHORT_TO_FULL_MAX_RATIO)

  const cutAtLastQuestionInShortRange = (normalized: string, minLen: number, maxScan: number): string | null => {
    const end = Math.min(normalized.length, maxScan)
    if (end <= minLen) return null
    const slice = normalized.slice(0, end)
    const tail = slice.slice(minLen)
    const lastQ = tail.lastIndexOf('?')
    if (lastQ < 0) return null
    return slice.slice(0, minLen + lastQ + 1).trim()
  }

  const ensureMinShortLength = (
    candidate: string,
    normalized: string,
    minLen: number,
    maxScan: number,
  ): string => {
    const end = Math.min(normalized.length, maxScan)
    const s = (candidate || '').trim()
    if (s.length >= minLen) return s.length <= end ? s : normalized.slice(0, end).trim()
    let extended = normalized.slice(0, end)
    if (extended.length < minLen) extended = normalized.slice(0, minLen)
    const para = extended.lastIndexOf('\n\n')
    if (para >= Math.floor(minLen * 0.9)) return extended.slice(0, para).trim()
    return extended.trim()
  }

  const pickShort = (text: string) => {
    const full = pickFullBodyOnly(text)
    if (!full) return ''

    const normalized = normalize(full)
    const fullLen = normalized.length
    const MIN_LEN = Math.max(1, Math.floor(fullLen * SHORT_MIN_RATIO))
    const MAX_SCAN = Math.max(MIN_LEN, Math.floor(fullLen * SHORT_MAX_SCAN_RATIO))
    const shortHm = normalized.match(SHORT_SECTION_HEADER)
    const longHm = normalized.match(LONG_SECTION_HEADER)

    if (shortHm && shortHm.index !== undefined) {
      const start = shortHm.index + shortHm[0].length
      let end = normalized.length
      if (longHm && longHm.index !== undefined && longHm.index > start) {
        end = longHm.index
      } else {
        end = Math.min(normalized.length, start + MAX_SCAN)
      }
      const section = normalized.slice(start, end).trim()
      if (section.length >= MIN_LEN) {
        const byQuestion = cutAtLastQuestionInShortRange(normalized, MIN_LEN, MAX_SCAN)
        const body = ensureMinShortLength(byQuestion || section, normalized, MIN_LEN, MAX_SCAN)
        return finalizeShortContent(body, text)
      }
    }

    if (longHm && longHm.index !== undefined && longHm.index >= MIN_LEN) {
      const beforeLong = normalized.slice(0, longHm.index).trim()
      if (beforeLong.length >= MIN_LEN) {
        const byQuestion = cutAtLastQuestionInShortRange(normalized, MIN_LEN, MAX_SCAN)
        const body = ensureMinShortLength(byQuestion || beforeLong, normalized, MIN_LEN, MAX_SCAN)
        return finalizeShortContent(body, text)
      }
    }

    const searchEnd =
      longHm && longHm.index !== undefined && longHm.index > 0
        ? Math.min(longHm.index, MAX_SCAN)
        : MAX_SCAN
    const searchSpace = normalized.slice(0, searchEnd)

    const byQuestion = cutAtLastQuestionInShortRange(normalized, MIN_LEN, MAX_SCAN)
    if (byQuestion) {
      return finalizeShortContent(ensureMinShortLength(byQuestion, normalized, MIN_LEN, MAX_SCAN), text)
    }

    const lastLine = searchSpace.lastIndexOf('\n')
    if (lastLine >= MIN_LEN) {
      return finalizeShortContent(
        ensureMinShortLength(searchSpace.slice(0, lastLine).trim(), normalized, MIN_LEN, MAX_SCAN),
        text,
      )
    }
    const lastSentence = Math.max(searchSpace.lastIndexOf('.'), searchSpace.lastIndexOf('!'))
    if (lastSentence >= MIN_LEN) {
      return finalizeShortContent(
        ensureMinShortLength(searchSpace.slice(0, lastSentence + 1).trim(), normalized, MIN_LEN, MAX_SCAN),
        text,
      )
    }
    return finalizeShortContent(
      ensureMinShortLength(searchSpace.trim(), normalized, MIN_LEN, MAX_SCAN),
      text,
    )
  }

  const findExtractContentAssistantTurn = (): HTMLElement | null => {
    const normalizeCompact = (text: string) => text.replace(/\r/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
    const hint = normalizeCompact(promptHint)
    if (hint.length < 30) return null

    const turns = Array.from(document.querySelectorAll<HTMLElement>('[data-message-author-role]')).filter((el) =>
      Boolean((el.innerText || '').trim()),
    )
    const promptOverlapScore = (userText: string) => {
      const u = normalizeCompact(userText)
      if (!u) return 0
      let best = 0
      const head = hint.slice(0, Math.min(160, hint.length))
      if (head.length >= 30 && u.includes(head)) best = Math.max(best, head.length)
      const chunk = 48
      for (let i = 0; i < hint.length; i += 24) {
        const slice = hint.slice(i, i + chunk)
        if (slice.length < 28) continue
        if (u.includes(slice)) best = Math.max(best, slice.length)
      }
      return best
    }
    const isExtractContentAssistantOutput = (text: string) => {
      const t = text.replace(/\r/g, '').trim()
      if (t.length < 500) return false
      const lower = t.toLowerCase()
      let score = 0
      if (/title\s*[:-]|tiêu đề\s*[:-]/i.test(t)) score += 1
      if (/\n\s*\n/.test(t)) score += 1
      if (/\?/.test(t)) score += 1
      if (/twist ending|happy ending|full[\s-]*length|nội dung ngắn|nội dung dài|short content/i.test(lower)) {
        score += 1
      }
      return score >= 2
    }
    const lastAssistantAfterUser = (userEl: HTMLElement): HTMLElement | null => {
      const startIdx = turns.indexOf(userEl)
      if (startIdx < 0) return null
      let last: HTMLElement | null = null
      for (let j = startIdx + 1; j < turns.length; j += 1) {
        const role = (turns[j].getAttribute('data-message-author-role') || '').toLowerCase()
        if (role === 'user') break
        if (role !== 'assistant') continue
        const text = (turns[j].innerText || '').trim()
        if (text) last = turns[j]
      }
      return last
    }

    const userTurns = turns.filter(
      (el) => (el.getAttribute('data-message-author-role') || '').toLowerCase() === 'user',
    )
    if (!userTurns.length) return null

    let best: { node: HTMLElement; rank: number } | null = null
    for (let i = userTurns.length - 1; i >= 0; i -= 1) {
      const userEl = userTurns[i]
      const userNorm = normalizeCompact(userEl.innerText || '')
      const hasStepLabel = /tiến trình\s*4|step\s*4/.test(userNorm)
      const overlap = promptOverlapScore(userEl.innerText || '')
      if (!hasStepLabel && overlap < 70) continue
      const assistant = lastAssistantAfterUser(userEl)
      if (!assistant) continue
      if (!isExtractContentAssistantOutput(assistant.innerText || '')) continue
      const rank = overlap + (hasStepLabel ? 250 : 0) + i * 0.001
      if (!best || rank > best.rank) best = { node: assistant, rank }
    }
    return best?.node ?? null
  }

  const findTitleHost = (root: HTMLElement): HTMLElement | null => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    let textNode: Text | null
    while ((textNode = walker.nextNode() as Text | null)) {
      for (const chunk of (textNode.textContent || '').split('\n')) {
        const line = chunk.replace(/\s+/g, ' ').trim()
        if (!line) continue
        if (/^\s*title\s*[:-]/i.test(line) || /^\s*#{1,6}\s+\S/.test(line)) {
          const host = blockHostFromTextNode(root, textNode)
          if (host) return host
        }
      }
    }
    const blocks = Array.from(
      root.querySelectorAll<HTMLElement>('p, li, h1, h2, h3, h4, h5, h6, pre, blockquote'),
    ).filter((el) => root.contains(el) && (el.innerText || '').trim().length > 0)
    return blocks[0] || null
  }

  const orderedBlockHosts = (root: HTMLElement) =>
    Array.from(
      root.querySelectorAll<HTMLElement>('p, li, h1, h2, h3, h4, h5, h6, pre, blockquote, div'),
    ).filter((el) => {
      if (!root.contains(el) || el === root) return false
      if (el.getAttribute('data-message-author-role') === 'assistant') return false
      const turnLen = (root.innerText || '').length
      const hostLen = (el.innerText || '').length
      if (el.tagName === 'DIV' && turnLen > 400 && hostLen / turnLen > 0.55) return false
      return (el.innerText || '').trim().length > 0
    })

  const collectContentAfterTitle = (root: HTMLElement, titleHost: HTMLElement): HTMLElement[] => {
    const direct: HTMLElement[] = []
    let sib: Element | null = titleHost.nextElementSibling
    while (sib && root.contains(sib)) {
      const he = sib as HTMLElement
      if (elementHasVideoToolMention(he)) break
      direct.push(he)
      sib = sib.nextElementSibling
    }
    if (direct.length > 0) return direct.filter((el) => !elementHasVideoToolMention(el))

    const blocks = orderedBlockHosts(root)
    const titleIdx = blocks.indexOf(titleHost)
    const after = titleIdx >= 0 ? blocks.slice(titleIdx + 1) : blocks.slice(1)
    const out: HTMLElement[] = []
    for (const el of after) {
      if (elementHasVideoToolMention(el)) break
      out.push(el)
    }
    return out
  }

  const collectFullElements = (root: HTMLElement, titleHost: HTMLElement, fullRaw: string): HTMLElement[] => {
    const fullBody = pickFullBodyOnly(fullRaw)
    const targetLen = Math.max(normalize(fullBody).replace(/\s+/g, ' ').length, 1)
    let els = collectBlocksForTextLength(root, targetLen, titleHost)
    els = els.filter((el) => el !== titleHost && !titleHost.contains(el))
    if (els.length > 0) return els
    return collectContentAfterTitle(root, titleHost).filter(
      (el) => el !== titleHost && !titleHost.contains(el),
    )
  }

  const collectBlocksForTextLength = (root: HTMLElement, targetLen: number, skipHost?: HTMLElement | null) => {
    const blocks = orderedBlockHosts(root)
    const out: HTMLElement[] = []
    let len = 0
    for (const el of blocks) {
      if (skipHost && (el === skipHost || skipHost.contains(el))) continue
      if (elementHasVideoToolMention(el)) break
      out.push(el)
      len += normalize(el.innerText || '').replace(/\s+/g, ' ').length
      if (len >= targetLen) break
    }
    return out
  }

  const joinBlockTexts = (blocks: HTMLElement[]) =>
    blocks
      .map((el) => (el.innerText || '').trim())
      .filter(Boolean)
      .join('\n\n')
      .trim()

  const measureCompact = (text: string) => normalize(text).replace(/\s+/g, ' ')

  /**
   * Gom khối DOM khớp đoạn pickShort: đi tuần tự từ sau title, dừng khi đủ cut (có đuôi),
   * không slice first..last (tránh bôi cả đoạn giữa / sau hook).
   */
  const collectBlocksForShortHighlight = (
    root: HTMLElement,
    titleHost: HTMLElement,
    cut: string,
  ): HTMLElement[] => {
    if (!cut.trim()) return []
    const c = measureCompact(cut)
    if (!c) return []
    const cutLen = c.length
    const cutTailKey = c.slice(-Math.min(48, c.length))

    const allBlocks = orderedBlockHosts(root).filter((el) => {
      if (el === titleHost || titleHost.contains(el)) return false
      if (elementHasVideoToolMention(el)) return false
      return true
    })

    const out: HTMLElement[] = []
    let joined = ''

    for (const el of allBlocks) {
      out.push(el)
      joined = measureCompact(joinBlockTexts(out))
      const hasTail = cutTailKey.length >= 10 && joined.includes(cutTailKey)
      if (hasTail && joined.length >= cutLen * 0.88) break
      if (joined.length >= cutLen && hasTail) break
      if (joined.length > cutLen * 1.25) break
    }

    while (out.length > 1) {
      const j = measureCompact(joinBlockTexts(out))
      const hasTail = cutTailKey.length >= 10 && j.includes(cutTailKey)
      if (j.length <= cutLen * 1.04 && hasTail) break
      if (j.length <= cutLen) break
      const withoutLast = measureCompact(joinBlockTexts(out.slice(0, -1)))
      if (cutTailKey.length >= 10 && !withoutLast.includes(cutTailKey)) break
      out.pop()
    }

    if (out.length === 0) {
      return collectBlocksForTextLength(root, cutLen, titleHost).filter(
        (el) => el !== titleHost && !titleHost.contains(el),
      )
    }

    return out
  }

  const highlightContentBlocks = (
    turn: HTMLElement,
    titleHost: HTMLElement,
    contentEls: HTMLElement[],
    kind: 'block-short' | 'block-full',
  ): HTMLElement | null => {
    const blocks = contentEls.filter((el) => el !== titleHost && !titleHost.contains(el))
    if (!blocks.length) return null

    const wrapped = wrapConsecutiveContentSiblings([...blocks])
    if (wrapped) {
      applyDomHighlight(wrapped, kind)
      return wrapped
    }

    const totalLen = blocks.reduce((sum, el) => sum + measureCompact(el.innerText || '').length, 0)
    const host = resolveSingleContentHighlightHostStep4(turn, titleHost, blocks)
    const hostLen = host ? measureCompact(host.innerText || '').length : 0

    if (host && hostLen >= totalLen * 0.85) {
      applyDomHighlight(host, kind)
      return host
    }

    for (const el of blocks) {
      applyDomHighlight(el, kind)
    }
    return blocks[0]
  }

  const turn = findExtractContentAssistantTurn()
  if (!turn) return false

  const raw = normalize(turn.innerText || '')
  const titleHost = findTitleHost(turn)
  if (!titleHost) return false

  removeHighlights()

  const isCollect = extractKind === 'collect'
  const isTitleOnly = extractKind === 'title_plain' || extractKind === 'title_styled'
  const isShortOnly = extractKind === 'content_short'

  if (isCollect) {
    scrollElementWithTopInset(titleHost)
    applyDomHighlight(titleHost, 'header')

    const shortText = pickShort(raw)
    let shortEls = collectBlocksForShortHighlight(turn, titleHost, shortText)
    if (!shortEls.length) {
      shortEls = collectContentAfterTitle(turn, titleHost).filter(
        (el) => el !== titleHost && !titleHost.contains(el),
      )
    }

    const shortHost = highlightContentBlocks(turn, titleHost, shortEls, 'block-short')

    const blocks = orderedBlockHosts(turn)
    let fullTailEls: HTMLElement[] = []
    if (shortEls.length > 0) {
      const lastShort = shortEls[shortEls.length - 1]
      const lastIdx = blocks.indexOf(lastShort)
      if (lastIdx >= 0) {
        fullTailEls = blocks
          .slice(lastIdx + 1)
          .filter((el) => el !== titleHost && !titleHost.contains(el) && !elementHasVideoToolMention(el))
      }
    }

    if (fullTailEls.length > 0) {
      const fullTailHost = resolveSingleContentHighlightHostStep4(turn, titleHost, fullTailEls)
      if (fullTailHost) applyDomHighlight(fullTailHost, 'block-full')
    } else {
      const fullEls = collectFullElements(turn, titleHost, raw)
      const fullHost = resolveSingleContentHighlightHostStep4(turn, titleHost, fullEls)
      if (fullHost && fullHost !== shortHost) applyDomHighlight(fullHost, 'block-full')
    }
  } else if (isTitleOnly) {
    scrollElementWithTopInset(titleHost)
    applyDomHighlight(titleHost, 'header')
  } else if (isShortOnly) {
    const shortText = pickShort(raw)
    let contentEls = collectBlocksForShortHighlight(turn, titleHost, shortText)
    if (!contentEls.length) {
      contentEls = collectContentAfterTitle(turn, titleHost).filter(
        (el) => el !== titleHost && !titleHost.contains(el),
      )
    }
    const contentHost = highlightContentBlocks(turn, titleHost, contentEls, 'block-short')
    if (contentHost) {
      scrollElementWithTopInset(contentHost)
    } else {
      scrollElementWithTopInset(titleHost)
    }
  } else {
    const fullEls = collectFullElements(turn, titleHost, raw).filter(
      (el) => el !== titleHost && !titleHost.contains(el),
    )
    const contentHost = resolveSingleContentHighlightHostStep4(turn, titleHost, fullEls)
    if (contentHost) {
      scrollElementWithTopInset(contentHost)
      applyDomHighlight(contentHost, 'block-full')
    } else {
      scrollElementWithTopInset(titleHost)
      applyDomHighlight(titleHost, 'header')
    }
  }

  window.setTimeout(() => removeHighlights(), HIGHLIGHT_MS)
  return true
}

/** Trích khối VIDEO 1/2; dừng theo marker; gỡ đoạn boilerplate “These … prompts are optimized for Runway…” (có/không số; kết …progression hoặc …locking). */
export function chatgptExtractVideoBlockPageScript(videoPart: number): string {
  const part = videoPart === 2 ? 2 : 1

  const compactLines = (raw: string) => {
    const source = (raw || '').replace(/\r/g, '').trim()
    if (!source) return ''
    return source
      .split('\n')
      .map((line) => line.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join('\n')
  }

  /** Nhúng trong page script (không import được khi inject). */
  const stripVideoToolMentionSentences = (raw: string) => {
    const toolRe = /\b(?:Runway|Kling|Pika|Luma|Veo|Grok)\b/i
    const source = (raw || '').replace(/\r/g, '')
    if (!source.trim()) return ''
    const lineHasTool = (line: string) => toolRe.test(line)
    return source
      .split('\n')
      .map((line) => {
        const trimmed = line.trim()
        if (!trimmed) return ''
        const sentences = trimmed
          .split(/(?<=[.!?])\s+/)
          .map((s) => s.trim())
          .filter(Boolean)
        if (sentences.length <= 1) return lineHasTool(trimmed) ? '' : line
        const kept = sentences.filter((s) => !lineHasTool(s))
        return kept.join(' ').trim()
      })
      .filter((line) => line.trim().length > 0)
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  }

  const extractVideoBlockByLines = (full: string, p: number) => {
    const lines = full.replace(/\r/g, '').split('\n')
    /** Tiêu đề kiểu cũ: 🎬 VIDEO 1 — hoặc kiểu mới: VIDEO 1 (6 SECONDS) */
    const headerRe = new RegExp(`^\\s*(?:🎬|🎥)\\s*VIDEO\\s*${p}\\b`, 'i')
    const headerRePlain = new RegExp(`^\\s*VIDEO\\s*${p}\\b`, 'i')
    let start = -1
    for (let i = 0; i < lines.length; i++) {
      const L = lines[i]
      if (headerRe.test(L) || headerRePlain.test(L)) {
        start = i
        break
      }
    }
    if (start < 0) return ''

    const isEqualsSeparatorLine = (L: string) => {
      const t = L.trim()
      return /^={10,}$/.test(t)
    }

    const isMetadataOrFooterLine = (t: string) => {
      if (/^AI GENERATION SETTINGS\b/i.test(t)) return true
      if (/^STYLE TAGS\b/i.test(t)) return true
      if (/^NEGATIVE PROMPT\b/i.test(t)) return true
      if (/^Apply to all assets\b/i.test(t)) return true
      if (/^This structure ensures\b/i.test(t)) return true
      if (/^These\s+(?:\d+\s+)?prompts\s+are\s+optimized\b/i.test(t)) return true
      if (/^(?:Facebook|ChatGPT|Grok|GGSheet|WebBlog)\s*$/i.test(t)) return true
      return false
    }

    const isStopLine = (L: string) => {
      const t = L.trim()
      if (isEqualsSeparatorLine(L)) return true
      if (isMetadataOrFooterLine(t)) return true
      if (/\b(?:Runway|Kling|Pika|Luma|Veo|Grok)\b/i.test(t)) return true
      if (p === 1) {
        if (/^🖼️\s*IMAGE\s*2\b/i.test(t)) return true
        if (/^🎬\s*IMAGE\s*2\b/i.test(t)) return true
        if (/^IMAGE\s*2\b/i.test(t)) return true
        if (/^(?:🎬|🎥)\s*VIDEO\s*2\b/i.test(t)) return true
        if (/^VIDEO\s*2\b/i.test(t)) return true
      }
      if (p === 2) {
        if (/^✅/.test(t)) return true
        if (/CONTINUITY\s+NOTES\b/i.test(t)) return true
        if (/^CONTINUITY\b/i.test(t)) return true
      }
      if (/^🔥/.test(t)) return true
      if (/^If you want\b/i.test(t)) return true
      return false
    }

    const out: string[] = []
    for (let i = start; i < lines.length; i++) {
      if (i > start && isStopLine(lines[i])) break
      out.push(lines[i])
    }
    return out.join('\n').trim()
  }

  const extractVideoBlockRegex = (full: string, p: number) => {
    const t = full.replace(/\r/g, '')
    const starts: number[] = []
    const mEmoji = t.match(new RegExp(`(?:🎬|🎥)\\s*VIDEO\\s*${p}\\b`, 'i'))
    if (mEmoji?.index !== undefined) starts.push(mEmoji.index)
    const mPlain = t.match(new RegExp(`(^|\\n)\\s*VIDEO\\s*${p}\\b`, 'i'))
    if (mPlain && mPlain.index !== undefined) {
      starts.push(mPlain.index + (mPlain[1] === '\n' ? 1 : 0))
    }
    if (!starts.length) return ''
    const startIdx = Math.min(...starts)

    const tail = t.slice(startIdx)
    let stop = tail.length
    const eqSep = tail.search(/\n={10,}\s*(?:\n|$)/)
    if (eqSep >= 0) stop = Math.min(stop, eqSep)
    for (const rg of [
      /\n\s*AI GENERATION SETTINGS\b/i,
      /\n\s*STYLE TAGS\b/i,
      /\n\s*NEGATIVE PROMPT\b/i,
      /\n\s*Apply to all assets\b/i,
      /\n\s*This structure ensures\b/i,
      /\n\s*These\s+(?:\d+\s+)?prompts\s+are\s+optimized\b/i,
      /\n\s*(?:Facebook|ChatGPT|Grok|GGSheet|WebBlog)\s*(?=\n|$)/i,
    ]) {
      const c = tail.search(rg)
      if (c >= 0) stop = Math.min(stop, c)
    }
    if (p === 1) {
      const candidates = [
        tail.search(/\n\s*🖼️\s*IMAGE\s*2\b/i),
        tail.search(/\n\s*🎬\s*IMAGE\s*2\b/i),
        tail.search(/\n\s*IMAGE\s*2\b/i),
        tail.search(/\n\s*(?:🎬|🎥)\s*VIDEO\s*2\b/i),
        tail.search(/\n\s*VIDEO\s*2\b/i),
      ]
      for (const c of candidates) {
        if (c >= 0) stop = Math.min(stop, c)
      }
    }
    if (p === 2) {
      for (const rg of [/\n\s*CONTINUITY\s+NOTES\b/i, /\n\s*CONTINUITY\b/i]) {
        const c = tail.search(rg)
        if (c >= 0) stop = Math.min(stop, c)
      }
    }
    for (const rg of [/\n\s*✅/i, /\n\s*🔥/i, /\n\s*If you want\b/i]) {
      const c = tail.search(rg)
      if (c >= 0) stop = Math.min(stop, c)
    }
    const toolMention = tail.search(/\n[^\n]*\b(?:Runway|Kling|Pika|Luma|Veo|Grok)\b[^\n]*/i)
    if (toolMention >= 0) stop = Math.min(stop, toolMention)
    return tail.slice(0, stop).trim()
  }

  const partRe = new RegExp(`(?:🎬|🎥)?\\s*VIDEO\\s*${part}\\b`, 'i')
  const assistants = Array.from(
    document.querySelectorAll<HTMLElement>('[data-message-author-role="assistant"]'),
  ).filter((el) => Boolean((el.innerText || '').trim()))

  let candidateNode: HTMLElement | null = null
  for (let i = assistants.length - 1; i >= 0; i -= 1) {
    if (partRe.test(assistants[i].innerText || '')) {
      candidateNode = assistants[i]
      break
    }
  }
  if (!candidateNode) return ''

  const text = candidateNode.innerText || ''

  let block = extractVideoBlockByLines(text, part)
  if (!block) block = extractVideoBlockRegex(text, part)

  /** Gỡ đoạn kết kiểu ChatGPT: “These [4 ] prompts are optimized for Runway …” (nhiều biến thể kết câu). */
  const stripThesePromptsOptimizedAppendix = (raw: string) =>
    raw
      .replace(
        /These\s+\d+\s+prompts\s+are\s+optimized\s+for\s+Runway[\s\S]*?story-accurate\s+suspense\s+progression\.?/gi,
        '',
      )
      .replace(
        /These\s+prompts\s+are\s+optimized\s+for\s+Runway[\s\S]*?continuity-safe\s+character\s+locking\.?/gi,
        '',
      )
      .replace(
        /These\s+(?:\d+\s+)?prompts\s+are\s+optimized\s+for\s+Runway[\s\S]*?(?:story-accurate\s+suspense\s+progression|continuity-safe\s+character\s+locking)\.?/gi,
        '',
      )
      .replace(/\n{3,}/g, '\n\n')
      .trim()

  return compactLines(stripVideoToolMentionSentences(stripThesePromptsOptimizedAppendix(block)))
}

/** Cuộn + khung sáng khối VIDEO PROMPT (package 1 image + 1 video, hoặc định dạng VIDEO cũ). */
export function chatgptScrollToSingleVideoBlockPageScript(): boolean {
  const TOP_INSET_PX = 96

  const scrollElementWithTopInset = (el: HTMLElement) => {
    const prevScrollMarginTop = el.style.scrollMarginTop
    el.style.scrollMarginTop = `${TOP_INSET_PX}px`
    el.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'instant' })

    const alignInScrollParent = (scrollParent: HTMLElement) => {
      const er = el.getBoundingClientRect()
      const pr = scrollParent.getBoundingClientRect()
      const delta = er.top - pr.top - TOP_INSET_PX
      if (Math.abs(delta) > 2) scrollParent.scrollTop += delta
    }

    let alignedMain = false
    let parent: HTMLElement | null = el.parentElement
    while (parent && parent !== document.body) {
      const oy = window.getComputedStyle(parent).overflowY
      if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') && parent.scrollHeight > parent.clientHeight + 8) {
        alignInScrollParent(parent)
        if (parent.matches('main, [role="log"]')) alignedMain = true
      }
      parent = parent.parentElement
    }

    if (!alignedMain) {
      const main = document.querySelector<HTMLElement>('main, [role="log"]')
      if (main && main.scrollHeight > main.clientHeight + 8) alignInScrollParent(main)
    }

    if (!alignedMain) {
      const rect = el.getBoundingClientRect()
      window.scrollTo({ top: Math.max(0, window.scrollY + rect.top - TOP_INSET_PX), behavior: 'instant' })
    }

    window.requestAnimationFrame(() => {
      el.style.scrollMarginTop = prevScrollMarginTop
    })
  }

  const assistantHasVideoBlock = (text: string) =>
    /VIDEO\s+PROMPT\s*:/i.test(text) ||
    /EXACTLY\s+1\s+VIDEO\s+PROMPT/i.test(text) ||
    /(?:^|\n)\s*(?:🎬|🎥)?\s*VIDEO\b/i.test(text)

  const lineMatchesVideoScrollTarget = (line: string) => {
    const t = line.replace(/\s+/g, ' ').trim()
    if (!t) return false
    if (/^\s*VIDEO\s+PROMPT\s*:?\s*$/i.test(t) || /^\s*VIDEO\s+PROMPT\s*:/i.test(t)) return true
    if (/^\s*2\)\s*EXACTLY\s+1\s+VIDEO\s+PROMPT/i.test(t)) return true
    if (/IMAGE\s+PROMPT/i.test(t)) return false
    if (/^\s*1\)\s*EXACTLY\s+1\s+IMAGE/i.test(t)) return false
    return /^\s*(?:🎬|🎥)?\s*VIDEO\b/i.test(t) && !/VIDEO\s*[12]\b/i.test(t)
  }

  const isVideoPackageHeaderLine = (line: string) => lineMatchesVideoScrollTarget(line)

  const isVideoPackageStopLine = (line: string) => {
    const t = line.trim()
    if (!t) return false
    if (/^SEGMENT\s+\d+/i.test(t)) return false
    if (/^={10,}$/.test(t)) return true
    if (/^AI GENERATION SETTINGS\b/i.test(t)) return true
    if (/^STYLE TAGS\b/i.test(t)) return true
    if (/^NEGATIVE PROMPT\b/i.test(t)) return true
    if (/^Apply to all assets\b/i.test(t)) return true
    if (/^This structure ensures\b/i.test(t)) return true
    if (/^This package is optimized for\b/i.test(t)) return true
    if (/^These\s+(?:\d+\s+)?prompts\s+are\s+optimized\b/i.test(t)) return true
    if (/^(?:Facebook|ChatGPT|Grok|GGSheet|WebBlog)\s*$/i.test(t)) return true
    if (/^title\s*[:-]/i.test(t)) return true
    if (/^tiêu đề\s*[:-]/i.test(t)) return true
    if (/^(?:This package|These\s+(?:\d+\s+)?prompts)\s+.*\b(?:Runway|Kling|Pika|Luma|Veo|Grok)\b/i.test(t)) {
      return true
    }
    if (/^✅/.test(t)) return true
    if (/CONTINUITY\s+NOTES\b/i.test(t)) return true
    if (/^CONTINUITY\b/i.test(t)) return true
    if (/^🔥/.test(t)) return true
    if (/^If you want\b/i.test(t)) return true
    return false
  }

  const findNewestAssistantWithVideo = (): HTMLElement | null => {
    const assistants = Array.from(
      document.querySelectorAll<HTMLElement>('[data-message-author-role="assistant"]'),
    ).filter((el) => Boolean((el.innerText || '').trim()))
    for (let i = assistants.length - 1; i >= 0; i -= 1) {
      if (assistantHasVideoBlock(assistants[i].innerText || '')) return assistants[i]
    }
    return null
  }

  const findVideoHeaderElement = (root: HTMLElement): HTMLElement | null => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    let textNode: Text | null
    while ((textNode = walker.nextNode() as Text | null)) {
      for (const chunk of (textNode.textContent || '').split('\n')) {
        const line = chunk.replace(/\s+/g, ' ').trim()
        if (!line || !lineMatchesVideoScrollTarget(line)) continue
        let el: HTMLElement | null = textNode.parentElement
        while (el && el !== root) {
          const tag = el.tagName
          if (/^(P|LI|H[1-6]|PRE|BLOCKQUOTE|DIV)$/i.test(tag) && el.offsetHeight > 4) return el
          el = el.parentElement
        }
        return textNode.parentElement
      }
    }
    return null
  }

  const firstLineOf = (el: HTMLElement) =>
    (el.innerText || '')
      .split('\n')
      .map((l) => l.replace(/\s+/g, ' ').trim())
      .find(Boolean) || ''

  const elementIsVideoPackageFooter = (el: HTMLElement) =>
    (el.innerText || '').split('\n').some((raw) => {
      const line = raw.replace(/\s+/g, ' ').trim()
      return (
        line.length > 0 &&
        /^(?:This package|These\s+(?:\d+\s+)?prompts)\s+.*\b(?:Runway|Kling|Pika|Luma|Veo|Grok)\b/i.test(line)
      )
    })

  const isStopElement = (el: HTMLElement) => {
    if (elementIsVideoPackageFooter(el)) return true
    const line = firstLineOf(el)
    return Boolean(line) && isVideoPackageStopLine(line) && !isVideoPackageHeaderLine(line)
  }

  const collectContentElementsAfterHeader = (root: HTMLElement, headerEl: HTMLElement): HTMLElement[] => {
    const direct: HTMLElement[] = []
    let sib: Element | null = headerEl.nextElementSibling
    while (sib && root.contains(sib)) {
      const he = sib as HTMLElement
      if (isStopElement(he)) break
      direct.push(he)
      sib = sib.nextElementSibling
    }
    if (direct.length > 0) {
      return direct.filter((el) => !elementIsVideoPackageFooter(el))
    }

    const content = new Set<HTMLElement>()
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    let started = false
    let passedHeaderLine = false
    let textNode: Text | null
    while ((textNode = walker.nextNode() as Text | null)) {
      if (!started) {
        if (headerEl.contains(textNode)) started = true
        else if (headerEl.compareDocumentPosition(textNode) & Node.DOCUMENT_POSITION_FOLLOWING) started = true
        if (!started) continue
      }
      for (const raw of (textNode.textContent || '').split('\n')) {
        const line = raw.replace(/\s+/g, ' ').trim()
        if (!line) continue
        if (isVideoPackageHeaderLine(line)) {
          passedHeaderLine = true
          continue
        }
        if (!passedHeaderLine) continue
        if (isVideoPackageStopLine(line)) {
          return [...content].filter((el) => !elementIsVideoPackageFooter(el))
        }
        const host =
          textNode.parentElement?.closest<HTMLElement>('p, li, pre, blockquote, h1, h2, h3, h4, h5, h6') ||
          textNode.parentElement
        if (
          host &&
          root.contains(host) &&
          host !== root &&
          host !== headerEl &&
          !headerEl.contains(host) &&
          !elementIsVideoPackageFooter(host)
        ) {
          content.add(host)
        }
      }
    }
    return [...content].filter((el) => !elementIsVideoPackageFooter(el))
  }

  const areConsecutiveSiblings = (elements: HTMLElement[]) => {
    if (elements.length < 2) return true
    const parent = elements[0].parentElement
    if (!parent || !elements.every((el) => el.parentElement === parent)) return false
    const indexOf = (el: HTMLElement) => [...parent.children].indexOf(el)
    const indices = elements.map(indexOf).sort((a, b) => a - b)
    for (let i = 1; i < indices.length; i += 1) {
      if (indices[i] !== indices[i - 1] + 1) return false
    }
    return true
  }

  const HIGHLIGHT_MS = 5000
  const HIGHLIGHT_MARK = 'data-ai-content-ext-video-highlight'
  const CONTENT_WRAP_ATTR = 'data-ai-content-ext-video-content-wrap'
  const HIGHLIGHT_STYLE_KEYS = ['outline', 'outlineOffset', 'boxShadow', 'backgroundColor', 'borderRadius'] as const

  const unwrapContentHighlight = () => {
    document.querySelectorAll<HTMLElement>(`[${CONTENT_WRAP_ATTR}]`).forEach((wrap) => {
      const parent = wrap.parentElement
      if (!parent) return
      while (wrap.firstChild) parent.insertBefore(wrap.firstChild, wrap)
      wrap.remove()
    })
  }

  const wrapConsecutiveContentSiblings = (elements: HTMLElement[]): HTMLElement | null => {
    if (!elements.length) return null
    if (elements.length === 1) return elements[0]
    if (!areConsecutiveSiblings(elements)) return null
    const parent = elements[0].parentElement
    if (!parent) return null

    const wrapNode = document.createElement('div')
    wrapNode.setAttribute(CONTENT_WRAP_ATTR, '1')
    parent.insertBefore(wrapNode, elements[0])
    for (const el of elements) wrapNode.appendChild(el)
    return wrapNode
  }

  const resolveSingleContentHighlightHost = (
    root: HTMLElement,
    headerEl: HTMLElement,
    contentEls: HTMLElement[],
  ): HTMLElement | null => {
    if (!contentEls.length) return null
    if (contentEls.length === 1) return contentEls[0]

    const wrapped = wrapConsecutiveContentSiblings(contentEls)
    if (wrapped) return wrapped

    const contentTextLen = contentEls.reduce((sum, el) => sum + (el.innerText || '').length, 0)
    let candidate: HTMLElement | null = contentEls[0]
    while (candidate && root.contains(candidate)) {
      if (candidate.contains(headerEl)) {
        candidate = candidate.parentElement
        continue
      }
      const allInside = contentEls.every((el) => candidate!.contains(el))
      if (allInside) {
        const hostLen = (candidate.innerText || '').length
        if (hostLen <= contentTextLen * 1.35) return candidate
      }
      candidate = candidate.parentElement
    }
    return contentEls[0]
  }

  const removeHighlights = () => {
    unwrapContentHighlight()
    document.querySelectorAll<HTMLElement>(`[${HIGHLIGHT_MARK}]`).forEach((el) => {
      for (const key of HIGHLIGHT_STYLE_KEYS) {
        const attr = `data-ai-content-ext-prev-${key}`
        const prev = el.getAttribute(attr)
        if (prev !== null) {
          el.style[key] = prev
          el.removeAttribute(attr)
        }
      }
      el.removeAttribute(HIGHLIGHT_MARK)
    })
  }

  const applyDomHighlight = (el: HTMLElement, kind: 'block' | 'header') => {
    if (el.hasAttribute(HIGHLIGHT_MARK)) return
    el.setAttribute(HIGHLIGHT_MARK, kind)
    for (const key of HIGHLIGHT_STYLE_KEYS) {
      el.setAttribute(`data-ai-content-ext-prev-${key}`, el.style[key] || '')
    }
    if (kind === 'header') {
      el.style.outline = '3px solid rgba(96, 165, 250, 1)'
      el.style.outlineOffset = '2px'
      el.style.boxShadow = '0 0 14px rgba(59, 130, 246, 0.45)'
      el.style.backgroundColor = 'rgba(59, 130, 246, 0.12)'
      el.style.borderRadius = '6px'
      return
    }
    el.style.outline = '2px solid rgba(59, 130, 246, 0.65)'
    el.style.outlineOffset = '4px'
    el.style.boxShadow = '0 0 0 6px rgba(59, 130, 246, 0.14)'
    el.style.backgroundColor = 'rgba(59, 130, 246, 0.06)'
    el.style.borderRadius = '10px'
  }

  const turn = findNewestAssistantWithVideo()
  if (!turn) return false

  const headerEl = findVideoHeaderElement(turn) || turn
  scrollElementWithTopInset(headerEl)

  removeHighlights()

  applyDomHighlight(headerEl, 'header')
  const contentElements = collectContentElementsAfterHeader(turn, headerEl).filter(
    (el) => el !== headerEl && !headerEl.contains(el),
  )
  const contentHost = resolveSingleContentHighlightHost(turn, headerEl, contentElements)
  if (contentHost) applyDomHighlight(contentHost, 'block')

  window.setTimeout(() => removeHighlights(), HIGHLIGHT_MS)

  return true
}

/**
 * Trích khối VIDEO PROMPT duy nhất (package ChatGPT: IMAGE + VIDEO, 4 SEGMENT).
 * Bắt đầu tại `VIDEO PROMPT:` / `2) EXACTLY 1 VIDEO PROMPT`; dừng trước footer Runway.
 */
export function chatgptExtractSingleVideoBlockPageScript(): string {
  const compactLines = (raw: string) => {
    const source = (raw || '').replace(/\r/g, '').trim()
    if (!source) return ''
    return source
      .split('\n')
      .map((line) => line.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join('\n')
  }

  const stripVideoToolMentionSentences = (raw: string) => {
    const toolRe = /\b(?:Runway|Kling|Pika|Luma|Veo|Grok)\b/i
    const source = (raw || '').replace(/\r/g, '')
    if (!source.trim()) return ''
    return source
      .split('\n')
      .map((line) => {
        const trimmed = line.trim()
        if (!trimmed) return ''
        if (/^(?:This package|These\s+(?:\d+\s+)?prompts)\s+.*\b(?:Runway|Kling|Pika|Luma|Veo|Grok)\b/i.test(trimmed)) {
          return ''
        }
        const sentences = trimmed
          .split(/(?<=[.!?])\s+/)
          .map((s) => s.trim())
          .filter(Boolean)
        if (sentences.length <= 1) return toolRe.test(trimmed) ? '' : line
        const kept = sentences.filter((s) => !toolRe.test(s))
        return kept.join(' ').trim()
      })
      .filter((line) => line.trim().length > 0)
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  }

  const stripThesePromptsOptimizedAppendix = (raw: string) =>
    raw
      .replace(/This\s+package\s+is\s+optimized\s+for\s+Runway[\s\S]*$/gi, '')
      .replace(
        /These\s+\d+\s+prompts\s+are\s+optimized\s+for\s+Runway[\s\S]*?story-accurate\s+suspense\s+progression\.?/gi,
        '',
      )
      .replace(
        /These\s+prompts\s+are\s+optimized\s+for\s+Runway[\s\S]*?continuity-safe\s+character\s+locking\.?/gi,
        '',
      )
      .replace(
        /These\s+(?:\d+\s+)?prompts\s+are\s+optimized\s+for\s+Runway[\s\S]*?(?:story-accurate\s+suspense\s+progression|continuity-safe\s+character\s+locking)\.?/gi,
        '',
      )
      .replace(/\n{3,}/g, '\n\n')
      .trim()

  const isVideoPromptLabelLine = (line: string) => {
    const t = line.trim()
    return /^\s*VIDEO\s+PROMPT\s*:?\s*$/i.test(t) || /^\s*VIDEO\s+PROMPT\s*:/i.test(t)
  }

  const isVideoSectionHeaderLine = (line: string) => /^\s*2\)\s*EXACTLY\s+1\s+VIDEO\s+PROMPT/i.test(line.trim())

  const isMetadataOrFooterLine = (t: string) => {
    if (/^AI GENERATION SETTINGS\b/i.test(t)) return true
    if (/^STYLE TAGS\b/i.test(t)) return true
    if (/^NEGATIVE PROMPT\b/i.test(t)) return true
    if (/^Apply to all assets\b/i.test(t)) return true
    if (/^This structure ensures\b/i.test(t)) return true
    if (/^This package is optimized for\b/i.test(t)) return true
    if (/^These\s+(?:\d+\s+)?prompts\s+are\s+optimized\b/i.test(t)) return true
    if (/^(?:Facebook|ChatGPT|Grok|GGSheet|WebBlog)\s*$/i.test(t)) return true
    if (/^title\s*[:-]/i.test(t)) return true
    if (/^tiêu đề\s*[:-]/i.test(t)) return true
    return false
  }

  const isVideoPackageStopLine = (L: string) => {
    const t = L.trim()
    if (!t) return false
    if (/^SEGMENT\s+\d+/i.test(t)) return false
    if (/^={10,}$/.test(t)) return true
    if (isMetadataOrFooterLine(t)) return true
    if (/^(?:This package|These\s+(?:\d+\s+)?prompts)\s+.*\b(?:Runway|Kling|Pika|Luma|Veo|Grok)\b/i.test(t)) {
      return true
    }
    if (/^✅/.test(t)) return true
    if (/CONTINUITY\s+NOTES\b/i.test(t)) return true
    if (/^CONTINUITY\b/i.test(t)) return true
    if (/^🔥/.test(t)) return true
    if (/^If you want\b/i.test(t)) return true
    return false
  }

  const findVideoBlockStartLine = (lines: string[]) => {
    for (let i = 0; i < lines.length; i += 1) {
      if (isVideoPromptLabelLine(lines[i])) return i
    }
    for (let i = 0; i < lines.length; i += 1) {
      if (!isVideoSectionHeaderLine(lines[i])) continue
      for (let j = i; j < Math.min(lines.length, i + 12); j += 1) {
        if (isVideoPromptLabelLine(lines[j])) return j
      }
      return i
    }
    for (let i = 0; i < lines.length; i += 1) {
      const L = lines[i]
      if (/IMAGE\s+PROMPT/i.test(L)) continue
      if (/^\s*1\)\s*EXACTLY\s+1\s+IMAGE/i.test(L)) continue
      if (/^\s*(?:🎬|🎥)?\s*VIDEO\s*[12]\b/i.test(L)) continue
      if (/^\s*(?:🎬|🎥)?\s*VIDEO\b/i.test(L)) return i
    }
    return -1
  }

  const extractSingleVideoBlock = (full: string) => {
    const lines = full.replace(/\r/g, '').split('\n')
    const start = findVideoBlockStartLine(lines)
    if (start < 0) return ''

    const out: string[] = []
    for (let i = start; i < lines.length; i += 1) {
      if (i > start && isVideoPackageStopLine(lines[i])) break
      out.push(lines[i])
    }
    return out.join('\n').trim()
  }

  const extractSingleVideoBlockRegex = (full: string) => {
    const t = full.replace(/\r/g, '')
    const starts: number[] = []

    const mVideoPrompt = t.match(/(?:^|\n)\s*VIDEO\s+PROMPT\s*:/i)
    if (mVideoPrompt?.index !== undefined) {
      starts.push(mVideoPrompt.index + (mVideoPrompt[0].startsWith('\n') ? 1 : 0))
    }

    const mSection = t.match(/(?:^|\n)\s*2\)\s*EXACTLY\s+1\s+VIDEO\s+PROMPT\b/i)
    if (mSection?.index !== undefined) {
      const fromSection = t.slice(mSection.index)
      const inner = fromSection.match(/(?:^|\n)\s*VIDEO\s+PROMPT\s*:/i)
      if (inner?.index !== undefined) {
        starts.push(mSection.index + inner.index + (inner[0].startsWith('\n') ? 1 : 0))
      } else {
        starts.push(mSection.index + (mSection[0].startsWith('\n') ? 1 : 0))
      }
    }

    if (!starts.length) {
      const mLegacy = t.match(/(?:^|\n)\s*(?:🎬|🎥)?\s*VIDEO\b(?!\s*[12]\b)/i)
      if (mLegacy?.index !== undefined) {
        const idx = mLegacy.index + (mLegacy[0].startsWith('\n') ? 1 : 0)
        const before = t.slice(0, idx)
        if (!/IMAGE\s+PROMPT\s*:[\s\S]*$/i.test(before.slice(Math.max(0, before.length - 4000)))) {
          starts.push(idx)
        }
      }
    }

    if (!starts.length) return ''
    const startIdx = Math.min(...starts)
    const tail = t.slice(startIdx)
    let stop = tail.length

    const eqSep = tail.search(/\n={10,}\s*(?:\n|$)/)
    if (eqSep >= 0) stop = Math.min(stop, eqSep)

    for (const rg of [
      /\n\s*This package is optimized for\b/i,
      /\n\s*These\s+(?:\d+\s+)?prompts\s+are\s+optimized\b/i,
      /\n\s*AI GENERATION SETTINGS\b/i,
      /\n\s*STYLE TAGS\b/i,
      /\n\s*NEGATIVE PROMPT\b/i,
      /\n\s*Apply to all assets\b/i,
      /\n\s*This structure ensures\b/i,
      /\n\s*(?:Facebook|ChatGPT|Grok|GGSheet|WebBlog)\s*(?=\n|$)/i,
      /\n\s*title\s*[:-]/i,
      /\n\s*tiêu đề\s*[:-]/i,
    ]) {
      const c = tail.search(rg)
      if (c >= 0) stop = Math.min(stop, c)
    }
    for (const rg of [/\n\s*CONTINUITY\s+NOTES\b/i, /\n\s*CONTINUITY\b/i, /\n\s*✅/i, /\n\s*🔥/i, /\n\s*If you want\b/i]) {
      const c = tail.search(rg)
      if (c >= 0) stop = Math.min(stop, c)
    }
    return tail.slice(0, stop).trim()
  }

  const assistantHasVideoBlock = (text: string) =>
    /VIDEO\s+PROMPT\s*:/i.test(text) ||
    /EXACTLY\s+1\s+VIDEO\s+PROMPT/i.test(text) ||
    /(?:^|\n)\s*(?:🎬|🎥)?\s*VIDEO\b/i.test(text)

  const assistants = Array.from(
    document.querySelectorAll<HTMLElement>('[data-message-author-role="assistant"]'),
  ).filter((el) => Boolean((el.innerText || '').trim()))

  let candidateNode: HTMLElement | null = null
  for (let i = assistants.length - 1; i >= 0; i -= 1) {
    if (assistantHasVideoBlock(assistants[i].innerText || '')) {
      candidateNode = assistants[i]
      break
    }
  }
  if (!candidateNode) return ''

  const text = candidateNode.innerText || ''
  let block = extractSingleVideoBlock(text)
  if (!block) block = extractSingleVideoBlockRegex(text)

  return compactLines(stripVideoToolMentionSentences(stripThesePromptsOptimizedAppendix(block)))
}

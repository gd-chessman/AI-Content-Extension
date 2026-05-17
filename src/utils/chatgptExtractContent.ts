/**
 * DOM scrape for ChatGPT „Tiến trình 4“ — một nguồn logic cho GG Sheet và công cụ copy trên ChatgptScreen.
 * Phải tự chứa (không import) vì được inject qua chrome.scripting.executeScript.
 */

export type ChatgptExtractContentClipboardKind = 'title_plain' | 'title_styled' | 'content_short' | 'content_full'

export type ChatgptExtractContentCollectedForSheet = {
  title: string
  shortContent: string
  fullContent: string
}

/**
 * ready: ['ready', promptHint] → boolean
 * collect: ['collect', promptHint]
 * clipboard: ['clipboard', kind, promptHint]
 */
export function chatgptExtractContent(...args: unknown[]): ChatgptExtractContentCollectedForSheet | string | boolean | null {
  const mode = args[0] as string

  const normalizeCompact = (text: string) => text.replace(/\r/g, '').replace(/\s+/g, ' ').trim().toLowerCase()

  const listThreadTurns = () =>
    Array.from(document.querySelectorAll<HTMLElement>('[data-message-author-role]')).filter(
      (el) => (el.innerText || '').trim().length > 0,
    )

  const promptOverlapScore = (userText: string, promptHint: string) => {
    const u = normalizeCompact(userText)
    const p = normalizeCompact(promptHint)
    if (!u || !p || p.length < 30) return 0
    let best = 0
    const head = p.slice(0, Math.min(160, p.length))
    if (head.length >= 30 && u.includes(head)) best = Math.max(best, head.length)
    const chunk = 48
    for (let i = 0; i < p.length; i += 24) {
      const slice = p.slice(i, i + chunk)
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

  const lastAssistantAfterUser = (turns: HTMLElement[], userEl: HTMLElement) => {
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

  const findExtractContentAssistantTurn = (turns: HTMLElement[], promptHint: string) => {
    const userTurns = turns.filter(
      (el) => (el.getAttribute('data-message-author-role') || '').toLowerCase() === 'user',
    )
    if (!userTurns.length) return null
    let best: { node: HTMLElement; rank: number } | null = null
    for (let i = userTurns.length - 1; i >= 0; i -= 1) {
      const userEl = userTurns[i]
      const userNorm = normalizeCompact(userEl.innerText || '')
      const hasStepLabel = /tiến trình\s*4|step\s*4/.test(userNorm)
      const overlap = promptOverlapScore(userEl.innerText || '', promptHint)
      if (!hasStepLabel && overlap < 70) continue
      const assistant = lastAssistantAfterUser(turns, userEl)
      if (!assistant) continue
      if (!isExtractContentAssistantOutput(assistant.innerText || '')) continue
      const rank = overlap + (hasStepLabel ? 250 : 0) + i * 0.001
      if (!best || rank > best.rank) best = { node: assistant, rank }
    }
    return best?.node ?? null
  }

  const resolvePromptHint = () => {
    if (mode === 'clipboard') {
      if (typeof args[2] === 'string') return args[2]
      if (typeof args[3] === 'string') return args[3]
      return ''
    }
    if (typeof args[1] === 'string') return args[1]
    if (typeof args[2] === 'string') return args[2]
    return ''
  }
  const promptHint = resolvePromptHint()

  if (mode === 'ready') {
    if (normalizeCompact(promptHint).length < 30) return false
    const turns = listThreadTurns()
    return findExtractContentAssistantTurn(turns, promptHint) !== null
  }

  const extractKind =
    mode === 'clipboard' ? (args[1] as ChatgptExtractContentClipboardKind | undefined) : undefined

  if (normalizeCompact(promptHint).length < 30) {
    return mode === 'collect' ? null : ''
  }

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
  const cleanTitleEnd = (value: string) => value.trim().replace(/[.!?…,:;\s-]+$/g, '')
  const stylizeTitle = (title: string) => {
    const upper = title.toUpperCase()
    const plain = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    const styled = '𝑨𝑩𝑪𝑫𝑬𝑭𝑮𝑯𝑰𝑱𝑲𝑳𝑴𝑵𝑶𝑷𝑸𝑹𝑺𝑻𝑼𝑽𝑾𝑿𝒀𝒁'
    const styledChars = Array.from(styled)
    return upper
      .split('')
      .map((char) => {
        const index = plain.indexOf(char)
        return index >= 0 ? styledChars[index] || char : char
      })
      .join('')
  }
  const pickTitle = (text: string) => {
    const normalized = normalize(text)
    if (!normalized) return ''
    const titleLine = normalized.match(/(?:^|\n)\s*title\s*[:-]\s*([^\n]+)/i)
    if (titleLine?.[1]) return cleanTitleEnd(titleLine[1])
    const headingLine = normalized.match(/(?:^|\n)\s*#{1,6}\s*([^\n]+)/)
    if (headingLine?.[1]) return cleanTitleEnd(headingLine[1])
    const paragraphs = splitParagraphs(normalized)
    return cleanTitleEnd((paragraphs[0] || '').split('\n')[0] || '')
  }
  /** Thân bài dài (bỏ đoạn đầu ngắn nếu coi là tiêu đề); dùng cho nội dung ngắn — không ghép tiêu đề vào. */
  const pickFullBodyOnly = (text: string): { body: string; strippedShortHead: boolean } => {
    const normalized = normalize(text)
    if (!normalized) return { body: '', strippedShortHead: false }
    const blockContent = getLargestCodeBlock(normalized)
    const base = blockContent || normalized
    const paragraphs = splitParagraphs(base)
    if (paragraphs.length <= 1) return { body: base, strippedShortHead: false }
    const firstWords = (paragraphs[0].match(/\S+/g) || []).length
    if (firstWords <= 26) {
      return { body: paragraphs.slice(1).join('\n\n').trim(), strippedShortHead: true }
    }
    return { body: base, strippedShortHead: false }
  }

  /** Nội dung dài: thân + tiêu đề thường (plain) ở đầu khi đã tách đoạn đầu ngắn — không dùng font kiểu đậm. */
  const pickFull = (text: string) => {
    const { body, strippedShortHead } = pickFullBodyOnly(text)
    if (!strippedShortHead) return body
    const plainTitle = pickTitle(text)
    if (!plainTitle) return body
    if (!body) return plainTitle
    const bodyFirstLine = (body.split('\n')[0] || '').trim()
    if (bodyFirstLine === plainTitle || cleanTitleEnd(bodyFirstLine) === plainTitle) return body
    return `${plainTitle}\n\n${body}`.trim()
  }
  const pickShort = (text: string) => {
    const full = pickFullBodyOnly(text).body
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
      if (nextBreak !== undefined && nextBreak >= 0)
        return full.slice(0, qIndex + 1 + nextBreak + 1).trim()
      return untilQ
    }
    const lastLine = searchSpace.lastIndexOf('\n')
    if (lastLine >= MIN_LEN) return searchSpace.slice(0, lastLine).trim()
    const lastSentence = Math.max(searchSpace.lastIndexOf('.'), searchSpace.lastIndexOf('!'))
    if (lastSentence >= MIN_LEN) return searchSpace.slice(0, lastSentence + 1).trim()
    return searchSpace.trim()
  }

  const turns = listThreadTurns()
  if (!turns.length) return mode === 'collect' ? null : mode === 'clipboard' ? '' : null

  const measureLen = (text: string) => normalize(text).replace(/\s+/g, ' ').length

  const findTitleHost = (root: HTMLElement): HTMLElement | null => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    let textNode: Text | null
    while ((textNode = walker.nextNode() as Text | null)) {
      for (const chunk of (textNode.textContent || '').split('\n')) {
        const line = chunk.replace(/\s+/g, ' ').trim()
        if (!line) continue
        if (/^\s*title\s*[:-]/i.test(line) || /^\s*#{1,6}\s+\S/.test(line)) {
          const host =
            textNode.parentElement?.closest<HTMLElement>('p, li, pre, blockquote, h1, h2, h3, h4, h5, h6') ||
            textNode.parentElement
          if (host && root.contains(host) && host !== root) return host
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

  const elementHasVideoToolMention = (el: HTMLElement) =>
    (el.innerText || '').split('\n').some((rawLine) => {
      const line = rawLine.replace(/\s+/g, ' ').trim()
      return line.length > 0 && /\b(?:Runway|Kling|Pika|Luma|Veo|Grok)\b/i.test(line)
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

  const collectBlocksForTextLength = (
    root: HTMLElement,
    targetLen: number,
    skipHost?: HTMLElement | null,
  ): HTMLElement[] => {
    const blocks = orderedBlockHosts(root)
    const out: HTMLElement[] = []
    let len = 0
    for (const el of blocks) {
      if (skipHost && (el === skipHost || skipHost.contains(el))) continue
      if (elementHasVideoToolMention(el)) break
      out.push(el)
      len += measureLen(el.innerText || '')
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

  /** Cùng vùng DOM với khung highlight — tránh pickShort() cắt text ngắn hơn khung. */
  const pickShortFromDom = (turn: HTMLElement, raw: string) => {
    const hint = pickShort(raw)
    const titleHost = findTitleHost(turn)
    if (!titleHost) return hint

    const targetLen = Math.max(measureLen(hint), 1)
    const used = new Set<HTMLElement>()
    let blocks = collectBlocksForTextLength(turn, targetLen, titleHost).filter(
      (el) => el !== titleHost && !titleHost.contains(el),
    )
    blocks.forEach((el) => used.add(el))

    let joined = joinBlockTexts(blocks)
    if (measureLen(joined) >= targetLen) return joined || hint

    for (const el of collectContentAfterTitle(turn, titleHost)) {
      if (used.has(el)) continue
      blocks.push(el)
      used.add(el)
      joined = joinBlockTexts(blocks)
      if (measureLen(joined) >= targetLen) break
    }

    return joined || hint
  }

  const matchedAssistantNode = findExtractContentAssistantTurn(turns, promptHint)
  const raw = matchedAssistantNode ? normalize(matchedAssistantNode.innerText || '') : ''
  if (!raw) return mode === 'collect' ? null : ''

  /** Cuộn do script highlight (ChatgptScreen / GgSheet) — tránh scroll lại gây giật. */

  const plainTitle = pickTitle(raw)
  const styledTitle = stylizeTitle(plainTitle)

  const shortContent =
    matchedAssistantNode ? pickShortFromDom(matchedAssistantNode, raw) : pickShort(raw)

  if (mode === 'collect') {
    return {
      title: styledTitle,
      shortContent,
      fullContent: pickFull(raw),
    }
  }

  if (mode !== 'clipboard' || !extractKind) return null

  if (extractKind === 'title_plain') return plainTitle
  if (extractKind === 'title_styled') return styledTitle
  if (extractKind === 'content_short') return shortContent
  return pickFull(raw)
}

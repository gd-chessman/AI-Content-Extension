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

  const promptHint = (() => {
    switch (mode) {
      case 'clipboard':
        if (typeof args[2] === 'string') return args[2]
        if (typeof args[3] === 'string') return args[3]
        return ''
      case 'ready':
      case 'collect':
        if (typeof args[1] === 'string') return args[1]
        if (typeof args[2] === 'string') return args[2]
        return ''
      default:
        return ''
    }
  })()

  switch (mode) {
    case 'ready': {
      if (normalizeCompact(promptHint).length < 30) return false
      const turns = listThreadTurns()
      return findExtractContentAssistantTurn(turns, promptHint) !== null
    }
    default:
      break
  }

  const extractKind =
    mode === 'clipboard' ? (args[1] as ChatgptExtractContentClipboardKind | undefined) : undefined

  if (normalizeCompact(promptHint).length < 30) {
    switch (mode) {
      case 'collect':
        return null
      default:
        return ''
    }
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

  /** Nội dung dài: chỉ thân bài (đoạn đầu ngắn coi là tiêu đề thì bỏ, không ghép lại). */
  const pickFull = (text: string) => pickFullBodyOnly(text).body

  const SHORT_MIN_RATIO = 0.3
  const SHORT_MAX_SCAN_RATIO = 0.5
  const SHORT_TO_FULL_MAX_RATIO = SHORT_MAX_SCAN_RATIO

  /** Nếu ngắn > 50% dài thì chỉ giữ tối đa 50% độ dài nội dung dài (cắt từ cuối, ưu tiên xuống dòng / câu). */
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
    capShortToMaxRatioOfFull(shortCandidate, pickFull(sourceText), SHORT_TO_FULL_MAX_RATIO)

  const measureCompact = (text: string) => normalize(text).replace(/\s+/g, ' ')

  /** ? cuối trong [minLen, maxScan] — không cắt trước minLen (tránh ~28%). */
  const cutAtLastQuestionInShortRange = (normalized: string, minLen: number, maxScan: number): string | null => {
    const end = Math.min(normalized.length, maxScan)
    if (end <= minLen) return null
    const slice = normalized.slice(0, end)
    const tail = slice.slice(minLen)
    const lastQ = tail.lastIndexOf('?')
    if (lastQ < 0) return null
    return slice.slice(0, minLen + lastQ + 1).trim()
  }

  /** Đảm bảo nội dung ngắn ≥ minLen (30%), tối đa maxScan. */
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

  const alignExtractedShortToCut = (joined: string, cut: string): string => {
    const joinedTrim = (joined || '').trim()
    const cutTrim = (cut || '').trim()
    if (!cutTrim) return joinedTrim
    if (!joinedTrim) return cutTrim
    const j = measureCompact(joinedTrim)
    const c = measureCompact(cutTrim)
    if (j.length <= c.length) return joinedTrim
    if (c.length > 0 && j.startsWith(c)) return cutTrim
    const tail = cutTrim.slice(Math.max(0, cutTrim.length - 48))
    const idx = joinedTrim.lastIndexOf(tail)
    if (idx >= 0) return joinedTrim.slice(0, idx + tail.length).trim()
    return cutTrim
  }

  const SHORT_SECTION_HEADER =
    /(?:^|\n)\s*(?:#{1,6}\s*)?(?:\*\*)?(?:short\s*content|nội dung ngắn|bản ngắn|phiên bản ngắn)(?:\*\*)?\s*[:\-]?\s*(?:\n|$)/i
  const LONG_SECTION_HEADER =
    /(?:^|\n)\s*(?:#{1,6}\s*)?(?:\*\*)?(?:full[\s-]*length|long\s*content|nội dung dài|bản đầy đủ|full\s*version)(?:\*\*)?\s*[:\-]?\s*(?:\n|$)/i

  const pickShort = (text: string) => {
    const full = pickFullBodyOnly(text).body
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

  const turns = listThreadTurns()
  if (!turns.length) return mode === 'collect' ? null : mode === 'clipboard' ? '' : null

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

  const joinBlockTexts = (blocks: HTMLElement[]) =>
    blocks
      .map((el) => (el.innerText || '').trim())
      .filter(Boolean)
      .join('\n\n')
      .trim()

  const collectBlocksForTextLength = (
    root: HTMLElement,
    targetLen: number,
    skipHost?: HTMLElement | null,
  ) => {
    const blocks = orderedBlockHosts(root)
    const out: HTMLElement[] = []
    let len = 0
    for (const el of blocks) {
      if (skipHost && (el === skipHost || skipHost.contains(el))) continue
      if (elementHasVideoToolMention(el)) break
      out.push(el)
      len += measureCompact(el.innerText || '').length
      if (len >= targetLen) break
    }
    return out
  }

  /** Cùng logic highlight — tuần tự từ sau title, dừng khi khớp đuôi cut. */
  const collectBlocksForShortExtract = (
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

  /** Ưu tiên text từ DOM (khớp khung highlight); pickShort(raw) chỉ làm mốc cắt. */
  const extractShortContentFromDom = (turn: HTMLElement, raw: string) => {
    const titleHost = findTitleHost(turn)
    if (!titleHost) return pickShort(raw)

    const cut = pickShort(raw)
    let blocks = cut ? collectBlocksForShortExtract(turn, titleHost, cut) : []
    if (!blocks.length) {
      blocks = collectContentAfterTitle(turn, titleHost).filter(
        (el) => el !== titleHost && !titleHost.contains(el) && !elementHasVideoToolMention(el),
      )
    }

    const joined = joinBlockTexts(blocks)
    if (joined) return finalizeShortContent(alignExtractedShortToCut(joined, cut), raw)
    return finalizeShortContent(cut || '', raw)
  }

  const matchedAssistantNode = findExtractContentAssistantTurn(turns, promptHint)
  const raw = matchedAssistantNode ? normalize(matchedAssistantNode.innerText || '') : ''
  if (!raw) {
    switch (mode) {
      case 'collect':
        return null
      default:
        return ''
    }
  }

  /** Cuộn do script highlight (ChatgptScreen / GgSheet) — tránh scroll lại gây giật. */

  const plainTitle = pickTitle(raw)
  const styledTitle = stylizeTitle(plainTitle)

  const shortContent = matchedAssistantNode
    ? extractShortContentFromDom(matchedAssistantNode, raw)
    : pickShort(raw)

  switch (mode) {
    case 'collect':
      return {
        title: styledTitle,
        shortContent,
        fullContent: pickFull(raw),
      }
    case 'clipboard':
      if (!extractKind) return null
      switch (extractKind) {
        case 'title_plain':
          return plainTitle
        case 'title_styled':
          return styledTitle
        case 'content_short':
          return shortContent
        case 'content_full':
          return pickFull(raw)
        default:
          return pickFull(raw)
      }
    default:
      return null
  }
}

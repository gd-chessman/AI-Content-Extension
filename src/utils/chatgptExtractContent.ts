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
 * args[0]: 'collect' → trả `{ title (styled), shortContent, fullContent } | null`
 * args[0]: 'clipboard', args[1]: kind → trả string (rỗng nếu không tìm thấy)
 */
export function chatgptExtractContent(...args: unknown[]): ChatgptExtractContentCollectedForSheet | string | null {
  const mode = args[0] as string
  const extractKind =
    mode === 'clipboard' ? (args[1] as ChatgptExtractContentClipboardKind | undefined) : undefined

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

  const turns = Array.from(document.querySelectorAll<HTMLElement>('[data-message-author-role]')).filter(
    (el) => (el.innerText || '').trim().length > 0,
  )
  if (!turns.length) return mode === 'collect' ? null : ''

  const isStep4UserPrompt = (text: string) => {
    const t = normalize(text).toLowerCase()
    if (!t) return false
    if (/tiến trình\s*4|step\s*4/.test(t)) return true
    const hintCount = [
      /title|tiêu đề/.test(t),
      /nội dung ngắn|short content/.test(t),
      /nội dung dài|full content/.test(t),
      /full[\s-]*length|twist ending|happy ending|story/.test(t),
    ].filter(Boolean).length
    return hintCount >= 2
  }

  const isStep4AssistantOutput = (text: string) => {
    const t = normalize(text)
    if (!t) return false
    const lower = t.toLowerCase()
    const score = [
      t.length >= 800,
      /title\s*[:-]|tiêu đề\s*[:-]/i.test(t),
      /\?\s*$|\?/.test(t),
      /\n\s*\n/.test(t),
      /twist ending|happy ending|full[\s-]*length|story/i.test(lower),
    ].filter(Boolean).length
    return score >= 2
  }

  let raw = ''

  for (let i = turns.length - 1; i >= 0; i -= 1) {
    const role = (turns[i].getAttribute('data-message-author-role') || '').toLowerCase()
    if (role !== 'user') continue

    const userText = normalize(turns[i].innerText || '')
    if (!isStep4UserPrompt(userText)) continue

    for (let j = i + 1; j < turns.length; j += 1) {
      const nextRole = (turns[j].getAttribute('data-message-author-role') || '').toLowerCase()
      if (nextRole === 'user') break
      if (nextRole !== 'assistant') continue
      const assistantText = normalize(turns[j].innerText || '')
      if (!assistantText) continue
      if (!isStep4AssistantOutput(assistantText)) continue
      raw = assistantText
      break
    }

    if (raw) break
  }

  if (!raw) return mode === 'collect' ? null : ''

  const plainTitle = pickTitle(raw)
  const styledTitle = stylizeTitle(plainTitle)

  if (mode === 'collect') {
    return {
      title: styledTitle,
      shortContent: pickShort(raw),
      fullContent: pickFull(raw),
    }
  }

  if (mode !== 'clipboard' || !extractKind) return null

  if (extractKind === 'title_plain') return plainTitle
  if (extractKind === 'title_styled') return styledTitle
  if (extractKind === 'content_short') return pickShort(raw)
  return pickFull(raw)
}

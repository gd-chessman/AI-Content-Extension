/**
 * Tiện ích xử lý nội dung ChatGPT: chèn ảnh vào bài dài, nhãn loại bước 4, trích khối VIDEO.
 * Hàm `chatgptExtractVideoBlockPageScript` dùng với chrome.scripting.executeScript (tự chứa, không import).
 */

import type { ChatgptExtractContentClipboardKind } from './chatgptExtractContent'

export function injectImagesIntoLongContent(content: string, image1: string, image2: string): string {
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

/** Trích khối VIDEO 1 hoặc 2: định dạng 🎬/🎥 VIDEO N hoặc VIDEO N (6 SECONDS); dừng trước IMAGE 2 / VIDEO 2 / CONTINUITY / dòng phân cách chỉ gồm dấu = (không lấy dòng = và phần bên dưới). */
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

    const isStopLine = (L: string) => {
      const t = L.trim()
      if (isEqualsSeparatorLine(L)) return true
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
    return tail.slice(0, stop).trim()
  }

  const assistantNodes = Array.from(
    document.querySelectorAll<HTMLElement>('[data-message-author-role="assistant"], article'),
  )
    .filter((el) => (el.innerText || '').trim().length > 0)
    .reverse()

  const candidateNode =
    assistantNodes.find((el) =>
      /VIDEO\s*[12]|IMAGE\s*[12]|🎬\s*VIDEO|🎥\s*VIDEO|🖼️\s*IMAGE|CONTINUITY|6\s*SECONDS|CONNECTS TO VIDEO/i.test(
        el.innerText || '',
      ),
    ) || assistantNodes[0]
  if (!candidateNode) return ''

  candidateNode.scrollIntoView({ block: 'start', behavior: 'instant' })

  const text = candidateNode.innerText || ''

  let block = extractVideoBlockByLines(text, part)
  if (!block) block = extractVideoBlockRegex(text, part)

  return compactLines(block)
}

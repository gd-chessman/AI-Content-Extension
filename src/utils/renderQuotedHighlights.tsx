import type { ReactNode } from 'react'

/** Chỉ khớp khi có ít nhất một ký tự bên trong — bỏ qua `""`. */
const QUOTED_TEXT_PATTERN = /"[^"]+"/g

/** Tô vàng các đoạn có nội dung trong dấu ngoặc kép, ví dụ `"fbdhbvdhvd"`. */
export function renderTextWithQuotedHighlights(text: string): ReactNode {
  if (!text) return text

  const parts: Array<{ key: string; text: string; quoted: boolean }> = []
  let lastIndex = 0
  for (const match of text.matchAll(QUOTED_TEXT_PATTERN)) {
    const start = match.index ?? 0
    const quoted = match[0]
    if (start > lastIndex) {
      parts.push({ key: `t-${lastIndex}`, text: text.slice(lastIndex, start), quoted: false })
    }
    parts.push({ key: `q-${start}`, text: quoted, quoted: true })
    lastIndex = start + quoted.length
  }
  if (lastIndex < text.length) {
    parts.push({ key: `t-${lastIndex}`, text: text.slice(lastIndex), quoted: false })
  }
  if (parts.length === 0) return text

  return parts.map((part) =>
    part.quoted ? (
      <mark key={part.key} className="rounded-sm bg-yellow-400/40 px-0.5 text-yellow-50">
        {part.text}
      </mark>
    ) : (
      <span key={part.key}>{part.text}</span>
    ),
  )
}

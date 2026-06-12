export const GROK_VIDEO_PROMPT_SUFFIX =
  "The character's voice needs to match the PROMPT accurately."

/** Gắn dòng hướng dẫn giọng nói ở cuối prompt trước khi paste lên Grok. */
export function withGrokVideoPromptSuffix(prompt: string): string {
  const body = (prompt || '').trim()
  if (!body) return GROK_VIDEO_PROMPT_SUFFIX
  if (body.includes(GROK_VIDEO_PROMPT_SUFFIX)) return body
  return `${body}\n\n${GROK_VIDEO_PROMPT_SUFFIX}`
}

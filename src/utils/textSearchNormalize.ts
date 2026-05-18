/** Đổi ký tự “font kiểu” (Unicode math, fullwidth, …) về chữ Latin thường để so khớp tìm kiếm. */
export function normalizeStyledTextToPlain(text: string): string {
  if (!text) return ''
  const out: string[] = []
  for (const char of text) {
    const cp = char.codePointAt(0)
    if (cp === undefined) continue
    const plain = demathOrStyledChar(cp)
    out.push(plain ?? char)
  }
  return out.join('').normalize('NFKC')
}

export function normalizeTextForSearch(text: string): string {
  return normalizeStyledTextToPlain(text).toLowerCase()
}

export function textMatchesSearch(haystack: string, query: string): boolean {
  const q = normalizeTextForSearch(query)
  if (!q) return true
  return normalizeTextForSearch(haystack).includes(q)
}

function demathOrStyledChar(cp: number): string | null {
  if (cp >= 0x1d400 && cp <= 0x1d419) return String.fromCharCode(0x41 + (cp - 0x1d400))
  if (cp >= 0x1d41a && cp <= 0x1d433) return String.fromCharCode(0x61 + (cp - 0x1d41a))
  if (cp >= 0x1d434 && cp <= 0x1d44d) return String.fromCharCode(0x41 + (cp - 0x1d434))
  if (cp >= 0x1d44e && cp <= 0x1d467) return String.fromCharCode(0x61 + (cp - 0x1d44e))
  if (cp >= 0x1d468 && cp <= 0x1d481) return String.fromCharCode(0x41 + (cp - 0x1d468))
  if (cp >= 0x1d482 && cp <= 0x1d49b) return String.fromCharCode(0x61 + (cp - 0x1d482))
  if (cp >= 0x1d49c && cp <= 0x1d4b5) return String.fromCharCode(0x41 + (cp - 0x1d49c))
  if (cp >= 0x1d4b6 && cp <= 0x1d4cf) return String.fromCharCode(0x61 + (cp - 0x1d4b6))
  if (cp >= 0x1d4d0 && cp <= 0x1d4e9) return String.fromCharCode(0x41 + (cp - 0x1d4d0))
  if (cp >= 0x1d4ea && cp <= 0x1d503) return String.fromCharCode(0x61 + (cp - 0x1d4ea))
  if (cp >= 0x1d504 && cp <= 0x1d51d) return String.fromCharCode(0x41 + (cp - 0x1d504))
  if (cp >= 0x1d51e && cp <= 0x1d537) return String.fromCharCode(0x61 + (cp - 0x1d51e))
  if (cp >= 0x1d538 && cp <= 0x1d551) return String.fromCharCode(0x41 + (cp - 0x1d538))
  if (cp >= 0x1d552 && cp <= 0x1d56b) return String.fromCharCode(0x61 + (cp - 0x1d552))
  if (cp >= 0x1d56c && cp <= 0x1d585) return String.fromCharCode(0x41 + (cp - 0x1d56c))
  if (cp >= 0x1d586 && cp <= 0x1d59f) return String.fromCharCode(0x61 + (cp - 0x1d586))
  if (cp >= 0x1d5a0 && cp <= 0x1d5b9) return String.fromCharCode(0x41 + (cp - 0x1d5a0))
  if (cp >= 0x1d5ba && cp <= 0x1d5d3) return String.fromCharCode(0x61 + (cp - 0x1d5ba))
  if (cp >= 0x1d5d4 && cp <= 0x1d5ed) return String.fromCharCode(0x41 + (cp - 0x1d5d4))
  if (cp >= 0x1d5ee && cp <= 0x1d607) return String.fromCharCode(0x61 + (cp - 0x1d5ee))
  if (cp >= 0x1d608 && cp <= 0x1d621) return String.fromCharCode(0x41 + (cp - 0x1d608))
  if (cp >= 0x1d622 && cp <= 0x1d63b) return String.fromCharCode(0x61 + (cp - 0x1d622))
  if (cp >= 0x1d63c && cp <= 0x1d655) return String.fromCharCode(0x41 + (cp - 0x1d63c))
  if (cp >= 0x1d656 && cp <= 0x1d66f) return String.fromCharCode(0x61 + (cp - 0x1d656))
  if (cp >= 0x1d670 && cp <= 0x1d689) return String.fromCharCode(0x41 + (cp - 0x1d670))
  if (cp >= 0x1d68a && cp <= 0x1d6a3) return String.fromCharCode(0x61 + (cp - 0x1d68a))
  if (cp >= 0x1d7ce && cp <= 0x1d7d7) return String.fromCharCode(0x30 + (cp - 0x1d7ce))
  if (cp >= 0x1d7d8 && cp <= 0x1d7e1) return String.fromCharCode(0x30 + (cp - 0x1d7d8))
  if (cp >= 0x1d7e2 && cp <= 0x1d7eb) return String.fromCharCode(0x30 + (cp - 0x1d7e2))
  if (cp >= 0xff10 && cp <= 0xff19) return String.fromCharCode(0x30 + (cp - 0xff10))
  if (cp >= 0xff21 && cp <= 0xff3a) return String.fromCharCode(0x41 + (cp - 0xff21))
  if (cp >= 0xff41 && cp <= 0xff5a) return String.fromCharCode(0x61 + (cp - 0xff41))
  return null
}

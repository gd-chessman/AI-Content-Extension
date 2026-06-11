/** Chạy trong tab Facebook qua `scripting.executeScript` — phải tự chứa, không import. */

export type FacebookReelScanRow = {
  id: string
  title: string
  description: string
  views: string
  viewCount: number
  url: string
  imageUrl: string
}

export type FacebookReelScanBatchResult = {
  rows: FacebookReelScanRow[]
  stagnantRounds: number
  reachedScrollEnd: boolean
  roundsCompleted: number
  stopped: boolean
  anchorCount: number
  foundCount: number
  hasMore: boolean
}

export async function runFacebookReelScanBatch(
  minViews: number,
  maxViewsArgInner: number,
  limit: number,
  token: string,
  excludedUrls: string[],
  fullPass: boolean,
  roundsPerBatch: number,
  stagnantRoundsIn: number,
  stagnantNeeded: number,
  waitMs: number,
): Promise<FacebookReelScanBatchResult> {
  const maxViews = maxViewsArgInner > 0 ? maxViewsArgInner : Number.POSITIVE_INFINITY
  const maxPlausibleViews = 10_000_000_000

  ;(window as unknown as { __aiContentScanControl?: Record<string, { stop?: boolean }> }).__aiContentScanControl ??=
    {}
  const control = (window as unknown as { __aiContentScanControl: Record<string, { stop?: boolean }> })
    .__aiContentScanControl
  control[token] = { stop: false }
  const excludedSet = new Set(excludedUrls || [])

  const parseLocalizedViewNumber = (raw: string) => {
    const s = (raw || '').trim()
    if (!s) return NaN
    const hasComma = s.includes(',')
    const hasDot = s.includes('.')
    let normalized = s
    if (hasComma && hasDot) {
      const lastComma = s.lastIndexOf(',')
      const lastDot = s.lastIndexOf('.')
      normalized = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
    } else if (hasComma) {
      const parts = s.split(',')
      const last = parts[parts.length - 1] || ''
      normalized =
        parts.length > 1 && last.length === 3 && /^\d+$/.test(last)
          ? s.replace(/,/g, '')
          : s.replace(',', '.')
    } else if (hasDot) {
      const parts = s.split('.')
      const last = parts[parts.length - 1] || ''
      if (parts.length > 1 && last.length === 3 && parts.every((p) => /^\d+$/.test(p))) {
        normalized = s.replace(/\./g, '')
      }
    }
    const n = Number(normalized)
    return Number.isFinite(n) ? n : NaN
  }

  const applyViewCountUnit = (value: number, unit: string) => {
    const u = (unit || '').toLowerCase()
    if (!u) return Math.round(value)
    if (value >= 100_000) return Math.round(value)
    if (u === 'k' || u === 'nghìn') return Math.round(value * 1_000)
    if (u === 'm' || u === 'triệu') return Math.round(value * 1_000_000)
    if (u === 'b' || u === 'tỷ') return Math.round(value * 1_000_000_000)
    return Math.round(value)
  }

  const parseViewLine = (line: string) => {
    const labeled = line.match(/([\d.,]+)\s*(k|m|b|nghìn|triệu|tỷ)?\s*(lượt xem|views?)/i)
    if (labeled) {
      const value = parseLocalizedViewNumber(labeled[1])
      if (!Number.isFinite(value)) return null
      return applyViewCountUnit(value, labeled[2] || '')
    }
    const compact = line.match(/([\d.,]+)\s*(k|m|b|nghìn|triệu|tỷ)\b/i)
    if (compact) {
      const value = parseLocalizedViewNumber(compact[1])
      if (!Number.isFinite(value)) return null
      return applyViewCountUnit(value, compact[2] || '')
    }
    return null
  }

  const parseViewCount = (text: string) => {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
    for (const line of lines) {
      if (!/lượt xem|views?/i.test(line)) continue
      const n = parseViewLine(line)
      if (n != null && n > 0 && n <= maxPlausibleViews) return n
    }
    for (const line of lines) {
      const n = parseViewLine(line)
      if (n != null && n > 0 && n <= maxPlausibleViews) return n
    }
    const withLabel = text.match(/([\d.,]+)\s*(k|m|b|nghìn|triệu|tỷ)?\s*(lượt xem|views?)/i)
    if (withLabel) {
      const value = parseLocalizedViewNumber(withLabel[1])
      if (Number.isFinite(value)) {
        const n = applyViewCountUnit(value, withLabel[2] || '')
        if (n > 0 && n <= maxPlausibleViews) return n
      }
    }
    const generic = text.match(/([\d.,]+)\s*(k|m|b|nghìn|triệu|tỷ)\b/i)
    if (generic) {
      const value = parseLocalizedViewNumber(generic[1])
      if (Number.isFinite(value)) {
        const n = applyViewCountUnit(value, generic[2] || '')
        if (n > 0 && n <= maxPlausibleViews) return n
      }
    }
    return null
  }

  const formatViewCount = (viewCount: number) => {
    const n = Math.max(0, Math.round(viewCount))
    if (n >= 1_000_000_000) {
      const b = n / 1_000_000_000
      return `${b >= 10 ? Math.round(b) : b.toFixed(1).replace(/\.0$/, '')}B`
    }
    if (n >= 1_000_000) {
      const m = n / 1_000_000
      return `${m >= 10 ? Math.round(m) : m.toFixed(1).replace(/\.0$/, '')}M`
    }
    if (n >= 1_000) {
      const k = n / 1_000
      return `${k >= 10 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, '')}K`
    }
    return String(n)
  }

  type Row = FacebookReelScanRow

  const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms))

  type ScrollRootCache = { el: HTMLElement; at: number }
  const scrollRootStore = window as unknown as { __aiContentFbScrollRoot?: ScrollRootCache }
  const SCROLL_ROOT_TTL_MS = 12_000

  const findScrollRoot = (): HTMLElement => {
    const now = Date.now()
    const cached = scrollRootStore.__aiContentFbScrollRoot
    if (cached && now - cached.at < SCROLL_ROOT_TTL_MS) {
      try {
        if (cached.el.isConnected && cached.el.scrollHeight > cached.el.clientHeight + 40) {
          return cached.el
        }
      } catch {
        /* ignore */
      }
    }

    const candidates: (HTMLElement | null)[] = [
      document.querySelector('#scrollview') as HTMLElement | null,
      document.querySelector('[role="main"]') as HTMLElement | null,
      document.querySelector('div[data-pagelet*="Reels"]') as HTMLElement | null,
    ]
    for (const direct of candidates) {
      if (direct && direct.scrollHeight > direct.clientHeight + 80) {
        scrollRootStore.__aiContentFbScrollRoot = { el: direct, at: now }
        return direct
      }
    }

    let best: HTMLElement | null = null
    let bestScore = 0
    const visit = (el: Element, depth: number) => {
      if (depth > 14 || !(el instanceof HTMLElement)) return
      const style = window.getComputedStyle(el)
      const oy = style.overflowY
      if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') && el.scrollHeight > el.clientHeight + 80) {
        const score = el.scrollHeight * el.clientWidth
        if (score > bestScore) {
          bestScore = score
          best = el
        }
      }
      for (const child of el.children) {
        visit(child, depth + 1)
      }
    }
    visit(document.body, 0)

    const picked = best || (document.scrollingElement as HTMLElement) || document.documentElement
    scrollRootStore.__aiContentFbScrollRoot = { el: picked, at: now }
    return picked
  }

  const isAtScrollBottom = (root: HTMLElement) => {
    const tolerance = 56
    const isDocRoot =
      root === document.documentElement ||
      root === document.body ||
      root === (document.scrollingElement as HTMLElement | null)

    if (!isDocRoot) {
      const maxTop = Math.max(0, root.scrollHeight - root.clientHeight)
      if (maxTop > 80 && root.scrollTop >= maxTop - tolerance) return true
    }

    const doc = document.documentElement
    const scrollMax = Math.max(0, doc.scrollHeight - window.innerHeight)
    return window.scrollY >= scrollMax - tolerance
  }

  /** Chỉ cuộn xuống — không dùng scrollIntoView (dễ kéo ngược lên đầu feed). */
  const scrollFeedDown = (root: HTMLElement) => {
    if (isAtScrollBottom(root)) return false

    const delta = Math.max(Math.floor((root.clientHeight || window.innerHeight) * 0.88), 560)
    const isDocRoot =
      root === document.documentElement ||
      root === document.body ||
      root === (document.scrollingElement as HTMLElement | null)

    if (!isDocRoot) {
      const maxTop = Math.max(0, root.scrollHeight - root.clientHeight)
      if (root.scrollTop < maxTop - 4) {
        root.scrollTop = Math.min(root.scrollTop + delta, maxTop)
      }
    }

    window.scrollBy(0, delta)
    return true
  }

  const uniqueByUrl = new Map<string, Row>()

  const scrapePass = () => {
    const anchors = Array.from(
      document.querySelectorAll<HTMLAnchorElement>('a[href*="/reel/"], a[href*="reel_id="]'),
    )

    for (const anchor of anchors) {
      const href = anchor.getAttribute('href')
      if (!href) continue

      const url = new URL(href, location.origin).toString()
      if (uniqueByUrl.has(url) || excludedSet.has(url)) continue

      const container = (anchor.closest('div[role="article"]') || anchor.closest('div')) as HTMLElement | null
      const ariaTexts = Array.from(container?.querySelectorAll<HTMLElement>('[aria-label]') || [])
        .map((element) => element.getAttribute('aria-label') || '')
        .join('\n')
      const containerText = container?.innerText || container?.textContent || ''
      const text = `${containerText}\n${anchor.innerText || ''}\n${ariaTexts}`.trim()
      if (!text) continue

      const viewCount = parseViewCount(text)
      if (!viewCount || viewCount < minViews || viewCount > maxViews) continue

      const title = (
        anchor.getAttribute('aria-label') || text.split('\n').find((line) => line.trim().length > 0) || 'Reel'
      )
        .trim()
        .slice(0, 120)

      const captionSource = (ariaTexts || anchor.innerText || '').trim() || containerText || text
      const lines = captionSource
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)

      const numericLike = /^[\d\s.,KkMmBb]+$/
      const contentLines = lines.filter((line) => {
        if (!line) return false
        if (/^https?:\/\//i.test(line)) return false
        if (/lượt xem|views?|thích|likes?|bình luận|comments?|chia sẻ|shares?/i.test(line)) return false
        if (/xem thêm/i.test(line)) return false
        if (numericLike.test(line)) return false
        return true
      })

      const description = (contentLines.length > 0 ? contentLines.join('\n') : lines.join('\n')) || title

      const imageCandidate =
        container?.querySelector<HTMLImageElement>('img[src]') ||
        anchor.querySelector<HTMLImageElement>('img[src]') ||
        null

      uniqueByUrl.set(url, {
        id: url,
        title,
        views: formatViewCount(viewCount),
        viewCount,
        url,
        description: description.slice(0, 500),
        imageUrl: imageCandidate?.src || '',
      })
    }
  }

  const unlimited = fullPass && limit <= 0
  let stagnantRounds = Math.max(0, stagnantRoundsIn)
  let reachedScrollEnd = false
  let roundsCompleted = 0
  let stopped = false
  let lastAnchorCount = 0

  for (let round = 0; round < roundsPerBatch; round += 1) {
    if (control[token]?.stop) {
      stopped = true
      break
    }

    const sizeBeforeRound = uniqueByUrl.size
    scrapePass()
    if (!fullPass && uniqueByUrl.size >= limit) {
      roundsCompleted = round + 1
      break
    }

    const root = findScrollRoot()
    scrollFeedDown(root)
    await sleep(waitMs)
    scrapePass()

    const addedThisRound = uniqueByUrl.size - sizeBeforeRound
    const atBottom = isAtScrollBottom(root)
    lastAnchorCount = document.querySelectorAll('a[href*="/reel/"], a[href*="reel_id="]').length

    // Chỉ reset khi thực sự có reel mới — không tin anchorCount/DOM (FB ảo hóa list).
    if (addedThisRound > 0) {
      stagnantRounds = 0
      scrollRootStore.__aiContentFbScrollRoot = { el: root, at: Date.now() }
    } else if (atBottom) {
      stagnantRounds += fullPass ? 2 : 1
    } else {
      stagnantRounds += 1
    }

    roundsCompleted = round + 1

    if (stagnantRounds >= stagnantNeeded) {
      reachedScrollEnd = true
      break
    }
  }

  const sorted = Array.from(uniqueByUrl.values()).sort((a, b) => b.viewCount - a.viewCount)
  const foundCount = sorted.length
  const rows = unlimited || limit <= 0 ? sorted : sorted.slice(0, limit)

  return {
    rows,
    stagnantRounds,
    reachedScrollEnd,
    roundsCompleted,
    stopped,
    anchorCount: lastAnchorCount,
    foundCount,
    hasMore: fullPass ? false : foundCount > limit,
  }
}

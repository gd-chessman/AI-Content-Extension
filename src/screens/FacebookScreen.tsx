import { useCallback, useEffect, useRef, useState } from 'react'
import { FiSearch } from 'react-icons/fi'
import { SiOpenai } from 'react-icons/si'

type ScannedReel = {
  id: string
  title: string
  description: string
  views: string
  url: string
  viewCount: number
  imageUrl: string
}

type ExtensionChrome = {
  tabs?: {
    query?: (
      queryInfo: { url?: string[]; active?: boolean; currentWindow?: boolean },
      callback: (tabs: Array<{ id?: number; url?: string; active?: boolean; title?: string }>) => void,
    ) => void
    create?: (createProperties: { url: string; active?: boolean }) => void
    update?: (tabId: number, updateProperties: { url?: string; active?: boolean }) => void
  }
  scripting?: {
    executeScript?: (injection: {
      target: { tabId: number }
      func: (...args: unknown[]) => unknown
      args?: unknown[]
    }) => Promise<Array<{ result?: unknown }>>
  }
}

const fanpages = [
  {
    id: 'fp-1',
    name: 'Profile 61581309613138',
    url: 'https://www.facebook.com/profile.php?id=61581309613138&sk=reels_tab',
  },
  {
    id: 'fp-2',
    name: 'ThousandTales68',
    url: 'https://www.facebook.com/ThousandTales68/reels/',
  },
  {
    id: 'fp-3',
    name: 'SilentHeroes369',
    url: 'https://www.facebook.com/SilentHeroes369/reels/',
  },
  {
    id: 'fp-4',
    name: '3mforlife.offcial',
    url: 'https://www.facebook.com/3mforlife.offcial/reels/',
  },
  {
    id: 'fp-5',
    name: 'happyliving88',
    url: 'https://www.facebook.com/happyliving88/reels/',
  },
  {
    id: 'fp-6',
    name: 'Profile 61581792626415',
    url: 'https://www.facebook.com/profile.php?id=61581792626415&sk=reels_tab',
  },
  {
    id: 'fp-7',
    name: 'LifeShortTales',
    url: 'https://www.facebook.com/LifeShortTales/reels/',
  },
  {
    id: 'fp-8',
    name: 'KailasTVOfficial',
    url: 'https://www.facebook.com/KailasTVOfficial/reels/',
  },
  {
    id: 'fp-9',
    name: 'Profile 100064211677926',
    url: 'https://www.facebook.com/profile.php?id=100064211677926&sk=reels_tab',
  },
  {
    id: 'fp-10',
    name: 'Profile 61581342302835',
    url: 'https://www.facebook.com/profile.php?id=61581342302835&sk=reels_tab',
  },
  {
    id: 'fp-11',
    name: 'womenlife88',
    url: 'https://www.facebook.com/womenlife88/reels/',
  },
  {
    id: 'fp-12',
    name: 'dramaseriesfb',
    url: 'https://www.facebook.com/dramaseriesfb/reels/',
  },
  {
    id: 'fp-13',
    name: 'togethergoodd',
    url: 'https://www.facebook.com/togethergoodd/reels/',
  },
  {
    id: 'fp-14',
    name: 'Profile 61579479232452',
    url: 'https://www.facebook.com/profile.php?id=61579479232452&sk=reels_tab',
  },
  {
    id: 'fp-15',
    name: 'Profile 61588320100559',
    url: 'https://www.facebook.com/profile.php?id=61588320100559&sk=reels_tab',
  },
  {
    id: 'fp-16',
    name: 'betterthoughtstv',
    url: 'https://www.facebook.com/betterthoughtstv/reels/',
  },
  {
    id: 'fp-17',
    name: 'themeaningoflife88',
    url: 'https://www.facebook.com/themeaningoflife88/reels/',
  },
  {
    id: 'fp-18',
    name: 'Profile 61584657914140',
    url: 'https://www.facebook.com/profile.php?id=61584657914140&sk=reels_tab',
  },
]

const MIN_VIEW_COUNT = 500_000
const MAX_SCAN_RESULTS = 5
const formatViewInput = (value: string) => {
  const digits = value.replace(/[^\d]/g, '')
  if (!digits) return ''
  return Number(digits).toLocaleString('en-US')
}

export default function FacebookScreen() {
  const [activeView, setActiveView] = useState<'fanpages' | 'reels' | 'content'>('fanpages')
  const [openedFacebookUrls, setOpenedFacebookUrls] = useState<Set<string>>(new Set())
  const [scannedReels, setScannedReels] = useState<ScannedReel[]>([])
  const [scanStatus, setScanStatus] = useState('')
  const [minViewInput, setMinViewInput] = useState(formatViewInput(String(MIN_VIEW_COUNT)))
  const [maxViewInput, setMaxViewInput] = useState('')
  const [selectedReel, setSelectedReel] = useState<ScannedReel | null>(null)
  const [contentText, setContentText] = useState('')
  const [copyStatus, setCopyStatus] = useState<'idle' | 'ok' | 'error'>('idle')
  const [isContentDirty, setIsContentDirty] = useState(false)
  const [reelLinkInput, setReelLinkInput] = useState('')
  const isContentDirtyRef = useRef(false)

  useEffect(() => {
    isContentDirtyRef.current = isContentDirty
  }, [isContentDirty])

  useEffect(() => {
    if (activeView === 'content' && selectedReel && !contentText.trim()) {
      setContentText(buildContentText(selectedReel))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView, selectedReel])

  const normalizeUrl = (value: string) => (value.endsWith('/') ? value.slice(0, -1) : value)

  const syncOpenedFacebookTabs = useCallback(() => {
    const extensionChrome = (globalThis as { chrome?: ExtensionChrome }).chrome
    if (!extensionChrome?.tabs?.query) return

    extensionChrome.tabs.query({ url: ['*://*.facebook.com/*'] }, (tabs) => {
      const next = new Set<string>()
      tabs.forEach((tab) => {
        if (!tab.url) return
        next.add(normalizeUrl(tab.url))
      })
      setOpenedFacebookUrls(next)
    })
  }, [])

  const openFanpage = (url: string) => {
    const extensionChrome = (globalThis as { chrome?: ExtensionChrome }).chrome
    const normalizedUrl = normalizeUrl(url)

    if (extensionChrome?.tabs?.query && extensionChrome?.tabs?.update && extensionChrome?.tabs?.create) {
      extensionChrome.tabs.query({ url: ['*://*.facebook.com/*'] }, (tabs) => {
        if (tabs.length > 0) {
          const targetTab = tabs[0]
          if (!targetTab.id) return

          const opened = targetTab.url?.endsWith('/') ? targetTab.url.slice(0, -1) : targetTab.url
          if (opened === normalizedUrl) {
            // Same Facebook reels tab is already opened, no action needed.
            return
          }

          extensionChrome.tabs?.update?.(targetTab.id, { url, active: true })
          setOpenedFacebookUrls(new Set([normalizedUrl]))
          return
        }

        extensionChrome.tabs?.create?.({ url, active: true })
        setOpenedFacebookUrls((prev) => new Set([...prev, normalizedUrl]))
      })
      return
    }

    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const buildContentText = (reel: ScannedReel) => {
    const desc = reel.description?.trim() ? reel.description.trim() : ''
    return desc
  }

  const openReelLinkInFacebookTab = (url: string) => {
    const extensionChrome = (globalThis as { chrome?: ExtensionChrome }).chrome
    if (!extensionChrome?.tabs?.query || !extensionChrome.tabs.update) {
      window.open(url, '_blank', 'noopener,noreferrer')
      return
    }

    const normalizedTarget = normalizeUrl(url)

    extensionChrome.tabs.query({ url: ['*://*.facebook.com/*'] }, (tabs) => {
      const normalizeTabUrl = (value?: string) => (value ? normalizeUrl(value) : '')

      const existing = tabs.find((t) => normalizeTabUrl(t.url) === normalizedTarget && t.id)
      if (existing?.id) {
        extensionChrome.tabs?.update?.(existing.id, { url, active: true })
        return
      }

      const activeFb = tabs.find((t) => t.active && t.id)
      if (activeFb?.id) {
        extensionChrome.tabs?.update?.(activeFb.id, { url, active: true })
      } else if (tabs[0]?.id) {
        extensionChrome.tabs?.update?.(tabs[0].id, { url, active: true })
      } else {
        window.open(url, '_blank', 'noopener,noreferrer')
      }
    })
  }

  const handleSelectReel = (reel: ScannedReel) => {
    setSelectedReel(reel)
    setActiveView('content')
    setContentText(buildContentText(reel))
    setIsContentDirty(false)
    setCopyStatus('idle')
    openReelLinkInFacebookTab(reel.url)
    window.setTimeout(() => {
      refreshSelectedReelFromFacebook(reel)
    }, 1300)
  }

  const handleSelectReelByLink = () => {
    const raw = reelLinkInput.trim()
    if (!raw) return

    let normalizedLink = raw
    try {
      normalizedLink = new URL(raw).toString()
    } catch {
      setScanStatus('Link chưa hợp lệ. Hãy dán đúng URL reel Facebook.')
      return
    }

    const normalizedTarget = normalizeUrl(normalizedLink)
    const reelId = normalizedTarget.match(/\/reel\/(\d+)/)?.[1] || normalizedTarget.match(/[?&]reel_id=(\d+)/)?.[1] || ''

    const matchByUrl = scannedReels.find((item) => normalizeUrl(item.url) === normalizedTarget)
    const matchById = !matchByUrl && reelId ? scannedReels.find((item) => item.url.includes(reelId)) : null
    const matched = matchByUrl || matchById

    if (matched) {
      handleSelectReel(matched)
      setScanStatus('Đã chọn reel theo link từ danh sách đã quét.')
      return
    }

    const fallbackReel: ScannedReel = {
      id: normalizedTarget,
      title: 'Reel từ link',
      description: '',
      views: '',
      viewCount: 0,
      url: normalizedTarget,
      imageUrl: '',
    }

    handleSelectReel(fallbackReel)
    setScanStatus('Đã chọn reel theo link (không nằm trong danh sách đã quét).')
  }

  const copyContent = async () => {
    try {
      await navigator.clipboard.writeText(contentText)
      setCopyStatus('ok')
      window.setTimeout(() => setCopyStatus('idle'), 1200)
    } catch {
      setCopyStatus('error')
      window.setTimeout(() => setCopyStatus('idle'), 1200)
    }
  }

  const runStep1OnChatgpt = () => {
    const reelContent = contentText.trim()
    if (!reelContent) {
      return
    }

    window.dispatchEvent(
      new CustomEvent('switch-main-tab', {
        detail: { tabId: 'chatgpt' },
      }),
    )

    window.setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent('run-chatgpt-step1-from-facebook', {
          detail: { reelContent },
        }),
      )
    }, 120)
  }

  const refreshSelectedReelFromFacebook = (reelOverride?: ScannedReel) => {
    const targetReel = reelOverride || selectedReel
    if (!targetReel) return

    const extensionChrome = (globalThis as { chrome?: ExtensionChrome }).chrome
    if (!extensionChrome?.tabs?.query || !extensionChrome.scripting?.executeScript) {
      return
    }

    const normalize = (value: string) => (value.endsWith('/') ? value.slice(0, -1) : value)
    const normalizedTarget = normalize(targetReel.url)
    const reelId = targetReel.url.match(/\/reel\/(\d+)/)?.[1] || ''

    extensionChrome.tabs.query({ url: ['*://*.facebook.com/*'] }, async (tabs) => {
      const matchedTab =
        tabs.find((tab) => {
          const tabUrl = tab.url || ''
          if (!tabUrl) return false
          if (normalize(tabUrl) === normalizedTarget) return true
          if (reelId && tabUrl.includes(reelId)) return true
          return false
        }) ||
        tabs.find((tab) => tab.active && tab.id) ||
        tabs[0]

      if (!matchedTab?.id || !matchedTab.url || !/facebook\.com/.test(matchedTab.url)) {
        return
      }

      try {
        const result = await extensionChrome.scripting?.executeScript?.({
          target: { tabId: matchedTab.id },
          func: (async (currentReelUrl: string) => {
            const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

            const normalize = (value: string) => (value.endsWith('/') ? value.slice(0, -1) : value)
            const normalizedCurrent = normalize(currentReelUrl)
            const reelIdMatch = currentReelUrl.match(/\/reel\/(\d+)/)
            const reelId = reelIdMatch?.[1] || ''

            const clickSeeMore = () => {
              const candidates = Array.from(
                document.querySelectorAll<HTMLElement>('div[role="button"], span[role="button"], a[role="button"], span, div'),
              )
              let clicked = 0
              candidates.forEach((el) => {
                const txt = (el.innerText || '').trim().toLowerCase()
                if (!txt) return
                if (txt === 'xem thêm' || txt === 'see more') {
                  el.click()
                  clicked += 1
                }
              })
              return clicked
            }

            for (let i = 0; i < 5; i += 1) {
              const clicked = clickSeeMore()
              await sleep(clicked > 0 ? 350 : 180)
            }

            const main =
              (document.querySelector('div[role=\"main\"]') as HTMLElement | null) || document.body

            const findTargetContainer = (): HTMLElement => {
              const links = Array.from(main.querySelectorAll<HTMLAnchorElement>('a[href*="/reel/"]'))
              const byUrl = links.find((link) => {
                const href = link.getAttribute('href')
                if (!href) return false
                const full = new URL(href, location.origin).toString()
                return normalize(full) === normalizedCurrent
              })
              if (byUrl) {
                const c = byUrl.closest('div[role="main"], div[role="article"], article, section, div') as HTMLElement | null
                if (c) return c
              }

              if (reelId) {
                const byId = links.find((link) => (link.getAttribute('href') || '').includes(reelId))
                if (byId) {
                  const c = byId.closest('div[role="main"], div[role="article"], article, section, div') as HTMLElement | null
                  if (c) return c
                }
              }

              return main
            }

            const target = findTargetContainer()

            const getCaptionBlocks = (root: HTMLElement) => {
              const directCaptionNodes = Array.from(
                root.querySelectorAll<HTMLElement>('[data-ad-preview=\"message\"], [data-ad-comet-preview=\"message\"]'),
              )
              const directCaptions = directCaptionNodes
                .map((el) => el.innerText.trim())
                .filter((txt) => txt.length > 20)

              if (directCaptions.length > 0) {
                return directCaptions.sort((a, b) => b.length - a.length)
              }

              const blocks = Array.from(
                root.querySelectorAll<HTMLElement>('div[dir=\"auto\"], span[dir=\"auto\"], h1, h2'),
              )
                .map((el) => el.innerText.trim())
                .filter(Boolean)

              // Prefer longer text blocks which are usually the actual caption.
              return blocks.sort((a, b) => b.length - a.length)
            }

            const candidateBlocks = getCaptionBlocks(target)
            const fallbackBlocks = getCaptionBlocks(main)
            const source = (candidateBlocks[0] || fallbackBlocks[0] || '').trim()

            const rawLines = source
              .split('\n')
              .map((line) => line.replace(/\s+/g, ' ').trim())
              .filter(Boolean)

            const numericLike = /^[\d\s.,KkMmBb]+$/
            const isLikelyChannelName = (line: string) => {
              const words = line.split(/\s+/)
              const noPunctuation = !/[.!?,:;'"“”\-]/.test(line)
              return line.length <= 40 && words.length <= 5 && noPunctuation
            }

            const lines = rawLines.filter((line, index) => {
              if (!line) return false
              if (/^https?:\/\//i.test(line)) return false
              if (/lượt xem|views?|thích|likes?|bình luận|comments?|chia sẻ|shares?/i.test(line)) return false
              if (/xem thêm|see more/i.test(line)) return false
              if (/bản xem trước|ô thước phim|preview/i.test(line)) return false
              if (numericLike.test(line)) return false
              if (line.length < 2) return false
              if (index === 0 && isLikelyChannelName(line) && rawLines.length > 1) return false
              return true
            })

            const unique = Array.from(new Set(lines))
            const rawDescription = unique.join('\n').trim()
            const description = rawDescription
              .replace(/\s*👇[\s\S]*$/u, '')
              .replace(/\s*ẩn bớt[\s\S]*$/iu, '')
              .trim()

            return description.slice(0, 10000)
          }) as (...args: unknown[]) => unknown,
          args: [targetReel.url],
        })

        const description = (result?.[0]?.result as string | undefined) || ''
        if (!description.trim()) return

        const next: ScannedReel = {
          ...targetReel,
          description,
        }
        setSelectedReel(next)
        if (!isContentDirtyRef.current) {
          setContentText(buildContentText(next))
        }
      } catch {
        // ignore
      }
    })
  }

  useEffect(() => {
    if (activeView !== 'content' || !selectedReel) return
    const timeouts: number[] = []
    const schedule = [400, 1100, 2200, 3800]
    schedule.forEach((delay) => {
      const id = window.setTimeout(() => {
        refreshSelectedReelFromFacebook(selectedReel)
      }, delay)
      timeouts.push(id)
    })

    return () => {
      timeouts.forEach((id) => window.clearTimeout(id))
    }
  }, [activeView, selectedReel])

  const handleScanReels = () => {
    const extensionChrome = (globalThis as { chrome?: ExtensionChrome }).chrome
    const minViewCount = Number(minViewInput.replace(/[^\d]/g, '')) || MIN_VIEW_COUNT
    const parsedMaxView = Number(maxViewInput.replace(/[^\d]/g, ''))
    const maxViewCount = Number.isFinite(parsedMaxView) && parsedMaxView > 0 ? parsedMaxView : Number.POSITIVE_INFINITY
    const maxViewArg = Number.isFinite(maxViewCount) && maxViewCount !== Number.POSITIVE_INFINITY ? maxViewCount : -1

    if (!extensionChrome?.tabs?.query || !extensionChrome?.scripting?.executeScript) {
      setScanStatus('Không thể quét trong môi trường hiện tại.')
      return
    }

    if (maxViewCount < minViewCount) {
      setScanStatus('Giá trị max phải lớn hơn hoặc bằng min.')
      setScannedReels([])
      return
    }

    setScanStatus('Đang quét reels theo khoảng lượt xem — extension sẽ cuộn trang để tải thêm video nếu cần...')
    extensionChrome.tabs.query({ url: ['*://*.facebook.com/*'], active: true, currentWindow: true }, async (activeTabs) => {
      const targetTab = activeTabs[0]

      if (!targetTab?.id) {
        setScanStatus('Hãy mở fanpage Facebook cần quét trong tab hiện tại trước.')
        setScannedReels([])
        return
      }

      const targetUrl = targetTab.url || ''
      const isAllowedFanpageTab = fanpages.some((page) => {
        try {
          const current = new URL(targetUrl)
          const allowed = new URL(page.url)

          if (current.hostname !== allowed.hostname) return false

          const currentPath = normalizeUrl(current.pathname)
          const allowedPath = normalizeUrl(allowed.pathname)
          const currentId = current.searchParams.get('id')
          const allowedId = allowed.searchParams.get('id')

          // For profile URLs, ensure profile id matches the configured fanpage.
          if (allowedPath === '/profile.php') {
            return currentPath === '/profile.php' && !!allowedId && currentId === allowedId
          }

          // For normal page URLs, require same page path (allow deeper sub paths).
          return currentPath === allowedPath || currentPath.startsWith(`${allowedPath}/`)
        } catch {
          return false
        }
      })

      if (!isAllowedFanpageTab) {
        setScanStatus('Chỉ quét khi tab hiện tại là fanpage có trong danh sách.')
        setScannedReels([])
        return
      }

      try {
        const result = await extensionChrome.scripting?.executeScript?.({
          target: { tabId: targetTab.id },
          func: (async (minViews: number, maxViewsArgInner: number, limit: number) => {
            const maxViews = maxViewsArgInner > 0 ? maxViewsArgInner : Number.POSITIVE_INFINITY
            const normalizeNumber = (raw: string) => raw.replace(/\./g, '').replace(',', '.')

            const parseViewCount = (text: string) => {
              const parseMatch = (match: RegExpMatchArray | null) => {
                if (!match) return null
                const value = Number(normalizeNumber(match[1]))
                if (Number.isNaN(value)) return null

                const unit = (match[2] || '').toLowerCase()
                if (unit === 'k' || unit === 'nghìn') return Math.round(value * 1_000)
                if (unit === 'm' || unit === 'triệu') return Math.round(value * 1_000_000)
                if (unit === 'b' || unit === 'tỷ') return Math.round(value * 1_000_000_000)
                return Math.round(value)
              }

              const withLabel = text.match(/([\d.,]+)\s*(k|m|b|nghìn|triệu|tỷ)?\s*(lượt xem|views?)/i)
              const labeledCount = parseMatch(withLabel)
              if (labeledCount) return labeledCount

              // Fallback: Facebook sometimes shows only 1.2M / 850K without explicit label.
              const generic = text.match(/([\d.,]+)\s*(k|m|b|nghìn|triệu|tỷ)\b/i)
              return parseMatch(generic)
            }

            type Row = {
              id: string
              title: string
              description: string
              views: string
              viewCount: number
              url: string
              imageUrl: string
            }

            const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

            const findScrollRoot = (): HTMLElement => {
              const direct = document.querySelector('#scrollview') as HTMLElement | null
              if (direct && direct.scrollHeight > direct.clientHeight + 80) {
                return direct
              }

              let best: HTMLElement | null = null
              let bestScore = 0
              const visit = (el: Element) => {
                if (!(el instanceof HTMLElement)) return
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
                  visit(child)
                }
              }
              visit(document.body)

              return best || (document.scrollingElement as HTMLElement) || document.documentElement
            }

            const scrollFeedDown = (root: HTMLElement) => {
              const delta = Math.max(Math.floor(root.clientHeight * 0.9), 480)
              if (
                root === document.documentElement ||
                root === document.body ||
                root === (document.scrollingElement as HTMLElement | null)
              ) {
                window.scrollBy(0, delta)
                return
              }
              const nextTop = Math.min(root.scrollTop + delta, Math.max(0, root.scrollHeight - root.clientHeight))
              if (nextTop > root.scrollTop + 4) {
                root.scrollTop = nextTop
              } else {
                window.scrollBy(0, Math.min(delta, 400))
              }
            }

            const scrapePass = (uniqueByUrl: Map<string, Row>) => {
              const anchors = Array.from(
                document.querySelectorAll<HTMLAnchorElement>('a[href*="/reel/"], a[href*="reel_id="]'),
              )

              anchors.forEach((anchor) => {
                const href = anchor.getAttribute('href')
                if (!href) return

                const url = new URL(href, location.origin).toString()
                if (uniqueByUrl.has(url)) return

                const container = (anchor.closest('div[role="article"]') || anchor.closest('div')) as HTMLElement | null
                const ariaTexts = Array.from(container?.querySelectorAll<HTMLElement>('[aria-label]') || [])
                  .map((element) => element.getAttribute('aria-label') || '')
                  .join('\n')
                const containerText = container?.innerText || container?.textContent || ''
                const text = `${containerText}\n${anchor.innerText || ''}\n${ariaTexts}`.trim()
                if (!text) return

                const viewCount = parseViewCount(text)
                if (!viewCount || viewCount < minViews || viewCount > maxViews) return

                const title =
                  (anchor.getAttribute('aria-label') || text.split('\n').find((line) => line.trim().length > 0) || 'Reel')
                    .trim()
                    .slice(0, 120)

                const captionSource =
                  (ariaTexts || anchor.innerText || '').trim() || containerText || text

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

                const description =
                  (contentLines.length > 0 ? contentLines.join('\n') : lines.join('\n')) || title

                const imageCandidate =
                  container?.querySelector<HTMLImageElement>('img[src]') ||
                  anchor.querySelector<HTMLImageElement>('img[src]') ||
                  null

                uniqueByUrl.set(url, {
                  id: url,
                  title,
                  views:
                    viewCount >= 1_000_000
                      ? `${(viewCount / 1_000_000).toFixed(1)}M`
                      : `${Math.round(viewCount / 1000)}K`,
                  viewCount,
                  url,
                  description: description.slice(0, 500),
                  imageUrl: imageCandidate?.src || '',
                })
              })
            }

            const MAX_SCROLL_ROUNDS = 55
            const WAIT_MS = 1100
            const uniqueByUrl = new Map<string, Row>()
            let stagnantRounds = 0

            for (let round = 0; round < MAX_SCROLL_ROUNDS; round += 1) {
              scrapePass(uniqueByUrl)
              if (uniqueByUrl.size >= limit) {
                break
              }

              const root = findScrollRoot()
              const beforeTop = root.scrollTop
              const beforeMax = root.scrollHeight

              scrollFeedDown(root)
              await sleep(WAIT_MS)

              const afterTop = root.scrollTop
              const afterMax = root.scrollHeight

              if (Math.abs(afterTop - beforeTop) < 8 && afterMax <= beforeMax + 40) {
                stagnantRounds += 1
              } else {
                stagnantRounds = 0
              }

              if (stagnantRounds >= 5) {
                break
              }
            }

            return Array.from(uniqueByUrl.values())
              .sort((a, b) => b.viewCount - a.viewCount)
              .slice(0, limit)
          }) as (...args: unknown[]) => unknown,
          args: [minViewCount, maxViewArg, MAX_SCAN_RESULTS],
        })

        if (!result) {
          setScanStatus('Quét thất bại: không nhận được kết quả từ executeScript.')
          setScannedReels([])
          return
        }

        const reels = (result?.[0]?.result as ScannedReel[] | undefined) || []
        setScannedReels(reels)
        const rangeLabel =
          Number.isFinite(maxViewCount) && maxViewCount !== Number.POSITIVE_INFINITY
            ? `${minViewCount.toLocaleString('en-US')} - ${maxViewCount.toLocaleString('en-US')}`
            : `>= ${minViewCount.toLocaleString('en-US')}`
        setScanStatus(
          reels.length > 0
            ? `Đã quét được ${reels.length} video trong khoảng ${rangeLabel} lượt xem.`
            : `Không tìm thấy video nào trong khoảng ${rangeLabel} lượt xem.`,
        )
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        setScanStatus(`Quét thất bại: ${message}. Hãy mở đúng trang reels của fanpage rồi thử lại.`)
        setScannedReels([])
      }
    })
  }

  useEffect(() => {
    syncOpenedFacebookTabs()
  }, [syncOpenedFacebookTabs])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-blue-500 text-base font-bold text-white shadow-lg shadow-blue-900/30">
            f
          </div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Facebook</p>
        </div>
        <button type="button" className="cursor-pointer rounded-xl border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-medium text-slate-200 backdrop-blur">
          Hôm nay
        </button>
      </header>

      <section className="mb-3 rounded-2xl border border-white/10 bg-white/5 p-1.5 backdrop-blur">
        <div className="grid grid-cols-3 gap-1.5">
          <button
            type="button"
            onClick={() => setActiveView('fanpages')}
            className={`cursor-pointer rounded-xl px-2 py-2 text-xs font-semibold transition ${
              activeView === 'fanpages'
                ? 'primary-blue-btn'
                : 'bg-transparent text-slate-400 hover:bg-white/10'
            }`}
          >
            Trang
          </button>
          <button
            type="button"
            onClick={() => setActiveView('reels')}
            className={`cursor-pointer rounded-xl px-2 py-2 text-xs font-semibold transition ${
              activeView === 'reels'
                ? 'primary-blue-btn'
                : 'bg-transparent text-slate-400 hover:bg-white/10'
            }`}
          >
            Reels
          </button>
          <button
            type="button"
            onClick={() => setActiveView('content')}
            className={`cursor-pointer rounded-xl px-2 py-2 text-xs font-semibold transition ${
              activeView === 'content'
                ? 'primary-blue-btn'
                : 'bg-transparent text-slate-400 hover:bg-white/10'
            }`}
          >
            Chi tiết Reel
          </button>
        </div>
      </section>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
        {activeView === 'fanpages' ? (
          <section className="glass-panel rounded-3xl p-3">
          <h2 className="text-sm font-semibold text-white">Fanpage nguồn</h2>
          <div className="mt-2 space-y-2">
            {fanpages.map((page) => (
              <button
                key={page.id}
                type="button"
                onClick={() => openFanpage(page.url)}
                disabled={openedFacebookUrls.has(normalizeUrl(page.url))}
                className={`flex w-full cursor-pointer items-center justify-between rounded-2xl px-3 py-3 text-left disabled:cursor-default ${
                  openedFacebookUrls.has(normalizeUrl(page.url))
                    ? 'border border-emerald-500/40 bg-emerald-500/10'
                    : 'border border-blue-300/20 bg-blue-400/10 hover:bg-blue-400/15'
                }`}
              >
                <div>
                  <p className="text-xs font-semibold text-slate-100">{page.name}</p>
                  <p className="mt-0.5 line-clamp-1 text-[11px] text-slate-500">{page.url}</p>
                </div>
                {openedFacebookUrls.has(normalizeUrl(page.url)) ? (
                  <span className="rounded-lg bg-emerald-500/20 px-2 py-1 text-[10px] font-semibold text-emerald-300">
                    Đang mở
                  </span>
                ) : (
                  <span className="rounded-lg bg-blue-500/20 px-2 py-1 text-[10px] font-semibold text-blue-300">
                    Chọn
                  </span>
                )}
              </button>
            ))}
          </div>
          </section>
        ) : null}

        {activeView === 'reels' ? (
          <>
          <section className="glass-panel rounded-3xl p-3">
            <h2 className="text-sm font-semibold text-white">Bộ lọc tìm reels</h2>
            <div className="mt-2 space-y-2">
              <input
                type="text"
                placeholder="Từ khóa: làm đẹp, bán hàng..."
                className="w-full rounded-2xl bg-slate-900/90 px-3 py-2.5 text-xs text-slate-100 outline-none placeholder:text-slate-500 focus:ring-2 focus:ring-blue-400/30"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Tối thiểu: 100,000"
                  value={minViewInput}
                  onChange={(event) => setMinViewInput(formatViewInput(event.target.value))}
                  className="w-full rounded-2xl bg-slate-900/90 px-3 py-2.5 text-xs text-slate-100 outline-none placeholder:text-slate-500 focus:ring-2 focus:ring-blue-400/30"
                />
                <input
                  type="text"
                  placeholder="Tối đa: 5,000,000"
                  value={maxViewInput}
                  onChange={(event) => setMaxViewInput(formatViewInput(event.target.value))}
                  className="w-full rounded-2xl bg-slate-900/90 px-3 py-2.5 text-xs text-slate-100 outline-none placeholder:text-slate-500 focus:ring-2 focus:ring-blue-400/30"
                />
              </div>
              <button
                type="button"
                onClick={handleScanReels}
                className="primary-blue-btn w-full cursor-pointer rounded-2xl px-3 py-2.5 text-xs font-semibold transition hover:opacity-90"
              >
                <span className="inline-flex items-center gap-1.5">
                  <FiSearch aria-hidden="true" className="h-3.5 w-3.5" />
                  Quét reels ngay
                </span>
              </button>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Dán link reel để chọn nhanh"
                  value={reelLinkInput}
                  onChange={(event) => setReelLinkInput(event.target.value)}
                  className="w-full rounded-2xl bg-slate-900/90 px-3 py-2.5 text-xs text-slate-100 outline-none placeholder:text-slate-500 focus:ring-2 focus:ring-blue-400/30"
                />
                <button
                  type="button"
                  onClick={handleSelectReelByLink}
                  disabled={!reelLinkInput.trim()}
                  className="cursor-pointer whitespace-nowrap rounded-2xl bg-blue-500/20 px-3 py-2.5 text-xs font-semibold text-blue-200 transition hover:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Chọn link
                </button>
              </div>
              {scanStatus ? <p className="text-[11px] text-slate-400">{scanStatus}</p> : null}
            </div>
          </section>

            <section className="glass-panel rounded-3xl p-3">
            <h2 className="text-sm font-semibold text-white">Danh sách reels</h2>
              <div className="mt-2 space-y-2">
              {scannedReels.map((reel) => (
                <article key={reel.id} className="rounded-2xl border border-blue-300/20 bg-blue-400/10 p-3">
                  <div className="flex gap-2">
                    {reel.imageUrl ? (
                      <img
                        src={reel.imageUrl}
                        alt={reel.title}
                        className="h-14 w-14 shrink-0 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-[10px] text-slate-500">
                        No image
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-xs font-medium text-slate-100">{reel.title}</p>
                      <p className="mt-1 line-clamp-1 text-[10px] text-slate-500">{reel.description || reel.url}</p>
                      <p className="mt-1 line-clamp-1 text-[10px] text-slate-500">{reel.url}</p>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-[11px] text-slate-400">{reel.views} views</span>
                    <button
                      type="button"
                      onClick={() => handleSelectReel(reel)}
                      className="cursor-pointer rounded-lg bg-blue-500/20 px-2 py-1 text-[10px] font-semibold text-blue-300 transition hover:bg-blue-500/25"
                    >
                      Chọn
                    </button>
                  </div>
                </article>
              ))}
              {scannedReels.length === 0 ? (
                <p className="rounded-xl border border-blue-300/20 bg-blue-400/10 px-3 py-2 text-[11px] text-slate-500">
                  Chưa có dữ liệu. Nhấn "Quét reels ngay" để lấy tối đa {MAX_SCAN_RESULTS} video theo ngưỡng lượt xem hiện tại.
                </p>
              ) : null}
              </div>
            </section>
          </>
        ) : null}

        {activeView === 'content' ? (
          <section className="glass-panel rounded-3xl p-3">
          <h2 className="text-sm font-semibold text-white">Chi tiết Reels</h2>
          {selectedReel ? (
            <div className="mt-2 rounded-2xl border border-blue-300/20 bg-blue-400/10 p-3">
              <div className="flex gap-3">
                {selectedReel.imageUrl ? (
                  <img
                    src={selectedReel.imageUrl}
                    alt={selectedReel.title}
                    className="h-16 w-16 rounded-xl object-cover"
                  />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-blue-500/10 text-[10px] text-slate-500">
                    No image
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-xs font-semibold text-slate-100">{selectedReel.title}</p>
                  <p className="mt-1 text-[11px] text-slate-400">{selectedReel.views} views</p>
                  <a
                    href={selectedReel.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 block truncate text-[10px] text-blue-300"
                    title={selectedReel.url}
                  >
                    {selectedReel.url}
                  </a>
                </div>
              </div>
            </div>
          ) : (
            <p className="mt-2 rounded-xl border border-blue-300/20 bg-blue-400/10 px-3 py-2 text-[11px] text-slate-500">Chưa chọn reels nào.</p>
          )}
          <div className="relative mt-2">
            <textarea
              placeholder="Caption, voice script, hashtag... hiển thị tại đây"
              value={contentText}
              onChange={(event) => {
                setContentText(event.target.value)
                setIsContentDirty(true)
              }}
              className="h-44 w-full resize-none rounded-2xl bg-slate-900/90 px-3 py-2.5 pr-11 text-xs text-slate-100 outline-none placeholder:text-slate-500 focus:ring-2 focus:ring-blue-400/30"
            />
            <button
              type="button"
              onClick={copyContent}
              disabled={!contentText.trim()}
              aria-label="Sao chép nội dung"
              title={
                copyStatus === 'ok'
                  ? 'Đã sao chép'
                  : copyStatus === 'error'
                    ? 'Sao chép lỗi'
                    : 'Sao chép'
              }
              className="absolute bottom-2 right-2 inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg bg-blue-500 text-sm text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {copyStatus === 'ok' ? '✓' : '⧉'}
            </button>
          </div>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={runStep1OnChatgpt}
              disabled={!contentText.trim()}
              className="primary-blue-btn w-full cursor-pointer rounded-2xl px-3 py-2.5 text-xs font-semibold transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className="inline-flex items-center gap-1.5">
                <SiOpenai aria-hidden="true" className="h-3.5 w-3.5" />
                Chạy tiến trình 1 trên ChatGPT
              </span>
            </button>
          </div>
          </section>
        ) : null}
      </div>

    </div>
  )
}

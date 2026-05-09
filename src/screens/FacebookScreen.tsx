import { useCallback, useEffect, useRef, useState } from 'react'
import {
  FiAlertTriangle,
  FiCheck,
  FiCheckCircle,
  FiEdit2,
  FiFilm,
  FiGlobe,
  FiInfo,
  FiMenu,
  FiPlus,
  FiRotateCcw,
  FiSave,
  FiSearch,
  FiTrash2,
  FiX,
  FiXCircle,
} from 'react-icons/fi'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import translate from 'translate'
import {
  createFanpage,
  deleteAllFanpages,
  deleteFanpage,
  getFanpages,
  updateFanpage,
} from '@/services/FanpageService'
import { checkStoryReelSaved, createStoryFromReel } from '@/services/StoryService'

type ScannedReel = {
  id: string
  title: string
  description: string
  views: string
  url: string
  viewCount: number
  imageUrl: string
}

type FanpageItem = {
  _id: string
  name: string
  url: string
}

type ExtensionChrome = {
  tabs?: {
    query?: (
      queryInfo: { url?: string | string[]; active?: boolean; currentWindow?: boolean },
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

const MIN_VIEW_COUNT = 500_000
const MAX_SCAN_RESULTS = 5
const FACEBOOK_REEL_MEMORY_KEY = 'facebookReelCopiedContent'

/** URL tab đang mở là trang reel (facebook.com/reel/, reel_id=, fb.watch). */
function isFacebookReelPageUrl(urlString: string): boolean {
  try {
    const normalizedLink = new URL(urlString.trim()).toString()
    const u = new URL(normalizedLink)
    const host = u.hostname.replace(/^www\./i, '').toLowerCase()
    const fullLower = normalizedLink.toLowerCase()
    const isFb =
      host === 'facebook.com' ||
      host.endsWith('.facebook.com') ||
      host === 'm.facebook.com' ||
      host === 'fb.watch' ||
      host.endsWith('.fb.watch')
    const hasReelSegment =
      fullLower.includes('facebook.com/reel/') ||
      fullLower.includes('m.facebook.com/reel/') ||
      /[?&]reel_id=/i.test(fullLower) ||
      host === 'fb.watch' ||
      fullLower.includes('fb.watch/')
    return isFb && hasReelSegment
  } catch {
    return false
  }
}
const formatViewInput = (value: string) => {
  const digits = value.replace(/[^\d]/g, '')
  if (!digits) return ''
  return Number(digits).toLocaleString('en-US')
}

export default function FacebookScreen() {
  const [activeView, setActiveView] = useState<'fanpages' | 'reels' | 'content'>('fanpages')
  const [openedFacebookUrls, setOpenedFacebookUrls] = useState<Set<string>>(new Set())
  const [scannedReels, setScannedReels] = useState<ScannedReel[]>([])
  const [hasMoreReels, setHasMoreReels] = useState(false)
  const [scanStatus, setScanStatus] = useState('')
  const [isScanning, setIsScanning] = useState(false)
  const [minViewInput, setMinViewInput] = useState(formatViewInput(String(MIN_VIEW_COUNT)))
  const [maxViewInput, setMaxViewInput] = useState('')
  const [selectedReel, setSelectedReel] = useState<ScannedReel | null>(null)
  const [contentText, setContentText] = useState('')
  const [originalContentText, setOriginalContentText] = useState('')
  const [isContentTranslated, setIsContentTranslated] = useState(false)
  const [copyStatus, setCopyStatus] = useState<'idle' | 'ok' | 'error'>('idle')
  const [isTranslating, setIsTranslating] = useState(false)
  const [translateStatus, setTranslateStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const [storySaveStatus, setStorySaveStatus] = useState<'idle' | 'saving' | 'ok' | 'error'>('idle')
  const [isContentDirty, setIsContentDirty] = useState(false)
  const [contentReelLoadStatus, setContentReelLoadStatus] = useState('')
  const [reelLinkInput, setReelLinkInput] = useState('')
  const [showAddFanpageForm, setShowAddFanpageForm] = useState(false)
  const [showEditFanpagesModal, setShowEditFanpagesModal] = useState(false)
  const [fanpageBulkInput, setFanpageBulkInput] = useState('')
  const [fanpageStatus, setFanpageStatus] = useState('')
  const [editingFanpages, setEditingFanpages] = useState<FanpageItem[]>([])
  const queryClient = useQueryClient()
  const { data: fanpages = [], isLoading: isLoadingFanpages } = useQuery<FanpageItem[]>({
    queryKey: ['fanpages'],
    queryFn: getFanpages,
  })
  const { data: reelSavedCheck } = useQuery({
    queryKey: ['stories', 'check-reel', selectedReel?.url],
    queryFn: () => checkStoryReelSaved(selectedReel!.url),
    enabled: Boolean(selectedReel?.url?.trim()),
    staleTime: 20_000,
  })
  const reelAlreadySaved = reelSavedCheck?.saved === true
  const createFanpageMutation = useMutation({
    mutationFn: createFanpage,
  })
  const updateFanpageMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { name?: string; url?: string } }) =>
      updateFanpage(id, payload),
  })
  const deleteFanpageMutation = useMutation({
    mutationFn: deleteFanpage,
  })
  const deleteAllFanpagesMutation = useMutation({
    mutationFn: deleteAllFanpages,
  })
  const isContentDirtyRef = useRef(false)
  const contentTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const scanControlRef = useRef<{ token: string; tabId: number } | null>(null)
  const scanStatusLower = scanStatus.toLowerCase()
  const scanStatusTone = scanStatusLower.includes('thất bại') || scanStatusLower.includes('không thể') || scanStatusLower.includes('không tìm thấy')
    ? 'error'
    : scanStatusLower.includes('đang ')
      ? 'loading'
      : scanStatusLower.includes('đã ')
        ? 'success'
        : 'info'
  const fanpageStatusLower = fanpageStatus.toLowerCase()
  const fanpageStatusTone = fanpageStatusLower.includes('lỗi') || fanpageStatusLower.includes('thất bại')
    ? 'error'
    : fanpageStatusLower.includes('đã ')
      ? 'success'
      : 'info'

  useEffect(() => {
    isContentDirtyRef.current = isContentDirty
  }, [isContentDirty])

  useEffect(() => {
    const textarea = contentTextareaRef.current
    if (!textarea) return
    textarea.scrollTo({ top: textarea.scrollHeight, behavior: 'smooth' })
  }, [contentText])

  useEffect(() => {
    if (activeView === 'content' && selectedReel && !contentText.trim()) {
      const next = buildContentText(selectedReel)
      setContentText(next)
      setOriginalContentText(next)
      setIsContentTranslated(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView, selectedReel])

  useEffect(() => {
    setStorySaveStatus('idle')
  }, [selectedReel?.id])

  useEffect(() => {
    if (selectedReel) setContentReelLoadStatus('')
  }, [selectedReel])

  const normalizeUrl = (value: string) => (value.endsWith('/') ? value.slice(0, -1) : value)

  /** Cùng reel dù Facebook thêm/khác query trên thanh địa chỉ */
  const isSameReelTabUrl = (tabUrl: string | undefined, targetUrl: string) => {
    if (!tabUrl) return false
    if (normalizeUrl(tabUrl) === normalizeUrl(targetUrl)) return true
    const reelIdFrom = (u: string) =>
      u.match(/\/reel\/(\d+)/)?.[1] || u.match(/[?&]reel_id=(\d+)/)?.[1] || ''
    const a = reelIdFrom(tabUrl)
    const b = reelIdFrom(targetUrl)
    return Boolean(a && b && a === b)
  }

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

  const handleAddFanpages = async () => {
    const rows = fanpageBulkInput
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)

    if (rows.length === 0) {
      setFanpageStatus('Hãy nhập dữ liệu fanpage trước khi thêm.')
      return
    }

    let successCount = 0
    let failedCount = 0

    for (const row of rows) {
      let name = ''
      let url = ''
      if (row.includes('|')) {
        const [nameRaw, ...urlParts] = row.split('|')
        name = (nameRaw || '').trim()
        url = urlParts.join('|').trim()
      } else {
        url = row
      }
      if (!url) {
        failedCount += 1
        continue
      }

      try {
        await createFanpageMutation.mutateAsync({ name: name || undefined, url })
        successCount += 1
      } catch {
        failedCount += 1
      }
    }

    await queryClient.invalidateQueries({ queryKey: ['fanpages'] })
    setFanpageStatus(`Đã thêm ${successCount} fanpage${failedCount ? `, lỗi ${failedCount}` : ''}.`)
    if (successCount > 0) {
      setFanpageBulkInput('')
      setShowAddFanpageForm(false)
    }
  }

  const openEditFanpagesModal = () => {
    setEditingFanpages(fanpages.map((item) => ({ ...item })))
    setShowEditFanpagesModal(true)
    setFanpageStatus('')
  }

  const handleEditFanpageField = (
    id: string,
    field: 'name' | 'url',
    value: string,
  ) => {
    setEditingFanpages((prev) =>
      prev.map((item) => (item._id === id ? { ...item, [field]: value } : item)),
    )
  }

  const handleSaveFanpage = async (item: FanpageItem) => {
    await updateFanpageMutation.mutateAsync({
      id: item._id,
      payload: { name: item.name, url: item.url },
    })
    await queryClient.invalidateQueries({ queryKey: ['fanpages'] })
    setFanpageStatus('Đã cập nhật fanpage.')
  }

  const handleDeleteFanpage = async (id: string) => {
    await deleteFanpageMutation.mutateAsync(id)
    await queryClient.invalidateQueries({ queryKey: ['fanpages'] })
    setEditingFanpages((prev) => prev.filter((item) => item._id !== id))
    setFanpageStatus('Đã xóa fanpage.')
  }

  const handleDeleteAllFanpages = async () => {
    await deleteAllFanpagesMutation.mutateAsync()
    await queryClient.invalidateQueries({ queryKey: ['fanpages'] })
    setEditingFanpages([])
    setFanpageStatus('Đã xóa toàn bộ fanpage.')
  }

  const openReelLinkInFacebookTab = (url: string) => {
    const extensionChrome = (globalThis as { chrome?: ExtensionChrome }).chrome
    if (!extensionChrome?.tabs?.query || !extensionChrome.tabs.update) {
      window.open(url, '_blank', 'noopener,noreferrer')
      return
    }

    extensionChrome.tabs.query({ url: ['*://*.facebook.com/*'] }, (tabs) => {
      const existing = tabs.find((t) => t.id && isSameReelTabUrl(t.url, url))
      if (existing?.id) {
        // Chỉ focus tab — không set lại url để tránh Chrome reload trang Facebook
        extensionChrome.tabs?.update?.(existing.id, { active: true })
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
    const next = buildContentText(reel)
    setContentText(next)
    setOriginalContentText(next)
    setIsContentTranslated(false)
    setIsContentDirty(false)
    setCopyStatus('idle')
    openReelLinkInFacebookTab(reel.url)
    window.setTimeout(() => {
      refreshSelectedReelFromFacebook(reel)
    }, 1300)
  }

  type ApplyReelUrlResult =
    | { ok: true; fromList: boolean }
    | { ok: false; reason: 'empty' | 'bad-url' | 'not-reel' }

  /** Chọn reel chỉ từ URL (facebook.com/reel/…, reel_id=, fb.watch). Dùng chung tab Reels & Chi tiết. */
  const applyReelFromUrlString = (raw: string): ApplyReelUrlResult => {
    const trimmed = raw.trim()
    if (!trimmed) return { ok: false, reason: 'empty' }
    let normalizedLink: string
    try {
      normalizedLink = new URL(trimmed).toString()
    } catch {
      return { ok: false, reason: 'bad-url' }
    }
    if (!isFacebookReelPageUrl(normalizedLink)) {
      return { ok: false, reason: 'not-reel' }
    }

    const normalizedTarget = normalizeUrl(normalizedLink)
    const reelId =
      normalizedTarget.match(/\/reel\/(\d+)/)?.[1] ||
      normalizedTarget.match(/[?&]reel_id=(\d+)/)?.[1] ||
      ''
    const matchByUrl = scannedReels.find((item) => normalizeUrl(item.url) === normalizedTarget)
    const matchById = !matchByUrl && reelId ? scannedReels.find((item) => item.url.includes(reelId)) : null
    const matched = matchByUrl || matchById

    if (matched) {
      handleSelectReel(matched)
      return { ok: true, fromList: true }
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
    return { ok: true, fromList: false }
  }

  const handleSelectReelByLink = () => {
    const res = applyReelFromUrlString(reelLinkInput)
    if (!res.ok) {
      if (res.reason === 'empty') return
      if (res.reason === 'bad-url') {
        setScanStatus('Link chưa hợp lệ. Hãy dán đúng URL reel Facebook.')
      } else {
        setScanStatus('Cần link chứa facebook.com/reel/… (hoặc fb.watch / reel_id=).')
      }
      return
    }
    setScanStatus(
      res.fromList
        ? 'Đã chọn reel theo link từ danh sách đã quét.'
        : 'Đã chọn reel theo link (không nằm trong danh sách đã quét).',
    )
  }

  const handleLoadReelFromOpenFacebookTab = () => {
    const extensionChrome = (globalThis as { chrome?: ExtensionChrome }).chrome
    const tabsQuery = extensionChrome?.tabs?.query
    if (!tabsQuery) {
      setContentReelLoadStatus('Chỉ hoạt động trong extension Chrome (cần quyền tabs).')
      return
    }

    setContentReelLoadStatus('')

    const finishWithUrl = (url: string | null) => {
      if (!url) {
        setContentReelLoadStatus(
          'Không thấy tab nào đang mở reel Facebook. Hãy mở reel trong một tab (facebook.com/reel/…).',
        )
        return
      }
      const res = applyReelFromUrlString(url)
      if (!res.ok) {
        if (res.reason === 'bad-url') {
          setContentReelLoadStatus('URL tab không hợp lệ.')
        } else {
          setContentReelLoadStatus('Tab đang mở không phải trang reel.')
        }
      }
    }

    const reelTabsIn = (tabs: Array<{ id?: number; url?: string; active?: boolean }>) =>
      tabs.filter((t) => t.url && isFacebookReelPageUrl(t.url))

    tabsQuery({ currentWindow: true }, (windowTabs) => {
      const list = windowTabs || []
      const activeTab = list.find((t) => t.active)
      if (activeTab?.url && isFacebookReelPageUrl(activeTab.url)) {
        finishWithUrl(activeTab.url)
        return
      }
      const firstReel = reelTabsIn(list)[0]
      if (firstReel?.url) {
        finishWithUrl(firstReel.url)
        return
      }

      tabsQuery(
        {
          url: [
            '*://*.facebook.com/*',
            '*://facebook.com/*',
            '*://m.facebook.com/*',
            '*://fb.watch/*',
            '*://*.fb.watch/*',
          ],
        },
        (allFbTabs) => {
          const reelTabs = reelTabsIn(allFbTabs || [])
          finishWithUrl(reelTabs[0]?.url ?? null)
        },
      )
    })
  }

  const copyContent = async () => {
    try {
      await navigator.clipboard.writeText(contentText)
      localStorage.setItem(FACEBOOK_REEL_MEMORY_KEY, contentText.trim())
      setCopyStatus('ok')
      window.setTimeout(() => setCopyStatus('idle'), 1200)
    } catch {
      setCopyStatus('error')
      window.setTimeout(() => setCopyStatus('idle'), 1200)
    }
  }

  const saveStoryToServer = async () => {
    if (
      !selectedReel?.url?.trim() ||
      !contentText.trim() ||
      storySaveStatus === 'saving' ||
      reelAlreadySaved
    ) {
      return
    }
    setStorySaveStatus('saving')
    try {
      await createStoryFromReel({
        sourceContent: contentText.trim(),
        sourceReelUrl: selectedReel.url.trim(),
        name: (selectedReel.title || '').trim().slice(0, 200),
      })
      setStorySaveStatus('ok')
      void queryClient.invalidateQueries({ queryKey: ['stories', 'check-reel'] })
      window.setTimeout(() => setStorySaveStatus('idle'), 2800)
    } catch {
      setStorySaveStatus('error')
      window.setTimeout(() => setStorySaveStatus('idle'), 4000)
    }
  }

  const translateContent = async () => {
    if (isContentTranslated) {
      setContentText(originalContentText || buildContentText(selectedReel || {
        id: '',
        title: '',
        description: '',
        views: '',
        url: '',
        viewCount: 0,
        imageUrl: '',
      }))
      setIsContentTranslated(false)
      setTranslateStatus('ok')
      window.setTimeout(() => setTranslateStatus('idle'), 1200)
      return
    }
    const source = contentText.trim()
    if (!source || isTranslating) return
    if (!originalContentText.trim()) {
      setOriginalContentText(source)
    }
    setIsTranslating(true)
    setTranslateStatus('loading')
    try {
      const translated = await translate(source, { to: 'vi' })
      if ((translated || '').trim()) {
        const next = translated.trim()
        setContentText(next)
        setIsContentDirty(true)
        setIsContentTranslated(true)
        setTranslateStatus(next === source ? 'error' : 'ok')
      } else {
        setTranslateStatus('error')
      }
    } catch {
      setTranslateStatus('error')
      setScanStatus('Dịch nội dung thất bại. Hãy thử lại.')
    } finally {
      setIsTranslating(false)
      window.setTimeout(() => setTranslateStatus('idle'), 1500)
    }
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
          const content = buildContentText(next)
          setContentText(content)
          setOriginalContentText(content)
          setIsContentTranslated(false)
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

  const handleScanReels = (append = false) => {
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

    if (isScanning) {
      return
    }

    const existingUrls = append ? scannedReels.map((item) => item.url) : []
    setIsScanning(true)
    setScanStatus(
      append
        ? 'Đang quét thêm reels theo khoảng lượt xem...'
        : 'Đang quét reels theo khoảng lượt xem — extension sẽ cuộn trang để tải thêm video nếu cần...',
    )
    extensionChrome.tabs.query({ url: ['*://*.facebook.com/*'], active: true, currentWindow: true }, async (activeTabs) => {
      const targetTab = activeTabs[0]

      if (!targetTab?.id) {
        setScanStatus('Hãy mở fanpage Facebook cần quét trong tab hiện tại trước.')
        setScannedReels([])
        setIsScanning(false)
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
        setIsScanning(false)
        return
      }

      const scanToken = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      scanControlRef.current = { token: scanToken, tabId: targetTab.id }

      try {
        const result = await extensionChrome.scripting?.executeScript?.({
          target: { tabId: targetTab.id },
          func: (async (minViews: number, maxViewsArgInner: number, limit: number, token: string, excludedUrls: string[]) => {
            const maxViews = maxViewsArgInner > 0 ? maxViewsArgInner : Number.POSITIVE_INFINITY
            const normalizeNumber = (raw: string) => raw.replace(/\./g, '').replace(',', '.')
            ;(window as unknown as { __aiContentScanControl?: Record<string, { stop?: boolean }> }).__aiContentScanControl ??= {}
            const control = (window as unknown as { __aiContentScanControl: Record<string, { stop?: boolean }> }).__aiContentScanControl
            control[token] = { stop: false }
            const excludedSet = new Set(excludedUrls || [])

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
                if (excludedSet.has(url)) return

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
              if (control[token]?.stop) break
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

            const sorted = Array.from(uniqueByUrl.values()).sort((a, b) => b.viewCount - a.viewCount)
            return {
              rows: sorted.slice(0, limit),
              hasMore: sorted.length > limit,
            }
          }) as (...args: unknown[]) => unknown,
          args: [minViewCount, maxViewArg, MAX_SCAN_RESULTS, scanToken, existingUrls],
        })

        if (!result) {
          setScanStatus('Quét thất bại: không nhận được kết quả từ executeScript.')
          setScannedReels([])
          setIsScanning(false)
          return
        }

        const payload = (result?.[0]?.result as { rows?: ScannedReel[]; hasMore?: boolean } | undefined) || {}
        const reels = payload.rows || []
        setHasMoreReels(Boolean(payload.hasMore))
        setScannedReels((prev) => {
          if (!append) return reels
          const map = new Map<string, ScannedReel>()
          prev.forEach((item) => map.set(item.url, item))
          reels.forEach((item) => map.set(item.url, item))
          return Array.from(map.values())
        })
        const rangeLabel =
          Number.isFinite(maxViewCount) && maxViewCount !== Number.POSITIVE_INFINITY
            ? `${minViewCount.toLocaleString('en-US')} - ${maxViewCount.toLocaleString('en-US')}`
            : `>= ${minViewCount.toLocaleString('en-US')}`
        setScanStatus(
          reels.length > 0
            ? append
              ? `Đã quét thêm ${reels.length} video trong khoảng ${rangeLabel} lượt xem.`
              : `Đã quét được ${reels.length} video trong khoảng ${rangeLabel} lượt xem.`
            : `Không tìm thấy video nào trong khoảng ${rangeLabel} lượt xem.`,
        )
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        setScanStatus(`Quét thất bại: ${message}. Hãy mở đúng trang reels của fanpage rồi thử lại.`)
        setScannedReels([])
        setHasMoreReels(false)
      } finally {
        setIsScanning(false)
        scanControlRef.current = null
      }
    })
  }

  const handleStopScan = () => {
    const extensionChrome = (globalThis as { chrome?: ExtensionChrome }).chrome
    const control = scanControlRef.current
    if (!extensionChrome?.scripting?.executeScript || !control?.tabId) return
    extensionChrome.scripting.executeScript({
      target: { tabId: control.tabId },
      func: ((token: string) => {
        const controlStore = (window as unknown as { __aiContentScanControl?: Record<string, { stop?: boolean }> }).__aiContentScanControl
        if (controlStore?.[token]) {
          controlStore[token].stop = true
        }
      }) as (...args: unknown[]) => unknown,
      args: [control.token],
    })
    setScanStatus('Đang dừng quét...')
  }

  useEffect(() => {
    syncOpenedFacebookTabs()
  }, [syncOpenedFacebookTabs])

  return (
    <div className="flex h-full min-h-0 flex-col">
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

      <div className={activeView === 'content' ? 'relative min-h-0 flex flex-1 pr-1' : 'relative min-h-0 flex-1 space-y-3 overflow-y-auto pr-1'}>
        {activeView === 'fanpages' ? (
          <section className="glass-panel rounded-3xl p-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-white">Fanpage nguồn</h2>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={openEditFanpagesModal}
                className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border border-amber-300/70 bg-amber-200 text-amber-800 transition hover:bg-amber-300"
                title="Sửa nhanh danh sách"
                aria-label="Sửa nhanh danh sách"
              >
                <FiEdit2 className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => setShowAddFanpageForm((prev) => !prev)}
                className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border border-blue-300/70 bg-blue-200 text-blue-800 transition hover:bg-blue-300"
                title="Thêm fanpage"
                aria-label="Thêm fanpage"
              >
                <FiPlus className="h-3 w-3" />
              </button>
            </div>
          </div>
          {fanpageStatus ? (
            <p
              className={`mt-2 inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] ${
                fanpageStatusTone === 'success'
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
                  : fanpageStatusTone === 'error'
                    ? 'border-rose-500/30 bg-rose-500/10 text-rose-100'
                    : 'border-white/10 bg-black/25 text-slate-300'
              }`}
            >
              {fanpageStatusTone === 'success' ? (
                <FiCheck className="h-3.5 w-3.5" />
              ) : fanpageStatusTone === 'error' ? (
                <FiAlertTriangle className="h-3.5 w-3.5" />
              ) : (
                <FiInfo className="h-3.5 w-3.5" />
              )}
              {fanpageStatus}
            </p>
          ) : null}
          <div className="mt-2 space-y-2">
            {isLoadingFanpages ? (
              <p className="rounded-xl border border-blue-300/20 bg-blue-400/10 px-3 py-2 text-[11px] text-slate-500">
                Đang tải danh sách fanpage...
              </p>
            ) : fanpages.length === 0 ? (
              <p className="rounded-xl border border-amber-300/20 bg-amber-400/10 px-3 py-2 text-[11px] text-slate-400">
                Chưa có fanpage nào. Hãy thêm mới
              </p>
            ) : fanpages.map((page) => (
              <button
                key={page._id}
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
                  <p className="mt-0.5 line-clamp-1 break-all text-[11px] text-slate-500">{page.url}</p>
                </div>
                {openedFacebookUrls.has(normalizeUrl(page.url)) ? (
                  <span className="whitespace-nowrap rounded-lg bg-emerald-500/20 px-2 py-1 text-[10px] font-semibold text-emerald-300">
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
        {showAddFanpageForm ? (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 px-3">
            <div className="w-full max-w-lg rounded-2xl border border-blue-300/40 bg-slate-950/95 p-3 shadow-2xl">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-white">Thêm fanpage</h3>
                <button
                  type="button"
                  onClick={() => setShowAddFanpageForm(false)}
                  className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-slate-300 transition hover:bg-white/10"
                  title="Đóng"
                  aria-label="Đóng"
                >
                  <FiX className="h-3.5 w-3.5" />
                </button>
              </div>
              <textarea
                value={fanpageBulkInput}
                onChange={(event) => setFanpageBulkInput(event.target.value)}
                placeholder={
                  'Mỗi dòng nhập URL hoặc Tên|URL\nVí dụ 1: https://www.facebook.com/ThousandTales68/reels/\nVí dụ 2: ThousandTales68|https://www.facebook.com/ThousandTales68/reels/'
                }
                className="mt-2 h-36 w-full resize-none rounded-xl bg-slate-900/90 px-3 py-2 text-[11px] text-slate-100 outline-none placeholder:text-slate-500 focus:ring-2 focus:ring-blue-400/30"
              />
              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddFanpageForm(false)}
                  className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg bg-white/10 text-slate-200 transition hover:bg-white/20"
                  title="Hủy"
                  aria-label="Hủy"
                >
                  <FiXCircle className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => void handleAddFanpages()}
                  disabled={createFanpageMutation.isPending}
                  className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg bg-blue-500/25 text-blue-200 transition hover:bg-blue-500/35 disabled:cursor-not-allowed disabled:opacity-50"
                  title="Thêm danh sách"
                  aria-label="Thêm danh sách"
                >
                  {createFanpageMutation.isPending ? (
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border border-blue-200/30 border-t-blue-100" />
                  ) : (
                    <FiCheckCircle className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {showEditFanpagesModal ? (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 px-3">
            <div className="w-full max-w-2xl rounded-2xl border border-blue-300/40 bg-slate-950/95 p-3 shadow-2xl">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-white">Sửa nhanh fanpages</h3>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => void handleDeleteAllFanpages()}
                    disabled={deleteAllFanpagesMutation.isPending || editingFanpages.length === 0}
                    className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-md bg-rose-500/20 text-rose-200 transition hover:bg-rose-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                    title="Xóa tất cả"
                    aria-label="Xóa tất cả"
                  >
                    <span className="relative inline-flex h-3.5 w-3.5 items-center justify-center">
                      <FiTrash2 className="h-3.5 w-3.5" />
                      <FiMenu className="absolute -right-1.5 -top-1.5 h-2.5 w-2.5 rounded-full bg-rose-500/70 p-px text-white" />
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowEditFanpagesModal(false)}
                    className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-slate-300 transition hover:bg-white/10"
                    title="Đóng"
                    aria-label="Đóng"
                  >
                    <FiX className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="mt-2 max-h-[320px] space-y-2 overflow-y-auto pr-1">
                {editingFanpages.map((item) => (
                  <div key={item._id} className="rounded-xl border border-white/10 bg-black/20 p-2">
                    <input
                      value={item.name}
                      onChange={(event) =>
                        handleEditFanpageField(item._id, 'name', event.target.value)
                      }
                      placeholder="Tên fanpage"
                      className="w-full rounded-lg bg-slate-900/90 px-2 py-1.5 text-[11px] text-slate-100 outline-none placeholder:text-slate-500"
                    />
                    <input
                      value={item.url}
                      onChange={(event) =>
                        handleEditFanpageField(item._id, 'url', event.target.value)
                      }
                      placeholder="URL"
                      className="mt-1.5 w-full rounded-lg bg-slate-900/90 px-2 py-1.5 text-[11px] text-slate-100 outline-none placeholder:text-slate-500"
                    />
                    <div className="mt-1.5 flex justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => void handleDeleteFanpage(item._id)}
                        className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-md bg-rose-500/20 text-rose-200 transition hover:bg-rose-500/30"
                        title="Xóa"
                        aria-label="Xóa"
                      >
                        <FiTrash2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleSaveFanpage(item)}
                        className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-md bg-blue-500/25 text-blue-200 transition hover:bg-blue-500/35"
                        title="Lưu"
                        aria-label="Lưu"
                      >
                        <FiCheck className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
                {editingFanpages.length === 0 ? (
                  <p className="rounded-xl border border-amber-300/20 bg-amber-400/10 px-3 py-2 text-[11px] text-slate-400">
                    Chưa có fanpage nào để chỉnh sửa.
                  </p>
                ) : null}
              </div>
            </div>
          </div>
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
                  placeholder="Tối thiểu:"
                  value={minViewInput}
                  onChange={(event) => setMinViewInput(formatViewInput(event.target.value))}
                  className="w-full rounded-2xl bg-slate-900/90 px-3 py-2.5 text-xs text-slate-100 outline-none placeholder:text-slate-500 focus:ring-2 focus:ring-blue-400/30"
                />
                <input
                  type="text"
                  placeholder="Tối đa:"
                  value={maxViewInput}
                  onChange={(event) => setMaxViewInput(formatViewInput(event.target.value))}
                  className="w-full rounded-2xl bg-slate-900/90 px-3 py-2.5 text-xs text-slate-100 outline-none placeholder:text-slate-500 focus:ring-2 focus:ring-blue-400/30"
                />
              </div>
              <div className="relative">
                {isScanning ? (
                  <>
                    <span className="pointer-events-none absolute -inset-px rounded-2xl border border-cyan-300/40" />
                    <svg className="pointer-events-none absolute -inset-px h-[calc(100%+2px)] w-[calc(100%+2px)]" viewBox="0 0 100 36" preserveAspectRatio="none">
                      <rect x="1" y="1" width="98" height="34" rx="12" ry="12" fill="none" stroke="rgba(34,211,238,0.18)" strokeWidth="1.2" />
                      <rect
                        x="1"
                        y="1"
                        width="98"
                        height="34"
                        rx="12"
                        ry="12"
                        fill="none"
                        stroke="rgba(34,211,238,0.95)"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeDasharray="24 220"
                      >
                        <animate attributeName="stroke-dashoffset" from="0" to="-244" dur="1.15s" repeatCount="indefinite" />
                      </rect>
                    </svg>
                  </>
                ) : null}
                <button
                  type="button"
                onClick={isScanning ? handleStopScan : () => handleScanReels(false)}
                  className={`primary-blue-btn relative z-1 w-full cursor-pointer rounded-2xl px-3 py-2.5 text-xs font-semibold transition hover:opacity-90 ${
                    isScanning ? 'animate-pulse bg-cyan-500/20 shadow-[0_0_14px_rgba(34,211,238,0.35)]' : ''
                  }`}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <FiSearch aria-hidden="true" className="h-3.5 w-3.5" />
                    {isScanning ? 'Dừng quét' : 'Quét reels ngay'}
                  </span>
                </button>
              </div>
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
              {scanStatus ? (
                <p
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] ${
                    scanStatusTone === 'success'
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
                      : scanStatusTone === 'error'
                        ? 'border-rose-500/30 bg-rose-500/10 text-rose-100'
                        : scanStatusTone === 'loading'
                          ? 'border-amber-500/30 bg-amber-500/10 text-amber-100'
                          : 'border-white/10 bg-black/25 text-slate-300'
                  }`}
                >
                  {scanStatusTone === 'success' ? (
                    <FiCheck className="h-3.5 w-3.5" />
                  ) : scanStatusTone === 'error' ? (
                    <FiAlertTriangle className="h-3.5 w-3.5" />
                  ) : scanStatusTone === 'loading' ? (
                    <FiSearch className="h-3.5 w-3.5 animate-pulse" />
                  ) : (
                    <FiInfo className="h-3.5 w-3.5" />
                  )}
                  {scanStatus}
                </p>
              ) : null}
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
                      <p className="mt-1 line-clamp-1 break-all text-[10px] text-slate-500">{reel.url}</p>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-[11px] text-slate-400">{reel.views} lượt xem</span>
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
              {scannedReels.length > 0 && hasMoreReels ? (
                <button
                  type="button"
                  onClick={() => handleScanReels(true)}
                  disabled={isScanning}
                  className="w-full cursor-pointer rounded-xl border border-blue-300/30 bg-blue-500/15 px-3 py-2 text-[11px] font-semibold text-blue-200 transition hover:bg-blue-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Quét thêm
                </button>
              ) : null}
              </div>
            </section>
          </>
        ) : null}

        {activeView === 'content' ? (
          <section className="glass-panel flex min-h-0 flex-1 flex-col rounded-3xl p-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-white">Chi tiết Reels</h2>
            <button
              type="button"
              onClick={() => handleLoadReelFromOpenFacebookTab()}
              title="Lấy reel từ tab đang mở"
              aria-label="Lấy reel từ tab đang mở"
              className="shrink-0 cursor-pointer rounded-lg p-1.5 text-blue-300 transition hover:bg-blue-500/20"
            >
              <FiFilm className="h-4 w-4" aria-hidden />
            </button>
          </div>
          {contentReelLoadStatus ? (
            <p className="mt-1 text-[10px] text-slate-400">{contentReelLoadStatus}</p>
          ) : null}
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
                  <p className="mt-1 text-[11px] text-slate-400">{selectedReel.views} lượt xem</p>
                  <a
                    href={selectedReel.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 block break-all text-[10px] text-blue-300"
                    title={selectedReel.url}
                  >
                    {selectedReel.url}
                  </a>
                </div>
              </div>
            </div>
          ) : (
            <p className="mt-2 rounded-xl border border-blue-300/20 bg-blue-400/10 px-3 py-2 text-[11px] text-slate-500">
              Chưa chọn reel. Mở reel trong một tab Chrome (facebook.com/reel/…), rồi bấm icon film góc phải — extension đọc tab đang xem (ưu tiên tab đang chọn trong cửa sổ hiện tại).
            </p>
          )}
          <div className="relative mt-2 min-h-0 flex-1 overflow-hidden">
            <textarea
              ref={contentTextareaRef}
              placeholder="Caption, voice script, hashtag... hiển thị tại đây"
              value={contentText}
              onChange={(event) => {
                setContentText(event.target.value)
                setIsContentDirty(true)
                setIsContentTranslated(false)
                setStorySaveStatus('idle')
                if (translateStatus !== 'idle') setTranslateStatus('idle')
              }}
              className="h-full min-h-[140px] w-full resize-none rounded-2xl bg-slate-900/90 px-3 py-2.5 pr-29 text-xs text-slate-100 outline-none placeholder:text-slate-500 focus:ring-2 focus:ring-blue-400/30"
            />
            {translateStatus !== 'idle' ? (
              <span
                className={`absolute bottom-3 left-3 z-10 rounded-lg border px-2 py-1 text-[10px] font-semibold shadow-lg ${
                  translateStatus === 'ok'
                    ? 'border-emerald-400/60 bg-neutral-900/95 text-emerald-300'
                    : translateStatus === 'error'
                      ? 'border-rose-400/60 bg-neutral-900/95 text-rose-300'
                      : 'border-violet-400/60 bg-neutral-900/95 text-violet-200'
                }`}
              >
                {translateStatus === 'ok'
                  ? 'Đã dịch'
                  : translateStatus === 'error'
                    ? 'Dịch lỗi'
                    : 'Đang dịch...'}
              </span>
            ) : null}
            <div className="absolute bottom-2 right-2 z-10 flex items-center gap-1">
              <button
                type="button"
                onClick={() => void translateContent()}
                disabled={!contentText.trim() || isTranslating}
                aria-label="Dịch tự động"
                title={
                  isTranslating
                    ? 'Đang dịch...'
                    : isContentTranslated
                      ? 'Quay về nội dung gốc'
                      : 'Dịch tự động sang tiếng Việt'
                }
                className="relative inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg bg-violet-500/20 text-violet-100 transition hover:bg-violet-500/30 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isTranslating ? (
                  <span className="animate-pulse">…</span>
                ) : isContentTranslated ? (
                  <FiRotateCcw className="h-4 w-4" />
                ) : (
                  <FiGlobe className="h-4 w-4" />
                )}
                {isContentTranslated ? (
                  <span className="absolute -right-1 -top-1 rounded-full bg-violet-500 px-1 text-[7px] leading-none text-white">
                    VI
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                onClick={() => void saveStoryToServer()}
                disabled={
                  !selectedReel ||
                  !contentText.trim() ||
                  storySaveStatus === 'saving' ||
                  reelAlreadySaved
                }
                aria-label={
                  reelAlreadySaved
                    ? 'Reel đã được lưu vào máy chủ'
                    : 'Lưu nội dung và link reel vào máy chủ'
                }
                title={
                  reelAlreadySaved
                    ? 'Đã lưu nội dung nguồn và đường dẫn reel'
                    : 'Lưu nội dung nguồn và đường dẫn reel vào database'
                }
                className={`relative inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg transition disabled:cursor-not-allowed ${
                  reelAlreadySaved
                    ? 'bg-amber-500/20 text-amber-100 opacity-90'
                    : storySaveStatus === 'ok'
                      ? 'bg-amber-500/25 text-amber-100 disabled:opacity-40'
                      : storySaveStatus === 'error'
                        ? 'bg-rose-500/80 text-white disabled:opacity-40'
                        : 'bg-amber-500/25 text-amber-100 hover:bg-amber-500/35 disabled:opacity-40'
                }`}
              >
                {storySaveStatus === 'saving' ? (
                  <span className="text-[10px]">…</span>
                ) : (
                  <FiSave className="h-4 w-4" aria-hidden />
                )}
                {storySaveStatus !== 'saving' &&
                (reelAlreadySaved || storySaveStatus === 'ok') ? (
                  <span
                    className="pointer-events-none absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-neutral-900/90 bg-emerald-500 text-white shadow-sm"
                    aria-hidden
                  >
                    <FiCheck className="h-2 w-2 stroke-3" />
                  </span>
                ) : null}
              </button>
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
                className={`inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-sm text-white transition disabled:cursor-not-allowed disabled:opacity-40 ${
                  copyStatus === 'ok'
                    ? 'bg-emerald-500 hover:bg-emerald-600'
                    : copyStatus === 'error'
                      ? 'bg-rose-500 hover:bg-rose-600'
                      : 'bg-blue-500/90 hover:bg-blue-500'
                }`}
              >
                {copyStatus === 'ok' ? '✓' : '⧉'}
              </button>
            </div>
          </div>
          </section>
        ) : null}
      </div>

    </div>
  )
}

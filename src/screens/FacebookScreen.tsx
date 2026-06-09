import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  FiAlertTriangle,
  FiCheck,
  FiCheckCircle,
  FiEdit2,
  FiFilm,
  FiGlobe,
  FiInfo,
  FiMenu,
  FiPlay,
  FiPlus,
  FiRefreshCw,
  FiRotateCcw,
  FiSave,
  FiSearch,
  FiSquare,
  FiTrash2,
  FiX,
  FiXCircle,
} from 'react-icons/fi'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'
import translate from 'translate'
import { isAxiosError } from 'axios'
import {
  createFanpage,
  deleteAllFanpages,
  deleteFanpage,
  getFanpages,
  updateFanpage,
} from '@/services/FanpageService'
import {
  checkVideoSourceForReel,
  getMyVideoSources,
  skipVideoSourceFromReel,
  syncVideoSourceFromReel,
} from '@/services/VideoShortService'
import { normalizeStepDisplayMode } from '@/utils/stepDisplayMode'
import {
  createStepRun,
  createWorkflowRun,
  createWorkflowRunEventSource,
  getUserWorkflowDetail,
  getUserWorkflows,
  getWorkflowRunById,
  updateStepRun,
  updateWorkflowRun,
  type WorkflowRunStreamEvent,
} from '@/services/WorkflowService'
import {
  finalizeMultiWorkflowJobAfterWorkflowRun,
  getCancelledWorkflowRunFromStream,
  shouldAcceptWorkflowRunFromStream,
  shouldStopLocalWorkflowForCancelledRun,
} from '@/utils/multiWorkflowRun'

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

type FacebookProcessStep = {
  id: string
  label: string
  prompt: string
  workflowId: string
  workflowPlatform: string
  backendStepId: string
  stepNo: number
  actionType: string
  displayMode?: string
  inputSchema: Record<string, unknown>
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
/** «Quét hết»: cuộn hết feed một lần, lấy tối đa bấy nhiêu reel mới (chưa có trong danh sách). */
const MAX_SCAN_FULL_PASS_RESULTS = 300

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
      u.pathname.includes('/reel/') ||
      /[?&]reel_id=/i.test(fullLower) ||
      host === 'fb.watch' ||
      fullLower.includes('fb.watch/')
    return isFb && hasReelSegment
  } catch {
    return false
  }
}

/** Tab desktop hợp lệ cho nút film: `facebook.com` hoặc `web.facebook.com/reel/…` (www bỏ). Không m.facebook, fb.watch. */
function isFacebookDotComReelPath(urlString: string): boolean {
  try {
    const u = new URL(urlString.trim())
    const host = u.hostname.replace(/^www\./i, '').toLowerCase()
    if (host !== 'facebook.com' && host !== 'web.facebook.com') return false
    return u.pathname.includes('/reel/')
  } catch {
    return false
  }
}

/** Khớp logic canonical URL reel trên BE (`canonicalSourceReelUrl`). */
function canonicalSourceReelUrl(url: string): string {
  try {
    const u = new URL(url.trim())
    u.protocol = 'https:'
    u.hostname = u.hostname.replace(/^www\./i, '').toLowerCase()
    const path = u.pathname.replace(/\/+$/, '')
    u.pathname = path || '/'
    u.search = ''
    u.hash = ''
    return u.toString()
  } catch {
    return url.trim()
  }
}

/** `payload.facebookCriteria` (Telegram/SSE) gộp vào inputSchema theo từng bước Facebook. */
function mergeFacebookStepCriteria(
  step: FacebookProcessStep,
  criteria: Record<string, unknown> | undefined,
): FacebookProcessStep {
  if (!criteria || Object.keys(criteria).length === 0) return step
  const inputSchema: Record<string, unknown> = { ...(step.inputSchema || {}) }
  const assignIf = (keys: string[]) => {
    for (const k of keys) {
      const v = criteria[k]
      if (v !== undefined && v !== null && v !== '') inputSchema[k] = v
    }
  }
  switch (step.actionType) {
    case 'facebook_open_fanpage':
      assignIf(['fanpageUrl', 'nameContains', 'pickIndex'])
      break
    case 'facebook_scan_reels':
      assignIf(['append'])
      if (
        criteria.fallbackFanpageCount !== undefined &&
        criteria.fallbackFanpageCount !== null &&
        criteria.fallbackFanpageCount !== ''
      ) {
        const n = Number(criteria.fallbackFanpageCount)
        if (Number.isFinite(n) && n >= 0) inputSchema.fallbackFanpageCount = Math.floor(n)
      }
      break
    case 'facebook_select_reel':
      assignIf(['index', 'maxAppendRounds'])
      if (inputSchema.index === undefined && criteria.reelIndex !== undefined) {
        inputSchema.index = criteria.reelIndex
      }
      break
    case 'facebook_wait_content':
      assignIf(['minLength', 'timeoutMs'])
      break
    default:
      break
  }
  return { ...step, inputSchema }
}

const formatViewInput = (value: string) => {
  const digits = value.replace(/[^\d]/g, '')
  if (!digits) return ''
  return Number(digits).toLocaleString('en-US')
}

const FB_REELS_SCAN_MIN_LS_KEY = 'facebookReelsScanMinViews'
const FB_REELS_SCAN_MAX_LS_KEY = 'facebookReelsScanMaxViews'
const FB_SELECTED_FANPAGE_LS_KEY = 'facebookSelectedFanpageId'
const FB_REELS_SCAN_HISTORY_PREFIX = 'facebookReelsScanHistory:'

function scanHistoryStorageKey(fanpageId: string) {
  return `${FB_REELS_SCAN_HISTORY_PREFIX}${fanpageId}`
}

function isScannedReelLike(value: unknown): value is ScannedReel {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return typeof row.id === 'string' && typeof row.url === 'string'
}

function readScanHistoryForFanpage(fanpageId: string): ScannedReel[] {
  try {
    const raw = localStorage.getItem(scanHistoryStorageKey(fanpageId))
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isScannedReelLike)
  } catch {
    return []
  }
}

function writeScanHistoryForFanpage(fanpageId: string, reels: ScannedReel[]) {
  try {
    localStorage.setItem(scanHistoryStorageKey(fanpageId), JSON.stringify(reels))
  } catch {
    /* ignore quota */
  }
}

function clearScanHistoryForFanpage(fanpageId: string) {
  try {
    localStorage.removeItem(scanHistoryStorageKey(fanpageId))
  } catch {
    /* ignore */
  }
}

function clearAllScanHistories() {
  try {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i)
      if (key?.startsWith(FB_REELS_SCAN_HISTORY_PREFIX)) keys.push(key)
    }
    keys.forEach((key) => localStorage.removeItem(key))
  } catch {
    /* ignore */
  }
}

function readStoredScanViewInput(key: string, fallback: string): string {
  try {
    const v = localStorage.getItem(key)
    if (v === null) return fallback
    return v
  } catch {
    return fallback
  }
}

export default function FacebookScreen() {
  const [activeView, setActiveView] = useState<'fanpages' | 'reels' | 'content'>('fanpages')
  const [openedFacebookUrls, setOpenedFacebookUrls] = useState<Set<string>>(new Set())
  const [scannedReels, setScannedReels] = useState<ScannedReel[]>([])
  const [hasMoreReels, setHasMoreReels] = useState(false)
  const hasMoreReelsRef = useRef(false)
  const [scanStatus, setScanStatus] = useState('')
  const [isScanning, setIsScanning] = useState(false)
  const [minViewInput, setMinViewInput] = useState(() =>
    readStoredScanViewInput(FB_REELS_SCAN_MIN_LS_KEY, formatViewInput(String(MIN_VIEW_COUNT))),
  )
  const [maxViewInput, setMaxViewInput] = useState(() =>
    readStoredScanViewInput(FB_REELS_SCAN_MAX_LS_KEY, ''),
  )
  const minViewInputRef = useRef(minViewInput)
  const maxViewInputRef = useRef(maxViewInput)
  const [selectedReel, setSelectedReel] = useState<ScannedReel | null>(null)
  const [contentText, setContentText] = useState('')
  const [originalContentText, setOriginalContentText] = useState('')
  const [isContentTranslated, setIsContentTranslated] = useState(false)
  const [copyStatus, setCopyStatus] = useState<'idle' | 'ok' | 'error'>('idle')
  const [isTranslating, setIsTranslating] = useState(false)
  const [translateStatus, setTranslateStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const [storySaveStatus, setVideoShortSaveStatus] = useState<'idle' | 'saving' | 'ok' | 'error'>('idle')
  const [isContentDirty, setIsContentDirty] = useState(false)
  const [contentReelLoadStatus, setContentReelLoadStatus] = useState('')
  /** Có ít nhất một tab cửa sổ hiện tại đang mở facebook.com/reel/… */
  const [hasDotComReelTab, setHasDotComReelTab] = useState(false)
  const [reelLinkInput, setReelLinkInput] = useState('')
  const [showAddFanpageForm, setShowAddFanpageForm] = useState(false)
  const [showEditFanpagesModal, setShowEditFanpagesModal] = useState(false)
  const [fanpageBulkInput, setFanpageBulkInput] = useState('')
  const [fanpageStatus, setFanpageStatus] = useState('')
  /** Fanpage dùng cho workflow (nút Play) — ưu tiên hơn `pickIndex` mặc định trên backend. */
  const [selectedFanpageId, setSelectedFanpageId] = useState<string | null>(null)
  const [editingFanpages, setEditingFanpages] = useState<FanpageItem[]>([])
  const queryClient = useQueryClient()
  const refreshRoleOnly = useAuth((s) => s.refreshRoleOnly)
  const role = useAuth((s) => s.role)
  const canUseWorkflow = role === 'user-vip' || role === 'admin'

  useEffect(() => {
    void refreshRoleOnly()
  }, [refreshRoleOnly])

  const { data: fanpages = [], isLoading: isLoadingFanpages } = useQuery<FanpageItem[]>({
    queryKey: ['fanpages'],
    queryFn: getFanpages,
  })

  useEffect(() => {
    if (!fanpages.length) {
      setSelectedFanpageId(null)
      return
    }
    setSelectedFanpageId((prev) => {
      if (prev && fanpages.some((p) => p._id === prev)) return prev
      try {
        const raw = localStorage.getItem(FB_SELECTED_FANPAGE_LS_KEY)
        if (raw && fanpages.some((p) => p._id === raw)) return raw
      } catch {
        /* ignore */
      }
      return null
    })
  }, [fanpages])

  useEffect(() => {
    try {
      if (selectedFanpageId) localStorage.setItem(FB_SELECTED_FANPAGE_LS_KEY, selectedFanpageId)
    } catch {
      /* ignore */
    }
  }, [selectedFanpageId])

  const checkReelQueryKey = useMemo(() => {
    const u = selectedReel?.url?.trim()
    return u ? canonicalSourceReelUrl(u) : ''
  }, [selectedReel?.url])

  const { data: reelSavedCheck } = useQuery({
    queryKey: ['video-shorts', 'sources', 'check-reel', checkReelQueryKey],
    queryFn: () => checkVideoSourceForReel(selectedReel!.url.trim()),
    enabled: Boolean(checkReelQueryKey),
    staleTime: 15_000,
    refetchOnMount: 'always',
  })
  /** Đã có VideoSource cho reel (GET /video-sources/check-reel). */
  const hasVideoSourceSynced = reelSavedCheck?.saved === true
  /** Hiển thị tick khi đã có nguồn trên server hoặc vừa lưu xong. */
  const reelSaveHasSyncedState = hasVideoSourceSynced || storySaveStatus === 'ok'

  const { data: myVideoSources = [] } = useQuery({
    queryKey: ['video-shorts', 'sources', 'my'],
    queryFn: getMyVideoSources,
    enabled: activeView === 'reels' || activeView === 'content',
    staleTime: 30_000,
  })

  const savedCanonicalReelUrls = useMemo(() => {
    const next = new Set<string>()
    for (const row of myVideoSources) {
      const u = (row.sourceReelUrl || '').trim()
      if (u) next.add(canonicalSourceReelUrl(u))
    }
    return next
  }, [myVideoSources])

  const skippedReelReasonByUrl = useMemo(() => {
    const next = new Map<string, string>()
    for (const row of myVideoSources) {
      const reason = (row.skipReason || '').trim()
      const u = (row.sourceReelUrl || '').trim()
      if (reason && u) next.set(canonicalSourceReelUrl(u), reason)
    }
    return next
  }, [myVideoSources])

  const { data: fbWorkflowSteps = [], isLoading: isLoadingFbWorkflowSteps } = useQuery<FacebookProcessStep[]>({
    queryKey: ['facebook-workflow-steps'],
    queryFn: async () => {
      const workflows = await getUserWorkflows({ platform: 'facebook' })
      const target = workflows[0] || null
      if (!target?._id) return []
      const detail = await getUserWorkflowDetail(target._id)
      return (detail.steps || [])
        .slice()
        .sort((a, b) => (a.stepNo || 0) - (b.stepNo || 0))
        .map((step) => ({
          id: `fb-step-${step.stepNo}`,
          label: (step.title || '').trim() || `Bước ${step.stepNo}`,
          prompt: (step.prompt || step.instruction || '').trim(),
          workflowId: target._id,
          workflowPlatform: (target.platform || 'facebook').trim().toLowerCase(),
          backendStepId: (step._id || '').trim(),
          stepNo: Number(step.stepNo) || 0,
          actionType: (step.actionType || 'custom').trim(),
          displayMode: normalizeStepDisplayMode(step.displayMode),
          inputSchema: (step.inputSchema || {}) as Record<string, unknown>,
        }))
        .filter((step) => step.backendStepId && step.workflowId)
    },
    staleTime: 60_000,
  })

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
  const scanAllStopRef = useRef(false)
  const isScanningRef = useRef(false)
  const scanResultRef = useRef<ScannedReel[]>([])
  const prevSelectedFanpageIdRef = useRef<string | null | undefined>(undefined)
  const contentTextRef = useRef('')
  const selectedReelRef = useRef<ScannedReel | null>(null)
  /** Fanpage URL vừa mở trong workflow — dùng để chọn đúng tab Facebook khi side panel không active tab fanpage */
  const workflowFanpageUrlRef = useRef<string | null>(null)
  /** Chỉ số fanpage trong `fanpages` đã mở ở bước `facebook_open_fanpage` — dùng cho fallbackFanpageCount. */
  const workflowOpenedFanpageIndexRef = useRef<number | null>(null)
  const fbWorkflowStopRef = useRef(false)
  const workflowCancelledRemotelyRef = useRef(false)
  const runningFbWorkflowRunIdRef = useRef('')
  const [fbWorkflowStatus, setFbWorkflowStatus] = useState('')
  const [isFbWorkflowRunning, setIsFbWorkflowRunning] = useState(false)
  /** Đồng bộ ngay khi bật/tắt workflow — callback refresh reel không được chờ re-render. */
  const isFbWorkflowRunningRef = useRef(false)
  const [isFbWorkflowStopping, setIsFbWorkflowStopping] = useState(false)
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
    try {
      localStorage.setItem(FB_REELS_SCAN_MIN_LS_KEY, minViewInput)
    } catch {
      /* ignore */
    }
  }, [minViewInput])

  useEffect(() => {
    try {
      localStorage.setItem(FB_REELS_SCAN_MAX_LS_KEY, maxViewInput)
    } catch {
      /* ignore */
    }
  }, [maxViewInput])

  useEffect(() => {
    minViewInputRef.current = minViewInput
  }, [minViewInput])

  useEffect(() => {
    maxViewInputRef.current = maxViewInput
  }, [maxViewInput])

  const getExtensionScanViewBounds = () => {
    const minViews = Number(minViewInputRef.current.replace(/[^\d]/g, '')) || MIN_VIEW_COUNT
    const maxDigits = maxViewInputRef.current.replace(/[^\d]/g, '')
    const maxParsed = maxDigits ? Number(maxDigits) : NaN
    const maxViews = Number.isFinite(maxParsed) && maxParsed > 0 ? maxParsed : undefined
    return {
      minViews,
      ...(maxViews != null ? { maxViews } : {}),
    }
  }

  useEffect(() => {
    isContentDirtyRef.current = isContentDirty
  }, [isContentDirty])

  useEffect(() => {
    isScanningRef.current = isScanning
  }, [isScanning])

  useEffect(() => {
    hasMoreReelsRef.current = hasMoreReels
  }, [hasMoreReels])

  useEffect(() => {
    scanResultRef.current = scannedReels
  }, [scannedReels])

  useEffect(() => {
    if (prevSelectedFanpageIdRef.current === selectedFanpageId) return
    prevSelectedFanpageIdRef.current = selectedFanpageId

    if (!selectedFanpageId) {
      setScannedReels([])
      scanResultRef.current = []
      setSelectedReel(null)
      return
    }

    const stored = readScanHistoryForFanpage(selectedFanpageId)
    setScannedReels(stored)
    scanResultRef.current = stored
    setSelectedReel(null)
    setContentText('')
    setOriginalContentText('')
    setIsContentDirty(false)
  }, [selectedFanpageId])

  useEffect(() => {
    contentTextRef.current = contentText
  }, [contentText])

  useEffect(() => {
    selectedReelRef.current = selectedReel
  }, [selectedReel])

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
    setVideoShortSaveStatus('idle')
  }, [selectedReel?.id])

  useEffect(() => {
    if (selectedReel) setContentReelLoadStatus('')
  }, [selectedReel])

  const normalizeUrl = (value: string) => (value.endsWith('/') ? value.slice(0, -1) : value)

  /** `www`/`web`/apex Facebook coi là một — dùng cho quét reels & workflow khớp fanpage. */
  const normalizeFacebookFanpageHost = (hostname: string) => {
    const h = hostname.replace(/^www\./i, '').toLowerCase()
    if (h === 'facebook.com' || h === 'web.facebook.com') return '__fb_desktop__'
    return h
  }

  const tabMatchesFanpageUrl = (tabUrl: string, fanpageUrl: string) => {
    try {
      const current = new URL(tabUrl)
      const allowed = new URL(fanpageUrl)
      if (normalizeFacebookFanpageHost(current.hostname) !== normalizeFacebookFanpageHost(allowed.hostname)) return false
      const currentPath = normalizeUrl(current.pathname)
      const allowedPath = normalizeUrl(allowed.pathname)
      const currentId = current.searchParams.get('id')
      const allowedId = allowed.searchParams.get('id')
      if (allowedPath === '/profile.php') {
        return currentPath === '/profile.php' && !!allowedId && currentId === allowedId
      }
      return currentPath === allowedPath || currentPath.startsWith(`${allowedPath}/`)
    } catch {
      return false
    }
  }

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

  /** Bật nút film (Chi tiết reel) chỉ khi có tab facebook.com/reel/… trong cửa sổ hiện tại. */
  useEffect(() => {
    if (activeView !== 'content') {
      setHasDotComReelTab(false)
      return
    }
    const extensionChrome = (globalThis as { chrome?: ExtensionChrome }).chrome
    const query = extensionChrome?.tabs?.query
    if (!query) {
      setHasDotComReelTab(false)
      return
    }
    const tick = () => {
      query({ currentWindow: true }, (tabs) => {
        const ok = (tabs || []).some((t) => t.url && isFacebookDotComReelPath(t.url))
        setHasDotComReelTab(ok)
      })
    }
    tick()
    const id = window.setInterval(tick, 2000)
    return () => window.clearInterval(id)
  }, [activeView])

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
    clearScanHistoryForFanpage(id)
    if (selectedFanpageId === id) {
      setSelectedFanpageId(null)
    }
    await queryClient.invalidateQueries({ queryKey: ['fanpages'] })
    setEditingFanpages((prev) => prev.filter((item) => item._id !== id))
    setFanpageStatus('Đã xóa fanpage.')
  }

  const handleDeleteAllFanpages = async () => {
    await deleteAllFanpagesMutation.mutateAsync()
    clearAllScanHistories()
    setSelectedFanpageId(null)
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
          'Không thấy tab facebook.com hoặc web.facebook.com/reel/… Hãy mở reel đúng định dạng này trong Chrome.',
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
      tabs.filter((t) => t.url && isFacebookDotComReelPath(t.url))

    tabsQuery({ currentWindow: true }, (windowTabs) => {
      const list = windowTabs || []
      const activeTab = list.find((t) => t.active)
      if (activeTab?.url && isFacebookDotComReelPath(activeTab.url)) {
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
      setCopyStatus('ok')
      window.setTimeout(() => setCopyStatus('idle'), 1200)
    } catch {
      setCopyStatus('error')
      window.setTimeout(() => setCopyStatus('idle'), 1200)
    }
  }

  const saveVideoShortToServer = async () => {
    const urlRaw = selectedReel?.url?.trim()
    if (
      !urlRaw ||
      !contentText.trim() ||
      storySaveStatus === 'saving'
    ) {
      return
    }
    setVideoShortSaveStatus('saving')
    try {
      await syncVideoSourceFromReel({
        sourceContent: contentText.trim(),
        sourceReelUrl: urlRaw,
        name: (selectedReel?.title || '').trim().slice(0, 200),
      })
      setVideoShortSaveStatus('ok')
      void queryClient.invalidateQueries({ queryKey: ['video-shorts', 'sources', 'check-reel'] })
      void queryClient.invalidateQueries({ queryKey: ['video-shorts', 'my'] })
      void queryClient.invalidateQueries({ queryKey: ['video-shorts', 'sources', 'my'] })
      window.setTimeout(() => setVideoShortSaveStatus('idle'), 2800)
    } catch (e) {
      if (isAxiosError(e) && e.response?.status === 409) {
        void queryClient.invalidateQueries({ queryKey: ['video-shorts', 'sources', 'check-reel'] })
        void queryClient.invalidateQueries({ queryKey: ['video-shorts', 'my'] })
        void queryClient.invalidateQueries({ queryKey: ['video-shorts', 'sources', 'my'] })
        setVideoShortSaveStatus('ok')
        window.setTimeout(() => setVideoShortSaveStatus('idle'), 2200)
        return
      }
      setVideoShortSaveStatus('error')
      window.setTimeout(() => setVideoShortSaveStatus('idle'), 4000)
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

    extensionChrome.tabs.query({ url: ['*://*.facebook.com/*', '*://facebook.com/*'] }, async (tabs) => {
      const reelTabs = (tabs || []).filter((tab) => tab.url && isFacebookDotComReelPath(tab.url))
      const matchedTab =
        reelTabs.find((tab) => {
          const tabUrl = tab.url || ''
          if (normalize(tabUrl) === normalizedTarget) return true
          if (reelId && tabUrl.includes(reelId)) return true
          return false
        }) ||
        reelTabs.find((tab) => tab.active && tab.id) ||
        reelTabs[0]

      if (!matchedTab?.id || !matchedTab.url) {
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
        if (isFbWorkflowRunningRef.current) {
          void syncVideoSourceFromReel({
            sourceReelUrl: targetReel.url.trim(),
            sourceContent: description.trim(),
            name: (targetReel.title || '').trim().slice(0, 200),
          })
            .then(() => {
              void queryClient.invalidateQueries({
                queryKey: ['video-shorts', 'sources', 'check-reel', targetReel.url],
              })
              void queryClient.invalidateQueries({ queryKey: ['video-shorts', 'sources', 'my'] })
            })
            .catch(() => {
              /* chưa đăng nhập hoặc lỗi mạng — bỏ qua */
            })
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

  /** Khi workflow gọi ngay sau setMinViewInput, state React chưa kịp cập nhật — phải truyền bounds trực tiếp. */
  const handleScanReels = (
    append = false,
    viewBounds?: { minViews: number; maxViews?: number },
    options?: { fullPass?: boolean },
  ) => {
    const fullPass = Boolean(options?.fullPass)
    const resultLimit = fullPass ? MAX_SCAN_FULL_PASS_RESULTS : MAX_SCAN_RESULTS
    const extensionChrome = (globalThis as { chrome?: ExtensionChrome }).chrome
    const minViewCount = viewBounds
      ? Math.max(1, Math.floor(viewBounds.minViews))
      : Number(minViewInput.replace(/[^\d]/g, '')) || MIN_VIEW_COUNT

    let maxViewCount: number
    if (viewBounds) {
      const mv = viewBounds.maxViews
      maxViewCount =
        mv != null && Number.isFinite(mv) && mv > 0 ? mv : Number.POSITIVE_INFINITY
    } else {
      const parsedMaxView = Number(maxViewInput.replace(/[^\d]/g, ''))
      maxViewCount =
        Number.isFinite(parsedMaxView) && parsedMaxView > 0 ? parsedMaxView : Number.POSITIVE_INFINITY
    }
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
      fullPass
        ? 'Đang quét hết — cuộn toàn bộ trang reels và lấy video còn lại...'
        : append
          ? 'Đang quét thêm reels theo khoảng lượt xem...'
          : 'Đang quét reels theo khoảng lượt xem — extension sẽ cuộn trang để tải thêm video nếu cần...',
    )
    extensionChrome.tabs.query({ url: ['*://*.facebook.com/*'], currentWindow: true }, async (fbTabs) => {
      const list = fbTabs || []
      const pickTab = (): (typeof list)[number] | undefined => {
        const prefer = workflowFanpageUrlRef.current?.trim()
        if (prefer) {
          const hit = list.find((t) => t.url && tabMatchesFanpageUrl(t.url, prefer))
          if (hit?.id != null && extensionChrome.tabs?.update) {
            extensionChrome.tabs.update(hit.id, { active: true })
            return hit
          }
          if (hit) return hit
        }
        const allowed = (u: string) => fanpages.some((page) => tabMatchesFanpageUrl(u, page.url))
        const activeOk = list.find((t) => t.active && t.url && allowed(t.url))
        if (activeOk) return activeOk
        const anyOk = list.find((t) => t.url && allowed(t.url))
        if (anyOk) return anyOk
        return list.find((t) => t.active) || list[0]
      }
      const targetTab = pickTab()

      if (!targetTab?.id) {
        setScanStatus('Hãy mở fanpage Facebook cần quét trong cửa sổ (tab Facebook).')
        setScannedReels([])
        setIsScanning(false)
        return
      }

      const targetUrl = targetTab.url || ''
      const isAllowedFanpageTab = fanpages.some((page) => tabMatchesFanpageUrl(targetUrl, page.url))

      if (!isAllowedFanpageTab) {
        setScanStatus('Chỉ quét khi có tab fanpage có trong danh sách (hoặc đúng fanpage workflow).')
        setScannedReels([])
        setIsScanning(false)
        return
      }

      const scanToken = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      scanControlRef.current = { token: scanToken, tabId: targetTab.id }

      try {
        const result = await extensionChrome.scripting?.executeScript?.({
          target: { tabId: targetTab.id },
          func: (async (
            minViews: number,
            maxViewsArgInner: number,
            limit: number,
            token: string,
            excludedUrls: string[],
            fullPassInner: boolean,
          ) => {
            const fullPass = Boolean(fullPassInner)
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

            let reachedScrollEnd = false

            for (let round = 0; round < MAX_SCROLL_ROUNDS; round += 1) {
              if (control[token]?.stop) break
              scrapePass(uniqueByUrl)
              if (!fullPass && uniqueByUrl.size >= limit) {
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
                reachedScrollEnd = true
                break
              }
            }

            const sorted = Array.from(uniqueByUrl.values()).sort((a, b) => b.viewCount - a.viewCount)
            const foundCount = sorted.length
            const rows = sorted.slice(0, limit)
            return {
              rows,
              foundCount,
              reachedScrollEnd,
              truncated: foundCount > limit,
              hasMore: fullPass
                ? !reachedScrollEnd && foundCount > 0
                : foundCount > limit,
            }
          }) as (...args: unknown[]) => unknown,
          args: [minViewCount, maxViewArg, resultLimit, scanToken, existingUrls, fullPass],
        })

        if (!result) {
          setScanStatus('Quét thất bại: không nhận được kết quả từ executeScript.')
          setScannedReels([])
          setIsScanning(false)
          return
        }

        const payload =
          (result?.[0]?.result as
            | {
                rows?: ScannedReel[]
                hasMore?: boolean
                foundCount?: number
                truncated?: boolean
                reachedScrollEnd?: boolean
              }
            | undefined) || {}
        const reels = payload.rows || []
        const foundCount = Number(payload.foundCount) || reels.length
        const prevCount = append ? scanResultRef.current.length : 0
        const historyFanpageId =
          fanpages.find((page) => tabMatchesFanpageUrl(targetUrl, page.url))?._id || selectedFanpageId
        const mergedList = (() => {
          if (!append) return reels
          const map = new Map<string, ScannedReel>()
          scanResultRef.current.forEach((item) => map.set(item.url, item))
          reels.forEach((item) => map.set(item.url, item))
          return Array.from(map.values())
        })()
        setHasMoreReels(Boolean(payload.hasMore))
        setScannedReels(mergedList)
        scanResultRef.current = mergedList
        if (historyFanpageId) {
          writeScanHistoryForFanpage(historyFanpageId, mergedList)
        }
        const mergedCount = mergedList.length
        const addedCount = Math.max(0, mergedCount - prevCount)
        const rangeLabel =
          Number.isFinite(maxViewCount) && maxViewCount !== Number.POSITIVE_INFINITY
            ? `${minViewCount.toLocaleString('en-US')} - ${maxViewCount.toLocaleString('en-US')}`
            : `>= ${minViewCount.toLocaleString('en-US')}`
        if (fullPass) {
          if (reels.length === 0) {
            setScanStatus(
              payload.reachedScrollEnd
                ? `Đã quét hết trang: không còn reel mới trong khoảng ${rangeLabel} lượt xem.`
                : `Không thấy reel mới (có thể đã lấy hết hoặc bị dừng giữa chừng).`,
            )
          } else if (payload.truncated) {
            setScanStatus(
              `Đã quét hết (giới hạn ${resultLimit} reel/lần): thêm ${addedCount} reel. Tổng ${mergedCount} trong danh sách (${foundCount} khớp bộ lọc trên trang).`,
            )
          } else {
            setScanStatus(
              `Đã quét hết trang: thêm ${addedCount} reel. Tổng ${mergedCount} trong danh sách.`,
            )
          }
        } else {
          setScanStatus(
            reels.length > 0
              ? append
                ? `Đã quét thêm ${reels.length} video (${foundCount} mới trên đoạn vừa quét). Tổng ${mergedCount} — khoảng ${rangeLabel} lượt xem.`
                : `Đã quét được ${reels.length} video trong khoảng ${rangeLabel} lượt xem.`
              : `Không tìm thấy video nào trong khoảng ${rangeLabel} lượt xem.`,
          )
        }
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

  const handleScanAllReels = async () => {
    if (isScanningRef.current) return
    if (scannedReels.length === 0) {
      setScanStatus('Hãy «Quét reels ngay» trước, sau đó mới «Quét hết».')
      return
    }

    scanAllStopRef.current = false
    handleScanReels(true, undefined, { fullPass: true })
    try {
      await waitScanIdle(360_000)
    } catch {
      if (!scanAllStopRef.current) {
        setScanStatus('Quét hết bị gián đoạn (timeout). Hãy cuộn fanpage reels thủ công rồi thử lại.')
      }
    }
  }

  const handleStopScan = () => {
    scanAllStopRef.current = true
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

  const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms))

  const fetchUnsavedScannedReels = async () => {
    const sources = await queryClient.fetchQuery({
      queryKey: ['video-shorts', 'sources', 'my'],
      queryFn: getMyVideoSources,
    })
    const handledSet = new Set<string>()
    for (const row of sources) {
      const u = (row.sourceReelUrl || '').trim()
      if (u) handledSet.add(canonicalSourceReelUrl(u))
    }

    let rows = scanResultRef.current
    for (let i = 0; i < 40 && rows.length === 0; i += 1) {
      await sleep(250)
      rows = scanResultRef.current
    }

    return rows.filter((r) => !handledSet.has(canonicalSourceReelUrl(r.url)))
  }

  const waitForReelCaption = async (minLen: number, timeoutMs: number) => {
    const t0 = Date.now()
    while (Date.now() - t0 < timeoutMs) {
      if (fbWorkflowStopRef.current) throw new Error('Đã dừng workflow')
      const sr = selectedReelRef.current
      if (sr) refreshSelectedReelFromFacebook(sr)
      await sleep(1600)
      if ((contentTextRef.current || '').trim().length >= minLen) {
        return contentTextRef.current.trim().length
      }
    }
    return null
  }

  const waitScanIdle = (timeoutMs = 180_000) =>
    new Promise<void>((resolve, reject) => {
      const started = Date.now()
      const tick = () => {
        if (!isScanningRef.current) {
          resolve()
          return
        }
        if (Date.now() - started > timeoutMs) {
          reject(new Error('Timeout khi chờ quét reels'))
          return
        }
        window.setTimeout(tick, 250)
      }
      tick()
    })

  const executeFacebookWorkflowStep = async (
    step: FacebookProcessStep,
    facebookCriteria?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> => {
    const schema = step.inputSchema || {}
    switch (step.actionType) {
      case 'facebook_open_fanpage': {
        let url = (schema.fanpageUrl as string | undefined)?.trim()
        const pickRaw = schema.pickIndex
        const pickIndex = pickRaw !== undefined && pickRaw !== null ? Number(pickRaw) : NaN
        const nameContains = (schema.nameContains as string | undefined)?.trim().toLowerCase()
        const criteriaPickIndexExplicit =
          facebookCriteria != null && Object.prototype.hasOwnProperty.call(facebookCriteria, 'pickIndex')

        if (!url && nameContains) {
          const fp = fanpages.find((p) => p.name.toLowerCase().includes(nameContains))
          if (!fp) throw new Error(`Không tìm thấy fanpage chứa "${nameContains}"`)
          url = fp.url
        }
        if (!url && !criteriaPickIndexExplicit && selectedFanpageId) {
          const fp = fanpages.find((p) => p._id === selectedFanpageId)
          const u = fp?.url?.trim()
          if (u) url = u
        }
        if (!url && Number.isFinite(pickIndex) && pickIndex >= 0) {
          const fp = fanpages[pickIndex]
          if (!fp) throw new Error(`Không có fanpage tại pickIndex=${pickIndex}`)
          url = fp.url
        }
        if (!url) throw new Error('facebook_open_fanpage: thêm fanpageUrl, nameContains hoặc pickIndex trong inputSchema')

        let openedListIndex: number | null = null
        const idxByUrl = fanpages.findIndex((p) => {
          try {
            return tabMatchesFanpageUrl(url, p.url)
          } catch {
            return false
          }
        })
        if (idxByUrl >= 0) {
          openedListIndex = idxByUrl
        } else if (Number.isFinite(pickIndex) && pickIndex >= 0) {
          openedListIndex = Math.floor(pickIndex)
        }
        workflowOpenedFanpageIndexRef.current = openedListIndex

        openFanpage(url)
        workflowFanpageUrlRef.current = url
        setActiveView('reels')
        await sleep(2500)
        return { fanpageUrl: url }
      }
      case 'facebook_scan_reels': {
        const viewBounds = getExtensionScanViewBounds()
        const fbCountRaw = schema.fallbackFanpageCount != null ? Number(schema.fallbackFanpageCount) : 0
        const fallbackFanpageCount =
          Number.isFinite(fbCountRaw) && fbCountRaw >= 0 ? Math.floor(fbCountRaw) : 0
        const baseFanpageIdx = workflowOpenedFanpageIndexRef.current

        const pollRowsAfterScan = async () => {
          let rows = scanResultRef.current
          for (let i = 0; i < 40 && rows.length === 0; i++) {
            await sleep(250)
            rows = scanResultRef.current
          }
          return rows
        }

        const runScanPass = async (appendFlag: boolean) => {
          handleScanReels(appendFlag, viewBounds)
          await waitScanIdle()
          await sleep(400)
          return pollRowsAfterScan()
        }

        let rows = await runScanPass(Boolean(schema.append))
        let scanPasses = 1

        if (rows.length === 0 && fallbackFanpageCount > 0 && baseFanpageIdx !== null && baseFanpageIdx >= 0) {
          for (let step = 1; step <= fallbackFanpageCount; step += 1) {
            const nextIdx = baseFanpageIdx + step
            if (nextIdx >= fanpages.length) break
            const fp = fanpages[nextIdx]
            const nextUrl = fp?.url?.trim()
            if (!nextUrl) continue
            openFanpage(nextUrl)
            workflowFanpageUrlRef.current = nextUrl
            workflowOpenedFanpageIndexRef.current = nextIdx
            setActiveView('reels')
            await sleep(2500)
            scanPasses += 1
            rows = await runScanPass(false)
            if (rows.length > 0) break
          }
        }

        return { scannedCount: rows.length, scanPasses, fallbackFanpageCount }
      }
      case 'facebook_select_reel': {
        const idx = schema.index != null ? Number(schema.index) : 0
        if (!Number.isFinite(idx) || idx < 0) {
          throw new Error('facebook_select_reel: index không hợp lệ')
        }
        const maxAppendRounds =
          schema.maxAppendRounds != null && Number.isFinite(Number(schema.maxAppendRounds))
            ? Math.max(0, Number(schema.maxAppendRounds))
            : 8

        const pollUntilRows = async () => {
          let rows = scanResultRef.current
          for (let i = 0; i < 40 && rows.length === 0; i++) {
            await sleep(250)
            rows = scanResultRef.current
          }
          return rows
        }

        let appendRound = 0

        while (true) {
          if (fbWorkflowStopRef.current) throw new Error('Đã dừng workflow')

          const sources = await queryClient.fetchQuery({
            queryKey: ['video-shorts', 'sources', 'my'],
            queryFn: getMyVideoSources,
          })
          const savedSet = new Set<string>()
          for (const row of sources) {
            const u = (row.sourceReelUrl || '').trim()
            if (u) savedSet.add(canonicalSourceReelUrl(u))
          }

          let rows = scanResultRef.current
          if (rows.length === 0) rows = await pollUntilRows()

          const unsaved = rows.filter((r) => !savedSet.has(canonicalSourceReelUrl(r.url)))
          const reel = unsaved[idx]

          if (reel) {
            handleSelectReel(reel)
            await sleep(900)
            return {
              reelUrl: reel.url,
              unsavedIndex: idx,
              unsavedCount: unsaved.length,
              appendRoundsUsed: appendRound,
            }
          }

          if (rows.length === 0) {
            throw new Error(`Không có reel sau quét (cần reel chưa lưu tại index=${idx}).`)
          }

          const canAppend = hasMoreReelsRef.current && appendRound < maxAppendRounds

          if (!canAppend) {
            if (unsaved.length === 0) {
              throw new Error(
                `Không có reel chưa lưu (${rows.length} reel đều đã lưu). Đã hết reel để quét thêm hoặc đạt giới hạn quét thêm (${maxAppendRounds} lần).`,
              )
            }
            throw new Error(
              `Không đủ reel chưa lưu tại index=${idx} (chỉ còn ${unsaved.length} reel chưa lưu).`,
            )
          }

          appendRound += 1
          handleScanReels(true, getExtensionScanViewBounds())
          await waitScanIdle()
          await sleep(500)
        }
      }
      case 'facebook_wait_content': {
        const minLen = schema.minLength != null ? Number(schema.minLength) : 30
        const timeoutMs = 15_000
        const maxSkipAttempts = Math.max(scanResultRef.current.length, 1)
        let skippedCount = 0
        const skippedUrls: string[] = []

        while (skippedCount <= maxSkipAttempts) {
          if (fbWorkflowStopRef.current) throw new Error('Đã dừng workflow')

          let current = selectedReelRef.current
          if (!current?.url) {
            const unsaved = await fetchUnsavedScannedReels()
            if (!unsaved.length) {
              throw new Error('Không còn reel chưa xử lý để chờ caption.')
            }
            handleSelectReel(unsaved[0])
            await sleep(900)
            current = selectedReelRef.current
          }

          const contentLength = await waitForReelCaption(minLen, timeoutMs)
          if (contentLength != null && current?.url) {
            return {
              contentLength,
              reelUrl: current.url,
              skippedCount,
              skippedUrls,
            }
          }

          if (!current?.url) {
            throw new Error('Không có reel đang chọn để bỏ qua.')
          }

          await skipVideoSourceFromReel({
            sourceReelUrl: current.url.trim(),
            name: (current.title || '').trim().slice(0, 200),
            reason: 'caption_timeout',
          })
          skippedUrls.push(current.url.trim())
          skippedCount += 1

          void queryClient.invalidateQueries({ queryKey: ['video-shorts', 'sources', 'my'] })
          void queryClient.invalidateQueries({
            queryKey: ['video-shorts', 'sources', 'check-reel', canonicalSourceReelUrl(current.url)],
          })

          setFbWorkflowStatus(
            `Caption quá ${Math.round(timeoutMs / 1000)}s — đã bỏ qua ${skippedCount} reel, thử reel tiếp…`,
          )

          const unsaved = await fetchUnsavedScannedReels()
          if (!unsaved.length) {
            throw new Error(
              skippedCount > 0
                ? `Đã bỏ qua ${skippedCount} reel (caption timeout) — không còn reel chưa xử lý.`
                : 'Timeout chờ nội dung caption đủ dài',
            )
          }

          handleSelectReel(unsaved[0])
          await sleep(900)
        }

        throw new Error(
          `Đã bỏ qua ${skippedCount} reel caption timeout — vượt giới hạn thử (${maxSkipAttempts}).`,
        )
      }
      case 'facebook_save_video_short': {
        const sr = selectedReelRef.current
        const text = contentTextRef.current.trim()
        if (!sr?.url || !text) throw new Error('Thiếu reel hoặc nội dung để lưu')
        try {
          const saved = await syncVideoSourceFromReel({
            sourceContent: text,
            sourceReelUrl: sr.url.trim(),
            name: (sr.title || '').trim().slice(0, 200),
          })
          void queryClient.invalidateQueries({ queryKey: ['video-shorts', 'sources', 'check-reel'] })
          void queryClient.invalidateQueries({ queryKey: ['video-shorts', 'my'] })
          void queryClient.invalidateQueries({ queryKey: ['video-shorts', 'sources', 'my'] })
          return { saved: true, videoSourceId: saved._id }
        } catch (e: unknown) {
          if (isAxiosError(e) && e.response?.status === 409) {
            return { skipped: true, reason: 'duplicate_reel' }
          }
          throw e
        }
      }
      default:
        throw new Error(`Bước chưa hỗ trợ trên Facebook: ${step.actionType}`)
    }
  }

  const stopFbWorkflowRun = () => {
    fbWorkflowStopRef.current = true
    setIsFbWorkflowStopping(true)
    setFbWorkflowStatus('Đang dừng workflow sau bước hiện tại…')
  }

  const stopFbWorkflowRunFromWeb = () => {
    if (!isFbWorkflowRunningRef.current || fbWorkflowStopRef.current) return
    workflowCancelledRemotelyRef.current = true
    fbWorkflowStopRef.current = true
    setIsFbWorkflowStopping(true)
    setFbWorkflowStatus('Đã hủy từ web — dừng sau bước hiện tại…')
  }

  const runFbWorkflow = async (options?: {
    runId?: string
    workflowId?: string
    source?: string
    /** Tiêu chí ghi đè (Telegram `payload.facebookCriteria` hoặc mở rộng sau này). */
    facebookCriteria?: Record<string, unknown>
  }) => {
    if (!canUseWorkflow) {
      setFbWorkflowStatus('Workflow chỉ dành cho VIP hoặc admin.')
      return
    }
    const extensionChrome = (globalThis as { chrome?: ExtensionChrome }).chrome
    if (!extensionChrome?.tabs?.query || !extensionChrome?.scripting?.executeScript) {
      setFbWorkflowStatus('Cần extension Chrome (tabs + scripting).')
      return
    }
    if (!fbWorkflowSteps.length || isFbWorkflowRunning) return

    const first = fbWorkflowSteps[0]
    if (!first?.workflowId) {
      setFbWorkflowStatus('Chưa có workflow Facebook trên backend.')
      return
    }
    if (options?.workflowId && options.workflowId !== first.workflowId) {
      setFbWorkflowStatus('Workflow không khớp với dữ liệu đang tải.')
      return
    }

    isFbWorkflowRunningRef.current = true
    setIsFbWorkflowRunning(true)
    setIsFbWorkflowStopping(false)
    fbWorkflowStopRef.current = false
    workflowCancelledRemotelyRef.current = false

    let workflowRunId = options?.runId || ''
    runningFbWorkflowRunIdRef.current = workflowRunId
    let mwOutcome: 'completed' | 'failed' | 'cancelled' | null = null
    let mwErrorMessage = ''
    let mwVideoSourceId = ''

    let facebookCriteria = options?.facebookCriteria
    if (workflowRunId && facebookCriteria === undefined && options?.source === 'sse') {
      try {
        const r = await getWorkflowRunById(workflowRunId)
        const raw = r.payload?.facebookCriteria
        if (raw && typeof raw === 'object' && Object.keys(raw).length > 0) {
          facebookCriteria = raw as Record<string, unknown>
        }
      } catch {
        /* payload có thể đã có trên SSE */
      }
    }

    try {
      if (!workflowRunId) {
        setFbWorkflowStatus(`Tạo workflow run (${fbWorkflowSteps.length} bước)…`)
        const run = await createWorkflowRun({
          workflowId: first.workflowId,
          payload: { source: options?.source || 'facebook_screen', totalSteps: fbWorkflowSteps.length },
        })
        workflowRunId = run._id
        runningFbWorkflowRunIdRef.current = workflowRunId
      } else {
        await updateWorkflowRun(workflowRunId, {
          status: 'running',
          progress: 0,
          currentStepNo: 0,
          startedAt: new Date().toISOString(),
          finishedAt: null,
          result: {},
          error: { code: '', message: '', details: {} },
        })
      }

      for (let index = 0; index < fbWorkflowSteps.length; index += 1) {
        const step = fbWorkflowSteps[index]
        const effectiveStep = mergeFacebookStepCriteria(step, facebookCriteria)
        const stepNo = step.stepNo || index + 1
        const progress = Math.round((index / fbWorkflowSteps.length) * 100)

        await updateWorkflowRun(workflowRunId, {
          status: 'running',
          currentStepNo: stepNo,
          progress,
        })

        setFbWorkflowStatus(`Workflow: ${step.label} (${index + 1}/${fbWorkflowSteps.length})`)

        const stepRun = await createStepRun({
          workflowRunId,
          workflowId: step.workflowId,
          stepId: step.backendStepId,
          stepNo,
          stepTitle: step.label,
          status: 'running',
          input: {
            actionType: effectiveStep.actionType,
            inputSchema: effectiveStep.inputSchema || {},
          },
        })

        try {
          const output = await executeFacebookWorkflowStep(effectiveStep, facebookCriteria)
          const outputVideoSourceId =
            output && typeof output === 'object' && 'videoSourceId' in output
              ? String((output as { videoSourceId?: string }).videoSourceId || '').trim()
              : ''
          if (outputVideoSourceId) {
            mwVideoSourceId = outputVideoSourceId
          }
          await updateStepRun(stepRun._id, {
            status: 'completed',
            output: output as Record<string, unknown>,
            finishedAt: new Date().toISOString(),
          })
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Step failed'
          await updateStepRun(stepRun._id, {
            status: 'failed',
            error: { message: errorMessage },
            finishedAt: new Date().toISOString(),
          })
          await updateWorkflowRun(workflowRunId, {
            status: 'failed',
            progress,
            currentStepNo: stepNo,
            error: { code: 'STEP_FAILED', message: errorMessage, details: { stepNo } },
            finishedAt: new Date().toISOString(),
          })
          throw error
        }

        if (fbWorkflowStopRef.current) {
          await updateWorkflowRun(workflowRunId, {
            status: 'cancelled',
            progress: Math.round(((index + 1) / fbWorkflowSteps.length) * 100),
            currentStepNo: stepNo,
            finishedAt: new Date().toISOString(),
          })
          setFbWorkflowStatus(`Đã dừng tại: ${step.label}`)
          mwOutcome = 'cancelled'
          return
        }
      }

      await updateWorkflowRun(workflowRunId, {
        status: 'completed',
        progress: 100,
        currentStepNo: fbWorkflowSteps[fbWorkflowSteps.length - 1]?.stepNo || fbWorkflowSteps.length,
        result: { completedSteps: fbWorkflowSteps.length },
        finishedAt: new Date().toISOString(),
      })
      setFbWorkflowStatus(`Hoàn tất ${fbWorkflowSteps.length} bước.`)
      mwOutcome = 'completed'
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Workflow lỗi'
      if (fbWorkflowStopRef.current) {
        mwOutcome = 'cancelled'
      } else {
        mwOutcome = 'failed'
        mwErrorMessage = msg
      }
      if (!workflowRunId) {
        setFbWorkflowStatus('Không tạo được workflow run.')
      } else if (!fbWorkflowStopRef.current) {
        setFbWorkflowStatus(`Lỗi: ${msg}`)
      }
    } finally {
      fbWorkflowStopRef.current = false
      workflowFanpageUrlRef.current = null
      workflowOpenedFanpageIndexRef.current = null
      if (workflowRunId && mwOutcome && !workflowCancelledRemotelyRef.current) {
        try {
          await finalizeMultiWorkflowJobAfterWorkflowRun(workflowRunId, mwOutcome, {
            videoSourceId: mwVideoSourceId || undefined,
            errorMessage: mwErrorMessage,
          })
        } catch {
          /* BE có thể đã cập nhật job — bỏ qua lỗi mạng lặp */
        }
      }
      workflowCancelledRemotelyRef.current = false
      runningFbWorkflowRunIdRef.current = ''
      isFbWorkflowRunningRef.current = false
      setIsFbWorkflowRunning(false)
      setIsFbWorkflowStopping(false)
    }
  }

  useEffect(() => {
    if (!canUseWorkflow || !fbWorkflowSteps.length) return
    const eventSource = createWorkflowRunEventSource()
    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(String(event.data || '{}')) as WorkflowRunStreamEvent
        const cancelledRun = getCancelledWorkflowRunFromStream(payload)
        if (
          cancelledRun &&
          shouldStopLocalWorkflowForCancelledRun(
            cancelledRun._id,
            runningFbWorkflowRunIdRef.current,
          )
        ) {
          stopFbWorkflowRunFromWeb()
          return
        }
        if (payload?.type !== 'workflow_run_created') return
        const run = payload.run
        if (!run?._id || !run?.workflowId) return
        if (!shouldAcceptWorkflowRunFromStream(run, fbWorkflowSteps[0]?.workflowId || '')) return
        if (isFbWorkflowRunning) return
        if (runningFbWorkflowRunIdRef.current === run._id) return
        setFbWorkflowStatus(`SSE: chạy multi workflow ${run._id}`)
        const runPayload = (run.payload || {}) as { facebookCriteria?: Record<string, unknown> }
        void runFbWorkflow({
          runId: run._id,
          workflowId: run.workflowId,
          source: 'sse',
          facebookCriteria: runPayload.facebookCriteria,
        })
      } catch {
        /* ignore */
      }
    }
    eventSource.onerror = () => {}
    return () => eventSource.close()
    // Không phụ thuộc isFbWorkflowRunning để tránh đóng/mở SSE giữa chừng khi chạy workflow
  }, [canUseWorkflow, fbWorkflowSteps])

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

      {canUseWorkflow ? (
        <section className="mb-3 rounded-2xl border border-violet-400/25 bg-violet-500/10 px-3 py-2">
          <div className="flex items-center gap-2">
            {isFbWorkflowRunning ? (
              <button
                type="button"
                onClick={stopFbWorkflowRun}
                disabled={isFbWorkflowStopping}
                className="inline-flex h-8 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-rose-500/25 px-2 text-rose-100 transition hover:bg-rose-500/35 disabled:cursor-not-allowed disabled:opacity-50"
                title={isFbWorkflowStopping ? 'Đang dừng…' : 'Dừng workflow'}
                aria-label="Dừng workflow Facebook"
              >
                {isFbWorkflowStopping ? (
                  <FiRefreshCw className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <FiSquare className="h-4 w-4" aria-hidden />
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void runFbWorkflow()}
                disabled={!fbWorkflowSteps.length || isLoadingFbWorkflowSteps}
                className="inline-flex h-8 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-violet-500/25 px-2 text-violet-100 transition hover:bg-violet-500/35 disabled:cursor-not-allowed disabled:opacity-50"
                title="Chạy workflow Facebook"
                aria-label="Chạy workflow Facebook"
              >
                <FiPlay className="h-4 w-4" aria-hidden />
              </button>
            )}
            <p className="min-w-0 flex-1 text-[11px] leading-snug text-slate-400">
              {isLoadingFbWorkflowSteps
                ? 'Đang tải workflow…'
                : fbWorkflowStatus ||
                  'Workflow VIP: theo bước trên backend — fanpage → quét reel → chọn chi tiết → chờ nội dung → lưu.'}
            </p>
          </div>
          {!isLoadingFbWorkflowSteps && !fbWorkflowSteps.length ? (
            <p className="mt-1.5 text-[10px] text-amber-200/90">
              Chưa cấu hình steps cho workflow platform facebook (admin).
            </p>
          ) : null}
        </section>
      ) : null}

      <div className={activeView === 'content' ? 'relative min-h-0 flex flex-1 pr-1' : 'relative min-h-0 flex-1 space-y-3 overflow-y-auto pr-1'}>
        {activeView === 'fanpages' ? (
          <section className="glass-panel rounded-3xl p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-white">Fanpage nguồn</h2>
            </div>
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
            ) : fanpages.map((page, index) => {
              const isSelected = page._id === selectedFanpageId
              const isOpen = openedFacebookUrls.has(normalizeUrl(page.url))
              const workflowRow = isFbWorkflowRunning && isSelected
              const cardClass = workflowRow
                ? 'border border-violet-400/70 bg-violet-500/15 ring-1 ring-violet-400/40'
                : isSelected
                  ? 'border border-green-500/55 bg-green-500/12 ring-1 ring-green-500/35'
                  : isOpen
                    ? 'border border-emerald-500/40 bg-emerald-500/10'
                    : 'border border-blue-300/20 bg-blue-400/10 hover:bg-blue-400/15'
              return (
              <button
                key={page._id}
                type="button"
                onClick={() => {
                  setSelectedFanpageId(page._id)
                  openFanpage(page.url)
                }}
                className={`flex w-full cursor-pointer items-center justify-between gap-2 rounded-2xl px-3 py-3 text-left transition ${cardClass}`}
              >
                <div className="flex min-w-0 flex-1 items-start gap-2.5">
                  <span
                    className="flex h-7 min-w-7 shrink-0 items-center justify-center rounded-lg bg-slate-800/90 text-[11px] font-bold tabular-nums text-slate-200 ring-1 ring-white/10"
                    title={`pickIndex=${index} (workflow facebook_open_fanpage)`}
                  >
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-100">{page.name}</p>
                    <p className="mt-0.5 line-clamp-1 break-all text-[11px] text-slate-500">{page.url}</p>
                  </div>
                </div>
                {workflowRow ? (
                  <span className="whitespace-nowrap rounded-lg bg-violet-500/25 px-2 py-1 text-[10px] font-semibold text-violet-200">
                    Workflow
                  </span>
                ) : openedFacebookUrls.has(normalizeUrl(page.url)) ? (
                  <span className="whitespace-nowrap rounded-lg bg-emerald-500/20 px-2 py-1 text-[10px] font-semibold text-emerald-300">
                    Đang mở
                  </span>
                ) : (
                  <span className="rounded-lg bg-blue-500/20 px-2 py-1 text-[10px] font-semibold text-blue-300">
                    Chọn
                  </span>
                )}
              </button>
              )
            })}
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
              {scannedReels.map((reel) => {
                const canonical = canonicalSourceReelUrl(reel.url)
                const reelSavedInList = savedCanonicalReelUrls.has(canonical)
                const skipReason = skippedReelReasonByUrl.get(canonical)
                return (
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
                      <div className="flex items-start gap-1.5">
                        <p className="line-clamp-2 min-w-0 flex-1 text-xs font-medium text-slate-100">{reel.title}</p>
                        {reelSavedInList ? (
                          <span
                            className="relative inline-flex shrink-0 text-amber-200/90"
                            title={
                              skipReason
                                ? `Đã bỏ qua (${skipReason})`
                                : 'Đã có nguồn reel (caption đã đồng bộ)'
                            }
                            aria-label={
                              skipReason ? 'Reel đã bỏ qua' : 'Đã có nguồn reel trên máy chủ'
                            }
                          >
                            <FiSave className="h-4 w-4" aria-hidden />
                            <span
                              className="pointer-events-none absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-neutral-900/90 bg-emerald-500 text-white shadow-sm"
                              aria-hidden
                            >
                              <FiCheck className="h-2 w-2 stroke-3" />
                            </span>
                          </span>
                        ) : null}
                      </div>
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
                )
              })}
              {scannedReels.length === 0 ? (
                <p className="rounded-xl border border-blue-300/20 bg-blue-400/10 px-3 py-2 text-[11px] text-slate-500">
                  Chưa có dữ liệu. Nhấn "Quét reels ngay" để lấy tối đa {MAX_SCAN_RESULTS} video theo ngưỡng lượt xem hiện tại.
                </p>
              ) : null}
              {scannedReels.length > 0 ? (
                <div className="flex gap-2">
                  {hasMoreReels ? (
                    <button
                      type="button"
                      onClick={() => handleScanReels(true)}
                      disabled={isScanning}
                      className="flex-1 cursor-pointer rounded-xl border border-blue-300/30 bg-blue-500/15 px-3 py-2 text-[11px] font-semibold text-blue-200 transition hover:bg-blue-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Quét thêm
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void handleScanAllReels()}
                    disabled={isScanning}
                    className={`cursor-pointer rounded-xl border border-cyan-400/35 bg-cyan-500/15 px-3 py-2 text-[11px] font-semibold text-cyan-100 transition hover:bg-cyan-500/25 disabled:cursor-not-allowed disabled:opacity-50 ${hasMoreReels ? 'flex-1' : 'w-full'}`}
                    title="Cuộn hết trang reels fanpage và lấy toàn bộ video còn lại (một lần)"
                  >
                    <span className="inline-flex items-center justify-center gap-1">
                      <FiRefreshCw aria-hidden className={`h-3 w-3 ${isScanning ? 'animate-spin' : ''}`} />
                      Quét hết
                    </span>
                  </button>
                </div>
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
              disabled={!hasDotComReelTab}
              onClick={() => handleLoadReelFromOpenFacebookTab()}
              title={
                hasDotComReelTab
                  ? 'Lấy reel từ tab facebook.com hoặc web.facebook.com/reel/ đang mở'
                  : 'Mở reel tại facebook.com hoặc web.facebook.com/reel/… trong một tab Chrome (tab trong cửa sổ này)'
              }
              aria-label="Lấy reel từ tab facebook.com hoặc web.facebook.com/reel"
              className="shrink-0 cursor-pointer rounded-lg p-1.5 text-blue-300 transition hover:bg-blue-500/20 disabled:cursor-not-allowed disabled:opacity-40"
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
              Chưa chọn reel. Mở đúng URL dạng facebook.com hoặc web.facebook.com/reel/… trong tab (cùng cửa sổ), rồi bấm icon film khi nút sáng — không dùng m.facebook hay fb.watch.
            </p>
          )}
          {selectedReel && reelSavedCheck ? (
            <p className="mt-1.5 text-[10px] text-slate-500">
              Lượt dùng — bạn:{' '}
              <span className="font-medium tabular-nums text-slate-300">
                {reelSavedCheck.myUsageCount ?? 0}
              </span>
              <span className="mx-1.5 text-slate-600">·</span>
              Toàn hệ thống:{' '}
              <span className="font-medium tabular-nums text-slate-300">
                {reelSavedCheck.globalUsageCount ?? 0}
              </span>
            </p>
          ) : null}
          <div className="relative mt-2 min-h-0 flex-1 overflow-hidden">
            <textarea
              ref={contentTextareaRef}
              placeholder="Caption, voice script, hashtag... hiển thị tại đây"
              value={contentText}
              onChange={(event) => {
                setContentText(event.target.value)
                setIsContentDirty(true)
                setIsContentTranslated(false)
                setVideoShortSaveStatus('idle')
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
                onClick={() => void saveVideoShortToServer()}
                disabled={
                  !selectedReel ||
                  !contentText.trim() ||
                  storySaveStatus === 'saving'
                }
                aria-label={
                  hasVideoSourceSynced
                    ? 'Lưu lại nguồn reel trên máy chủ (cập nhật nội dung nếu đã có)'
                    : 'Lưu nội dung và link reel vào máy chủ (nguồn reel)'
                }
                title={
                  hasVideoSourceSynced
                    ? 'Nguồn reel đã có. Bấm để cập nhật lại caption/URL mới nhất.'
                    : 'Lưu caption + URL reel làm nguồn reel (không tạo bản ghi video ngắn).'
                }
                className={`relative inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg transition disabled:cursor-not-allowed ${
                  storySaveStatus === 'ok'
                    ? 'bg-amber-500/25 text-amber-100 disabled:opacity-40'
                    : storySaveStatus === 'error'
                      ? 'bg-rose-500/80 text-white disabled:opacity-40'
                      : hasVideoSourceSynced
                        ? 'bg-amber-500/20 text-amber-100 hover:bg-amber-500/30'
                        : 'bg-amber-500/25 text-amber-100 hover:bg-amber-500/35 disabled:opacity-40'
                }`}
              >
                {storySaveStatus === 'saving' ? (
                  <span className="text-[10px]">…</span>
                ) : (
                  <FiSave className="h-4 w-4" aria-hidden />
                )}
                {storySaveStatus !== 'saving' && reelSaveHasSyncedState ? (
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

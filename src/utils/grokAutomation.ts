import {
  grokCaptureMediaBaselinePageScript,
  grokFillImaginePageScript,
  grokDownloadVideoBufferPageScript,
  grokListVideoUrlsPageScript,
  grokProbeImageReadyPageScript,
  grokComparePreviewImagesPageScript,
  grokProbeVideoCandidatesPageScript,
  grokSaveVideoToDirectoryPageScript,
  grokSubmitImaginePageScript,
} from '@/utils/grokPageScripts'
import { writeBlobToFile } from '@/utils/localWorkspacePersistence'

export type GrokBrowserTab = { id?: number; url?: string; active?: boolean }

type GrokScriptInjection = {
  target: { tabId: number }
  func: (...args: unknown[]) => unknown
  args?: unknown[]
  world?: 'MAIN' | 'ISOLATED'
}

type ExtensionChrome = {
  tabs?: {
    query?: (
      queryInfo: { url?: string[]; currentWindow?: boolean; active?: boolean },
      callback: (tabs: GrokBrowserTab[]) => void,
    ) => void
    get?: (tabId: number, callback: (tab: GrokBrowserTab) => void) => void
    create?: (createProperties: { url: string; active?: boolean }, callback?: (tab: GrokBrowserTab) => void) => void
    update?: (tabId: number, updateProperties: { url?: string; active?: boolean }, callback?: (tab: GrokBrowserTab) => void) => void
  }
  scripting?: {
    executeScript?: (injection: GrokScriptInjection) => Promise<Array<{ result?: unknown }>>
  }
}

export const GROK_URL = 'https://grok.com/imagine/saved'
export const GROK_PATTERNS = ['*://grok.com/imagine*']

export type GrokBaselineCard = {
  cardKey: string
  urls: string[]
  /** Thứ tự <video> hiển thị trong DOM lúc submit (0 = trên cùng). */
  orderIndex: number
}

export type GrokMediaBaseline = {
  videoUrls: string[]
  postUrls: string[]
  /** Vị trí thẻ <video> lúc submit — chặn hover làm URL cũ bị coi là video mới. */
  videoCards: GrokBaselineCard[]
  postCards: GrokBaselineCard[]
  visibleVideoCount: number
  submittedAt: number
  /** Ảnh đã paste lên Grok — dùng so khớp preview cạnh video trước khi lưu. */
  submittedImageUrl?: string
}

export const GROK_PREVIEW_MATCH_MIN_SCORE = 0.68
export const GROK_FRAME_MATCH_MIN_SCORE = 0.5

export type GrokVideoProbeContext = {
  nowMs: number
  minWaitAfterSubmitMs: number
}

/** Chờ ngắn sau submit — chính vẫn là đếm slot DOM mới; 10s đủ chặn hover ngay sau Enter. */
export const GROK_MIN_WAIT_AFTER_SUBMIT_MS = 10_000
/** Poll nhanh sau grace; rút ngắn thời gian ghi nhận khi video đã render. */
export const GROK_PROBE_INTERVAL_MS = 800
export const GROK_PROBE_INTERVAL_CANDIDATE_MS = 450

export class GrokVideoAmbiguousError extends Error {
  urls: string[]

  constructor(urls: string[]) {
    super(
      `Phát hiện ${urls.length} video Grok mới cùng lúc — không thể xác định video đúng. Tránh tạo video song song trên tab này.`,
    )
    this.name = 'GrokVideoAmbiguousError'
    this.urls = urls
  }
}

const emptyGrokMediaBaseline = (): GrokMediaBaseline => ({
  videoUrls: [],
  postUrls: [],
  videoCards: [],
  postCards: [],
  visibleVideoCount: 0,
  submittedAt: 0,
})

const normalizeGrokMediaBaseline = (raw?: Partial<GrokMediaBaseline> | null): GrokMediaBaseline => {
  const videoCards = Array.isArray(raw?.videoCards)
    ? raw.videoCards
        .map((card, index) => ({
          cardKey: String(card?.cardKey || '').trim(),
          urls: Array.isArray(card?.urls) ? card.urls.map((u) => u.trim()).filter(Boolean) : [],
          orderIndex: Number.isFinite(Number(card?.orderIndex)) ? Math.floor(Number(card?.orderIndex)) : index,
        }))
        .filter((card) => card.cardKey)
    : []

  return {
    videoUrls: Array.isArray(raw?.videoUrls) ? raw.videoUrls.map((u) => u.trim()).filter(Boolean) : [],
    postUrls: Array.isArray(raw?.postUrls) ? raw.postUrls.map((u) => u.trim()).filter(Boolean) : [],
    videoCards,
    postCards: Array.isArray(raw?.postCards)
      ? raw.postCards
          .map((card, index) => ({
            cardKey: String(card?.cardKey || '').trim(),
            urls: Array.isArray(card?.urls) ? card.urls.map((u) => u.trim()).filter(Boolean) : [],
            orderIndex: Number.isFinite(Number(card?.orderIndex)) ? Math.floor(Number(card?.orderIndex)) : index,
          }))
          .filter((card) => card.cardKey)
      : [],
    visibleVideoCount: Math.max(
      0,
      Number.isFinite(Number(raw?.visibleVideoCount))
        ? Math.floor(Number(raw?.visibleVideoCount))
        : videoCards.length,
    ),
    submittedAt: Number(raw?.submittedAt) || 0,
    ...(String(raw?.submittedImageUrl || '').trim()
      ? { submittedImageUrl: String(raw?.submittedImageUrl || '').trim() }
      : {}),
  }
}

type GrokVideoCardProbe = {
  cardKey: string
  orderIndex: number
  top: number
  left: number
  width: number
  height: number
  readyState: number
  urls: string[]
  previewImageUrls?: string[]
  hasMp4: boolean
  isReady: boolean
  isNew: boolean
  imageMatchScore?: number
}

type GrokPostLinkProbe = {
  url: string
  top: number
  left: number
  isNew: boolean
}

const isGrokGeneratedMp4Url = (url: string) =>
  /assets\.grok\.com/i.test(url) && /generated_video\.mp4/i.test(url)

const pickGrokCaptureUrl = (urls: string[], baseline: Set<string>) => {
  const fresh = urls.map((u) => u.trim()).filter(Boolean).filter((url) => !baseline.has(url))
  const generated = fresh.find(isGrokGeneratedMp4Url)
  if (generated) return generated
  const blob = fresh.find((url) => url.startsWith('blob:'))
  if (blob) return blob
  return ''
}

const selectGrokVideoProbe = (
  cards: GrokVideoCardProbe[],
  postLinks: GrokPostLinkProbe[],
  mediaBaseline: GrokMediaBaseline,
  probeContext?: GrokVideoProbeContext,
) => {
  const baseline = new Set(
    [...mediaBaseline.videoUrls, ...mediaBaseline.postUrls].map((u) => u.trim()).filter(Boolean),
  )

  const submittedAt = mediaBaseline.submittedAt || 0
  const nowMs = probeContext?.nowMs || Date.now()
  const minWaitAfterSubmitMs = probeContext?.minWaitAfterSubmitMs ?? GROK_MIN_WAIT_AFTER_SUBMIT_MS
  if (submittedAt > 0 && nowMs < submittedAt + minWaitAfterSubmitMs) {
    return { ready: false, url: '', kind: '', ambiguous: false, ambiguousUrls: [] as string[] }
  }

  const readyNewCards = cards
    .filter((card) => card.isNew && card.isReady)
    .sort((a, b) => a.orderIndex - b.orderIndex || a.top - b.top || a.left - b.left)

  if (readyNewCards.length > 1) {
    return {
      ready: false,
      url: '',
      kind: '',
      ambiguous: true,
      ambiguousUrls: readyNewCards.flatMap((card) => card.urls.filter((url) => !baseline.has(url))),
    }
  }

  if (readyNewCards.length === 1) {
    const card = readyNewCards[0]
    const url = pickGrokCaptureUrl(card.urls, baseline)
    if (url) {
      return {
        ready: true,
        url,
        kind: url.startsWith('blob:') ? 'blob' : isGrokGeneratedMp4Url(url) ? 'mp4' : 'http',
        ambiguous: false,
        ambiguousUrls: [] as string[],
      }
    }
  }

  const newPosts = postLinks
    .filter((post) => post.isNew)
    .sort((a, b) => a.top - b.top || a.left - b.left)

  if (newPosts.length > 1) {
    return {
      ready: false,
      url: '',
      kind: '',
      ambiguous: true,
      ambiguousUrls: newPosts.map((post) => post.url),
    }
  }

  if (newPosts.length === 1) {
    return {
      ready: true,
      url: newPosts[0].url,
      kind: 'post_link',
      ambiguous: false,
      ambiguousUrls: [] as string[],
    }
  }

  return { ready: false, url: '', kind: '', ambiguous: false, ambiguousUrls: [] as string[] }
}

export const mergeGrokMediaBaseline = (baseline: GrokMediaBaseline, capturedUrl: string): GrokMediaBaseline => {
  const url = capturedUrl.trim()
  if (!url) return baseline
  if (/imagine\/post/i.test(url)) {
    return { ...baseline, postUrls: [...new Set([...baseline.postUrls, url])] }
  }
  return { ...baseline, videoUrls: [...new Set([...baseline.videoUrls, url])] }
}

const getChrome = () => (globalThis as { chrome?: ExtensionChrome }).chrome

export const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms))

/** Tải ảnh từ extension (Cloudinary URL…) → data URL để inject vào tab Grok. */
export async function resolveGrokImageDataUrl(imageUrl: string): Promise<string> {
  const trimmed = imageUrl.trim()
  if (!trimmed) return ''
  if (/^data:image\//i.test(trimmed)) return trimmed

  const response = await fetch(trimmed)
  if (!response.ok) throw new Error(`Fetch ảnh thất bại: ${response.status}`)
  const blob = await response.blob()
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Không đọc được blob ảnh.'))
    reader.readAsDataURL(blob)
  })
}

const runGrokPageScript = async (tabId: number, func: (...args: unknown[]) => unknown, args: unknown[] = []) => {
  const extensionChrome = getChrome()
  if (!extensionChrome?.scripting?.executeScript) return null
  const result = await extensionChrome.scripting.executeScript({
    target: { tabId },
    func,
    args,
    world: 'MAIN',
  })
  return result?.[0]?.result ?? null
}

const parseGrokPath = (raw?: string) => {
  if (!raw) return null
  try {
    const u = new URL(raw)
    if (u.hostname !== 'grok.com') return null
    return u.pathname.replace(/\/+$/, '')
  } catch {
    return null
  }
}

const isSavedGrokUrl = (raw?: string) => parseGrokPath(raw) === '/imagine/saved'

/** Tab Grok thuộc nhánh Imagine (dùng khi tìm tab — điền prompt chỉ trên /imagine/saved). */
export const isSupportedGrokUrl = (raw?: string) => {
  const path = parseGrokPath(raw)
  if (!path) return false
  return path === '/imagine' || path === '/imagine/saved' || path.startsWith('/imagine/post')
}

const getGrokTabById = (tabId: number) =>
  new Promise<GrokBrowserTab | null>((resolve) => {
    getChrome()?.tabs?.get?.(tabId, (tab) => resolve(tab || null))
  })

export const queryGrokTabs = (urlPatterns?: string[], currentWindow?: boolean, active?: boolean) =>
  new Promise<GrokBrowserTab[]>((resolve) => {
    getChrome()?.tabs?.query?.({ url: urlPatterns, currentWindow, active }, (tabs) => resolve(tabs || []))
  })

export const createGrokTab = (url: string, active = true) =>
  new Promise<GrokBrowserTab | null>((resolve) => {
    getChrome()?.tabs?.create?.({ url, active }, (tab) => resolve(tab || null))
  })

export const updateGrokTab = (tabId: number, url?: string, active = true) =>
  new Promise<GrokBrowserTab | null>((resolve) => {
    getChrome()?.tabs?.update?.(tabId, url ? { url, active } : { active }, (tab) => resolve(tab || null))
  })

export async function pickGrokTab(preferActive = true): Promise<GrokBrowserTab | null> {
  const extensionChrome = getChrome()
  if (!extensionChrome?.tabs?.query || !extensionChrome.tabs.update || !extensionChrome.tabs.create) {
    return null
  }

  const grokTabsRaw = await queryGrokTabs(GROK_PATTERNS, true)
  const grokTabs = grokTabsRaw.filter((t) => isSupportedGrokUrl(t.url))

  let target: GrokBrowserTab | null | undefined =
    grokTabs.find((t) => isSavedGrokUrl(t.url)) || grokTabs[0] || null

  if (!target?.id) {
    target = await createGrokTab(GROK_URL, preferActive)
  } else {
    target = await ensureGrokSavedTab(target.id, preferActive)
  }

  return target?.id ? target : null
}

/** Chỉ điền prompt trên /imagine/saved — chuyển hướng nếu tab đang ở URL Imagine khác. */
export async function ensureGrokSavedTab(tabId: number, active = false): Promise<GrokBrowserTab | null> {
  const current = await getGrokTabById(tabId)
  if (!current?.id) return null

  if (isSavedGrokUrl(current.url || '')) {
    if (active) return updateGrokTab(tabId, undefined, true)
    return current
  }

  const updated = await updateGrokTab(tabId, GROK_URL, active)
  for (let i = 0; i < 20; i += 1) {
    await sleep(i === 0 ? 400 : 300)
    const tab = await getGrokTabById(tabId)
    if (isSavedGrokUrl(tab?.url || '')) return tab
  }
  return updated
}

export async function waitForGrokComposer(tabId: number) {
  const attempts = 18
  for (let i = 0; i < attempts; i += 1) {
    await sleep(i === 0 ? 120 : 220)
    const payload = (await runGrokPageScript(
      tabId,
      (() => {
        const path = location.pathname.replace(/\/+$/, '')
        const okPath = path === '/imagine/saved'
        if (!okPath) return { ok: false, path, hasInput: false }

        const isVisible = (el: Element | null): el is HTMLElement => {
          if (!(el instanceof HTMLElement)) return false
          const rect = el.getBoundingClientRect()
          const style = window.getComputedStyle(el)
          return rect.width > 40 && rect.height > 20 && style.display !== 'none' && style.visibility !== 'hidden'
        }
        const selectors = [
          'textarea',
          'div[contenteditable="true"][role="textbox"]',
          'div[contenteditable="true"]',
        ]
        const candidates = selectors.flatMap((selector) => Array.from(document.querySelectorAll<HTMLElement>(selector)))
        const hasInput = candidates.some((el) => isVisible(el))
        return { ok: okPath, path, hasInput }
      }) as (...args: unknown[]) => unknown,
    )) as { ok?: boolean; hasInput?: boolean } | null

    if (payload?.ok && payload?.hasInput) return true
  }
  return false
}

export async function injectPromptToGrok(tabId: number, prompt: string, imageUrl?: string) {
  await ensureGrokSavedTab(tabId, true)
  let imagePayload = ''
  if (imageUrl?.trim()) {
    try {
      imagePayload = await resolveGrokImageDataUrl(imageUrl)
    } catch {
      imagePayload = imageUrl.trim()
    }
  }

  const payload = (await runGrokPageScript(
    tabId,
    grokFillImaginePageScript as (...args: unknown[]) => unknown,
    [prompt, imagePayload, false],
  )) as {
    ok?: boolean
    wroteText?: boolean
    pastedImage?: boolean
    reason?: string
  } | null

  if (!payload?.ok) return false
  return {
    foundInput: true,
    wroteText: Boolean(payload.wroteText),
    pastedImage: Boolean(payload.pastedImage),
  }
}

export async function probeGrokImageReady(tabId: number) {
  return (await runGrokPageScript(
    tabId,
    grokProbeImageReadyPageScript as (...args: unknown[]) => unknown,
  )) as {
    ready?: boolean
    submitEnabled?: boolean
    hasSubmitButton?: boolean
  } | null
}

export async function waitForGrokImageReady(tabId: number, timeoutMs = 120_000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const probe = await probeGrokImageReady(tabId)
    if (probe?.ready || probe?.submitEnabled) return true
    await sleep(500)
  }
  return false
}

export async function submitGrokImagine(tabId: number, options?: { timeoutMs?: number }) {
  const timeoutMs = options?.timeoutMs ?? 45_000
  const started = Date.now()

  while (Date.now() - started < timeoutMs) {
    const payload = (await runGrokPageScript(
      tabId,
      grokSubmitImaginePageScript as (...args: unknown[]) => unknown,
    )) as { submitted?: boolean; reason?: string } | null
    if (payload?.submitted) return true
    if (payload?.reason === 'submit_disabled' || payload?.reason === 'no_submit_button') {
      await sleep(500)
      continue
    }
    await sleep(400)
  }
  return false
}

export async function listGrokMediaBaselineOnPage(tabId: number): Promise<GrokMediaBaseline> {
  const result = (await runGrokPageScript(
    tabId,
    grokCaptureMediaBaselinePageScript as (...args: unknown[]) => unknown,
  )) as GrokMediaBaseline | null

  if (!result || typeof result !== 'object') return emptyGrokMediaBaseline()
  return normalizeGrokMediaBaseline(result)
}

export async function listGrokVideoUrlsOnPage(tabId: number) {
  const baseline = await listGrokMediaBaselineOnPage(tabId)
  return baseline.videoUrls
}

const verifyGrokCardsWithSubmittedImage = async (
  tabId: number,
  cards: GrokVideoCardProbe[],
  submittedImageSrc: string,
) => {
  const verified: GrokVideoCardProbe[] = []

  for (const card of cards) {
    if (!card.isNew || !card.isReady) {
      verified.push(card)
      continue
    }

    const previews = (card.previewImageUrls || []).map((u) => u.trim()).filter(Boolean)
    const match = (await runGrokPageScript(
      tabId,
      grokComparePreviewImagesPageScript as (...args: unknown[]) => unknown,
      [submittedImageSrc, previews, card.urls],
    )) as {
      matched?: boolean
      score?: number
      previewScore?: number
      frameScore?: number
      reason?: string
    } | null

    const previewScore = Number(match?.previewScore) || 0
    const frameScore = Number(match?.frameScore) || 0
    const score = Math.max(previewScore, frameScore, Number(match?.score) || 0)
    let matched = Boolean(match?.matched)

    // So khớp kỹ thuật lỗi (ảnh quá lớn, CORS…) — giữ logic slot DOM thay vì chờ mãi.
    if (!matched && card.hasMp4) {
      const compareBroken =
        match?.reason === 'submitted_load_failed' ||
        match?.reason === 'submitted_hash_failed' ||
        match == null
      if (compareBroken) matched = true
    }

    verified.push({ ...card, isNew: matched, imageMatchScore: score })
  }

  return verified
}

export async function probeGrokVideoLink(
  tabId: number,
  mediaBaseline: GrokMediaBaseline = emptyGrokMediaBaseline(),
  probeContext?: GrokVideoProbeContext & { submittedImageSrc?: string; skipImageVerify?: boolean },
) {
  const raw = (await runGrokPageScript(
    tabId,
    grokProbeVideoCandidatesPageScript as (...args: unknown[]) => unknown,
    [
      {
        ...mediaBaseline,
        probeNowMs: probeContext?.nowMs || Date.now(),
        minWaitAfterSubmitMs: probeContext?.minWaitAfterSubmitMs ?? GROK_MIN_WAIT_AFTER_SUBMIT_MS,
      },
    ],
  )) as { cards?: GrokVideoCardProbe[]; postLinks?: GrokPostLinkProbe[] } | null

  if (!raw || !Array.isArray(raw.cards) || !Array.isArray(raw.postLinks)) return null

  let cards = raw.cards
  const submittedImageSrc = probeContext?.submittedImageSrc?.trim() || ''
  if (submittedImageSrc && !probeContext?.skipImageVerify) {
    cards = await verifyGrokCardsWithSubmittedImage(tabId, cards, submittedImageSrc)
  }

  return selectGrokVideoProbe(cards, raw.postLinks, mediaBaseline, probeContext)
}

export async function waitForGrokVideoLink(
  tabId: number,
  timeoutMs: number,
  options?: { mediaBaseline?: GrokMediaBaseline; minWaitAfterSubmitMs?: number },
) {
  const mediaBaseline = options?.mediaBaseline || emptyGrokMediaBaseline()
  const minWaitAfterSubmitMs = options?.minWaitAfterSubmitMs ?? GROK_MIN_WAIT_AFTER_SUBMIT_MS
  const started = Date.now()
  let lastUrl = ''
  let stableHits = 0
  let ambiguousStreak = 0
  let lastAmbiguousUrls: string[] = []

  const submittedImageSrc = mediaBaseline.submittedImageUrl?.trim() || ''

  while (Date.now() - started < timeoutMs) {
    let probe = await probeGrokVideoLink(tabId, mediaBaseline, {
      nowMs: Date.now(),
      minWaitAfterSubmitMs,
      submittedImageSrc,
      skipImageVerify: Boolean(submittedImageSrc),
    })

    if (probe?.ambiguous) {
      ambiguousStreak += 1
      lastAmbiguousUrls = Array.isArray(probe.ambiguousUrls)
        ? probe.ambiguousUrls.map((u) => u.trim()).filter(Boolean)
        : []
      if (ambiguousStreak >= 2 && lastAmbiguousUrls.length > 1) {
        throw new GrokVideoAmbiguousError(lastAmbiguousUrls)
      }
      lastUrl = ''
      stableHits = 0
      await sleep(GROK_PROBE_INTERVAL_MS)
      continue
    }

    ambiguousStreak = 0
    lastAmbiguousUrls = []

    let url = probe?.ready && probe.url ? probe.url.trim() : ''
    if (url && submittedImageSrc) {
      const confirmed = await probeGrokVideoLink(tabId, mediaBaseline, {
        nowMs: Date.now(),
        minWaitAfterSubmitMs,
        submittedImageSrc,
        skipImageVerify: false,
      })
      if (confirmed?.ready && confirmed.url?.trim()) {
        url = confirmed.url.trim()
        probe = confirmed
      } else {
        lastUrl = ''
        stableHits = 0
        await sleep(GROK_PROBE_INTERVAL_CANDIDATE_MS)
        continue
      }
    }

    if (url) {
      if (isGrokGeneratedMp4Url(url) || probe?.kind === 'post_link') {
        return url
      }

      if (url === lastUrl) stableHits += 1
      else {
        lastUrl = url
        stableHits = 1
      }
      const needStableHits = url.startsWith('blob:') ? 2 : 1
      if (stableHits >= needStableHits) return lastUrl
      await sleep(GROK_PROBE_INTERVAL_CANDIDATE_MS)
      continue
    }

    lastUrl = ''
    stableHits = 0
    await sleep(GROK_PROBE_INTERVAL_MS)
  }
  return ''
}

export type GrokVideoLocalSaveTarget = {
  dirHandle: FileSystemDirectoryHandle
  filename: string
  /** Ví dụ stories/my-story/videos/video-1.mp4 — không gồm prefix local: */
  relativePath: string
}

export async function saveGrokVideoToDirectory(
  tabId: number,
  videoUrl: string,
  target: GrokVideoLocalSaveTarget,
) {
  const safeName = (target.filename || 'video.mp4').replace(/[/\\]/g, '-')

  try {
    const result = (await runGrokPageScript(
      tabId,
      grokSaveVideoToDirectoryPageScript as (...args: unknown[]) => unknown,
      [videoUrl, target.dirHandle, safeName],
    )) as { ok?: boolean; filename?: string; byteLength?: number } | null

    if (result?.ok) {
      return {
        filename: result.filename || safeName,
        byteLength: result.byteLength || 0,
        localPath: `local:${target.relativePath}`,
      }
    }
  } catch {
    /* fallback buffer → ghi từ extension */
  }

  const downloaded = (await runGrokPageScript(
    tabId,
    grokDownloadVideoBufferPageScript as (...args: unknown[]) => unknown,
    [videoUrl],
  )) as { buffer?: ArrayBuffer; mimeType?: string; byteLength?: number } | null

  if (!(downloaded?.buffer instanceof ArrayBuffer) || downloaded.buffer.byteLength === 0) {
    throw new Error('Không tải được video từ tab Grok.')
  }

  const blob = new Blob([downloaded.buffer], { type: downloaded.mimeType || 'video/mp4' })
  await writeBlobToFile(target.dirHandle, safeName, blob)

  return {
    filename: safeName,
    byteLength: downloaded.byteLength || downloaded.buffer.byteLength,
    localPath: `local:${target.relativePath}`,
  }
}

/** Chờ video Grok render → tải trong tab → ghi file local workspace. */
export async function captureAndSaveGrokVideoLocally(
  tabId: number,
  timeoutMs: number,
  saveTarget: GrokVideoLocalSaveTarget,
  options?: { mediaBaseline?: GrokMediaBaseline },
) {
  const grokUrl = await waitForGrokVideoLink(tabId, timeoutMs, options)
  if (!grokUrl) return { grokUrl: '', localPath: '', byteLength: 0 }

  if (/imagine\/post/i.test(grokUrl) && !/\.mp4/i.test(grokUrl)) {
    throw new Error('Chỉ thấy link post Grok — chưa có file video MP4 để tải.')
  }

  const saved = await saveGrokVideoToDirectory(tabId, grokUrl, saveTarget)
  return { grokUrl, localPath: saved.localPath, byteLength: saved.byteLength }
}

export async function fillGrokFromVideoShortPair(
  tabId: number,
  prompt: string,
  imageUrl: string,
  options?: { submit?: boolean },
) {
  await ensureGrokSavedTab(tabId, true)
  const ready = await waitForGrokComposer(tabId)
  if (!ready) throw new Error('Grok composer chưa sẵn sàng trên grok.com/imagine/saved.')

  let imagePayload = ''
  if (imageUrl?.trim()) {
    try {
      imagePayload = await resolveGrokImageDataUrl(imageUrl)
    } catch {
      imagePayload = imageUrl.trim()
    }
  }

  const shouldSubmit = options?.submit !== false
  const payload = (await runGrokPageScript(
    tabId,
    grokFillImaginePageScript as (...args: unknown[]) => unknown,
    [prompt, imagePayload, shouldSubmit],
  )) as {
    ok?: boolean
    wroteText?: boolean
    pastedImage?: boolean
    submitted?: boolean
    reason?: string
    hasPreview?: boolean
    hasSubmitButton?: boolean
    videoBaseline?: GrokMediaBaseline
    submittedAt?: number
  } | null

  if (!payload?.ok) {
    if (payload?.reason === 'no_input') throw new Error('Không tìm thấy ô nhập Grok.')
    if (payload?.reason === 'image_preview_timeout') {
      throw new Error('Ảnh chưa hiện preview trên Grok — chưa gửi.')
    }
    if (payload?.reason === 'submit_not_ready') {
      throw new Error('Nút Gửi chưa sẵn sàng sau khi upload ảnh + điền prompt.')
    }
    throw new Error('Không điền được nội dung lên Grok.')
  }

  if (shouldSubmit && !payload.submitted) {
    throw new Error('Không gửi được prompt Grok (nút Gửi).')
  }

  const videoBaseline = payload.videoBaseline
    ? normalizeGrokMediaBaseline({
        ...payload.videoBaseline,
        submittedImageUrl: imageUrl.trim(),
      })
    : shouldSubmit
      ? {
          ...(await listGrokMediaBaselineOnPage(tabId)),
          submittedImageUrl: imageUrl.trim(),
        }
      : emptyGrokMediaBaseline()

  return {
    foundInput: true,
    wroteText: Boolean(payload.wroteText),
    pastedImage: Boolean(payload.pastedImage),
    videoBaseline,
    submittedAt: Number(payload.submittedAt) || Date.now(),
    submittedImageUrl: imageUrl.trim(),
  }
}

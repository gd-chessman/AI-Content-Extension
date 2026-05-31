/**
 * Tiện ích xử lý ảnh ChatGPT: chờ tạo ảnh, đếm ảnh assistant, chụp/cắt đôi, lưu tải xuống.
 * Các hàm `*PageScript` dùng với chrome.scripting.executeScript (tự chứa, không import).
 */

import {
  DEFAULT_STORIES_FOLDER_SEGMENT,
  ensureDirectoryWritable,
  ensureStoryWorkspaceChildDirs,
  sanitizeWorkspaceFolderSegment,
} from './localWorkspacePersistence'

export const SPLIT_IMAGE_DOWNLOAD_FOLDER = 'chatgpt-images'
export const SAVED_SPLIT_IMAGE_HASHES_KEY = 'savedSplitImageCopyHashes'
export const SAVED_SPLIT_IMAGE_HASHES_MAX = 150

/** Bỏ mép khi chia đôi: mỗi nửa cắt 4 cạnh (% theo chiều rộng/chiều cao vùng cắt). */
export const SPLIT_EDGE_TRIM_RATIO = 0.0075

function computeEdgeTrim(size: number, ratio = SPLIT_EDGE_TRIM_RATIO): number {
  return Math.max(2, Math.round(size * ratio))
}

export function hashDataUrl(dataUrl: string): string {
  let h = 5381
  const stride = Math.max(1, Math.floor(dataUrl.length / 12000))
  for (let i = 0; i < dataUrl.length; i += stride) {
    h = ((h << 5) + h) ^ dataUrl.charCodeAt(i)
  }
  return `${(h >>> 0).toString(16)}_${dataUrl.length}`
}

export type SplitCaptureRect = {
  x: number
  y: number
  width: number
  height: number
  viewportWidth?: number
  viewportHeight?: number
  openedModal?: boolean
  /** URL ảnh gốc trên trang ChatGPT (nếu đọc được). */
  imageSrc?: string
  /** Ảnh đã tải trong ngữ cảnh trang — tránh phải chụp màn hình. */
  dataUrl?: string
}

export async function splitCapturedImage(
  screenshotDataUrl: string,
  rect: { x: number; y: number; width: number; height: number; viewportWidth?: number; viewportHeight?: number },
): Promise<{ left: string; right: string }> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Không thể đọc ảnh chụp màn hình.'))
    img.src = screenshotDataUrl
  })

  const viewportWidth = rect.viewportWidth && rect.viewportWidth > 0 ? rect.viewportWidth : image.width
  const viewportHeight = rect.viewportHeight && rect.viewportHeight > 0 ? rect.viewportHeight : image.height
  const scaleX = image.width / viewportWidth
  const scaleY = image.height / viewportHeight

  const sourceX = Math.max(0, Math.round(rect.x * scaleX))
  const sourceY = Math.max(0, Math.round(rect.y * scaleY))
  const sourceW = Math.max(2, Math.round(rect.width * scaleX))
  const sourceH = Math.max(2, Math.round(rect.height * scaleY))
  const halfW = Math.max(1, Math.floor(sourceW / 2))
  const rightHalfW = Math.max(1, sourceW - halfW)

  const leftTrimX = computeEdgeTrim(halfW)
  const leftTrimY = computeEdgeTrim(sourceH)
  const rightTrimX = computeEdgeTrim(rightHalfW)
  const rightTrimY = computeEdgeTrim(sourceH)

  const leftSx = sourceX + leftTrimX
  const leftSy = sourceY + leftTrimY
  const leftW = Math.max(1, halfW - leftTrimX * 2)
  const leftH = Math.max(1, sourceH - leftTrimY * 2)

  const rightSx = sourceX + halfW + rightTrimX
  const rightSy = sourceY + rightTrimY
  const rightW = Math.max(1, rightHalfW - rightTrimX * 2)
  const rightH = Math.max(1, sourceH - rightTrimY * 2)

  const makePart = (sx: number, sy: number, sw: number, sh: number) => {
    const canvas = document.createElement('canvas')
    canvas.width = sw
    canvas.height = sh
    const ctx = canvas.getContext('2d')
    if (!ctx) return ''
    ctx.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh)
    return canvas.toDataURL('image/png')
  }

  const left = makePart(leftSx, leftSy, leftW, leftH)
  const right = makePart(rightSx, rightSy, rightW, rightH)
  return { left, right }
}

/** Chia đôi toàn bộ file ảnh (không cần rect viewport từ screenshot). */
export async function splitFullImageDataUrl(dataUrl: string): Promise<{ left: string; right: string }> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Không thể đọc ảnh.'))
    img.src = dataUrl
  })
  return splitCapturedImage(dataUrl, {
    x: 0,
    y: 0,
    width: image.width,
    height: image.height,
    viewportWidth: image.width,
    viewportHeight: image.height,
  })
}

/** Cắt vùng ảnh từ screenshot tab — không chia đôi (sao chép 1 ảnh). */
export async function cropCapturedImage(
  screenshotDataUrl: string,
  rect: { x: number; y: number; width: number; height: number; viewportWidth?: number; viewportHeight?: number },
): Promise<string> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Không thể đọc ảnh chụp màn hình.'))
    img.src = screenshotDataUrl
  })

  const viewportWidth = rect.viewportWidth && rect.viewportWidth > 0 ? rect.viewportWidth : image.width
  const viewportHeight = rect.viewportHeight && rect.viewportHeight > 0 ? rect.viewportHeight : image.height
  const scaleX = image.width / viewportWidth
  const scaleY = image.height / viewportHeight

  const sourceX = Math.max(0, Math.round(rect.x * scaleX))
  const sourceY = Math.max(0, Math.round(rect.y * scaleY))
  const sourceW = Math.max(2, Math.round(rect.width * scaleX))
  const sourceH = Math.max(2, Math.round(rect.height * scaleY))
  const trimX = computeEdgeTrim(sourceW)
  const trimY = computeEdgeTrim(sourceH)
  const cropX = sourceX + trimX
  const cropY = sourceY + trimY
  const cropW = Math.max(1, sourceW - trimX * 2)
  const cropH = Math.max(1, sourceH - trimY * 2)

  const canvas = document.createElement('canvas')
  canvas.width = cropW
  canvas.height = cropH
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  ctx.drawImage(image, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH)
  return canvas.toDataURL('image/png')
}

/** Inject: đếm ảnh assistant (baseline trước bước tạo ảnh). */
export function chatgptAssistantImageCountPageScript(): number {
  const all = Array.from(document.querySelectorAll<HTMLImageElement>('[data-message-author-role="assistant"] img'))
  return all.filter((img) => {
    const src = (img.getAttribute('src') || '').trim()
    if (!src) return false
    if (src.startsWith('data:')) return false
    return true
  }).length
}

export type WaitGeneratedImagePageResult = {
  ok?: boolean
  reason?: string
  imageCount?: number
}

export type ChatgptGeneratedImageSnapshot = {
  generating: boolean
  imageCount: number
  assistantCount: number
  assistantTextLen: number
}

/** Một lần đọc trạng thái tạo ảnh — extension poll và có thể dừng giữa chừng. */
export function chatgptSnapshotGeneratedImagePageScript(): ChatgptGeneratedImageSnapshot {
  const isVisible = (el: Element | null): el is HTMLElement => {
    if (!(el instanceof HTMLElement)) return false
    const rect = el.getBoundingClientRect()
    const style = window.getComputedStyle(el)
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden'
  }
  const loadingEl = document.querySelector(
    '[data-testid="image-gen-loading-state-dots"], [data-testid="loading-halftone-dots-animation"]',
  ) as HTMLElement | null
  let imageGenLoading = false
  if (loadingEl) {
    const st = window.getComputedStyle(loadingEl)
    const r = loadingEl.getBoundingClientRect()
    imageGenLoading =
      st.display !== 'none' &&
      st.visibility !== 'hidden' &&
      Number(st.opacity) >= 0.05 &&
      r.width > 4 &&
      r.height > 4
  }
  const stopBtn =
    (document.querySelector('button[data-testid="stop-button"]') as HTMLButtonElement | null) ||
    (document.querySelector('button[aria-label*="Stop"]') as HTMLButtonElement | null) ||
    (document.querySelector('button[aria-label*="Dừng"]') as HTMLButtonElement | null)
  const generating =
    imageGenLoading ||
    Boolean(stopBtn && !stopBtn.disabled && isVisible(stopBtn)) ||
    Boolean(document.querySelector('[data-testid="conversation-turn-loading"]'))
  const imageCount = Array.from(
    document.querySelectorAll<HTMLImageElement>(
      '[data-message-author-role="assistant"] img, article img, main img',
    ),
  ).filter((img) => {
    const src = (img.getAttribute('src') || '').trim()
    if (!src || src.startsWith('data:')) return false
    const alt = (img.getAttribute('alt') || '').toLowerCase()
    if (alt.includes('avatar') || alt.includes('profile')) return false
    const w = img.naturalWidth || img.width || 0
    const h = img.naturalHeight || img.height || 0
    if (w > 0 && h > 0 && (w < 96 || h < 96)) return false
    return true
  }).length
  const turns = Array.from(document.querySelectorAll<HTMLElement>('[data-message-author-role="assistant"]')).filter(
    (el) => (el.innerText || '').trim().length > 0,
  )
  const lastText = (turns[turns.length - 1]?.innerText || '').replace(/\s+/g, ' ').trim()
  return {
    generating,
    imageCount,
    assistantCount: turns.length,
    assistantTextLen: lastText.length,
  }
}

/** Inject: chờ ChatGPT tạo ảnh xong (workflow bước chatgpt_generate_images). */
export async function chatgptWaitGeneratedImageDonePageScript(
  baseCount: number,
  maxWaitMs: number,
): Promise<WaitGeneratedImagePageResult> {
  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
  const pollMs = 700
  const stableMs = 1800
  const settleAfterDetectMs = 3200
  const textOnlyFailMs = 10_000
  const startedAt = Date.now()
  let stableSince = Date.now()
  let imageDetected = false
  let firstDetectAt = 0
  let lastCount = baseCount

  const isVisible = (el: Element | null): el is HTMLElement => {
    if (!(el instanceof HTMLElement)) return false
    const rect = el.getBoundingClientRect()
    const style = window.getComputedStyle(el)
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden'
  }

  const isImageGenLoadingUi = () => {
    const el = document.querySelector(
      '[data-testid="image-gen-loading-state-dots"], [data-testid="loading-halftone-dots-animation"]',
    ) as HTMLElement | null
    if (!el) return false
    const st = window.getComputedStyle(el)
    if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) < 0.05) return false
    const r = el.getBoundingClientRect()
    return r.width > 4 && r.height > 4
  }

  const isGenerating = () => {
    if (isImageGenLoadingUi()) return true
    const stopBtn =
      (document.querySelector('button[data-testid="stop-button"]') as HTMLButtonElement | null) ||
      (document.querySelector('button[aria-label*="Stop"]') as HTMLButtonElement | null) ||
      (document.querySelector('button[aria-label*="Dừng"]') as HTMLButtonElement | null)
    if (stopBtn && !stopBtn.disabled && isVisible(stopBtn)) return true
    return Boolean(document.querySelector('[data-testid="conversation-turn-loading"]'))
  }

  const countAssistantImages = () => {
    const all = Array.from(
      document.querySelectorAll<HTMLImageElement>(
        '[data-message-author-role="assistant"] img, article img, main img',
      ),
    )
    return all.filter((img) => {
      const src = (img.getAttribute('src') || '').trim()
      if (!src) return false
      if (src.startsWith('data:')) return false
      const alt = (img.getAttribute('alt') || '').toLowerCase()
      if (alt.includes('avatar') || alt.includes('profile')) return false
      const w = img.naturalWidth || img.width || 0
      const h = img.naturalHeight || img.height || 0
      if (w > 0 && h > 0 && (w < 96 || h < 96)) return false
      return true
    }).length
  }

  const getAssistantSignature = () => {
    const turns = Array.from(document.querySelectorAll<HTMLElement>('[data-message-author-role="assistant"]')).filter(
      (el) => (el.innerText || '').trim().length > 0,
    )
    const lastText = (turns[turns.length - 1]?.innerText || '').replace(/\s+/g, ' ').trim()
    return {
      count: turns.length,
      textLen: lastText.length,
    }
  }

  const baselineSig = getAssistantSignature()
  let prevSig = baselineSig

  while (Date.now() - startedAt < maxWaitMs) {
    const currentCount = countAssistantImages()
    const generatingNow = isGenerating()
    const currentSig = getAssistantSignature()
    if (currentCount > baseCount) {
      imageDetected = true
      if (!firstDetectAt) firstDetectAt = Date.now()
    }

    if (
      currentCount !== lastCount ||
      generatingNow ||
      currentSig.count !== prevSig.count ||
      currentSig.textLen !== prevSig.textLen
    ) {
      stableSince = Date.now()
    }

    if (imageDetected && currentCount > baseCount && !generatingNow && Date.now() - stableSince >= stableMs) {
      return { ok: true, reason: 'image_done', imageCount: currentCount }
    }
    if (
      imageDetected &&
      currentCount > baseCount &&
      firstDetectAt &&
      Date.now() - firstDetectAt >= settleAfterDetectMs &&
      !generatingNow
    ) {
      return { ok: true, reason: 'image_done_settle', imageCount: currentCount }
    }

    const elapsed = Date.now() - startedAt
    const noNewImages = currentCount <= baseCount
    const hasNewTextResponse =
      currentSig.count > baselineSig.count || currentSig.textLen > baselineSig.textLen
    if (elapsed >= textOnlyFailMs && noNewImages && hasNewTextResponse && !generatingNow) {
      return { ok: false, reason: 'text_only_response', imageCount: currentCount }
    }

    lastCount = currentCount
    prevSig = currentSig
    await sleep(pollMs)
  }

  return { ok: false, reason: imageDetected ? 'timeout_after_image' : 'no_new_image', imageCount: lastCount }
}

/** Inject: tìm ảnh lớn nhất, mở lightbox nếu cần, trả vùng chụp viewport. */
export async function chatgptLocateLatestChatImageForCapturePageScript(): Promise<SplitCaptureRect | null> {
  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
  const isVisible = (el: HTMLElement) => {
    const rect = el.getBoundingClientRect()
    const style = window.getComputedStyle(el)
    return rect.width > 120 && rect.height > 120 && style.display !== 'none' && style.visibility !== 'hidden'
  }

  const rectArea = (r: DOMRect) => Math.max(0, r.width) * Math.max(0, r.height)

  const imageCandidates = Array.from(document.querySelectorAll<HTMLImageElement>('article img, [data-message-author-role] img, main img'))
    .filter((img) => isVisible(img))
    .map((img) => {
      const rect = img.getBoundingClientRect()
      const score = rect.width * rect.height + rect.top
      return { img, rect, score }
    })
    .sort((a, b) => b.score - a.score)

  const candidate = imageCandidates[0]
  if (!candidate) return null

  const initialArea = rectArea(candidate.rect)
  /** Cần lớn hơn ảnh inline đáng kể = lightbox / viewer đã mở (tránh đo rect quá sớm → cắt lệch). */
  const minModalArea = Math.max(initialArea * 1.22, 180 * 180)

  candidate.img.scrollIntoView({ block: 'center', behavior: 'instant' })
  await sleep(200)
  candidate.img.click()
  await sleep(350)

  const pickLargestInDialogs = (): { img: HTMLImageElement; rect: DOMRect } | null => {
    const roots = document.querySelectorAll<HTMLElement>(
      '[role="dialog"], [aria-modal="true"], [data-state="open"][role="dialog"]',
    )
    let best: { img: HTMLImageElement; rect: DOMRect; area: number } | null = null
    for (let i = 0; i < roots.length; i += 1) {
      const root = roots[i]
      const rs = window.getComputedStyle(root)
      if (rs.display === 'none' || rs.visibility === 'hidden') continue
      const imgs = root.querySelectorAll<HTMLImageElement>('img')
      for (let j = 0; j < imgs.length; j += 1) {
        const img = imgs[j]
        if (!isVisible(img)) continue
        const r = img.getBoundingClientRect()
        const a = rectArea(r)
        if (a < minModalArea) continue
        if (!best || a > best.area) best = { img, rect: r, area: a }
      }
    }
    if (!best) return null
    return { img: best.img, rect: best.rect }
  }

  const pickLargestChatImage = (): { img: HTMLImageElement; rect: DOMRect } | null => {
    const list = Array.from(document.querySelectorAll<HTMLImageElement>('article img, [data-message-author-role] img, main img'))
      .filter((img) => isVisible(img))
      .map((img) => {
        const r = img.getBoundingClientRect()
        return { img, rect: r, area: rectArea(r) }
      })
      .filter((x) => x.area >= minModalArea)
      .sort((a, b) => b.area - a.area)
    const top = list[0]
    return top ? { img: top.img, rect: top.rect } : null
  }

  let openedModal = false
  let selected: { img: HTMLImageElement; rect: DOMRect } | null = null
  const deadline = Date.now() + 3200
  let stable: { img: HTMLImageElement; rect: DOMRect; area: number } | null = null
  let stableTicks = 0

  while (Date.now() < deadline) {
    const fromDialog = pickLargestInDialogs()
    const fromChat = fromDialog || pickLargestChatImage()
    if (fromChat) {
      openedModal = Boolean(fromDialog)
      const a = rectArea(fromChat.rect)
      if (stable && stable.img === fromChat.img && Math.abs(stable.area - a) < a * 0.02) {
        stableTicks += 1
        if (stableTicks >= 2) {
          selected = { img: fromChat.img, rect: fromChat.img.getBoundingClientRect() }
          break
        }
      } else {
        stable = { img: fromChat.img, rect: fromChat.rect, area: a }
        stableTicks = 0
      }
    } else {
      stable = null
      stableTicks = 0
    }
    await sleep(140)
  }

  if (!selected) {
    candidate.img.scrollIntoView({ block: 'center', behavior: 'instant' })
    await sleep(160)
    const r = candidate.img.getBoundingClientRect()
    selected = { img: candidate.img, rect: r }
    openedModal = false
  }

  const rect = selected.rect
  const imageSrc = (selected.img.currentSrc || selected.img.src || '').trim()
  let dataUrl = ''
  if (imageSrc.startsWith('data:image/')) {
    dataUrl = imageSrc
  } else if (imageSrc) {
    try {
      const response = await fetch(imageSrc)
      if (response.ok) {
        const blob = await response.blob()
        dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result || ''))
          reader.onerror = () => reject(new Error('Không thể đọc ảnh.'))
          reader.readAsDataURL(blob)
        })
      }
    } catch {
      dataUrl = ''
    }
  }

  return {
    x: Math.max(0, rect.left),
    y: Math.max(0, rect.top),
    width: rect.width,
    height: rect.height,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    openedModal,
    imageSrc,
    dataUrl: dataUrl.startsWith('data:image/') ? dataUrl : undefined,
  }
}

/** Inject: đóng lightbox ảnh sau khi chụp. */
export function chatgptCloseImageLightboxPageScript(): void {
  const closeButton =
    (document.querySelector('button[aria-label*="Close"]') as HTMLButtonElement | null) ||
    (document.querySelector('button[aria-label*="Đóng"]') as HTMLButtonElement | null)
  closeButton?.click()
  document.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'Escape',
      code: 'Escape',
      bubbles: true,
    }),
  )
  document.dispatchEvent(
    new KeyboardEvent('keyup', {
      key: 'Escape',
      code: 'Escape',
      bubbles: true,
    }),
  )
}

export type ExtensionChromeForSplitSave = {
  runtime?: {
    id?: string
    lastError?: { message?: string }
    sendMessage?: (message: unknown, responseCallback?: (response: { ok?: boolean; error?: string }) => void) => void
  }
  storage?: {
    local?: {
      get?: (keys: string | string[], callback: (items: Record<string, unknown>) => void) => void
      set?: (items: Record<string, unknown>, callback?: () => void) => void
    }
  }
  downloads?: {
    download?: (
      options: {
        url: string
        filename?: string
        saveAs?: boolean
        conflictAction?: 'uniquify' | 'overwrite' | 'prompt'
      },
      callback?: () => void,
    ) => void
  }
}

export type SaveCopiedSplitImageWorkspaceTarget = {
  rootHandle: FileSystemDirectoryHandle
  storiesFolderSegment: string
  storyFolderSegment: string
}

export type SaveCopiedSplitImageOptions = {
  /** Ghi theo: gốc / [stories] / [story] / images / file.png — đồng thời tạo content & info. */
  workspaceTarget?: SaveCopiedSplitImageWorkspaceTarget | null
  /** @deprecated Chỉ một thư mục phẳng; ưu tiên workspaceTarget. */
  directoryHandle?: FileSystemDirectoryHandle | null
}

export type SaveSplitImageResult =
  | {
      saved: true
      skipped: false
      reason?: 'ok'
      destination?: 'workspace' | 'directory' | 'downloads'
      directoryName?: string
      /** Ví dụ stories/My-Story/images/part-1-abc.png */
      relativePath?: string
    }
  | { saved: false; skipped: true; reason: 'duplicate' }
  | { saved: false; skipped: false; reason: 'not_extension' | 'no_storage' }

export async function saveCopiedSplitImageIfNew(
  extensionChrome: ExtensionChromeForSplitSave | null | undefined,
  dataUrl: string,
  part: 'left' | 'right',
  imageBlob: Blob,
  options?: SaveCopiedSplitImageOptions,
): Promise<SaveSplitImageResult> {
  if (!extensionChrome) {
    return { saved: false, skipped: false, reason: 'not_extension' }
  }
  const runtime = extensionChrome.runtime
  const sendMessage = runtime?.sendMessage
  if (!runtime?.id) {
    return { saved: false, skipped: false, reason: 'not_extension' }
  }
  const hashKey = `${part}:${hashDataUrl(dataUrl)}`
  const storage = extensionChrome.storage?.local
  if (!storage?.get || !storage?.set) {
    return { saved: false, skipped: false, reason: 'no_storage' }
  }

  const existing = await new Promise<string[]>((resolve) => {
    storage.get?.([SAVED_SPLIT_IMAGE_HASHES_KEY], (items) => {
      const raw = items[SAVED_SPLIT_IMAGE_HASHES_KEY]
      resolve(Array.isArray(raw) ? (raw as string[]) : [])
    })
  })

  if (existing.includes(hashKey)) {
    return { saved: false, skipped: true, reason: 'duplicate' }
  }

  const safeHash = hashKey.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40)
  const filename = `${SPLIT_IMAGE_DOWNLOAD_FOLDER}/part-${part === 'left' ? '1' : '2'}-${safeHash}.png`
  const baseFileName = filename.includes('/') ? filename.split('/').pop() || 'image.png' : filename

  const tryWriteToChosenDirectory = async (): Promise<boolean> => {
    const dir = options?.directoryHandle
    if (!dir) return false
    const writableOk = await ensureDirectoryWritable(dir)
    if (!writableOk) return false
    const name = `part-${part === 'left' ? '1' : '2'}-${safeHash}.png`
    const fileHandle = await dir.getFileHandle(name, { create: true })
    const writable = await fileHandle.createWritable()
    try {
      await writable.write(imageBlob)
    } finally {
      await writable.close()
    }
    return true
  }

  const tryWriteToWorkspace = async (): Promise<{ ok: boolean; relativePath?: string }> => {
    const w = options?.workspaceTarget
    if (!w) return { ok: false }
    const rootOk = await ensureDirectoryWritable(w.rootHandle)
    if (!rootOk) return { ok: false }
    const storiesSeg = sanitizeWorkspaceFolderSegment(w.storiesFolderSegment, DEFAULT_STORIES_FOLDER_SEGMENT)
    const storySeg = sanitizeWorkspaceFolderSegment(w.storyFolderSegment, 'unnamed-story')
    const stories = await w.rootHandle.getDirectoryHandle(storiesSeg, { create: true })
    const storyDir = await stories.getDirectoryHandle(storySeg, { create: true })
    await ensureStoryWorkspaceChildDirs(storyDir)
    const images = await storyDir.getDirectoryHandle('images', { create: true })
    const name = `part-${part === 'left' ? '1' : '2'}-${safeHash}.png`
    const fileHandle = await images.getFileHandle(name, { create: true })
    const writable = await fileHandle.createWritable()
    try {
      await writable.write(imageBlob)
    } finally {
      await writable.close()
    }
    return { ok: true, relativePath: `${storiesSeg}/${storySeg}/images/${name}` }
  }

  const tryAnchorDownloadBlob = () => {
    const objectUrl = URL.createObjectURL(imageBlob)
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = baseFileName
    a.rel = 'noopener'
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 5000)
  }

  const tryAnchorDownloadDataUrl = () => {
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = baseFileName
    a.rel = 'noopener'
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const tryPageDownloadBlob = () =>
    new Promise<void>((resolve, reject) => {
      const d = extensionChrome.downloads?.download
      if (!d) {
        reject(new Error('no_downloads_api'))
        return
      }
      const objectUrl = URL.createObjectURL(imageBlob)
      d({ url: objectUrl, filename, saveAs: false, conflictAction: 'uniquify' }, () => {
        const err = runtime.lastError
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500)
        if (err?.message) reject(new Error(err.message))
        else resolve()
      })
    })

  const tryPageDownloadDataUrl = () =>
    new Promise<void>((resolve, reject) => {
      const d = extensionChrome.downloads?.download
      if (!d) {
        reject(new Error('no_downloads_api'))
        return
      }
      d({ url: dataUrl, filename, saveAs: false, conflictAction: 'uniquify' }, () => {
        const err = runtime.lastError
        if (err?.message) reject(new Error(err.message))
        else resolve()
      })
    })

  const tryBackgroundMessage = (payload: unknown) =>
    new Promise<{ ok: boolean; error?: string }>((resolve, reject) => {
      if (!sendMessage) {
        reject(new Error('no_receiver'))
        return
      }
      sendMessage(payload, (res) => {
        const le = runtime.lastError
        if (le?.message) reject(new Error(le.message))
        else {
          const body = res as { ok?: boolean; error?: string } | undefined
          resolve({ ok: Boolean(body?.ok), error: body?.error })
        }
      })
    })

  const runDownload = async () => {
    const hasDownloadsApi = Boolean(extensionChrome.downloads?.download)

    if (hasDownloadsApi) {
      try {
        await tryPageDownloadBlob()
        return
      } catch {
        /* thử anchor + background + data URL */
      }
    } else {
      tryAnchorDownloadBlob()
      return
    }

    tryAnchorDownloadBlob()

    if (sendMessage) {
      try {
        const buffer = await imageBlob.arrayBuffer()
        const r = await tryBackgroundMessage({
          type: 'DOWNLOAD_ARRAY_BUFFER',
          buffer,
          filename,
          mimeType: imageBlob.type || 'image/png',
        })
        if (r.ok) return
      } catch {
        /* fall through */
      }
      try {
        const r = await tryBackgroundMessage({ type: 'DOWNLOAD_DATA_URL', dataUrl, filename })
        if (r.ok) return
      } catch {
        /* fall through */
      }
    }

    try {
      await tryPageDownloadDataUrl()
      return
    } catch {
      /* fall through */
    }

    tryAnchorDownloadDataUrl()
  }

  let wroteToWorkspace: { ok: boolean; relativePath?: string } = { ok: false }
  try {
    wroteToWorkspace = await tryWriteToWorkspace()
  } catch {
    wroteToWorkspace = { ok: false }
  }

  if (wroteToWorkspace.ok) {
    const next = [...existing.filter((k) => k !== hashKey), hashKey].slice(-SAVED_SPLIT_IMAGE_HASHES_MAX)
    await new Promise<void>((resolve) => storage.set?.({ [SAVED_SPLIT_IMAGE_HASHES_KEY]: next }, () => resolve()))
    return {
      saved: true,
      skipped: false,
      reason: 'ok',
      destination: 'workspace',
      directoryName: options?.workspaceTarget?.rootHandle.name,
      relativePath: wroteToWorkspace.relativePath,
    }
  }

  let wroteToDirectory = false
  try {
    wroteToDirectory = await tryWriteToChosenDirectory()
  } catch {
    wroteToDirectory = false
  }

  if (wroteToDirectory) {
    const next = [...existing.filter((k) => k !== hashKey), hashKey].slice(-SAVED_SPLIT_IMAGE_HASHES_MAX)
    await new Promise<void>((resolve) => storage.set?.({ [SAVED_SPLIT_IMAGE_HASHES_KEY]: next }, () => resolve()))
    const directoryName = options?.directoryHandle?.name || ''
    return { saved: true, skipped: false, reason: 'ok', destination: 'directory', directoryName }
  }

  await runDownload()

  const next = [...existing.filter((k) => k !== hashKey), hashKey].slice(-SAVED_SPLIT_IMAGE_HASHES_MAX)
  await new Promise<void>((resolve) => storage.set?.({ [SAVED_SPLIT_IMAGE_HASHES_KEY]: next }, () => resolve()))

  return { saved: true, skipped: false, reason: 'ok', destination: 'downloads' }
}

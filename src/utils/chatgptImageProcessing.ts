/**
 * Tiện ích xử lý ảnh ChatGPT: chờ tạo ảnh, đếm ảnh assistant, chụp/cắt đôi, lưu tải xuống, ghép ảnh vào nội dung.
 * Các hàm `*PageScript` dùng với chrome.scripting.executeScript (tự chứa, không import).
 */

export const SPLIT_IMAGE_DOWNLOAD_FOLDER = 'chatgpt-images'
export const SAVED_SPLIT_IMAGE_HASHES_KEY = 'savedSplitImageCopyHashes'
export const SAVED_SPLIT_IMAGE_HASHES_MAX = 150

export function hashDataUrl(dataUrl: string): string {
  let h = 5381
  const stride = Math.max(1, Math.floor(dataUrl.length / 12000))
  for (let i = 0; i < dataUrl.length; i += stride) {
    h = ((h << 5) + h) ^ dataUrl.charCodeAt(i)
  }
  return `${(h >>> 0).toString(16)}_${dataUrl.length}`
}

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

export type SplitCaptureRect = {
  x: number
  y: number
  width: number
  height: number
  viewportWidth?: number
  viewportHeight?: number
  openedModal?: boolean
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

  const makePart = (sx: number, sw: number) => {
    const canvas = document.createElement('canvas')
    canvas.width = sw
    canvas.height = sourceH
    const ctx = canvas.getContext('2d')
    if (!ctx) return ''
    ctx.drawImage(image, sx, sourceY, sw, sourceH, 0, 0, sw, sourceH)
    return canvas.toDataURL('image/png')
  }

  const left = makePart(sourceX, halfW)
  const right = makePart(sourceX + halfW, sourceW - halfW)
  return { left, right }
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

/** Inject: chờ ChatGPT tạo ảnh xong (workflow bước chatgpt_generate_images). */
export async function chatgptWaitGeneratedImageDonePageScript(
  baseCount: number,
  maxWaitMs: number,
): Promise<WaitGeneratedImagePageResult> {
  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
  const pollMs = 700
  const stableMs = 1800
  const settleAfterDetectMs = 3200
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

  let prevSig = getAssistantSignature()

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

  candidate.img.scrollIntoView({ block: 'center', behavior: 'instant' })
  await sleep(120)
  candidate.img.click()
  await sleep(260)

  const modalCandidates = Array.from(document.querySelectorAll<HTMLImageElement>('img'))
    .filter((img) => isVisible(img))
    .map((img) => {
      const rect = img.getBoundingClientRect()
      const score = rect.width * rect.height
      return { img, rect, score }
    })
    .sort((a, b) => b.score - a.score)

  const selected = modalCandidates[0] || candidate
  const rect = selected.rect
  return {
    x: Math.max(0, rect.left),
    y: Math.max(0, rect.top),
    width: rect.width,
    height: rect.height,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    openedModal: true,
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

export type SaveSplitImageResult =
  | { saved: true; skipped: false; reason?: 'ok' }
  | { saved: false; skipped: true; reason: 'duplicate' }
  | { saved: false; skipped: false; reason: 'not_extension' | 'no_storage' }

export async function saveCopiedSplitImageIfNew(
  extensionChrome: ExtensionChromeForSplitSave | null | undefined,
  dataUrl: string,
  part: 'left' | 'right',
  imageBlob: Blob,
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

  await runDownload()

  const next = [...existing.filter((k) => k !== hashKey), hashKey].slice(-SAVED_SPLIT_IMAGE_HASHES_MAX)
  await new Promise<void>((resolve) => storage.set?.({ [SAVED_SPLIT_IMAGE_HASHES_KEY]: next }, () => resolve()))

  return { saved: true, skipped: false, reason: 'ok' }
}

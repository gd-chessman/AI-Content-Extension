import {
  grokFillImaginePageScript,
  grokDownloadVideoBufferPageScript,
  grokListVideoUrlsPageScript,
  grokProbeImageReadyPageScript,
  grokProbeVideoLinkPageScript,
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
    create?: (createProperties: { url: string; active?: boolean }, callback?: (tab: GrokBrowserTab) => void) => void
    update?: (tabId: number, updateProperties: { url?: string; active?: boolean }, callback?: (tab: GrokBrowserTab) => void) => void
  }
  scripting?: {
    executeScript?: (injection: GrokScriptInjection) => Promise<Array<{ result?: unknown }>>
  }
}

export const GROK_URL = 'https://grok.com/imagine/saved'
export const GROK_PATTERNS = ['*://grok.com/imagine*']

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

const isPreferredGrokUrl = (raw?: string) => {
  const path = parseGrokPath(raw)
  return path === '/imagine' || path === '/imagine/saved'
}

const isSavedGrokUrl = (raw?: string) => parseGrokPath(raw) === '/imagine/saved'
const isImagineRootUrl = (raw?: string) => parseGrokPath(raw) === '/imagine'

export const isSupportedGrokUrl = (raw?: string) => {
  const path = parseGrokPath(raw)
  if (!path) return false
  return path === '/imagine' || path === '/imagine/saved' || path.startsWith('/imagine/post')
}

const isImaginePostUrl = (raw?: string) => {
  const path = parseGrokPath(raw)
  return Boolean(path && path.startsWith('/imagine/post'))
}

const shouldRedirectPostToImagine = (raw?: string) => {
  const path = parseGrokPath(raw)
  return Boolean(path && path.startsWith('/imagine/post/') && path !== '/imagine/post')
}

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

  const pickBest = (tabs: GrokBrowserTab[]) => {
    const saved = tabs.find((t) => isSavedGrokUrl(t.url))
    if (saved) return saved
    const imagineRoot = tabs.find((t) => isImagineRootUrl(t.url))
    if (imagineRoot) return imagineRoot
    const post = tabs.find((t) => isImaginePostUrl(t.url))
    if (post) return post
    return tabs[0] || null
  }

  let target: GrokBrowserTab | null | undefined = pickBest(grokTabs)

  if (target?.id && target.url && isImaginePostUrl(target.url) && shouldRedirectPostToImagine(target.url)) {
    target = await updateGrokTab(target.id, GROK_URL, preferActive)
  } else if (target?.id && target.url && isPreferredGrokUrl(target.url)) {
    target = await updateGrokTab(target.id, undefined, preferActive)
  } else if (target?.id) {
    target = await updateGrokTab(target.id, undefined, preferActive)
  }

  if (!target?.id) {
    target = await createGrokTab(GROK_URL, preferActive)
  } else if (!isSupportedGrokUrl(target.url || '')) {
    target = await updateGrokTab(target.id, GROK_URL, preferActive)
  } else {
    target = await updateGrokTab(target.id, undefined, preferActive)
  }

  return target?.id ? target : null
}

export async function waitForGrokComposer(tabId: number, options?: { allowPost?: boolean }) {
  const allowPost = options?.allowPost !== false
  const attempts = 14
  for (let i = 0; i < attempts; i += 1) {
    await sleep(i === 0 ? 120 : 220)
    const payload = (await runGrokPageScript(
      tabId,
      ((canUsePost: boolean) => {
        const path = location.pathname.replace(/\/+$/, '')
        const okPath = path === '/imagine' || path === '/imagine/saved' || (canUsePost && path === '/imagine/post')
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
      [allowPost],
    )) as { ok?: boolean; hasInput?: boolean } | null

    if (payload?.ok && payload?.hasInput) return true
  }
  return false
}

export async function injectPromptToGrok(tabId: number, prompt: string, imageUrl?: string) {
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

export async function listGrokVideoUrlsOnPage(tabId: number) {
  const result = (await runGrokPageScript(
    tabId,
    grokListVideoUrlsPageScript as (...args: unknown[]) => unknown,
  )) as string[] | null
  return Array.isArray(result) ? result.map((u) => u.trim()).filter(Boolean) : []
}

export async function probeGrokVideoLink(tabId: number, baselineUrls: string[] = []) {
  return (await runGrokPageScript(
    tabId,
    grokProbeVideoLinkPageScript as (...args: unknown[]) => unknown,
    [baselineUrls],
  )) as { ready?: boolean; url?: string; kind?: string } | null
}

export async function waitForGrokVideoLink(
  tabId: number,
  timeoutMs: number,
  options?: { baselineUrls?: string[] },
) {
  const baselineUrls = options?.baselineUrls || []
  const started = Date.now()
  let lastUrl = ''
  let stableHits = 0

  while (Date.now() - started < timeoutMs) {
    const probe = await probeGrokVideoLink(tabId, baselineUrls)
    const url = probe?.ready && probe.url ? probe.url.trim() : ''
    if (url) {
      if (url === lastUrl) stableHits += 1
      else {
        lastUrl = url
        stableHits = 1
      }
      if (stableHits >= 2) return lastUrl
    } else {
      lastUrl = ''
      stableHits = 0
    }
    await sleep(2500)
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
  options?: { baselineUrls?: string[] },
) {
  const grokUrl = await waitForGrokVideoLink(tabId, timeoutMs, options)
  if (!grokUrl) return { grokUrl: '', localPath: '', byteLength: 0 }

  if (/imagine\/post/i.test(grokUrl) && !/\.mp4/i.test(grokUrl)) {
    throw new Error('Chỉ thấy link post Grok — chưa có file video MP4 để tải.')
  }

  const saved = await saveGrokVideoToDirectory(tabId, grokUrl, saveTarget)
  return { grokUrl, localPath: saved.localPath, byteLength: saved.byteLength }
}

export async function fillGrokFromStoryPair(
  tabId: number,
  prompt: string,
  imageUrl: string,
  options?: { submit?: boolean },
) {
  const ready = await waitForGrokComposer(tabId, { allowPost: true })
  if (!ready) throw new Error('Grok composer chưa sẵn sàng.')

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

  return {
    foundInput: true,
    wroteText: Boolean(payload.wroteText),
    pastedImage: Boolean(payload.pastedImage),
  }
}

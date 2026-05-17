/**
 * Chạy handlerScript / guardScript từ DB mà không dùng `AsyncFunction` / `Function`.
 * Extension Chrome (CSP) không cho phép eval — `AsyncFunction is not defined`.
 */
export type ToolScriptHost = Record<string, unknown>

function compactScript(source: string): string {
  return source.replace(/\s+/g, ' ').trim()
}

function callHostVoid(host: ToolScriptHost, key: string, ...args: unknown[]): Promise<void> {
  const fn = host[key]
  if (typeof fn !== 'function') {
    throw new Error(`host.${key} không khả dụng`)
  }
  return Promise.resolve(fn(...args))
}

/** Thực thi handlerScript đã đăng ký trong `shared/tools` (khớp chuỗi sau khi compact). */
export async function runToolHandlerScript(
  handlerScript: string,
  host: ToolScriptHost,
  config: Record<string, unknown>,
): Promise<void> {
  const body = compactScript(handlerScript)
  if (!body) {
    throw new Error('handlerScript trống')
  }

  if (body.includes('captureAndSplitLatestImage') || body.includes('extractAndSplitLatestImageFromStep3')) {
    await callHostVoid(host, 'captureAndSplitLatestImage')
    return
  }

  if (body.includes('copySplitImage')) {
    const part: 'left' | 'right' = config.part === 'right' ? 'right' : 'left'
    await callHostVoid(host, 'copySplitImage', part)
    return
  }

  if (body.includes('copyLatestChatImage')) {
    await callHostVoid(host, 'copyLatestChatImage')
    return
  }

  if (body.includes('extractSingleVideoContent')) {
    await callHostVoid(host, 'extractSingleVideoContent')
    return
  }

  if (body.includes('extractVideoContent')) {
    const part: 1 | 2 = config.part === 2 || config.part === '2' ? 2 : 1
    await callHostVoid(host, 'extractVideoContent', part)
    return
  }

  if (body.includes('extractThreadContent') || body.includes('extractStep4Content')) {
    const mode = config.mode
    if (
      mode !== 'title_plain' &&
      mode !== 'title_styled' &&
      mode !== 'content_short' &&
      mode !== 'content_full'
    ) {
      throw new Error('config.mode không hợp lệ cho extractThreadContent')
    }
    await callHostVoid(host, 'extractThreadContent', mode)
    return
  }

  if (body.includes('fillGrokImage')) {
    const part: 1 | 2 = config.part === 2 || config.part === '2' ? 2 : 1
    await callHostVoid(host, 'fillGrokImage', part)
    return
  }

  if (body === 'await host.pushWebBlog();' || body.includes('pushWebBlog')) {
    await callHostVoid(host, 'pushWebBlog')
    return
  }

  if (body.includes('collectGgSheet')) {
    await callHostVoid(host, 'collectGgSheet')
    return
  }

  if (body.includes('saveLocal')) {
    await callHostVoid(host, 'saveLocal')
    return
  }

  throw new Error(`Chưa hỗ trợ handlerScript: ${body.slice(0, 120)}`)
}

const GUARD_HANDLERS: Record<string, (host: ToolScriptHost) => boolean> = {
  '!host.stepIsExtractVideos()': (host) =>
    !(typeof host.stepIsExtractVideos === 'function' && host.stepIsExtractVideos()),
  '!host.stepIsGenerateImages()': (host) =>
    !(typeof host.stepIsGenerateImages === 'function' && host.stepIsGenerateImages()),
  '!host.stepIsExtractContent()': (host) =>
    !(typeof host.stepIsExtractContent === 'function' && host.stepIsExtractContent()),
  '!host.splitImages': (host) => !host.splitImages,
  '!host.legacyStepPanelContext.hasExtractVideosStep': (host) => {
    const ctx = host.legacyStepPanelContext as { hasExtractVideosStep?: boolean } | undefined
    return !ctx?.hasExtractVideosStep
  },
  '!host.legacyStepPanelContext.hasGenerateImagesStep': (host) => {
    const ctx = host.legacyStepPanelContext as { hasGenerateImagesStep?: boolean } | undefined
    return !ctx?.hasGenerateImagesStep
  },
  '!host.legacyStepPanelContext.hasExtractContentStep': (host) => {
    const ctx = host.legacyStepPanelContext as { hasExtractContentStep?: boolean } | undefined
    return !ctx?.hasExtractContentStep
  },
  '!host.canSaveLocal': (host) => !host.canSaveLocal,
  '!host.isExtractContentReady': (host) => !host.isExtractContentReady,
}

/** `guardScript` trả truthy → nút bị disabled. */
export function isToolDisabledByGuardScript(
  guardScript: string | undefined,
  host: ToolScriptHost,
  _config: Record<string, unknown>,
): boolean {
  const body = compactScript(guardScript || '')
  if (!body) return false
  const handler = GUARD_HANDLERS[body]
  if (handler) return handler(host)
  return false
}

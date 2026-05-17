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

type ToolHandlerKind =
  | 'captureAndSplit'
  | 'copySplitImage'
  | 'copyLatestChatImage'
  | 'extractSingleVideoContent'
  | 'extractVideoContent'
  | 'extractThreadContent'
  | 'fillGrokImage'
  | 'pushWebBlog'
  | 'collectGgSheet'
  | 'saveLocal'

function resolveToolHandlerKind(body: string): ToolHandlerKind | null {
  if (body.includes('captureAndSplitLatestImage') || body.includes('extractAndSplitLatestImageFromStep3')) {
    return 'captureAndSplit'
  }
  if (body.includes('copySplitImage')) return 'copySplitImage'
  if (body.includes('copyLatestChatImage')) return 'copyLatestChatImage'
  if (body.includes('extractSingleVideoContent')) return 'extractSingleVideoContent'
  if (body.includes('extractVideoContent')) return 'extractVideoContent'
  if (body.includes('extractThreadContent') || body.includes('extractStep4Content')) {
    return 'extractThreadContent'
  }
  if (body.includes('fillGrokImage')) return 'fillGrokImage'
  if (body === 'await host.pushWebBlog();' || body.includes('pushWebBlog')) return 'pushWebBlog'
  if (body.includes('collectGgSheet')) return 'collectGgSheet'
  if (body.includes('saveLocal')) return 'saveLocal'
  return null
}

function parseImagePart(config: Record<string, unknown>): 'left' | 'right' {
  return config.part === 'right' ? 'right' : 'left'
}

function parseNumericPart(config: Record<string, unknown>): 1 | 2 {
  return config.part === 2 || config.part === '2' ? 2 : 1
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

  const kind = resolveToolHandlerKind(body)
  if (!kind) {
    throw new Error(`Chưa hỗ trợ handlerScript: ${body.slice(0, 120)}`)
  }

  switch (kind) {
    case 'captureAndSplit':
      await callHostVoid(host, 'captureAndSplitLatestImage')
      return
    case 'copySplitImage':
      await callHostVoid(host, 'copySplitImage', parseImagePart(config))
      return
    case 'copyLatestChatImage':
      await callHostVoid(host, 'copyLatestChatImage')
      return
    case 'extractSingleVideoContent':
      await callHostVoid(host, 'extractSingleVideoContent')
      return
    case 'extractVideoContent':
      await callHostVoid(host, 'extractVideoContent', parseNumericPart(config))
      return
    case 'extractThreadContent': {
      const mode = config.mode
      switch (mode) {
        case 'title_plain':
        case 'title_styled':
        case 'content_short':
        case 'content_full':
          await callHostVoid(host, 'extractThreadContent', mode)
          return
        default:
          throw new Error('config.mode không hợp lệ cho extractThreadContent')
      }
    }
    case 'fillGrokImage':
      await callHostVoid(host, 'fillGrokImage', parseNumericPart(config))
      return
    case 'pushWebBlog':
      await callHostVoid(host, 'pushWebBlog')
      return
    case 'collectGgSheet':
      await callHostVoid(host, 'collectGgSheet')
      return
    case 'saveLocal':
      await callHostVoid(host, 'saveLocal')
      return
    default:
      throw new Error(`Chưa hỗ trợ handlerScript: ${body.slice(0, 120)}`)
  }
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

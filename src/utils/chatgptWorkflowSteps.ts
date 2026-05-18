/**
 * Nhận diện bước workflow ChatGPT theo `actionType` từ DB — không dùng stepNo / step-id cố định.
 * Giá trị khớp enum `StepActionType` backend (`step.schema.ts`).
 */

export type ChatgptProcessStepLike = {
  id: string
  label: string
  stepNo?: number
  actionType?: string
  prompt?: string
  displayMode?: string
}

/** Prompt bước `chatgpt_extract_content` (đầu chuỗi) — dùng khớp thread ChatGPT / GgSheet collect. */
export const CHATGPT_EXTRACT_CONTENT_PROMPT_HINT_KEY = 'chatgptExtractContentPromptHint'

export const CHATGPT_STEP_ACTION = {
  REWRITE_CONTENT: 'chatgpt_rewrite_content',
  EXTRACT_CONTENT_VIDEOS: 'chatgpt_extract_content_videos',
  EXTRACT_CONTENT_VIDEO: 'chatgpt_extract_content_video',
  GENERATE_IMAGES: 'chatgpt_generate_images',
  GENERATE_IMAGE: 'chatgpt_generate_image',
  EXTRACT_CONTENT: 'chatgpt_extract_content',
  SAVE_STORY: 'chatgpt_save_story',
} as const

export function normalizeChatgptActionType(actionType?: string): string {
  return (actionType || '').trim().toLowerCase()
}

export function isChatgptRewriteContentStep(step: ChatgptProcessStepLike): boolean {
  return normalizeChatgptActionType(step.actionType) === CHATGPT_STEP_ACTION.REWRITE_CONTENT
}

export function isChatgptExtractVideosStep(step: ChatgptProcessStepLike): boolean {
  const action = normalizeChatgptActionType(step.actionType)
  return (
    action === CHATGPT_STEP_ACTION.EXTRACT_CONTENT_VIDEOS ||
    action === CHATGPT_STEP_ACTION.EXTRACT_CONTENT_VIDEO
  )
}

export function isChatgptGenerateImagesStep(step: ChatgptProcessStepLike): boolean {
  const action = normalizeChatgptActionType(step.actionType)
  return action === CHATGPT_STEP_ACTION.GENERATE_IMAGES || action === CHATGPT_STEP_ACTION.GENERATE_IMAGE
}

/** `chatgpt_generate_images` — ảnh kép cạnh nhau, cần cắt trái/phải. */
export function isChatgptGenerateSplitImagesStep(step: ChatgptProcessStepLike): boolean {
  return normalizeChatgptActionType(step.actionType) === CHATGPT_STEP_ACTION.GENERATE_IMAGES
}

/** Workflow có bước tạo ảnh kép → chụp và cắt đôi; chỉ `chatgpt_generate_image` → một ảnh nguyên. */
export function shouldSplitChatgptGeneratedImages(steps: ChatgptProcessStepLike[]): boolean {
  return steps.some(isChatgptGenerateSplitImagesStep)
}

export function isChatgptExtractContentStep(step: ChatgptProcessStepLike): boolean {
  return normalizeChatgptActionType(step.actionType) === CHATGPT_STEP_ACTION.EXTRACT_CONTENT
}

export function isChatgptSaveStoryStep(step: ChatgptProcessStepLike): boolean {
  return normalizeChatgptActionType(step.actionType) === CHATGPT_STEP_ACTION.SAVE_STORY
}

export function findChatgptStep(
  steps: ChatgptProcessStepLike[],
  matcher: (step: ChatgptProcessStepLike) => boolean,
): ChatgptProcessStepLike | undefined {
  return steps.find(matcher)
}

export function stepDisplayLabel(step: ChatgptProcessStepLike | undefined, fallback: string): string {
  const label = (step?.label || '').trim()
  return label || fallback
}

export type ChatgptStepsByAction = {
  rewrite: ChatgptProcessStepLike | undefined
  extractVideos: ChatgptProcessStepLike | undefined
  generateImages: ChatgptProcessStepLike | undefined
  extractContent: ChatgptProcessStepLike | undefined
}

export function indexChatgptStepsByAction(steps: ChatgptProcessStepLike[]): ChatgptStepsByAction {
  return {
    rewrite: findChatgptStep(steps, isChatgptRewriteContentStep),
    extractVideos: findChatgptStep(steps, isChatgptExtractVideosStep),
    generateImages: findChatgptStep(steps, isChatgptGenerateImagesStep),
    extractContent: findChatgptStep(steps, isChatgptExtractContentStep),
  }
}

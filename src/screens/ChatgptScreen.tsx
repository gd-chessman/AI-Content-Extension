import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  FiAlignLeft,
  FiAlertTriangle,
  FiCheck,
  FiCopy,
  FiDownload,
  FiEdit3,
  FiFileText,
  FiGrid,
  FiLayers,
  FiFilm,
  FiFolder,
  FiImage,
  FiInfo,
  FiItalic,
  FiPlay,
  FiRefreshCw,
  FiSave,
  FiScissors,
  // FiSettings,
  FiSquare,
  FiType,
} from 'react-icons/fi'
import { IoFlash } from 'react-icons/io5'
import { RiAdminFill } from 'react-icons/ri'
import { SiGooglesheets, SiX } from 'react-icons/si'
import { useAuth } from '@/hooks/useAuth'
import {
  createWorkflowRunEventSource,
  createStepRun,
  createWorkflowRun,
  getUserWorkflowDetail,
  getUserWorkflowTools,
  getUserWorkflows,
  getWorkflowRunById,
  type WorkflowItem,
  type WorkflowRunStreamEvent,
  updateStepRun,
  updateWorkflowRun,
} from '@/services/WorkflowService'
import {
  createStoryFromReel,
  getMyStories,
  getMyStorySources,
} from '@/services/StoryService'
import { uploadStoryImagesFromDataUrls } from '@/services/CloudinaryUploadService'
import { chatgptExtractContent } from '@/utils/chatgptExtractContent'
import {
  appendShortCutInjectArgs,
  getShortContentCutConfigFromStorage,
} from '@/utils/shortContentCutConfig'
import {
  chatgptExtractSingleVideoBlockPageScript,
  chatgptExtractVideoBlockPageScript,
  chatgptProbeLatestAssistantVideoReadyPageScript,
  chatgptScrollToSingleVideoBlockPageScript,
  chatgptScrollToVideoBlockPageScript,
  chatgptWarmThreadScrollContainersPageScript,
  chatgptScrollHighlightStep4ContentPageScript,
  getChatgptStep4ContentKindLabel,
  injectImagesIntoLongContent,
  injectSingleImageIntoLongContent,
} from '@/utils/chatgptContentProcessing'
import {
  chatgptInjectPromptPageScript,
  chatgptOpenNewChatPageScript,
  chatgptVerifyLastStepReadyPageScript,
  chatgptSnapshotAssistantResponsePageScript,
  type ChatgptAssistantResponseSnapshot,
} from '@/utils/chatgptPageScripts'
import {
  chatgptAssistantImageCountPageScript,
  chatgptCloseImageLightboxPageScript,
  chatgptLocateLatestChatImageForCapturePageScript,
  chatgptSnapshotGeneratedImagePageScript,
  type ChatgptGeneratedImageSnapshot,
  cropCapturedImage,
  splitCapturedImage,
  splitFullImageDataUrl,
  type SplitCaptureRect,
} from '@/utils/chatgptImageProcessing'
import {
  getStoriesFolderSegmentFromStorage,
  isFilesystemPermissionError,
  type LocalStoryBundleWritePayload,
  resolveWritableContentRootDirectory,
  sanitizeWorkspaceFolderSegment,
  writeStoryBundleToWorkspace,
} from '@/utils/localWorkspacePersistence'
import type { StepToolLink } from '@/services/StepToolService'
import { fetchToolHandler } from '@/services/ToolHandlerService'
import {
  buildWorkflowBottomBarTools,
  type ResolvedBottomBarTool,
} from '@/utils/chatgptBottomBarTools'
import {
  buildWorkflowStepPanelComparison,
  getStepPanelBadgeLabel,
  type ResolvedStepPanelTool,
  type StepPanelIconKey,
  type StepPanelToolComparison,
} from '@/utils/chatgptStepPanelTools'
import {
  isToolDisabledByGuardScript,
  runToolHandlerScript,
  type ToolScriptHost,
} from '@/utils/toolScriptRunner'
import {
  CHATGPT_EXTRACT_CONTENT_PROMPT_HINT_KEY,
  indexChatgptStepsByAction,
  type ChatgptProcessStepLike,
  isChatgptExtractContentStep,
  isChatgptExtractVideosStep,
  isChatgptExtractContentVideosPluralStep,
  isChatgptGenerateImagesStep,
  isChatgptRewriteContentStep,
  isChatgptSaveStoryStep,
  shouldSplitChatgptGeneratedImages,
  stepDisplayLabel,
} from '@/utils/chatgptWorkflowSteps'
import { TOOL_STEP_PHASE_LABEL, type ToolStepPhase } from '@/utils/toolStepPhase'
import {
  canManualChatgptStep,
  isBackgroundDisplayMode,
  normalizeStepDisplayMode,
  type StepDisplayMode,
} from '@/utils/stepDisplayMode'

type BrowserTab = { id?: number; url?: string; active?: boolean; windowId?: number }
type ExtensionChrome = {
  runtime?: {
    id?: string
    lastError?: { message?: string }
    sendMessage?: (
      message: unknown,
      responseCallback?: (response: { ok?: boolean; error?: string }) => void,
    ) => void
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
        conflictAction?: 'uniquify' | 'overwrite' | 'prompt'
        saveAs?: boolean
      },
      callback?: () => void,
    ) => void
  }
  tabs?: {
    query?: (
      queryInfo: { url?: string[]; currentWindow?: boolean; active?: boolean },
      callback: (tabs: BrowserTab[]) => void,
    ) => void
    create?: (createProperties: { url: string; active?: boolean }, callback?: (tab: BrowserTab) => void) => void
    update?: (tabId: number, updateProperties: { url?: string; active?: boolean }, callback?: (tab: BrowserTab) => void) => void
    captureVisibleTab?: (
      windowId?: number,
      options?: { format?: 'jpeg' | 'png'; quality?: number },
      callback?: (dataUrl: string) => void,
    ) => void
  }
  windows?: {
    update?: (
      windowId: number,
      updateProperties: { focused?: boolean },
      callback?: () => void,
    ) => void
  }
  scripting?: {
    executeScript?: (injection: {
      target: { tabId: number }
      func: (...args: unknown[]) => unknown
      args?: unknown[]
    }) => Promise<Array<{ result?: unknown }>>
  }
}

const CHATGPT_URL = 'https://chatgpt.com/'
const CHATGPT_PATTERNS = ['*://chatgpt.com/*', '*://chat.openai.com/*']

const FACEBOOK_REEL_MEMORY_KEY = 'facebookReelCopiedContent'
const CHATGPT_SELECTED_WORKFLOW_STORAGE_KEY = 'chatgptSelectedWorkflowId'

/** Story mới nhất cùng StorySource (để gắn lưu videoPrompts cuối workflow). */
async function resolveLatestStoryIdForSource(storySourceId: string): Promise<string> {
  const { items: stories } = await getMyStories({ page: 1, limit: 200 })
  const linked = stories
    .filter((s) => (s.storySourceId || '').trim() === storySourceId.trim())
    .sort((a, b) => {
      const tb = new Date(b.createdAt || 0).getTime()
      const ta = new Date(a.createdAt || 0).getTime()
      return tb - ta
    })
  return (linked[0]?._id || '').trim()
}

function nonEmptyVideoPrompts(items: string[] | null | undefined): string[] {
  if (!items?.length) return []
  return items.map((s) => String(s ?? '').trim()).filter(Boolean)
}

export type ChatgptStorySaveBundle = {
  title: string
  shortContent: string
  longContent: string
  imageUrls: string[]
}

/** Sau khi workflow xong: tạo Story mới kèm videoPrompts + nội dung/ảnh từ ChatGPT. */
async function createStoryForPipelineRun(
  videoPrompts: string[],
  bundle: ChatgptStorySaveBundle,
): Promise<{ storyId: string; error?: string }> {
  const sources = await getMyStorySources()
  const top = sources[0]
  if (!top?._id) {
    return {
      storyId: '',
      error: 'Chưa có StorySource — hãy Lưu story trên Facebook trước khi chạy workflow.',
    }
  }

  const reelUrl = (top.sourceReelUrl || '').trim()
  if (!reelUrl) {
    return {
      storyId: '',
      error: 'StorySource thiếu URL reel — mở Facebook, chọn reel và bấm Lưu story lại.',
    }
  }

  try {
    const created = await createStoryFromReel({
      sourceReelUrl: reelUrl,
      name: (bundle.title || top.name || '').trim().slice(0, 200),
      videoPrompts,
      shortContent: bundle.shortContent,
      longContent: bundle.longContent,
      imageUrls: bundle.imageUrls,
    })
    const storyId = (created._id || '').trim()
    if (!storyId) {
      return { storyId: '', error: 'API tạo story không trả về id.' }
    }
    return { storyId }
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : typeof err === 'string' ? err : 'Không tạo được story trên máy chủ.'
    return { storyId: '', error: msg }
  }
}

/** Lưu cục bộ khi không có story trên API — `storyId` dạng `local-…` để phân biệt trong meta.json. */
function buildLocalOnlyStoryContextFromTitle(titlePlain: string): {
  storyId: string
  folderSegment: string
  titleDisplay: string
  sourceReelUrl: string
} {
  const trimmed = titlePlain.trim()
  const storyId = `local-${Date.now()}`
  return {
    storyId,
    folderSegment: sanitizeWorkspaceFolderSegment(trimmed, `story-local-${Date.now()}`),
    titleDisplay: trimmed,
    sourceReelUrl: '',
  }
}

/** Nguồn caption cho workflow ChatGPT: DB (StorySource) hoặc localStorage. */
type ChatgptWorkflowSource = 'localstorage' | 'stories'

function normalizeChatgptWorkflowSource(raw?: string): ChatgptWorkflowSource | undefined {
  const s = String(raw || '').trim().toLowerCase()
  if (s === 'stories') return 'stories'
  if (s === 'localstorage') return 'localstorage'
  return undefined
}

/**
 * Mặc định **stories** (StorySource DB). Ép **localstorage** qua `runWorkflow({ chatgptWorkflowSource })`
 * hoặc payload run `chatgptWorkflowSource` / `chatgptStep1Source` (legacy).
 */
async function resolveChatgptWorkflowSourceMode(
  runId: string,
  options?: {
    chatgptWorkflowSource?: ChatgptWorkflowSource
    source?: string
  },
): Promise<ChatgptWorkflowSource> {
  const fromOptions = normalizeChatgptWorkflowSource(options?.chatgptWorkflowSource)
  if (fromOptions) return fromOptions

  if (runId) {
    try {
      const r = await getWorkflowRunById(runId)
      const payload = (r.payload || {}) as {
        chatgptWorkflowSource?: string
        /** @deprecated Dùng chatgptWorkflowSource */
        chatgptStep1Source?: string
      }
      const fromPayload =
        normalizeChatgptWorkflowSource(payload.chatgptWorkflowSource) ||
        normalizeChatgptWorkflowSource(payload.chatgptStep1Source)
      if (fromPayload) return fromPayload
    } catch {
      /* ignore */
    }
  }

  return 'stories'
}

type ProcessStep = {
  id: string
  label: string
  /** Prompt gốc từ DB (không gồn instruction) — dùng ẩn/hiện sidebar. */
  hasDbPrompt: boolean
  prompt: string
  workflowId: string
  workflowPlatform: string
  backendStepId: string
  stepNo: number
  actionType: string
  displayMode: StepDisplayMode
  inputSchema: Record<string, unknown>
  tools?: StepToolLink[]
}

const STEP_PANEL_ICONS: Record<StepPanelIconKey, typeof FiScissors> = {
  scissors: FiScissors,
  image: FiImage,
  film: FiFilm,
  type: FiType,
  italic: FiItalic,
  alignLeft: FiAlignLeft,
  fileText: FiFileText,
}

type StepPanelToolsSectionProps = {
  comparison: StepPanelToolComparison
  copiedTool: string | null
  copiedPart: 'left' | 'right' | null
  getOwnerStep: (tool: ResolvedStepPanelTool) => ProcessStep | undefined
  isToolDisabled: (tool: ResolvedStepPanelTool, step: ProcessStep) => boolean
  onRunTool: (tool: ResolvedStepPanelTool) => void
}

function StepPanelToolsSection({
  comparison,
  copiedTool,
  copiedPart,
  getOwnerStep,
  isToolDisabled,
  onRunTool,
}: StepPanelToolsSectionProps) {
  if (!comparison.display.length) {
    return (
      <div className="grid grid-cols-2 gap-1">
        {[0, 1].map((slot) => (
          <div
            key={slot}
            className="inline-flex h-6.5 cursor-default items-center justify-center rounded-md border border-dashed border-white/15 bg-white/5 text-slate-600"
            aria-hidden
          >
            <FiGrid className="h-3.5 w-3.5 opacity-30" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-1">
      {comparison.display.map((tool) => {
        const ownerStep = getOwnerStep(tool)
        if (!ownerStep) return null
        const Icon = STEP_PANEL_ICONS[tool.ui.icon]
        const disabled = isToolDisabled(tool, ownerStep)
        const badge = getStepPanelBadgeLabel(tool.config, tool.ui)
        const showCopyBadge = tool.ui.showCopyBadge === true
        const copied =
          copiedTool === tool.ui.copiedToolId ||
          (tool.ui.copiedToolId.startsWith('image-') && copiedPart === tool.config.part)

        return (
          <button
            key={`${tool.ownerStepId}-${tool.toolId}`}
            type="button"
            onClick={() => onRunTool(tool)}
            disabled={disabled}
            className={`inline-flex h-6.5 w-full cursor-pointer items-center justify-center rounded-md transition disabled:cursor-not-allowed disabled:opacity-40 ${tool.ui.buttonClass} ${
              tool.ui.colSpan === 2 ? 'col-span-2' : ''
            }`}
            title={tool.name}
          >
            <span className="relative inline-flex items-center justify-center">
              <Icon className="h-3.5 w-3.5" />
              {badge ? (
                <span
                  className={`absolute -right-1.5 -top-1.5 inline-flex h-3 min-w-3 items-center justify-center rounded-full px-0.5 text-[7px] font-bold leading-none text-white ${tool.ui.badgeClass}`}
                >
                  {badge}
                </span>
              ) : null}
              {showCopyBadge ? (
                <span
                  className={`absolute -left-1.5 -bottom-1.5 inline-flex h-2 min-w-2 items-center justify-center rounded-full px-0 text-[5px] font-bold leading-none text-white ${tool.ui.badgeClass}`}
                >
                  {copied ? <FiCheck className="h-1.5 w-1.5" /> : <FiCopy className="h-1.5 w-1.5" />}
                </span>
              ) : null}
            </span>
          </button>
        )
      })}
    </div>
  )
}

type BottomBarToolsSectionProps = {
  tools: ResolvedBottomBarTool[]
  isLoading: boolean
  isSavingStoryLocal: boolean
  isToolDisabled: (tool: ResolvedBottomBarTool) => boolean
  onRunTool: (tool: ResolvedBottomBarTool) => void
}

function BottomBarToolIcon({
  icon,
  isSavingStoryLocal,
}: {
  icon: ResolvedBottomBarTool['ui']['icon']
  isSavingStoryLocal: boolean
}) {
  switch (icon) {
    case 'grok1':
      return (
        <>
          <SiX className="h-3 w-3" />
          <FiImage className="h-3 w-3" />
          <span className="absolute -right-2 -top-2 inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-sky-500 px-0.5 text-[8px] font-bold leading-none text-white">
            1
          </span>
        </>
      )
    case 'grok2':
      return (
        <>
          <SiX className="h-3 w-3" />
          <FiImage className="h-3 w-3" />
          <span className="absolute -right-2 -top-2 inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-sky-500 px-0.5 text-[8px] font-bold leading-none text-white">
            2
          </span>
        </>
      )
    case 'grokSingle':
      return (
        <>
          <SiX className="h-3 w-3" />
          <FiImage className="h-3 w-3" />
          <FiFilm className="h-3 w-3" />
        </>
      )
    case 'webblog':
      return (
        <>
          <RiAdminFill className="h-3 w-3" />
          <FiFileText className="h-3 w-3" />
        </>
      )
    case 'ggsheet':
      return (
        <>
          <SiGooglesheets className="h-3 w-3" />
          <FiDownload className="h-3 w-3" />
        </>
      )
    case 'saveLocal':
      if (isSavingStoryLocal) {
        return (
          <>
            <FiSave className="h-3 w-3 opacity-40" aria-hidden />
            <FiRefreshCw className="h-3 w-3 animate-spin" aria-hidden />
          </>
        )
      }
      return (
        <>
          <FiSave className="h-3 w-3" aria-hidden />
          <FiFolder className="h-3 w-3" aria-hidden />
        </>
      )
    default:
      return (
        <>
          <FiSave className="h-3 w-3" aria-hidden />
          <FiFolder className="h-3 w-3" aria-hidden />
        </>
      )
  }
}

function BottomBarToolsSection({
  tools,
  isLoading,
  isSavingStoryLocal,
  isToolDisabled,
  onRunTool,
}: BottomBarToolsSectionProps) {
  if (isLoading && !tools.length) {
    return (
      <>
        {[0, 1, 2, 3, 4].map((slot) => (
          <div
            key={slot}
            className="inline-flex min-h-8 min-w-0 flex-1 animate-pulse rounded-lg bg-white/10"
            aria-hidden
          />
        ))}
      </>
    )
  }

  if (!tools.length) {
    return (
      <p className="w-full py-1 text-center text-[10px] text-slate-500">
        Chưa có công cụ dưới cho workflow này.
      </p>
    )
  }

  return (
    <>
      {tools.map((tool) => {
        const disabled = isToolDisabled(tool)
        const showSaving = tool.ui.icon === 'saveLocal' && isSavingStoryLocal
        return (
          <button
            key={tool.toolId}
            type="button"
            onClick={() => onRunTool(tool)}
            disabled={disabled}
            className={`inline-flex min-h-8 min-w-0 flex-1 cursor-pointer items-center justify-center rounded-lg px-1 transition disabled:cursor-not-allowed disabled:opacity-40 sm:px-2 ${tool.ui.buttonClass}`}
            title={tool.name}
            aria-label={tool.name}
          >
            <span className="relative inline-flex items-center justify-center gap-1">
              <BottomBarToolIcon icon={tool.ui.icon} isSavingStoryLocal={showSaving} />
            </span>
          </button>
        )
      })}
    </>
  )
}


export default function ChatgptScreen() {
  const refreshRoleOnly = useAuth((s) => s.refreshRoleOnly)
  const role = useAuth((s) => s.role)
  const canUseWorkflow = role === 'user-vip' || role === 'admin'

  useEffect(() => {
    void refreshRoleOnly()
  }, [refreshRoleOnly])

  const [status, setStatus] = useState('Chọn một tiến trình để gửi prompt tự động vào ChatGPT.')
  const [selectedWorkflowId, setSelectedWorkflowId] = useState('')
  const [selectedStepId, setSelectedStepId] = useState('')
  const [splitImages, setSplitImages] = useState<{ left: string; right: string } | null>(null)
  const [copiedPart, setCopiedPart] = useState<'left' | 'right' | null>(null)
  const [copiedTool, setCopiedTool] = useState<string | null>(null)
  const [isSavingStoryLocal, setIsSavingStoryLocal] = useState(false)
  const pendingLocalSaveRef = useRef<LocalStoryBundleWritePayload | null>(null)
  const [hasPendingLocalSave, setHasPendingLocalSave] = useState(false)
  /** Đã có đủ lượt user + phản hồi assistant cho bước trích nội dung trên tab ChatGPT. */
  const [extractContentReady, setExtractContentReady] = useState(false)
  const [isWorkflowRunning, setIsWorkflowRunning] = useState(false)
  /** Tiến trình đang chạy trong workflow — highlight tím trên sidebar. */
  const [workflowActiveStepId, setWorkflowActiveStepId] = useState('')
  const workflowStepsScrollRef = useRef<HTMLDivElement>(null)
  const workflowStepItemRefs = useRef(new Map<string, HTMLDivElement>())
  const workflowStopRef = useRef(false)
  const WORKFLOW_STOPPED_MESSAGE = 'WORKFLOW_STOPPED'

  const throwIfWorkflowStopped = () => {
    if (workflowStopRef.current) {
      throw new Error(WORKFLOW_STOPPED_MESSAGE)
    }
  }

  const lockedWorkflowTabIdRef = useRef<number>(0)
  const runningWorkflowRunIdRef = useRef('')
  /** Story đang chạy pipeline ChatGPT (tiến trình 1 — cùng story để lưu videoPrompts sau cùng). */
  const chatgptPipelineStoryIdRef = useRef('')
  /** Prompt VIDEO (1 hoặc nhiều) sau bước tách — commit DB ở bước save story. */
  const chatgptDraftVideoPromptsRef = useRef<string[] | null>(null)
  /** Workflow: gọi công cụ step_panel — gom text VIDEO, không copy clipboard. */
  const workflowVideoCaptureRef = useRef<{ active: boolean; prompts: string[] }>({
    active: false,
    prompts: [],
  })
  /** Bước `chatgpt_rewrite_content`: gán lúc bắt đầu workflow — mặc định story (`sourceContent`). */
  /** Nguồn caption workflow: `stories` = StorySource DB; `localstorage` = bản nhớ tạm Facebook. */
  const chatgptWorkflowSourceRef = useRef<ChatgptWorkflowSource>('stories')
  const { data: workflows = [], isLoading: isLoadingWorkflows } = useQuery<WorkflowItem[]>({
    queryKey: ['chatgpt-workflows'],
    queryFn: async () => await getUserWorkflows({ platform: 'chatgpt' }),
    staleTime: 60_000,
  })
  const { data: workflowDetail, isLoading: isLoadingWorkflowDetail } = useQuery({
    queryKey: ['chatgpt-workflow-detail', selectedWorkflowId],
    enabled: Boolean(selectedWorkflowId),
    queryFn: async () => {
      const target = workflows.find((workflow) => workflow._id === selectedWorkflowId) || null
      if (!target?._id) return null
      return await getUserWorkflowDetail(target._id)
    },
    staleTime: 60_000,
  })

  const { data: workflowTools, isLoading: isLoadingWorkflowTools } = useQuery({
    queryKey: ['chatgpt-workflow-tools', selectedWorkflowId],
    enabled: Boolean(selectedWorkflowId),
    queryFn: async () => await getUserWorkflowTools(selectedWorkflowId),
    staleTime: 30_000,
    refetchOnMount: 'always',
  })

  const isLoadingProcessSteps = isLoadingWorkflowDetail || isLoadingWorkflowTools

  const toolsByStepId = useMemo(() => {
    const map = new Map<string, StepToolLink[]>()
    for (const group of workflowTools?.steps ?? []) {
      map.set(
        group.stepId,
        (group.tools || []).filter((link) => link.isActive !== false),
      )
    }
    return map
  }, [workflowTools])

  const workflowSteps = useMemo<ProcessStep[]>(() => {
    const target = workflows.find((workflow) => workflow._id === selectedWorkflowId) || null
    if (!target?._id || !workflowDetail?.steps?.length) return []
    return workflowDetail.steps
      .slice()
      .sort((a, b) => (a.stepNo || 0) - (b.stepNo || 0))
      .map((step) => {
        const dbPrompt = (step.prompt || '').trim()
        return {
        id: `step-${step.stepNo}`,
        label: (step.title || '').trim() || `Tiến trình ${step.stepNo}`,
        hasDbPrompt: Boolean(dbPrompt),
        prompt: dbPrompt || (step.instruction || '').trim(),
        workflowId: target._id,
        workflowPlatform: (target.platform || 'multi').trim().toLowerCase(),
        backendStepId: (step._id || '').trim(),
        stepNo: Number(step.stepNo) || 0,
        actionType: (step.actionType || 'custom').trim(),
        displayMode: normalizeStepDisplayMode(step.displayMode),
        inputSchema: (step.inputSchema || {}) as Record<string, unknown>,
        tools: toolsByStepId.get((step._id || '').trim()) ?? [],
      }
      })
      .filter((step) => {
        if (!step.backendStepId || !step.workflowId) return false
        if (isBackgroundDisplayMode(step.displayMode)) return true
        return Boolean(step.prompt)
      })
  }, [workflowDetail, workflows, selectedWorkflowId, toolsByStepId])

  /** Sidebar: không gồm bước `background` (vd. lưu story). */
  const sidebarSteps = useMemo(
    () => workflowSteps.filter((step) => !isBackgroundDisplayMode(step.displayMode)),
    [workflowSteps],
  )

  /** Bước có prompt — dùng công cụ ChatGPT / index actionType. */
  const processSteps = useMemo(
    () => sidebarSteps.filter((step) => canManualChatgptStep(step)),
    [sidebarSteps],
  )

  const chatgptStepsByAction = useMemo(() => indexChatgptStepsByAction(processSteps), [processSteps])
  const splitGeneratedImages = useMemo(
    () => shouldSplitChatgptGeneratedImages(processSteps),
    [processSteps],
  )
  const rewriteStepLabel = stepDisplayLabel(chatgptStepsByAction.rewrite, 'bước viết lại nội dung')
  const extractVideosStepLabel = stepDisplayLabel(chatgptStepsByAction.extractVideos, 'bước tách VIDEO')
  const generateImagesStepLabel = stepDisplayLabel(chatgptStepsByAction.generateImages, 'bước tạo ảnh')
  const extractContentStepLabel = stepDisplayLabel(chatgptStepsByAction.extractContent, 'bước trích nội dung')
  const extractContentStep = chatgptStepsByAction.extractContent
  const extractContentPromptHint = (extractContentStep?.prompt || '').trim().slice(0, 400)

  const legacyStepPanelContext = useMemo(
    () => ({
      hasGenerateImagesStep: Boolean(chatgptStepsByAction.generateImages),
      hasExtractVideosStep: Boolean(chatgptStepsByAction.extractVideos),
      hasExtractContentStep: Boolean(chatgptStepsByAction.extractContent),
    }),
    [chatgptStepsByAction],
  )

  const selectedProcessStep = useMemo(
    () => sidebarSteps.find((step) => step.id === selectedStepId) || null,
    [sidebarSteps, selectedStepId],
  )

  const workflowStepPanelComparison = useMemo(
    () =>
      buildWorkflowStepPanelComparison(
        processSteps.map((step) => ({
          ownerStepId: step.backendStepId,
          tools: step.tools ?? [],
        })),
      ),
    [processSteps],
  )

  const bottomBarTools = useMemo(
    () =>
      buildWorkflowBottomBarTools(
        (workflowTools?.steps ?? []).map((group) => ({
          ownerStepId: group.stepId,
          tools: (group.tools ?? []).filter((link) => link.isActive !== false),
        })),
      ),
    [workflowTools],
  )

  const processStepByBackendId = useMemo(() => {
    const map = new Map<string, ProcessStep>()
    for (const step of processSteps) {
      map.set(step.backendStepId, step)
    }
    return map
  }, [processSteps])

  const getChrome = () => (globalThis as { chrome?: ExtensionChrome }).chrome

  useEffect(() => {
    if (!workflows.length) {
      setSelectedWorkflowId('')
      return
    }

    setSelectedWorkflowId((prev) => {
      if (prev && workflows.some((workflow) => workflow._id === prev)) return prev
      const saved = localStorage.getItem(CHATGPT_SELECTED_WORKFLOW_STORAGE_KEY) || ''
      if (saved && workflows.some((workflow) => workflow._id === saved)) return saved
      return workflows[0]._id
    })
  }, [workflows])

  useEffect(() => {
    if (!selectedWorkflowId) return
    localStorage.setItem(CHATGPT_SELECTED_WORKFLOW_STORAGE_KEY, selectedWorkflowId)
  }, [selectedWorkflowId])

  useEffect(() => {
    if (!sidebarSteps.length) {
      setSelectedStepId('')
      return
    }
    setSelectedStepId((prev) => {
      if (sidebarSteps.some((step) => step.id === prev)) return prev
      return (processSteps[0] || sidebarSteps[0]).id
    })
  }, [sidebarSteps, processSteps])

  useEffect(() => {
    if (!isWorkflowRunning || !workflowActiveStepId) return
    const frame = window.requestAnimationFrame(() => {
      const el = workflowStepItemRefs.current.get(workflowActiveStepId)
      if (!el) return
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [workflowActiveStepId, isWorkflowRunning])

  const queryTabs = (pattern?: string[], currentWindow = false, active = false) =>
    new Promise<BrowserTab[]>((resolve) => {
      const extensionChrome = getChrome()
      const query = extensionChrome?.tabs?.query
      if (!query) {
        resolve([])
        return
      }
      query({ url: pattern, currentWindow, active }, (tabs) => resolve(tabs || []))
    })

  useEffect(() => {
    if (extractContentPromptHint.length >= 30) {
      localStorage.setItem(CHATGPT_EXTRACT_CONTENT_PROMPT_HINT_KEY, extractContentPromptHint)
    }
  }, [extractContentPromptHint])

  useEffect(() => {
    if (!extractContentStep || extractContentPromptHint.length < 30) {
      setExtractContentReady(false)
      return
    }

    let cancelled = false

    const poll = async () => {
      const extensionChrome = getChrome()
      if (!extensionChrome?.tabs?.query || !extensionChrome.scripting?.executeScript) {
        if (!cancelled) setExtractContentReady(false)
        return
      }

      const currentActive = await queryTabs(undefined, true, true)
      const activeTab = currentActive[0]
      const isActiveChatgpt = Boolean(activeTab?.url && /chatgpt\.com|chat\.openai\.com/i.test(activeTab.url))
      const activeTabs = isActiveChatgpt ? [activeTab] : await queryTabs(CHATGPT_PATTERNS, true, true)
      const allTabs = activeTabs.length > 0 ? activeTabs : await queryTabs(CHATGPT_PATTERNS)
      const target = allTabs[0]
      if (!target?.id) {
        if (!cancelled) setExtractContentReady(false)
        return
      }

      try {
        const result = await extensionChrome.scripting.executeScript({
          target: { tabId: target.id },
          func: chatgptExtractContent as (...args: unknown[]) => unknown,
          args: ['ready', extractContentPromptHint],
        })
        if (!cancelled) setExtractContentReady(result?.[0]?.result === true)
      } catch {
        if (!cancelled) setExtractContentReady(false)
      }
    }

    void poll()
    const timer = window.setInterval(() => void poll(), 2500)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [extractContentStep, extractContentPromptHint, selectedWorkflowId])

  const createTab = (url: string) =>
    new Promise<BrowserTab | null>((resolve) => {
      const extensionChrome = getChrome()
      const create = extensionChrome?.tabs?.create
      if (!create) {
        resolve(null)
        return
      }
      create({ url, active: true }, (tab) => resolve(tab || null))
    })

  const updateTab = (tabId: number, url?: string) =>
    new Promise<BrowserTab | null>((resolve) => {
      const extensionChrome = getChrome()
      const update = extensionChrome?.tabs?.update
      if (!update) {
        resolve(null)
        return
      }
      update(
        tabId,
        url ? { url, active: true } : { active: true },
        (tab) => resolve(tab || null),
      )
    })

  const captureVisibleTab = (windowId?: number) =>
    new Promise<string | null>((resolve) => {
      const extensionChrome = getChrome()
      const capture = extensionChrome?.tabs?.captureVisibleTab
      if (!capture) {
        resolve(null)
        return
      }
      capture(windowId, { format: 'png' }, (dataUrl) => {
        const maybeError = extensionChrome?.runtime?.lastError?.message || ''
        if (maybeError) {
          resolve(null)
          return
        }
        if (!dataUrl || !String(dataUrl).startsWith('data:image/')) {
          resolve(null)
          return
        }
        resolve(dataUrl)
      })
    })

  const focusChatgptTabForCapture = async (tabId: number, windowId?: number) => {
    const extensionChrome = getChrome()
    if (windowId && extensionChrome?.windows?.update) {
      await new Promise<void>((resolve) => {
        extensionChrome.windows?.update?.(windowId, { focused: true }, () => resolve())
      })
    }
    await updateTab(tabId)
    await sleep(650)
  }

  /** Fallback khi không đọc được ảnh từ DOM — focus tab rồi chụp màn hình. */
  const captureVisibleTabWithRetry = async (tabId: number, windowId?: number) => {
    const tryWindowIds = Array.from(new Set<number | undefined>([windowId, undefined]))
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await focusChatgptTabForCapture(tabId, windowId)
      if (attempt > 0) {
        await sleep(200 + attempt * 150)
      }
      for (const wid of tryWindowIds) {
        const shot = await captureVisibleTab(wid)
        if (shot) return shot
      }
    }
    return null
  }

  const resolveChatgptImageDataUrl = async (
    tabId: number,
    windowId: number | undefined,
    rect: SplitCaptureRect,
  ) => {
    if (rect.dataUrl?.startsWith('data:image/')) {
      return rect.dataUrl
    }
    return captureVisibleTabWithRetry(tabId, windowId)
  }

  const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms))

  type CaptureSplitPairResult =
    | { ok: true; left: string; right: string }
    | { ok: false; reason: 'unsupported' | 'no_rect' | 'no_screenshot' | 'split_failed' | 'exception' }

  type CaptureSingleImageResult =
    | { ok: true; image: string }
    | { ok: false; reason: 'unsupported' | 'no_rect' | 'no_screenshot' | 'crop_failed' | 'exception' }

  /** Định vị ảnh mới nhất trong luồng ChatGPT, chụp tab, cắt đôi — dùng chung cho nút tiến trình 3 và lưu local. */
  const captureSplitPairFromChatgptTab = async (
    tabId: number,
    windowId: number | undefined,
  ): Promise<CaptureSplitPairResult> => {
    const extensionChrome = getChrome()
    if (!extensionChrome?.scripting?.executeScript || !extensionChrome.tabs?.captureVisibleTab) {
      return { ok: false, reason: 'unsupported' }
    }
    const locateResult = await extensionChrome.scripting.executeScript({
      target: { tabId },
      func: chatgptLocateLatestChatImageForCapturePageScript as (...args: unknown[]) => unknown,
    })
    const rect = (locateResult?.[0]?.result as SplitCaptureRect | null) || null
    if (!rect || rect.width < 2 || rect.height < 2) {
      return { ok: false, reason: 'no_rect' }
    }

    const screenshotDataUrl = await resolveChatgptImageDataUrl(tabId, windowId, rect)
    if (!screenshotDataUrl) {
      return { ok: false, reason: 'no_screenshot' }
    }

    try {
      const parts = rect.dataUrl
        ? await splitFullImageDataUrl(screenshotDataUrl)
        : await splitCapturedImage(screenshotDataUrl, rect)
      if (!parts.left || !parts.right) {
        return { ok: false, reason: 'split_failed' }
      }
      if (rect.openedModal) {
        await extensionChrome.scripting.executeScript({
          target: { tabId },
          func: chatgptCloseImageLightboxPageScript as (...args: unknown[]) => unknown,
        })
      }
      return { ok: true, left: parts.left, right: parts.right }
    } catch {
      return { ok: false, reason: 'exception' }
    }
  }

  /** Ảnh nguyên khố — không cắt đôi (công cụ «Sao chép ảnh»). */
  const captureSingleImageFromChatgptTab = async (
    tabId: number,
    windowId: number | undefined,
  ): Promise<CaptureSingleImageResult> => {
    const extensionChrome = getChrome()
    if (!extensionChrome?.scripting?.executeScript || !extensionChrome.tabs?.captureVisibleTab) {
      return { ok: false, reason: 'unsupported' }
    }
    const locateResult = await extensionChrome.scripting.executeScript({
      target: { tabId },
      func: chatgptLocateLatestChatImageForCapturePageScript as (...args: unknown[]) => unknown,
    })
    const rect = (locateResult?.[0]?.result as SplitCaptureRect | null) || null
    if (!rect || rect.width < 2 || rect.height < 2) {
      return { ok: false, reason: 'no_rect' }
    }

    const screenshotDataUrl = await resolveChatgptImageDataUrl(tabId, windowId, rect)
    if (!screenshotDataUrl) {
      return { ok: false, reason: 'no_screenshot' }
    }

    try {
      const image = rect.dataUrl
        ? screenshotDataUrl
        : await cropCapturedImage(screenshotDataUrl, rect)
      if (!image) {
        return { ok: false, reason: 'crop_failed' }
      }
      if (rect.openedModal) {
        await extensionChrome.scripting.executeScript({
          target: { tabId },
          func: chatgptCloseImageLightboxPageScript as (...args: unknown[]) => unknown,
        })
      }
      return { ok: true, image }
    } catch {
      return { ok: false, reason: 'exception' }
    }
  }

  /** Chat dài: scrollbar thường nằm trong main/phần `[role=log]`, đứng đầu thread là không đọc được bubble dưới. */
  const snapChatgptThreadToBottomBeforeRead = async (tabId: number) => {
    const extensionChrome = getChrome()
    const exec = extensionChrome?.scripting?.executeScript
    if (!extensionChrome?.tabs?.query || typeof exec !== 'function') return
    await exec({
      target: { tabId },
      func: () => {
        const z = (e: HTMLElement | null | undefined) => {
          if (!e) return
          try {
            e.scrollTop = Math.max(0, e.scrollHeight - e.clientHeight)
          } catch {
            /* ignore */
          }
        }
        window.scrollTo(0, Math.max(document.documentElement.scrollHeight, document.body.scrollHeight))
        z(document.documentElement as unknown as HTMLElement)
        z(document.body)
        document.querySelectorAll<HTMLElement>('main, [role="log"], section').forEach((el) => {
          const oy = window.getComputedStyle(el).overflowY
          if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') && el.scrollHeight > el.clientHeight + 40) z(el)
        })
        const turns = [...document.querySelectorAll<HTMLElement>('[data-message-author-role]')].filter((el) =>
          Boolean((el.innerText || '').trim()),
        )
        turns[turns.length - 1]?.scrollIntoView({ block: 'end', behavior: 'instant' })
      },
    })
    await sleep(100)
  }

  const prepareChatgptTabForVideoRead = async (tabId: number, options?: { heavy?: boolean }) => {
    const extensionChrome = getChrome()
    const exec = extensionChrome?.scripting?.executeScript
    if (!extensionChrome?.tabs?.update || typeof exec !== 'function') return
    const heavy = Boolean(options?.heavy)
    await updateTab(tabId)
    await sleep(heavy ? 400 : 280)
    await exec({
      target: { tabId },
      func: chatgptWarmThreadScrollContainersPageScript as (...args: unknown[]) => unknown,
    })
    await sleep(heavy ? 200 : 150)
    await snapChatgptThreadToBottomBeforeRead(tabId)
    await sleep(heavy ? 400 : 300)
  }

  const waitForLatestAssistantVideoReady = async (
    tabId: number,
    step: ProcessStep,
    stepLabel: string,
    timeoutMs = 50_000,
  ): Promise<boolean> => {
    const extensionChrome = getChrome()
    if (!extensionChrome?.scripting?.executeScript) return false
    const probeMode = isChatgptExtractContentVideosPluralStep(step) ? 'dual_parts' : 'single_block'
    const startedAt = Date.now()
    let lastLen = 0
    let polls = 0

    while (Date.now() - startedAt < timeoutMs) {
      throwIfWorkflowStopped()
      if (polls === 0 || polls % 4 === 0) {
        await prepareChatgptTabForVideoRead(tabId, { heavy: polls > 0 })
      }
      polls += 1

      const result = await extensionChrome.scripting.executeScript({
        target: { tabId },
        func: chatgptProbeLatestAssistantVideoReadyPageScript as (...args: unknown[]) => unknown,
        args: [probeMode],
      })
      const payload = (result?.[0]?.result || null) as { ready?: boolean; assistantLen?: number } | null
      if (payload?.ready) return true

      const len = payload?.assistantLen || 0
      if (len > lastLen) {
        lastLen = len
        setStatus(`${stepLabel}: Đang chờ ChatGPT ghi đủ khối VIDEO (${Math.round(len / 1000)}k ký tự)...`)
      }

      await sleep(850)
    }

    setStatus(`${stepLabel}: Hết thời gian chờ marker VIDEO trong thread.`)
    return false
  }

  const injectPrompt = async (tabId: number, prompt: string, autoSend: boolean) => {
    const extensionChrome = getChrome()
    if (!extensionChrome?.scripting?.executeScript) return false

    const result = await extensionChrome.scripting.executeScript({
      target: { tabId },
      func: chatgptInjectPromptPageScript as (...args: unknown[]) => unknown,
      args: [prompt, autoSend],
    })

    return Boolean(result?.[0]?.result)
  }

  const pickChatgptTab = async (preferredTabId?: number) => {
    if (preferredTabId) {
      const tab = await updateTab(preferredTabId)
      if (tab?.id) {
        if (!tab.url?.includes('chatgpt.com')) {
          return await updateTab(tab.id, CHATGPT_URL)
        }
        return tab
      }
    }

    const currentActive = await queryTabs(undefined, true, true)
    const activeTab = currentActive[0]
    const isActiveChatgpt = Boolean(activeTab?.url && /chatgpt\.com|chat\.openai\.com/i.test(activeTab.url))

    const activeTabs = isActiveChatgpt ? [activeTab] : await queryTabs(CHATGPT_PATTERNS, true, true)
    const allTabs = activeTabs.length > 0 ? activeTabs : await queryTabs(CHATGPT_PATTERNS)
    let target: BrowserTab | null | undefined = allTabs[0]

    if (!target?.id) {
      target = await createTab(CHATGPT_URL)
    } else if (!target.url?.includes('chatgpt.com')) {
      target = await updateTab(target.id, CHATGPT_URL)
    } else {
      target = await updateTab(target.id)
    }

    return target || null
  }

  const runProcess = async (
    step: { label: string; prompt: string },
    options?: { autoSend?: boolean; fast?: boolean; preferredTabId?: number; forceNewChat?: boolean },
  ) => {
    const autoSend = Boolean(options?.autoSend)
    const fastMode = Boolean(options?.fast)
    const preferredTabId = options?.preferredTabId
    const forceNewChat = Boolean(options?.forceNewChat)
    const extensionChrome = getChrome()
    if (!extensionChrome?.tabs?.query || !extensionChrome.tabs.create || !extensionChrome.tabs.update || !extensionChrome.scripting?.executeScript) {
      setStatus('Môi trường hiện tại không hỗ trợ tự động gửi vào ChatGPT.')
      return false
    }

    setStatus(`${step.label}: Đang mở ChatGPT và chuẩn bị xử lý...`)
    const target = await pickChatgptTab(preferredTabId)

    if (!target?.id) {
      setStatus(`${step.label}: Không thể mở tab ChatGPT.`)
      return false
    }

    if (forceNewChat) {
      setStatus(`${step.label}: Đang tạo đoạn chat mới...`)
      const switched = await extensionChrome.scripting.executeScript({
        target: { tabId: target.id },
        func: chatgptOpenNewChatPageScript as (...args: unknown[]) => unknown,
      })
      const ok = Boolean(switched?.[0]?.result)
      if (!ok) {
        await sleep(800)
      } else {
        await sleep(320)
      }
    }

    setStatus(`${step.label}: Đã mở ChatGPT, đang điền prompt...`)

    let filled = false
    const attempts = fastMode ? 3 : 5
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (attempt > 0) {
        await sleep(fastMode ? 120 : 220)
      }
      filled = await injectPrompt(target.id, step.prompt, autoSend)
      if (filled) break
    }

    if (!filled && autoSend) {
      await sleep(280)
      filled = await injectPrompt(target.id, step.prompt, true)
    }

    setStatus(
      filled
        ? autoSend
          ? `${step.label}: Đã điền và gửi prompt trên ChatGPT.`
          : `${step.label}: Đã điền prompt vào ChatGPT (chưa gửi).`
        : `${step.label}: Không tìm thấy khung chat để xử lý.`,
    )
    return filled
  }

  const runFastProcess = async (step: ProcessStep) => {
    if (!canManualChatgptStep(step)) {
      setStatus('Bước này không có prompt hoặc chạy nền — không dùng chạy nhanh thủ công.')
      return false
    }

    if (isChatgptExtractVideosStep(step)) {
      setSplitImages(null)
      setCopiedPart(null)
    }

    if (!isChatgptRewriteContentStep(step)) {
      return await runProcess(step, { autoSend: true, fast: true, preferredTabId: lockedWorkflowTabIdRef.current || undefined })
    }

    let mergedStep = step
    if (chatgptWorkflowSourceRef.current === 'localstorage') {
      let mergedPrompt = step.prompt
      const fromStorage = localStorage.getItem(FACEBOOK_REEL_MEMORY_KEY)?.trim() || ''
      if (fromStorage) mergedPrompt = `${step.prompt}\n\n${fromStorage}`
      mergedStep = { ...step, prompt: mergedPrompt }
    } else {
      const sources = await getMyStorySources()
      const picked = sources[0]
      if (!picked || !(picked.sourceContent || '').trim()) {
        throw new Error(
          'Không có StorySource caption (ưu tiên nguồn mới, ít dùng — hãy đồng bộ reel hoặc lưu nguồn trên Facebook).',
        )
      }
      const extra = picked.sourceContent.trim()
      mergedStep = { ...step, prompt: extra ? `${step.prompt}\n\n${extra}` : step.prompt }
    }

    return await runProcess(mergedStep, {
      autoSend: true,
      fast: true,
      preferredTabId: lockedWorkflowTabIdRef.current || undefined,
      forceNewChat: true,
    })
  }

  const runFillProcess = async (step: ProcessStep) => {
    if (!canManualChatgptStep(step)) {
      setStatus('Bước này không có prompt hoặc chạy nền — không dùng điền prompt thủ công.')
      return false
    }

    if (isChatgptExtractVideosStep(step)) {
      setSplitImages(null)
      setCopiedPart(null)
    }

    if (!isChatgptRewriteContentStep(step)) {
      return await runProcess(step, { autoSend: false, fast: false })
    }

    let mergedStep = step
    if (chatgptWorkflowSourceRef.current === 'localstorage') {
      let mergedPrompt = step.prompt
      const fromStorage = localStorage.getItem(FACEBOOK_REEL_MEMORY_KEY)?.trim() || ''
      if (fromStorage) mergedPrompt = `${step.prompt}\n\n${fromStorage}`
      mergedStep = { ...step, prompt: mergedPrompt }
    } else {
      const sources = await getMyStorySources()
      const picked = sources[0]
      if (!picked || !(picked.sourceContent || '').trim()) {
        throw new Error(
          'Không có StorySource caption (ưu tiên nguồn mới, ít dùng — hãy đồng bộ reel hoặc lưu nguồn trên Facebook).',
        )
      }
      const extra = picked.sourceContent.trim()
      mergedStep = { ...step, prompt: extra ? `${step.prompt}\n\n${extra}` : step.prompt }
    }

    return await runProcess(mergedStep, { autoSend: false, fast: false, forceNewChat: true })
  }

  const waitForChatgptResponseDone = async (stepLabel: string, timeoutMs = 240_000, preferredTabId?: number) => {
    const extensionChrome = getChrome()
    if (!extensionChrome?.tabs?.query || !extensionChrome.scripting?.executeScript) {
      setStatus(`${stepLabel}: Không hỗ trợ theo dõi phản hồi ChatGPT.`)
      return false
    }

    const target = await pickChatgptTab(preferredTabId)
    if (!target?.id) {
      setStatus(`${stepLabel}: Không tìm thấy tab ChatGPT để chờ phản hồi.`)
      return false
    }
    await sleep(220)

    const tabId = target.id
    const readSnapshot = async () => {
      if (!extensionChrome.scripting?.executeScript) return null
      const result = await extensionChrome.scripting.executeScript({
        target: { tabId },
        func: chatgptSnapshotAssistantResponsePageScript as (...args: unknown[]) => unknown,
      })
      return (result?.[0]?.result || null) as ChatgptAssistantResponseSnapshot | null
    }

    const initial = await readSnapshot()
    if (!initial) {
      setStatus(`${stepLabel}: Không thể xác nhận trạng thái phản hồi ChatGPT.`)
      return false
    }

    setStatus(`${stepLabel}: Đang đợi ChatGPT phản hồi xong...`)
    const pollMs = 700
    const stableMs = 3000
    const startedAt = Date.now()
    let prev = initial
    let stableSince = Date.now()
    let observedProgress = false

    while (Date.now() - startedAt < timeoutMs) {
      throwIfWorkflowStopped()

      const current = await readSnapshot()
      if (!current) {
        await sleep(pollMs)
        continue
      }

      const generatingNow = current.generating
      const changed =
        current.count !== initial.count ||
        current.textLen !== initial.textLen ||
        current.text !== initial.text
      if (changed || generatingNow) observedProgress = true
      if (
        current.count !== prev.count ||
        current.textLen !== prev.textLen ||
        current.text !== prev.text ||
        generatingNow
      ) {
        stableSince = Date.now()
      }

      if (!generatingNow && observedProgress && Date.now() - stableSince >= stableMs) {
        setStatus(`${stepLabel}: ChatGPT đã phản hồi xong, tiếp tục bước kế tiếp.`)
        return true
      }

      prev = current
      await sleep(pollMs)
    }

    if (observedProgress) {
      setStatus(`${stepLabel}: Hết thời gian chờ phản hồi ChatGPT.`)
    } else {
      setStatus(`${stepLabel}: Chưa thấy phản hồi mới từ ChatGPT.`)
    }
    return false
  }

  const getAssistantImageCount = async (preferredTabId?: number) => {
    const extensionChrome = getChrome()
    if (!extensionChrome?.scripting?.executeScript) return 0
    const target = await pickChatgptTab(preferredTabId)
    if (!target?.id) return 0

    const result = await extensionChrome.scripting.executeScript({
      target: { tabId: target.id },
      func: chatgptAssistantImageCountPageScript as (...args: unknown[]) => unknown,
    })
    return Number(result?.[0]?.result || 0)
  }

  const waitForGeneratedImageDone = async (stepLabel: string, baselineCount: number, timeoutMs = 360_000, preferredTabId?: number) => {
    const extensionChrome = getChrome()
    if (!extensionChrome?.tabs?.query || !extensionChrome.scripting?.executeScript) {
      setStatus(`${stepLabel}: Không hỗ trợ theo dõi tạo ảnh ChatGPT.`)
      return false
    }
    const target = await pickChatgptTab(preferredTabId)
    if (!target?.id) {
      setStatus(`${stepLabel}: Không tìm thấy tab ChatGPT để chờ tạo ảnh.`)
      return false
    }

    const tabId = target.id
    const readSnapshot = async () => {
      if (!extensionChrome.scripting?.executeScript) return null
      const result = await extensionChrome.scripting.executeScript({
        target: { tabId },
        func: chatgptSnapshotGeneratedImagePageScript as (...args: unknown[]) => unknown,
      })
      return (result?.[0]?.result || null) as ChatgptGeneratedImageSnapshot | null
    }

    setStatus(`${stepLabel}: Đang đợi ChatGPT tạo ảnh xong...`)
    const pollMs = 700
    const stableMs = 1800
    const settleAfterDetectMs = 3200
    const startedAt = Date.now()
    let stableSince = Date.now()
    let imageDetected = false
    let firstDetectAt = 0
    let lastCount = baselineCount
    let prevSig = await readSnapshot()

    while (Date.now() - startedAt < timeoutMs) {
      throwIfWorkflowStopped()

      const snap = await readSnapshot()
      if (!snap) {
        await sleep(pollMs)
        continue
      }

      const currentCount = snap.imageCount
      const generatingNow = snap.generating
      if (currentCount > baselineCount) {
        imageDetected = true
        if (!firstDetectAt) firstDetectAt = Date.now()
      }

      if (
        currentCount !== lastCount ||
        generatingNow ||
        snap.assistantCount !== (prevSig?.assistantCount ?? 0) ||
        snap.assistantTextLen !== (prevSig?.assistantTextLen ?? 0)
      ) {
        stableSince = Date.now()
      }

      if (imageDetected && currentCount > baselineCount && !generatingNow && Date.now() - stableSince >= stableMs) {
        setStatus(`${stepLabel}: Ảnh đã tạo xong, tiếp tục bước kế tiếp.`)
        return true
      }
      if (
        imageDetected &&
        currentCount > baselineCount &&
        firstDetectAt &&
        Date.now() - firstDetectAt >= settleAfterDetectMs &&
        !generatingNow
      ) {
        setStatus(`${stepLabel}: Ảnh đã tạo xong, tiếp tục bước kế tiếp.`)
        return true
      }

      lastCount = currentCount
      prevSig = snap
      await sleep(pollMs)
    }

    if (imageDetected) {
      setStatus(`${stepLabel}: Đã có ảnh mới nhưng hết thời gian chờ hoàn tất.`)
    } else {
      setStatus(`${stepLabel}: Không thấy ảnh mới được tạo.`)
    }
    return false
  }

  const extractVideoContent = async (
    part: 1 | 2,
    options?: { copyToClipboard?: boolean; preferredTabId?: number },
  ) => {
    const workflowCapture = workflowVideoCaptureRef.current.active
    const copyToClipboard = !workflowCapture && options?.copyToClipboard !== false
    const extensionChrome = getChrome()
    if (!extensionChrome?.tabs?.query || !extensionChrome.scripting?.executeScript) {
      setStatus('Môi trường hiện tại không hỗ trợ lấy nội dung VIDEO.')
      return ''
    }

    if (!chatgptStepsByAction.extractVideos) {
      if (copyToClipboard) {
        setStatus('Workflow chưa có bước actionType = chatgpt_extract_content_videos (hoặc chatgpt_extract_content_video).')
      }
      return ''
    }

    if (copyToClipboard) {
      setStatus(`Đang lấy nội dung VIDEO ${part} từ «${extractVideosStepLabel}»...`)
    }

    const target = await pickChatgptTab(
      lockedWorkflowTabIdRef.current || options?.preferredTabId,
    )
    if (!target?.id) {
      setStatus('Không tìm thấy tab ChatGPT để lấy nội dung VIDEO.')
      return ''
    }

    const maxVideoExtractAttempts = workflowCapture ? 5 : 3
    let extracted = ''

    for (let attempt = 1; attempt <= maxVideoExtractAttempts; attempt += 1) {
      await prepareChatgptTabForVideoRead(target.id, { heavy: attempt > 1 })

      await extensionChrome.scripting.executeScript({
        target: { tabId: target.id },
        func: chatgptScrollToVideoBlockPageScript as (...args: unknown[]) => unknown,
        args: [part],
      })
      await sleep(workflowCapture ? 480 : copyToClipboard ? 380 : 420)

      const result = await extensionChrome.scripting.executeScript({
        target: { tabId: target.id },
        func: chatgptExtractVideoBlockPageScript as (...args: unknown[]) => unknown,
        args: [part],
      })

      extracted = ((result?.[0]?.result as string | undefined) || '').trim()
      if (extracted) break

      if (copyToClipboard && attempt < maxVideoExtractAttempts) {
        setStatus(`Chưa lấy được VIDEO ${part}, tự thử lại (${attempt}/${maxVideoExtractAttempts})…`)
      }
    }

    if (!extracted) {
      if (copyToClipboard) {
        setStatus(`Không tìm thấy nội dung VIDEO ${part}. Hãy đảm bảo đã có output «${extractVideosStepLabel}» trong hội thoại.`)
      }
      return ''
    }

    if (workflowCapture && extracted) {
      workflowVideoCaptureRef.current.prompts.push(extracted)
    }

    if (copyToClipboard) {
      try {
        await navigator.clipboard.writeText(extracted)
        const toolId = `video-${part}`
        setCopiedTool(toolId)
        window.setTimeout(() => setCopiedTool((prev) => (prev === toolId ? null : prev)), 1200)
        setStatus(`Đã lấy và sao chép nội dung VIDEO ${part} vào clipboard.`)
      } catch {
        setStatus(`Đã lấy nội dung VIDEO ${part} nhưng sao chép thất bại.`)
      }
    }
    return extracted
  }

  const extractSingleVideoContent = async (options?: { copyToClipboard?: boolean; preferredTabId?: number }) => {
    const workflowCapture = workflowVideoCaptureRef.current.active
    const copyToClipboard = !workflowCapture && options?.copyToClipboard !== false
    const extensionChrome = getChrome()
    if (!extensionChrome?.tabs?.query || !extensionChrome.scripting?.executeScript) {
      setStatus('Môi trường hiện tại không hỗ trợ lấy nội dung VIDEO.')
      return ''
    }

    if (!chatgptStepsByAction.extractVideos) {
      if (copyToClipboard) {
        setStatus(
          'Workflow chưa có bước actionType = chatgpt_extract_content_video(s) (tách VIDEO / một khối VIDEO).',
        )
      }
      return ''
    }

    if (copyToClipboard) {
      setStatus(`Đang lấy nội dung VIDEO từ «${extractVideosStepLabel}»...`)
    }

    const target = await pickChatgptTab(
      lockedWorkflowTabIdRef.current || options?.preferredTabId,
    )
    if (!target?.id) {
      setStatus('Không tìm thấy tab ChatGPT để lấy nội dung VIDEO.')
      return ''
    }

    const maxAttempts = workflowCapture ? 5 : 3
    let extracted = ''

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      await prepareChatgptTabForVideoRead(target.id, { heavy: attempt > 1 })

      await extensionChrome.scripting.executeScript({
        target: { tabId: target.id },
        func: chatgptScrollToSingleVideoBlockPageScript as (...args: unknown[]) => unknown,
      })
      await sleep(workflowCapture ? 480 : copyToClipboard ? 380 : 420)

      const result = await extensionChrome.scripting.executeScript({
        target: { tabId: target.id },
        func: chatgptExtractSingleVideoBlockPageScript as (...args: unknown[]) => unknown,
      })

      extracted = ((result?.[0]?.result as string | undefined) || '').trim()
      if (extracted) break

      if (copyToClipboard && attempt < maxAttempts) {
        setStatus(`Chưa lấy được nội dung VIDEO, tự thử lại (${attempt}/${maxAttempts})…`)
      }
    }

    if (!extracted) {
      if (copyToClipboard) {
        setStatus(
          `Không tìm thấy khối VIDEO trong output «${extractVideosStepLabel}». Hãy đảm bảo đã có phần VIDEO trên ChatGPT.`,
        )
      }
      return ''
    }

    if (workflowCapture && extracted) {
      workflowVideoCaptureRef.current.prompts.push(extracted)
    }

    if (copyToClipboard) {
      try {
        await navigator.clipboard.writeText(extracted)
        setCopiedTool('video-single')
        window.setTimeout(() => setCopiedTool((prev) => (prev === 'video-single' ? null : prev)), 1200)
        setStatus('Đã lấy và sao chép nội dung VIDEO vào clipboard.')
      } catch {
        setStatus('Đã lấy nội dung VIDEO nhưng sao chép thất bại.')
      }
    }
    return extracted
  }

  const resolveProcessStepForVideo = (
    videoStep: ChatgptProcessStepLike | ProcessStep,
  ): ProcessStep | null => {
    if ('backendStepId' in videoStep && (videoStep as ProcessStep).backendStepId) {
      return videoStep as ProcessStep
    }
    return processSteps.find((s) => s.id === videoStep.id) || null
  }

  const isVideoStepPanelToolCode = (code: string) =>
    code === 'chatgpt_copy_single_video' ||
    code === 'chatgpt_copy_video_1' ||
    code === 'chatgpt_copy_video_2'

  const buildWorkflowVideoToolHost = (): ToolScriptHost => ({
    stepIsExtractVideos: () => true,
    extractVideoContent: (part: 1 | 2) => extractVideoContent(part, { copyToClipboard: false }),
    extractSingleVideoContent: () => extractSingleVideoContent({ copyToClipboard: false }),
  })

  const fallbackExtractVideoPrompts = async (ownerStep: ProcessStep): Promise<string[]> => {
    if (isChatgptExtractContentVideosPluralStep(ownerStep)) {
      return nonEmptyVideoPrompts([
        await extractVideoContent(1, { copyToClipboard: false }),
        await extractVideoContent(2, { copyToClipboard: false }),
      ])
    }
    return nonEmptyVideoPrompts([await extractSingleVideoContent({ copyToClipboard: false })])
  }

  /** Workflow: chạy công cụ step_panel theo `stepPhase` (cùng handler như bấm nút). */
  const runWorkflowStepTools = async (
    step: ProcessStep,
    phase: ToolStepPhase,
  ): Promise<string[]> => {
    const toolsToRun = workflowStepPanelComparison.display.filter(
      (tool) => tool.ownerStepId === step.backendStepId && tool.stepPhase === phase,
    )
    if (!toolsToRun.length) return []

    const capturesVideo = toolsToRun.some((tool) => isVideoStepPanelToolCode(tool.code))

    if (lockedWorkflowTabIdRef.current) {
      await updateTab(lockedWorkflowTabIdRef.current)
      await sleep(200)
    }

    if (capturesVideo) {
      workflowVideoCaptureRef.current = { active: true, prompts: [] }
    }

    setStatus(`${step.label}: Công cụ — ${TOOL_STEP_PHASE_LABEL[phase]}...`)

    try {
      for (const tool of toolsToRun) {
        throwIfWorkflowStopped()
        if (isStepPanelToolDisabled(tool, step)) continue
        const payload = await fetchToolHandler(tool.toolId)
        const config = {
          ...(payload.defaultConfig || {}),
          ...tool.config,
        }
        const host: ToolScriptHost = capturesVideo
          ? { ...buildStepGuardHost(step), ...buildWorkflowVideoToolHost() }
          : buildStepGuardHost(step)
        await runToolHandlerScript(payload.handlerScript, host, config)
      }
    } finally {
      if (capturesVideo) {
        workflowVideoCaptureRef.current.active = false
      }
    }

    if (capturesVideo) {
      return nonEmptyVideoPrompts(workflowVideoCaptureRef.current.prompts)
    }
    return []
  }

  const collectVideoPromptsForWorkflow = async (
    videoStep: ChatgptProcessStepLike | ProcessStep,
  ): Promise<string[]> => {
    const ownerStep = resolveProcessStepForVideo(videoStep)
    if (!ownerStep) return []

    const tryCollect = async () => {
      const fromTools = await runWorkflowStepTools(ownerStep, 'after_step')
      if (fromTools.length) return fromTools
      return fallbackExtractVideoPrompts(ownerStep)
    }

    let prompts = await tryCollect()
    if (prompts.length) return prompts

    const tabId = lockedWorkflowTabIdRef.current
    if (!tabId) return []

    setStatus(`${ownerStep.label}: Chờ khối VIDEO hiển thị đầy đủ, thử lấy lại...`)
    await waitForLatestAssistantVideoReady(tabId, ownerStep, ownerStep.label, 40_000)
    await prepareChatgptTabForVideoRead(tabId, { heavy: true })
    prompts = await tryCollect()
    return prompts
  }

  const executeWorkflowStep = async (step: ProcessStep) => {
    throwIfWorkflowStopped()
    if (isChatgptSaveStoryStep(step)) {
      if (chatgptWorkflowSourceRef.current !== 'stories') {
        return { skipped: true, reason: 'not_stories_source' }
      }
      let videoPrompts = nonEmptyVideoPrompts(chatgptDraftVideoPromptsRef.current)
      if (!videoPrompts.length && chatgptStepsByAction.extractVideos) {
        setStatus(`${step.label}: Đang thử lấy lại nội dung VIDEO...`)
        videoPrompts = await collectVideoPromptsForWorkflow(chatgptStepsByAction.extractVideos)
        chatgptDraftVideoPromptsRef.current = videoPrompts
      }
      if (!videoPrompts.length) {
        throw new Error(
          `${step.label}: Chưa lấy được nội dung VIDEO (kiểm tra «${extractVideosStepLabel}»).`,
        )
      }
      setStatus(`${step.label}: Đang lấy nội dung ChatGPT và upload ảnh lên Cloudinary...`)
      const bundle = await collectStoryBundleForApiSave()
      const created = await createStoryForPipelineRun(videoPrompts, bundle)
      if (!created.storyId) {
        throw new Error(created.error || `${step.label}: Không tạo được story trên máy chủ.`)
      }
      chatgptPipelineStoryIdRef.current = created.storyId
      const videoLabel = videoPrompts.length === 1 ? 'VIDEO' : `${videoPrompts.length} VIDEO`
      const imageNote =
        bundle.imageUrls.length > 0
          ? `, ${bundle.imageUrls.length} ảnh Cloudinary`
          : ' (chưa có ảnh — bước tạo ảnh có thể chưa chạy)'
      setStatus(
        `${step.label}: Đã tạo story — tiêu đề, nội dung ngắn/dài, prompt ${videoLabel}${imageNote}.`,
      )
      return {
        saved: true,
        storyId: created.storyId,
        videoPromptCount: videoPrompts.length,
        imageCount: bundle.imageUrls.length,
        titleLength: bundle.title.length,
        shortContentLength: bundle.shortContent.length,
        longContentLength: bundle.longContent.length,
      }
    }

    // User-required behavior: every workflow step in ChatGPT screen
    // runs exactly like "Chạy nhanh", then waits for response completion.
    const isGenerateImageStep = isChatgptGenerateImagesStep(step)
    const baselineImageCount = isGenerateImageStep ? await getAssistantImageCount(lockedWorkflowTabIdRef.current || undefined) : 0

    await runWorkflowStepTools(step, 'before_step')

    const sent = await runFastProcess(step)
    if (!sent) {
      throw new Error(`${step.label}: Không điền/gửi được prompt vào ChatGPT.`)
    }

    const done = isGenerateImageStep
      ? await waitForGeneratedImageDone(step.label, baselineImageCount, 360_000, lockedWorkflowTabIdRef.current || undefined)
      : await waitForChatgptResponseDone(step.label, 240_000, lockedWorkflowTabIdRef.current || undefined)
    throwIfWorkflowStopped()
    if (!done) {
      throw new Error(
        isGenerateImageStep
          ? `${step.label}: ChatGPT chưa tạo ảnh hoàn tất.`
          : `${step.label}: ChatGPT chưa phản hồi hoàn tất.`,
      )
    }

    if (isGenerateImageStep) {
      setSplitImages(null)
      setCopiedPart(null)
    }

    if (isChatgptExtractVideosStep(step)) {
      const tabId = lockedWorkflowTabIdRef.current
      if (tabId) {
        setStatus(`${step.label}: Đang chờ khối VIDEO xuất hiện trong thread...`)
        await waitForLatestAssistantVideoReady(tabId, step, step.label, 55_000)
        await prepareChatgptTabForVideoRead(tabId)
      }
    }

    if (isChatgptExtractVideosStep(step)) {
      const prompts = await collectVideoPromptsForWorkflow(step)
      chatgptDraftVideoPromptsRef.current = prompts
      if (!prompts.length) {
        throw new Error(
          `${step.label}: Chưa lấy được nội dung VIDEO (kiểm tra «${extractVideosStepLabel}»).`,
        )
      }
      if (prompts.length === 1) {
        setStatus(`${step.label}: Đã lấy prompt VIDEO.`)
      } else {
        setStatus(`${step.label}: Đã lấy ${prompts.length} prompt VIDEO.`)
      }
    } else {
      await runWorkflowStepTools(step, 'after_step')
    }

    return {
      mode: 'forced_fast_per_step',
      actionType: step.actionType || 'custom',
      workflowPlatform: step.workflowPlatform,
      promptSent: sent,
      responseCompleted: done,
    }
  }

  const stopWorkflowRun = () => {
    if (!isWorkflowRunning || workflowStopRef.current) return
    workflowStopRef.current = true
    setStatus('Workflow đã dừng.')
    const runId = runningWorkflowRunIdRef.current
    if (runId) {
      void updateWorkflowRun(runId, {
        status: 'cancelled',
        finishedAt: new Date().toISOString(),
      }).catch(() => undefined)
    }
  }

  const runWorkflow = async (options?: {
    runId?: string
    workflowId?: string
    source?: string
    /** Ưu tiên trước payload run; mặc định story DB — truyền `localstorage` để dùng clipboard. */
    chatgptWorkflowSource?: ChatgptWorkflowSource
  }) => {
    if (!canUseWorkflow) {
      setStatus('Workflow chỉ dành cho tài khoản VIP hoặc quản trị viên.')
      return
    }
    if (!workflowSteps.length || isWorkflowRunning) return
    const extensionChrome = getChrome()
    if (!extensionChrome?.tabs?.query || !extensionChrome?.scripting?.executeScript) {
      setStatus('Workflow chỉ chạy được trong extension Chrome đã cấp quyền Tabs + Scripting.')
      return
    }
    const firstStep = workflowSteps[0]
    if (!firstStep?.workflowId) {
      setStatus('Chưa tìm thấy workflowId để bắt đầu chạy workflow.')
      return
    }
    if (options?.workflowId && options.workflowId !== firstStep.workflowId) {
      setStatus('Workflow từ SSE không khớp workflow đang load ở màn hình ChatGPT.')
      return
    }

    setIsWorkflowRunning(true)
    workflowStopRef.current = false

    let workflowRunId = options?.runId || ''
    runningWorkflowRunIdRef.current = workflowRunId
    try {
      chatgptPipelineStoryIdRef.current = ''
      chatgptDraftVideoPromptsRef.current = null

      const lockedTab = await pickChatgptTab()
      lockedWorkflowTabIdRef.current = lockedTab?.id || 0
      if (!lockedWorkflowTabIdRef.current) {
        setStatus('Không thể khóa tab ChatGPT cho workflow.')
        return
      }

      if (!workflowRunId) {
        setStatus(`Đang tạo workflow run (${workflowSteps.length} bước)...`)
        const run = await createWorkflowRun({
          workflowId: firstStep.workflowId,
          payload: { source: options?.source || 'chatgpt_screen', totalSteps: workflowSteps.length },
        })
        workflowRunId = run._id
        runningWorkflowRunIdRef.current = workflowRunId
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

      chatgptWorkflowSourceRef.current = await resolveChatgptWorkflowSourceMode(workflowRunId, {
        chatgptWorkflowSource: options?.chatgptWorkflowSource,
        source: options?.source,
      })

      for (let index = 0; index < workflowSteps.length; index += 1) {
        if (workflowStopRef.current) {
          setStatus('Workflow đã dừng.')
          return
        }

        const step = workflowSteps[index]
        const stepNo = step.stepNo || index + 1
        const progress = Math.round((index / workflowSteps.length) * 100)
        const isBackground = isBackgroundDisplayMode(step.displayMode)

        await updateWorkflowRun(workflowRunId, {
          status: 'running',
          currentStepNo: stepNo,
          progress,
        })

        setWorkflowActiveStepId(step.id)
        if (!isBackground) {
          setSelectedStepId(step.id)
        }
        setStatus(
          isBackground
            ? `Workflow: ${step.label} (chạy nền)...`
            : `Workflow: đang chạy ${step.label} (${index + 1}/${workflowSteps.length})...`,
        )

        const stepRun = await createStepRun({
          workflowRunId,
          workflowId: step.workflowId,
          stepId: step.backendStepId,
          stepNo,
          stepTitle: step.label,
          status: 'running',
          input: {
            actionType: step.actionType,
            promptLength: step.prompt.length,
            inputSchema: step.inputSchema || {},
          },
        })

        try {
          const output = await executeWorkflowStep(step)
          await updateStepRun(stepRun._id, {
            status: 'completed',
            output: output as Record<string, unknown>,
            finishedAt: new Date().toISOString(),
          })
        } catch (error) {
          const stopped =
            workflowStopRef.current ||
            (error instanceof Error && error.message === WORKFLOW_STOPPED_MESSAGE)
          if (stopped) {
            await updateStepRun(stepRun._id, {
              status: 'skipped',
              finishedAt: new Date().toISOString(),
            }).catch(() => undefined)
            setStatus('Workflow đã dừng.')
            return
          }
          const errorMessage = error instanceof Error ? error.message : 'Step execution failed.'
          await updateStepRun(stepRun._id, {
            status: 'failed',
            error: { message: errorMessage },
            finishedAt: new Date().toISOString(),
          })
          await updateWorkflowRun(workflowRunId, {
            status: 'failed',
            progress,
            currentStepNo: stepNo,
            error: { code: 'STEP_FAILED', message: errorMessage, details: { stepId: step.id, stepNo } },
            finishedAt: new Date().toISOString(),
          })
          throw error
        }
      }

      await updateWorkflowRun(workflowRunId, {
        status: 'completed',
        progress: 100,
        currentStepNo: workflowSteps[workflowSteps.length - 1]?.stepNo || workflowSteps.length,
        result: { completedSteps: workflowSteps.length },
        finishedAt: new Date().toISOString(),
      })

      const stepCountLabel = `${workflowSteps.length}/${workflowSteps.length}`
      const savedStoryId = chatgptPipelineStoryIdRef.current.trim()
      if (savedStoryId) {
        setStatus(`Workflow chạy xong ${stepCountLabel} bước. Đã lưu story (prompt VIDEO).`)
      } else {
        setStatus(`Workflow chạy xong ${stepCountLabel} bước.`)
      }
    } catch (error) {
      if (!workflowRunId) {
        setStatus('Không thể tạo workflow run trên backend.')
      } else if (!workflowStopRef.current) {
        const errorMessage = error instanceof Error ? error.message : 'Workflow execution failed.'
        setStatus(`Workflow thất bại: ${errorMessage}`)
      }
    } finally {
      workflowStopRef.current = false
      setWorkflowActiveStepId('')
      lockedWorkflowTabIdRef.current = 0
      runningWorkflowRunIdRef.current = ''
      chatgptPipelineStoryIdRef.current = ''
      chatgptDraftVideoPromptsRef.current = null
      chatgptWorkflowSourceRef.current = 'stories'
      setIsWorkflowRunning(false)
    }
  }

  useEffect(() => {
    const onRunStep1FromFacebook = (event: Event) => {
      const customEvent = event as CustomEvent<{ reelContent?: string }>
      const reelContent = customEvent.detail?.reelContent?.trim() || ''
      const rewritePrompt = chatgptStepsByAction.rewrite?.prompt || ''
      if (!rewritePrompt) {
        setStatus(`Chưa có bước «${rewriteStepLabel}» (actionType = chatgpt_rewrite_content) trong workflow.`)
        return
      }
      const mergedPrompt = `${rewritePrompt}\n\nStory:\n${reelContent}`
      void runProcess(
        { label: rewriteStepLabel, prompt: mergedPrompt },
        { autoSend: false, fast: false, forceNewChat: true },
      )
    }

    window.addEventListener('run-chatgpt-step1-from-facebook', onRunStep1FromFacebook as EventListener)
    return () => {
      window.removeEventListener('run-chatgpt-step1-from-facebook', onRunStep1FromFacebook as EventListener)
    }
  }, [processSteps, chatgptStepsByAction.rewrite, rewriteStepLabel])

  useEffect(() => {
    if (!canUseWorkflow || !workflowSteps.length) return
    const eventSource = createWorkflowRunEventSource()

    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(String(event.data || '{}')) as WorkflowRunStreamEvent
        if (payload?.type !== 'workflow_run_created') return
        const run = payload.run
        if (!run?._id || !run?.workflowId) return
        if ((run.status || '').toLowerCase() !== 'queued') return
        if (run.workflowId !== workflowSteps[0]?.workflowId) return
        if (isWorkflowRunning) return
        if (runningWorkflowRunIdRef.current === run._id) return
        setStatus(`SSE: nhận lệnh chạy workflow từ backend (${run._id}).`)
        const runPayload = (run.payload || {}) as {
          chatgptWorkflowSource?: string
          chatgptStep1Source?: string
        }
        const workflowSource =
          normalizeChatgptWorkflowSource(runPayload.chatgptWorkflowSource) ||
          normalizeChatgptWorkflowSource(runPayload.chatgptStep1Source)
        void runWorkflow({
          runId: run._id,
          workflowId: run.workflowId,
          source: 'sse',
          chatgptWorkflowSource: workflowSource,
        })
      } catch {
        // ignore malformed SSE payload
      }
    }

    eventSource.onerror = () => {
      // keep silent to avoid noisy UI when stream reconnects
    }

    return () => {
      eventSource.close()
    }
  }, [canUseWorkflow, workflowSteps, isWorkflowRunning])

  const copyImageDataUrl = async (
    dataUrl: string,
    label: string,
    options?: { part?: 'left' | 'right'; copiedToolId?: string },
  ) => {
    try {
      const response = await fetch(dataUrl)
      const blob = await response.blob()
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
      if (options?.copiedToolId) {
        setCopiedTool(options.copiedToolId)
        window.setTimeout(
          () => setCopiedTool((prev) => (prev === options.copiedToolId ? null : prev)),
          1200,
        )
      } else if (options?.part) {
        setCopiedPart(options.part)
        window.setTimeout(() => setCopiedPart((prev) => (prev === options.part ? null : prev)), 1200)
      }
      setStatus(`Đã sao chép ${label} vào clipboard (chỉ clipboard, không lưu file trên máy).`)
    } catch {
      setStatus(`Không thể sao chép ${label}. Hãy thử lại.`)
    }
  }

  const captureLatestChatImageDataUrl = async (): Promise<string | null> => {
    const extensionChrome = getChrome()
    if (!extensionChrome?.tabs?.query || !extensionChrome.scripting?.executeScript || !extensionChrome.tabs.captureVisibleTab) {
      setStatus('Môi trường hiện tại không hỗ trợ lấy ảnh từ ChatGPT.')
      return null
    }

    const currentActive = await queryTabs(undefined, true, true)
    const activeTab = currentActive[0]
    const isActiveChatgpt = Boolean(activeTab?.url && /chatgpt\.com|chat\.openai\.com/i.test(activeTab.url))
    const activeTabs = isActiveChatgpt ? [activeTab] : await queryTabs(CHATGPT_PATTERNS, true, true)
    const allTabs = activeTabs.length > 0 ? activeTabs : await queryTabs(CHATGPT_PATTERNS)
    let target: BrowserTab | null | undefined = allTabs[0]

    if (!target?.id) {
      target = await createTab(CHATGPT_URL)
      await sleep(900)
    } else {
      target = await updateTab(target.id)
      await sleep(450)
    }

    if (!target?.id) {
      setStatus('Không tìm thấy tab ChatGPT để lấy ảnh.')
      return null
    }

    await snapChatgptThreadToBottomBeforeRead(target.id)

    const cap = await captureSingleImageFromChatgptTab(target.id, target.windowId)
    if (!cap.ok) {
      const human: Record<Exclude<CaptureSingleImageResult, { ok: true }>['reason'], string> = {
        unsupported: 'Môi trường hiện tại không hỗ trợ chụp tab.',
        no_rect: 'Không tìm thấy ảnh phù hợp trong hội thoại ChatGPT.',
        no_screenshot: 'Không thể chụp ảnh màn hình tab ChatGPT.',
        crop_failed: 'Không thể xử lý ảnh đã chụp.',
        exception: 'Lấy ảnh thất bại. Hãy thử lại.',
      }
      setStatus(human[cap.reason])
      return null
    }

    return cap.image
  }

  const copyLatestChatImage = async () => {
    setStatus('Đang lấy ảnh mới nhất từ ChatGPT và sao chép vào clipboard...')
    const image = await captureLatestChatImageDataUrl()
    if (!image) return
    await copyImageDataUrl(image, 'ảnh', { copiedToolId: 'image-single' })
  }

  const dispatchFillGrok = (detail: { prompt: string; imageDataUrl: string; part?: 1 | 2; single?: boolean }) => {
    window.dispatchEvent(new CustomEvent('switch-main-tab', { detail: { tabId: 'grok' } }))
    window.setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent('fill-grok-from-chatgpt-video1-image', {
          detail,
        }),
      )
    }, 120)
  }

  const fillGrokWithSinglePackage = async () => {
    setStatus(
      `Đang lấy ảnh («${generateImagesStepLabel}») và VIDEO («${extractVideosStepLabel}») cho Grok đơn...`,
    )

    const imageDataUrl = await captureLatestChatImageDataUrl()
    if (!imageDataUrl) return

    const prompt = await extractSingleVideoContent({ copyToClipboard: false })
    if (!prompt) {
      setStatus(`Không tìm thấy VIDEO PROMPT trong output «${extractVideosStepLabel}».`)
      return
    }

    dispatchFillGrok({ prompt, imageDataUrl, single: true })
    setCopiedTool('grok-single')
    window.setTimeout(() => setCopiedTool((prev) => (prev === 'grok-single' ? null : prev)), 1200)
    setStatus(
      `Đã chuyển Grok: ảnh đơn («${generateImagesStepLabel}») + VIDEO («${extractVideosStepLabel}»), không Enter.`,
    )
  }

  const fillGrokWithVideoImage = async (part: 1 | 2) => {
    setStatus(
      `Đang lấy ảnh ${part} («${generateImagesStepLabel}») và nội dung VIDEO ${part} («${extractVideosStepLabel}»)...`,
    )

    const imageDataUrl = part === 1 ? splitImages?.left : splitImages?.right
    if (!imageDataUrl) {
      setStatus(`Chưa có ảnh ${part} từ «${generateImagesStepLabel}». Hãy bấm nút cắt ảnh trước.`)
      return
    }

    const prompt = await extractVideoContent(part, { copyToClipboard: false })
    if (!prompt) {
      setStatus(`Không tìm thấy nội dung VIDEO ${part} trong output «${extractVideosStepLabel}».`)
      return
    }

    dispatchFillGrok({ prompt, imageDataUrl, part })
    setStatus(
      `Đã chuyển Grok: ảnh ${part} («${generateImagesStepLabel}») + VIDEO ${part} («${extractVideosStepLabel}»), không Enter.`,
    )
  }

  const extractThreadContent = async (
    kind: 'title_plain' | 'title_styled' | 'content_short' | 'content_full',
    options?: { copyToClipboard?: boolean },
  ) => {
    const copyToClipboard = options?.copyToClipboard !== false
    const extractStep = extractContentStep
    const promptHint = extractContentPromptHint
    if (!extractStep || promptHint.length < 30) {
      if (copyToClipboard) {
        setStatus('Workflow chưa có bước actionType = chatgpt_extract_content.')
      }
      return ''
    }
    const extensionChrome = getChrome()
    if (!extensionChrome?.tabs?.query || !extensionChrome.scripting?.executeScript) {
      const kindLabel = getChatgptStep4ContentKindLabel(kind)
      if (copyToClipboard) {
        setStatus(`Môi trường hiện tại không hỗ trợ lấy ${kindLabel} từ «${extractContentStepLabel}».`)
      }
      return ''
    }

    const kindLabel = getChatgptStep4ContentKindLabel(kind)
    const cutConfig = await getShortContentCutConfigFromStorage(getChrome()?.storage?.local)

    if (copyToClipboard) {
      setStatus(`Đang lấy ${kindLabel} từ «${extractContentStepLabel}»...`)
    }

    const target = await pickChatgptTab(lockedWorkflowTabIdRef.current || undefined)
    if (!target?.id) {
      if (copyToClipboard) {
        setStatus(`Không tìm thấy tab ChatGPT để lấy dữ liệu «${extractContentStepLabel}».`)
      }
      return ''
    }
    await sleep(240)

    const readyResult = await extensionChrome.scripting.executeScript({
      target: { tabId: target.id },
      func: chatgptExtractContent as (...args: unknown[]) => unknown,
      args: appendShortCutInjectArgs(['ready', promptHint], cutConfig),
    })
    const isReady = readyResult?.[0]?.result === true
    setExtractContentReady(isReady)
    if (!isReady) {
      if (copyToClipboard) {
        setStatus(
          `Chưa có phản hồi «${extractContentStepLabel}» trên ChatGPT (hãy chạy xong bước trích nội dung trong workflow trước).`,
        )
      }
      return ''
    }

    await extensionChrome.scripting.executeScript({
      target: { tabId: target.id },
      func: chatgptWarmThreadScrollContainersPageScript as (...args: unknown[]) => unknown,
    })
    await sleep(140)

    await extensionChrome.scripting.executeScript({
      target: { tabId: target.id },
      func: chatgptScrollHighlightStep4ContentPageScript as (...args: unknown[]) => unknown,
      args: appendShortCutInjectArgs([kind, promptHint], cutConfig),
    })
    await sleep(copyToClipboard ? 380 : 140)

    const result = await extensionChrome.scripting.executeScript({
      target: { tabId: target.id },
      func: chatgptExtractContent as (...args: unknown[]) => unknown,
      args: appendShortCutInjectArgs(['clipboard', kind, promptHint], cutConfig),
    })

    const extracted = ((result?.[0]?.result as string | undefined) || '').trim()
    if (!extracted) {
      if (copyToClipboard) {
        setStatus(`Không tìm thấy ${kindLabel} từ output «${extractContentStepLabel}».`)
      }
      return ''
    }

    if (copyToClipboard) {
      try {
        await navigator.clipboard.writeText(extracted)
        const toolId = `step4-${kind}`
        setCopiedTool(toolId)
        window.setTimeout(() => setCopiedTool((prev) => (prev === toolId ? null : prev)), 1200)
        setStatus(`Đã lấy và sao chép ${kindLabel} («${extractContentStepLabel}») vào clipboard.`)
      } catch {
        setStatus(`Đã lấy ${kindLabel} («${extractContentStepLabel}») nhưng sao chép thất bại.`)
      }
    }
    return extracted
  }

  /** Lấy text từ ChatGPT, upload ảnh thẳng Cloudinary, trả URL — POST /stories chỉ nhận JSON nhẹ. */
  const collectStoryBundleForApiSave = async (): Promise<ChatgptStorySaveBundle> => {
    if (!extractContentStep || extractContentPromptHint.length < 30) {
      throw new Error('Workflow chưa có bước actionType = chatgpt_extract_content.')
    }

    const extensionChrome = getChrome()
    if (!extensionChrome?.tabs?.query || !extensionChrome.scripting?.executeScript) {
      throw new Error('Môi trường không hỗ trợ đọc tab ChatGPT.')
    }

    const target = await pickChatgptTab(lockedWorkflowTabIdRef.current || undefined)
    if (!target?.id) {
      throw new Error(`Không tìm thấy tab ChatGPT để lấy dữ liệu «${extractContentStepLabel}».`)
    }
    await sleep(240)

    await snapChatgptThreadToBottomBeforeRead(target.id)

    const readyResult = await extensionChrome.scripting.executeScript({
      target: { tabId: target.id },
      func: chatgptExtractContent as (...args: unknown[]) => unknown,
      args: ['ready', extractContentPromptHint],
    })
    if (readyResult?.[0]?.result !== true) {
      throw new Error(
        `Chưa có phản hồi «${extractContentStepLabel}» trên ChatGPT (hãy chạy xong bước trích nội dung trước).`,
      )
    }

    const titlePlain = (await extractThreadContent('title_plain', { copyToClipboard: false })).trim()
    const shortContent = (await extractThreadContent('content_short', { copyToClipboard: false })).trim()
    const longContent = (await extractThreadContent('content_full', { copyToClipboard: false })).trim()

    if (!titlePlain || !shortContent || !longContent) {
      throw new Error(
        `Không lấy đủ tiêu đề / nội dung ngắn / dài từ «${extractContentStepLabel}».`,
      )
    }

    const imageDataUrls: string[] = []
    if (extensionChrome.tabs?.captureVisibleTab) {
      await snapChatgptThreadToBottomBeforeRead(target.id)
      if (splitGeneratedImages) {
        const cap = await captureSplitPairFromChatgptTab(target.id, target.windowId)
        if (cap.ok) {
          if (cap.left) imageDataUrls.push(cap.left)
          if (cap.right) imageDataUrls.push(cap.right)
          setSplitImages({ left: cap.left, right: cap.right })
        }
      } else {
        const cap = await captureSingleImageFromChatgptTab(target.id, target.windowId)
        if (cap.ok && cap.image) {
          imageDataUrls.push(cap.image)
          setSplitImages({ left: cap.image, right: '' })
        }
      }
    }
    if (imageDataUrls.length === 0) {
      const staleLeft = (splitImages?.left || '').trim()
      const staleRight = (splitImages?.right || '').trim()
      if (splitGeneratedImages) {
        if (staleLeft) imageDataUrls.push(staleLeft)
        if (staleRight) imageDataUrls.push(staleRight)
      } else if (staleLeft || staleRight) {
        imageDataUrls.push(staleLeft || staleRight)
      }
    }

    let imageUrls: string[] = []
    if (imageDataUrls.length > 0) {
      setStatus('Đang upload ảnh lên Cloudinary (trực tiếp từ extension)...')
      imageUrls = await uploadStoryImagesFromDataUrls(imageDataUrls)
    }

    return { title: titlePlain, shortContent, longContent, imageUrls }
  }

  const resolveStoryContextForLocalSave = async (): Promise<{
    storyId: string
    folderSegment: string
    titleDisplay: string
    sourceReelUrl: string
  } | null> => {
    const storyFromId = async (storyId: string) => {
      const { items: list } = await getMyStories({ page: 1, limit: 200 })
      const s = list.find((x) => (x._id || '').trim() === storyId.trim())
      if (!s) return null
      const id = (s._id || '').trim()
      const rawName = (s.name || '').trim()
      const folderSegment = sanitizeWorkspaceFolderSegment(
        rawName,
        `story-${id.replace(/[^a-zA-Z0-9]/g, '').slice(-12) || 'id'}`,
      )
      return {
        storyId: id,
        folderSegment,
        titleDisplay: rawName || id,
        sourceReelUrl: (s.sourceReelUrl || '').trim(),
      }
    }

    const cur = chatgptPipelineStoryIdRef.current.trim()
    if (cur) {
      const r = await storyFromId(cur)
      if (r) return r
    }
    try {
      const sources = await getMyStorySources()
      const top = sources[0]
      if (!top?._id) return null
      const sid = await resolveLatestStoryIdForSource(top._id)
      if (!sid) return null
      return await storyFromId(sid)
    } catch {
      return null
    }
  }

  const flushPendingLocalSave = async (): Promise<boolean> => {
    const payload = pendingLocalSaveRef.current
    if (!payload) return false

    setIsSavingStoryLocal(true)
    try {
      setStatus('Đang chọn thư mục và ghi file story đã chuẩn bị...')
      const root = await resolveWritableContentRootDirectory({ allowPicker: true })
      if (!root) {
        setStatus('Đã hủy chọn thư mục — bấm Lưu local lại để hoàn tất ghi file.')
        return false
      }
      const result = await writeStoryBundleToWorkspace(root, payload)
      pendingLocalSaveRef.current = null
      setHasPendingLocalSave(false)
      setStatus(
        `Đã lưu cục bộ: …/${result.storiesSeg}/${result.folderSegment}/ — content (noi-dung-ngan, noi-dung-dai), info/meta.json${result.imageNote}.`,
      )
      return true
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setStatus(`Lưu vào local thất bại: ${msg}`)
      return false
    } finally {
      setIsSavingStoryLocal(false)
    }
  }

  const writeLocalBundleWithPermissionRecovery = async (
    root: FileSystemDirectoryHandle,
    payload: LocalStoryBundleWritePayload,
  ): Promise<boolean> => {
    try {
      const result = await writeStoryBundleToWorkspace(root, payload)
      pendingLocalSaveRef.current = null
      setHasPendingLocalSave(false)
      setStatus(
        `Đã lưu cục bộ: …/${result.storiesSeg}/${result.folderSegment}/ — content (noi-dung-ngan, noi-dung-dai), info/meta.json${result.imageNote}.`,
      )
      return true
    } catch (e) {
      if (!isFilesystemPermissionError(e) && !(e instanceof Error && e.message === 'PERMISSION_REQUIRED')) {
        throw e
      }
      pendingLocalSaveRef.current = payload
      setHasPendingLocalSave(true)
      const recovered = await flushPendingLocalSave()
      if (recovered) return true
      if (!pendingLocalSaveRef.current) return false
      setStatus(
        'Story đã sẵn sàng — bấm Lưu local một lần nữa (hoặc «Xác nhận lưu») để chọn thư mục và ghi file.',
      )
      return false
    }
  }

  const saveStoryBundleToLocal = async () => {
    if (pendingLocalSaveRef.current) {
      await flushPendingLocalSave()
      return
    }

    const sorted = [...processSteps].sort((a, b) => (a.stepNo || 0) - (b.stepNo || 0))
    const lastStep = sorted[sorted.length - 1]
    if (!lastStep?.prompt?.trim()) {
      setStatus('Workflow không có bước cuối hoặc thiếu prompt.')
      return
    }

    setIsSavingStoryLocal(true)
    try {
      setStatus('Đang xác nhận quyền thư mục lưu...')
      const root = await resolveWritableContentRootDirectory({ allowPicker: true })
      if (!root) {
        setStatus('Cần chọn thư mục lưu story trên máy để tiếp tục.')
        return
      }

      const extensionChrome = getChrome()
      if (!extensionChrome?.tabs?.query || !extensionChrome.scripting?.executeScript) {
        setStatus('Môi trường không hỗ trợ kiểm tra / lưu qua tab ChatGPT.')
        return
      }

      const currentActive = await queryTabs(undefined, true, true)
      const activeTab = currentActive[0]
      const isActiveChatgpt = Boolean(activeTab?.url && /chatgpt\.com|chat\.openai\.com/i.test(activeTab.url))
      const activeTabs = isActiveChatgpt ? [activeTab] : await queryTabs(CHATGPT_PATTERNS, true, true)
      const allTabs = activeTabs.length > 0 ? activeTabs : await queryTabs(CHATGPT_PATTERNS)
      let target: BrowserTab | null | undefined = allTabs[0]

      if (!target?.id) {
        setStatus('Không tìm thấy tab ChatGPT để kiểm tra bước cuối.')
        return
      }

      target = await updateTab(target.id)
      await sleep(240)

      if (!target?.id) {
        setStatus('Không thể kích hoạt tab ChatGPT.')
        return
      }

      await snapChatgptThreadToBottomBeforeRead(target.id)

      setStatus('Đang kiểm tra: prompt bước cuối đã gửi và ChatGPT đã phản hồi xong...')
      const verifyRes = await extensionChrome.scripting.executeScript({
        target: { tabId: target.id },
        func: chatgptVerifyLastStepReadyPageScript as (...args: unknown[]) => unknown,
        args: [lastStep.prompt],
      })
      const vr = (verifyRes?.[0]?.result || null) as { ok?: boolean; reason?: string } | null
      if (!vr?.ok) {
        const key = String(vr?.reason || 'unknown')
        const human: Record<string, string> = {
          empty_prompt: 'Thiếu prompt bước cuối.',
          prompt_too_short: 'Prompt bước cuối quá ngắn để so khớp với tin nhắn.',
          no_messages: 'Không đọc được luồng tin nhắn trên ChatGPT.',
          no_user_message: 'Chưa có tin nhắn user — hãy gửi prompt bước cuối trên ChatGPT.',
          last_user_prompt_mismatch:
            'Tin user cuối không khớp đầu prompt bước cuối (có thể chưa gửi đúng bước cuối hoặc đã sửa quá nhiều).',
          no_assistant_after_last_send: 'Chưa có phản hồi assistant sau lần gửi cuối.',
          still_generating: 'ChatGPT vẫn đang sinh câu trả lời — đợi xong rồi bấm Lưu lại.',
          last_turn_not_assistant: 'Lượt tin nhắn cuối chưa phải assistant (còn chờ hoặc lỗi luồng).',
        }
        setStatus(`Chưa lưu được: ${human[key] || key}`)
        return
      }

      let storyCtx = await resolveStoryContextForLocalSave()
      let titlePlain = ''
      if (!storyCtx) {
        setStatus(
          'Chưa gắn story trên hệ thống (reel/Hồ sơ) — đang lấy tiêu đề bước 4 trên ChatGPT để đặt tên thư mục...',
        )
        titlePlain = (await extractThreadContent('title_plain', { copyToClipboard: false })).trim()
        if (!titlePlain) {
          setStatus(
            'Không đặt tên thư mục được: chưa có story trên API và không đọc được tiêu đề từ ChatGPT. Gợi ý: chạy workflow với bước 1 nguồn «story», hoặc hoàn thành bước 4 có block tiêu đề.',
          )
          return
        }
        storyCtx = buildLocalOnlyStoryContextFromTitle(titlePlain)
      }

      const ext = getChrome()
      const storiesSeg = await getStoriesFolderSegmentFromStorage(ext?.storage?.local)

      setStatus(`Đang lưu bundle story «${storyCtx.folderSegment}» vào máy...`)

      const shortText = await extractThreadContent('content_short', { copyToClipboard: false })
      const longText = await extractThreadContent('content_full', { copyToClipboard: false })
      if (!titlePlain) {
        titlePlain = (await extractThreadContent('title_plain', { copyToClipboard: false })).trim()
      }

      if (!shortText || !longText || !titlePlain) {
        setStatus(
          `Không lấy đủ nội dung «${extractContentStepLabel}» (tiêu đề / ngắn / dài). Hãy đảm bảo đã có output trên ChatGPT.`,
        )
        return
      }

      let left = ''
      let right = ''
      let usedStaleSplitFallback = false
      if (extensionChrome.tabs?.captureVisibleTab && target?.id) {
        setStatus(
          splitGeneratedImages
            ? `Đang chụp và cắt đôi ảnh mới nhất từ ChatGPT («${generateImagesStepLabel}») để lưu...`
            : `Đang chụp ảnh mới nhất từ ChatGPT («${generateImagesStepLabel}») để lưu...`,
        )
        await snapChatgptThreadToBottomBeforeRead(target.id)
        if (splitGeneratedImages) {
          const cap = await captureSplitPairFromChatgptTab(target.id, target.windowId)
          if (cap.ok) {
            left = cap.left
            right = cap.right
            setSplitImages({ left, right })
          }
        } else {
          const cap = await captureSingleImageFromChatgptTab(target.id, target.windowId)
          if (cap.ok && cap.image) {
            left = cap.image
            setSplitImages({ left, right: '' })
          }
        }
      }
      if (splitGeneratedImages ? !left || !right : !left) {
        const staleLeft = (splitImages?.left || '').trim()
        const staleRight = (splitImages?.right || '').trim()
        if (splitGeneratedImages && staleLeft && staleRight) {
          left = staleLeft
          right = staleRight
          usedStaleSplitFallback = true
        } else if (!splitGeneratedImages && (staleLeft || staleRight)) {
          left = staleLeft || staleRight
          usedStaleSplitFallback = true
        }
      }

      const bundlePayload: LocalStoryBundleWritePayload = {
        storiesSeg,
        folderSegment: storyCtx.folderSegment,
        storyId: storyCtx.storyId,
        titleDisplay: storyCtx.titleDisplay,
        sourceReelUrl: storyCtx.sourceReelUrl || '',
        workflowId: selectedWorkflowId,
        shortText,
        longText,
        titlePlain,
        splitGeneratedImages,
        left,
        right,
        usedStaleSplitFallback,
      }

      await writeLocalBundleWithPermissionRecovery(root, bundlePayload)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setStatus(`Lưu vào local thất bại: ${msg}`)
    } finally {
      setIsSavingStoryLocal(false)
    }
  }

  const ensureImagesForWebBlog = async (): Promise<{ left: string; right: string } | null> => {
    let left = (splitImages?.left || '').trim()
    let right = (splitImages?.right || '').trim()
    if (splitGeneratedImages ? left && right : left) {
      return { left, right }
    }

    if (!chatgptStepsByAction.generateImages) {
      setStatus('Workflow chưa có bước tạo ảnh (chatgpt_generate_image / chatgpt_generate_images).')
      return null
    }

    const extensionChrome = getChrome()
    if (!extensionChrome?.tabs?.query || !extensionChrome.scripting?.executeScript || !extensionChrome.tabs.captureVisibleTab) {
      setStatus('Môi trường hiện tại không hỗ trợ chụp ảnh từ ChatGPT.')
      return null
    }

    setStatus(
      splitGeneratedImages
        ? `Đang chụp và cắt đôi ảnh («${generateImagesStepLabel}») cho WebBlog...`
        : `Đang chụp ảnh («${generateImagesStepLabel}») cho WebBlog...`,
    )

    const currentActive = await queryTabs(undefined, true, true)
    const activeTab = currentActive[0]
    const isActiveChatgpt = Boolean(activeTab?.url && /chatgpt\.com|chat\.openai\.com/i.test(activeTab.url))
    const activeTabs = isActiveChatgpt ? [activeTab] : await queryTabs(CHATGPT_PATTERNS, true, true)
    const allTabs = activeTabs.length > 0 ? activeTabs : await queryTabs(CHATGPT_PATTERNS)
    let target: BrowserTab | null | undefined = allTabs[0]

    if (!target?.id) {
      target = await createTab(CHATGPT_URL)
      await sleep(900)
    } else {
      target = await updateTab(target.id)
      await sleep(450)
    }

    if (!target?.id) {
      setStatus('Không tìm thấy tab ChatGPT để lấy ảnh.')
      return null
    }

    await snapChatgptThreadToBottomBeforeRead(target.id)

    if (splitGeneratedImages) {
      const cap = await captureSplitPairFromChatgptTab(target.id, target.windowId)
      if (!cap.ok) {
        const human: Record<Exclude<CaptureSplitPairResult, { ok: true }>['reason'], string> = {
          unsupported: 'Môi trường hiện tại không hỗ trợ chụp tab.',
          no_rect: `Không tìm thấy ảnh phù hợp từ hội thoại («${generateImagesStepLabel}»).`,
          no_screenshot: 'Không thể chụp ảnh màn hình tab ChatGPT.',
          split_failed: 'Không thể tách ảnh thành 2 phần.',
          exception: 'Xử lý ảnh thất bại. Hãy thử lại.',
        }
        setStatus(human[cap.reason])
        return null
      }
      left = cap.left
      right = cap.right
      setSplitImages({ left, right })
    } else {
      const cap = await captureSingleImageFromChatgptTab(target.id, target.windowId)
      if (!cap.ok) {
        const human: Record<Exclude<CaptureSingleImageResult, { ok: true }>['reason'], string> = {
          unsupported: 'Môi trường hiện tại không hỗ trợ chụp tab.',
          no_rect: `Không tìm thấy ảnh phù hợp từ hội thoại («${generateImagesStepLabel}»).`,
          no_screenshot: 'Không thể chụp ảnh màn hình tab ChatGPT.',
          crop_failed: 'Không thể xử lý ảnh đã chụp.',
          exception: 'Lấy ảnh thất bại. Hãy thử lại.',
        }
        setStatus(human[cap.reason])
        return null
      }
      left = cap.image
      right = ''
      setSplitImages({ left, right: '' })
    }

    return { left, right }
  }

  const pushThreadToWebBlog = async () => {
    const images = await ensureImagesForWebBlog()
    if (!images) return

    setStatus(
      splitGeneratedImages
        ? 'Đang lấy tiêu đề thường + nội dung dài và ghép ảnh 1/2 cho WebBlog...'
        : 'Đang lấy tiêu đề thường + nội dung dài và ghép ảnh cho WebBlog...',
    )
    const titlePlain = await extractThreadContent('title_plain', { copyToClipboard: false })
    const fullContent = await extractThreadContent('content_full', { copyToClipboard: false })
    if (!titlePlain || !fullContent) {
      setStatus(`Không lấy đủ dữ liệu «${extractContentStepLabel}» để gửi WebBlog.`)
      return
    }

    const contentWithImages = splitGeneratedImages
      ? injectImagesIntoLongContent(fullContent, images.left, images.right)
      : injectSingleImageIntoLongContent(fullContent, images.left)

    window.dispatchEvent(new CustomEvent('switch-main-tab', { detail: { tabId: 'webblog' } }))
    window.setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent('fill-webblog-from-chatgpt', {
          detail: {
            title: titlePlain,
            longContent: contentWithImages,
            image1: images.left,
            image2: images.right,
          },
        }),
      )
    }, 120)
    setStatus(
      splitGeneratedImages
        ? 'Đã gửi dữ liệu sang WebBlog (tiêu đề + nội dung dài có chèn ảnh 1/2).'
        : 'Đã gửi dữ liệu sang WebBlog (tiêu đề + nội dung dài có chèn 1 ảnh).',
    )
  }

  const runGgSheetCollectTool = () => {
    window.dispatchEvent(new CustomEvent('switch-main-tab', { detail: { tabId: 'ggsheet' } }))
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('run-ggsheet-collect-from-chatgpt'))
    }, 120)
    setStatus('Đã chuyển sang GGSheet và bắt đầu gom dữ liệu từ ChatGPT.')
  }

  const captureAndSplitLatestImage = async () => {
    const extensionChrome = getChrome()
    if (!extensionChrome?.tabs?.query || !extensionChrome.scripting?.executeScript || !extensionChrome.tabs.captureVisibleTab) {
      setStatus('Môi trường hiện tại không hỗ trợ công cụ xử lý ảnh.')
      return
    }
    if (!chatgptStepsByAction.generateImages) {
      setStatus('Workflow chưa có bước actionType = chatgpt_generate_images (hoặc chatgpt_generate_image).')
      return
    }

    setStatus(
      splitGeneratedImages
        ? `Đang lấy ảnh mới nhất («${generateImagesStepLabel}») và cắt đôi...`
        : `Đang lấy ảnh mới nhất («${generateImagesStepLabel}»)...`,
    )

    const currentActive = await queryTabs(undefined, true, true)
    const activeTab = currentActive[0]
    const isActiveChatgpt = Boolean(activeTab?.url && /chatgpt\.com|chat\.openai\.com/i.test(activeTab.url))

    const activeTabs = isActiveChatgpt ? [activeTab] : await queryTabs(CHATGPT_PATTERNS, true, true)
    const allTabs = activeTabs.length > 0 ? activeTabs : await queryTabs(CHATGPT_PATTERNS)
    let target: BrowserTab | null | undefined = allTabs[0]

    if (!target?.id) {
      target = await createTab(CHATGPT_URL)
      await sleep(900)
    } else {
      target = await updateTab(target.id)
      await sleep(450)
    }

    if (!target?.id) {
      setStatus('Không tìm thấy tab ChatGPT để lấy ảnh.')
      return
    }

    await snapChatgptThreadToBottomBeforeRead(target.id)

    if (splitGeneratedImages) {
      const cap = await captureSplitPairFromChatgptTab(target.id, target.windowId)
      if (!cap.ok) {
        const human: Record<Exclude<CaptureSplitPairResult, { ok: true }>['reason'], string> = {
          unsupported: 'Môi trường hiện tại không hỗ trợ chụp tab.',
          no_rect: `Không tìm thấy ảnh phù hợp từ hội thoại («${generateImagesStepLabel}»).`,
          no_screenshot: 'Không thể chụp ảnh màn hình tab ChatGPT.',
          split_failed: 'Không thể tách ảnh thành 2 phần.',
          exception: 'Xử lý ảnh thất bại. Hãy thử lại.',
        }
        setStatus(human[cap.reason])
        return
      }
      setSplitImages({ left: cap.left, right: cap.right })
      setStatus('Đã lấy và cắt đôi ảnh thành công. Có thể sao chép ảnh 1/2.')
    } else {
      const cap = await captureSingleImageFromChatgptTab(target.id, target.windowId)
      if (!cap.ok) {
        const human: Record<Exclude<CaptureSingleImageResult, { ok: true }>['reason'], string> = {
          unsupported: 'Môi trường hiện tại không hỗ trợ chụp tab.',
          no_rect: `Không tìm thấy ảnh phù hợp từ hội thoại («${generateImagesStepLabel}»).`,
          no_screenshot: 'Không thể chụp ảnh màn hình tab ChatGPT.',
          crop_failed: 'Không thể xử lý ảnh đã chụp.',
          exception: 'Lấy ảnh thất bại. Hãy thử lại.',
        }
        setStatus(human[cap.reason])
        return
      }
      setSplitImages({ left: cap.image, right: '' })
      setStatus('Đã lấy ảnh thành công (workflow đơn). Có thể sao chép hoặc đẩy WebBlog.')
    }
  }

  const stepPanelToolHost = useMemo<ToolScriptHost>(
    () => ({
      legacyStepPanelContext,
      splitImages,
      captureAndSplitLatestImage,
      copyLatestChatImage,
      copySplitImage: async (part: 'left' | 'right') => {
        const dataUrl = part === 'left' ? splitImages?.left : splitImages?.right
        if (dataUrl) {
          await copyImageDataUrl(dataUrl, `ảnh ${part === 'left' ? '1' : '2'}`, { part })
        }
      },
      extractVideoContent: (part: 1 | 2) => extractVideoContent(part),
      extractSingleVideoContent: () => extractSingleVideoContent(),
      extractThreadContent: (mode: 'title_plain' | 'title_styled' | 'content_short' | 'content_full') =>
        extractThreadContent(mode),
    }),
    [
      legacyStepPanelContext,
      splitImages,
      captureAndSplitLatestImage,
      copyLatestChatImage,
      copyImageDataUrl,
      extractVideoContent,
      extractSingleVideoContent,
      extractThreadContent,
    ],
  )

  const buildStepGuardHost = (step: ProcessStep): ToolScriptHost => ({
    ...stepPanelToolHost,
    currentStep: step,
    stepIsExtractVideos: () =>
      isChatgptExtractVideosStep(step) || Boolean(legacyStepPanelContext.hasExtractVideosStep),
    stepIsGenerateImages: () =>
      isChatgptGenerateImagesStep(step) || Boolean(legacyStepPanelContext.hasGenerateImagesStep),
    stepIsExtractContent: () =>
      isChatgptExtractContentStep(step) || Boolean(legacyStepPanelContext.hasExtractContentStep),
    isExtractContentReady: () => extractContentReady,
  })

  const isStepPanelToolDisabled = (tool: ResolvedStepPanelTool, step: ProcessStep) => {
    if (
      (tool.code === 'chatgpt_copy_video_1' || tool.code === 'chatgpt_copy_video_2') &&
      isChatgptExtractVideosStep(step)
    ) {
      return false
    }
    return isToolDisabledByGuardScript(tool.guardScript, buildStepGuardHost(step), tool.config)
  }

  const runStepPanelTool = async (tool: ResolvedStepPanelTool) => {
    try {
      const payload = await fetchToolHandler(tool.toolId)
      const config = {
        ...(payload.defaultConfig || {}),
        ...tool.config,
      }
      await runToolHandlerScript(payload.handlerScript, stepPanelToolHost, config)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Chạy công cụ thất bại.'
      setStatus(message)
    }
  }

  const bottomBarToolHost = useMemo<ToolScriptHost>(
    () => ({
      fillGrokImage: (part: 1 | 2) => fillGrokWithVideoImage(part),
      fillGrokSingle: () => fillGrokWithSinglePackage(),
      pushWebBlog: () => pushThreadToWebBlog(),
      collectGgSheet: () => runGgSheetCollectTool(),
      saveLocal: () => saveStoryBundleToLocal(),
      canSaveLocal: processSteps.length > 0 && !isSavingStoryLocal,
    }),
    [
      processSteps.length,
      isSavingStoryLocal,
      fillGrokWithVideoImage,
      fillGrokWithSinglePackage,
      pushThreadToWebBlog,
      runGgSheetCollectTool,
      saveStoryBundleToLocal,
    ],
  )

  const isBottomBarToolDisabled = (tool: ResolvedBottomBarTool) =>
    isToolDisabledByGuardScript(tool.guardScript, bottomBarToolHost, tool.config)

  const runBottomBarTool = async (tool: ResolvedBottomBarTool) => {
    try {
      const payload = await fetchToolHandler(tool.toolId)
      const config = {
        ...(payload.defaultConfig || {}),
        ...tool.config,
      }
      await runToolHandlerScript(payload.handlerScript, bottomBarToolHost, config)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Chạy công cụ thất bại.'
      setStatus(message)
    }
  }

  const selectedStep = selectedProcessStep
  const statusLower = status.toLowerCase()
  const statusTone = statusLower.includes('không thể') || statusLower.includes('không tìm thấy') || statusLower.includes('thất bại') || statusLower.includes('lỗi')
    ? 'error'
    : statusLower.includes('đang ')
      ? 'loading'
      : statusLower.includes('đã ')
        ? 'success'
        : 'info'

  return (
    <section className="glass-panel flex h-full min-h-0 flex-col rounded-3xl p-4">
      <div className="mb-2 flex shrink-0 items-center gap-2">
        <div className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 p-1.5">
          <div className="flex gap-1 overflow-x-auto px-0.5 py-0.5">
          {workflows.map((workflow, idx) => (
            <button
              key={workflow._id}
              type="button"
              onClick={() => setSelectedWorkflowId(workflow._id)}
              className={`relative inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg transition ${
                selectedWorkflowId === workflow._id
                  ? 'bg-cyan-500/25 text-cyan-100 ring-1 ring-cyan-300/40'
                  : 'bg-white/10 text-slate-300 hover:bg-cyan-500/20'
              }`}
              title={workflow.name || `Workflow ${idx + 1}`}
              aria-label={`Chọn workflow ${idx + 1}`}
            >
              <FiLayers className="h-3.5 w-3.5" />
              <span className="absolute right-0.5 top-0.5 inline-flex h-3 min-w-3 items-center justify-center rounded-full bg-cyan-500 px-0.5 text-[7px] font-bold leading-none text-white">
                {idx + 1}
              </span>
            </button>
          ))}
          {!isLoadingWorkflows && workflows.length === 0 ? (
            <span className="rounded-lg bg-white/10 px-2 py-1 text-[10px] text-slate-400">--</span>
          ) : null}
          </div>
        </div>
        {/* Tạm ẩn nút cài đặt workflow
        <button
          type="button"
          className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-white/10 bg-black/30 text-slate-300 transition hover:bg-blue-500/20 hover:text-blue-100"
          title="Cài đặt workflow"
          aria-label="Cài đặt workflow"
        >
          <FiSettings className="h-3.5 w-3.5" />
        </button>
        */}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_92px] gap-3">
        <div className="flex min-h-0 flex-col rounded-2xl border border-white/10 bg-black/30 p-3">
          <h2 className="text-sm font-semibold text-white">{selectedStep?.label || 'Tiến trình'}</h2>
          <p className="mt-1 text-[11px] text-slate-400">Nội dung chi tiết tiến trình đang chọn.</p>
          {!canUseWorkflow && !isLoadingProcessSteps && processSteps.length > 0 ? (
            <p className="mt-1 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[10px] text-amber-100">
              Bạn có thể dùng ⚡ và ✏️ để chạy thủ công từng bước. Chạy workflow tự động liên tiếp mọi bước chỉ có với VIP.
            </p>
          ) : null}
          <textarea
            readOnly
            value={
              isLoadingProcessSteps
                ? 'Đang tải dữ liệu workflow...'
                : selectedStep && !canManualChatgptStep(selectedStep)
                  ? 'Bước này không có prompt trên DB — chỉ chạy qua workflow tự động (nếu được cấu hình).'
                  : selectedStep?.prompt || 'Chưa có dữ liệu workflow/steps từ backend.'
            }
            className="mt-2 min-h-[180px] flex-1 w-full resize-none rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2 text-[11px] text-slate-200 outline-none"
          />
          <p
            className={`mt-2 shrink-0 rounded-xl border px-3 py-2 text-[11px] ${
              statusTone === 'success'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
                : statusTone === 'error'
                  ? 'border-rose-500/30 bg-rose-500/10 text-rose-100'
                  : statusTone === 'loading'
                    ? 'border-amber-500/30 bg-amber-500/10 text-amber-100'
                    : 'border-white/10 bg-black/40 text-slate-300'
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              {statusTone === 'success' ? (
                <FiCheck className="h-3.5 w-3.5" />
              ) : statusTone === 'error' ? (
                <FiAlertTriangle className="h-3.5 w-3.5" />
              ) : statusTone === 'loading' ? (
                <FiScissors className="h-3.5 w-3.5 animate-pulse" />
              ) : (
                <FiInfo className="h-3.5 w-3.5" />
              )}
              {status}
            </span>
          </p>
          {hasPendingLocalSave ? (
            <button
              type="button"
              onClick={() => void flushPendingLocalSave()}
              disabled={isSavingStoryLocal}
              className="mt-2 inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-amber-400/35 bg-amber-500/15 px-3 py-2 text-[11px] font-medium text-amber-100 transition hover:bg-amber-500/25 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Xác nhận lưu vào thư mục
            </button>
          ) : null}
        </div>

        <aside className="flex min-h-0 flex-col rounded-2xl border border-white/10 bg-black/30 p-2">
          {canUseWorkflow ? (
            <div className="mb-2 shrink-0 rounded-xl border border-white/10 bg-white/5 p-1.5">
              {isWorkflowRunning ? (
                <button
                  type="button"
                  onClick={stopWorkflowRun}
                  className="inline-flex h-8 w-full cursor-pointer items-center justify-center rounded-lg bg-rose-500/20 text-rose-100 transition hover:bg-rose-500/30"
                  title="Dừng workflow"
                  aria-label="Dừng workflow"
                >
                  <FiSquare className="h-4 w-4" aria-hidden />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void runWorkflow()}
                  disabled={!workflowSteps.length || isLoadingProcessSteps || isLoadingWorkflows}
                  className="inline-flex h-8 w-full cursor-pointer items-center justify-center rounded-lg bg-violet-500/20 text-violet-100 transition hover:bg-violet-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                  title="Chạy toàn bộ workflow"
                  aria-label="Chạy workflow"
                >
                  <FiPlay className="h-4 w-4" aria-hidden />
                </button>
              )}
            </div>
          ) : null}
          <div ref={workflowStepsScrollRef} className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-0.5">
            {sidebarSteps.map((step) => {
              const isWorkflowActive =
                isWorkflowRunning && workflowActiveStepId === step.id
              return (
                <div
                  key={step.id}
                  ref={(node) => {
                    if (node) workflowStepItemRefs.current.set(step.id, node)
                    else workflowStepItemRefs.current.delete(step.id)
                  }}
                  className={`rounded-xl border p-1.5 transition-all duration-300 ${
                    isWorkflowActive
                      ? 'border-violet-400/70 bg-violet-500/15 shadow-[0_0_18px_rgba(168,85,247,0.45)]'
                      : 'border-white/10 bg-white/5'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedStepId(step.id)}
                    className={`inline-flex h-8 w-full cursor-pointer items-center justify-center gap-1 rounded-lg transition ${
                      isWorkflowActive
                        ? 'bg-violet-500/35 text-violet-50 ring-2 ring-violet-300/80 shadow-[0_0_12px_rgba(168,85,247,0.5)]'
                        : selectedStepId === step.id
                          ? 'bg-blue-500/25 text-blue-100 ring-1 ring-blue-300/40'
                          : 'bg-white/10 text-slate-200 hover:bg-white/20'
                    }`}
                    title={`Xem chi tiết ${step.label}`}
                  >
                    <span
                      className={`inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold leading-none text-white transition ${
                        isWorkflowActive
                          ? 'bg-violet-500 shadow-[0_0_10px_rgba(196,181,253,0.95)]'
                          : 'bg-blue-500'
                      }`}
                    >
                      {step.id.replace('step-', '')}
                    </span>
                  </button>
                  {canManualChatgptStep(step) ? (
                    <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedStepId(step.id)
                          void runFastProcess(step)
                        }}
                        disabled={isLoadingProcessSteps || isWorkflowRunning}
                        className="inline-flex h-7 w-full cursor-pointer items-center justify-center rounded-md bg-emerald-500/25 text-emerald-100 transition hover:bg-emerald-500/35 disabled:cursor-not-allowed disabled:opacity-40"
                        title={
                          isChatgptRewriteContentStep(step)
                            ? `${step.label} + bản nhớ tạm mới nhất, tự Enter`
                            : 'Chạy nhanh và tự Enter'
                        }
                      >
                        <IoFlash className="h-3.5 w-3.5 text-emerald-300" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedStepId(step.id)
                          void runFillProcess(step)
                        }}
                        disabled={isLoadingProcessSteps || isWorkflowRunning}
                        className="inline-flex h-7 w-full cursor-pointer items-center justify-center rounded-md bg-amber-500/20 text-amber-100 transition hover:bg-amber-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                        title={
                          isChatgptRewriteContentStep(step)
                            ? `${step.label} + bản nhớ tạm mới nhất, không Enter`
                            : 'Điền prompt, không Enter'
                        }
                      >
                        <FiEdit3 className="h-3.5 w-3.5 text-amber-300" />
                      </button>
                    </div>
                  ) : null}
                </div>
              )
            })}
            {!isLoadingProcessSteps && sidebarSteps.length === 0 ? (
              <p className="rounded-xl border border-white/10 bg-white/5 px-2 py-2 text-[10px] text-slate-400">
                Chưa có workflow/steps cho ChatGPT. Hãy tạo dữ liệu.
              </p>
            ) : null}
          </div>

          {processSteps.length > 0 ? (
            <div className="mt-2 max-h-[min(42vh,320px)] shrink-0 overflow-y-auto rounded-xl border border-white/10 bg-white/5 p-2">
              <StepPanelToolsSection
                comparison={workflowStepPanelComparison}
                copiedTool={copiedTool}
                copiedPart={copiedPart}
                getOwnerStep={(tool) => processStepByBackendId.get(tool.ownerStepId)}
                isToolDisabled={isStepPanelToolDisabled}
                onRunTool={(tool) => void runStepPanelTool(tool)}
              />
            </div>
          ) : null}
        </aside>
      </div>
      <div className="mt-3 flex w-full min-w-0 shrink-0 flex-nowrap items-stretch gap-1.5 rounded-2xl border border-white/10 bg-black/30 p-2">
        <BottomBarToolsSection
          tools={bottomBarTools}
          isLoading={isLoadingWorkflowTools}
          isSavingStoryLocal={isSavingStoryLocal}
          isToolDisabled={isBottomBarToolDisabled}
          onRunTool={(tool) => void runBottomBarTool(tool)}
        />
      </div>
    </section>
  )
}

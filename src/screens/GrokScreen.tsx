import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FiAlertTriangle, FiCheck, FiGlobe, FiImage, FiInfo, FiPlay, FiRefreshCw, FiRotateCcw, FiSquare } from 'react-icons/fi'
import translate from 'translate'
import { useAuth } from '@/hooks/useAuth'
import { getLatestGrokReadyVideoShort, getVideoShortById, patchVideoShort } from '@/services/VideoShortService'
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
  captureAndSaveGrokVideoLocally,
  fillGrokFromVideoShortPair,
  mergeGrokMediaBaseline,
  pickGrokTab,
  type GrokMediaBaseline,
} from '@/utils/grokAutomation'
import { GROK_VIDEO_PROMPT_SUFFIX, withGrokVideoPromptSuffix } from '@/utils/grokVideoPrompt'
import {
  ensureVideoShortWorkspaceLayout,
  getVideoShortsFolderSegmentFromStorage,
  resolveWritableContentRootDirectory,
  sanitizeWorkspaceFolderSegment,
} from '@/utils/localWorkspacePersistence'
import {
  getCancelledWorkflowRunFromStream,
  finalizeMultiWorkflowJobAfterWorkflowRun,
  shouldAcceptWorkflowRunFromStream,
  shouldStopLocalWorkflowForCancelledRun,
} from '@/utils/multiWorkflowRun'
import {
  isGrokCaptureVideoLinkStep,
  isGrokFillFromVideoShortStep,
  readGrokPairIndex,
  readGrokRunPairIndex,
  readGrokTimeoutMs,
} from '@/utils/grokWorkflowSteps'

type GrokProcessStep = {
  id: string
  label: string
  workflowId: string
  workflowPlatform: string
  backendStepId: string
  stepNo: number
  actionType: string
  inputSchema: Record<string, unknown>
}

const QUOTED_TEXT_PATTERN = /"[^"]*"/g

const renderTextWithQuotedHighlights = (text: string) => {
  if (!text) return text

  const parts: Array<{ key: string; text: string; quoted: boolean }> = []
  let lastIndex = 0
  for (const match of text.matchAll(QUOTED_TEXT_PATTERN)) {
    const start = match.index ?? 0
    const quoted = match[0]
    if (start > lastIndex) {
      parts.push({ key: `t-${lastIndex}`, text: text.slice(lastIndex, start), quoted: false })
    }
    parts.push({ key: `q-${start}`, text: quoted, quoted: true })
    lastIndex = start + quoted.length
  }
  if (lastIndex < text.length) {
    parts.push({ key: `t-${lastIndex}`, text: text.slice(lastIndex), quoted: false })
  }
  if (parts.length === 0) return text

  return parts.map((part) =>
    part.quoted ? (
      <mark key={part.key} className="rounded-sm bg-yellow-400/40 px-0.5 text-yellow-50">
        {part.text}
      </mark>
    ) : (
      <span key={part.key}>{part.text}</span>
    ),
  )
}

const translateInChunks = async (source: string) => {
  const value = (source || '').trim()
  if (!value) return ''

  const MAX_CHUNK = 1800
  const blocks = value
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean)

  const chunks: string[] = []
  let current = ''
  for (const block of blocks) {
    if (!current) {
      current = block
      continue
    }
    const next = `${current}\n\n${block}`
    if (next.length <= MAX_CHUNK) {
      current = next
    } else {
      chunks.push(current)
      current = block
    }
  }
  if (current) chunks.push(current)
  if (chunks.length === 0) chunks.push(value.slice(0, MAX_CHUNK))

  const out: string[] = []
  for (const chunk of chunks) {
    const translated = await translate(chunk, { to: 'vi' })
    out.push((translated || '').trim())
  }
  return out.join('\n\n').trim()
}

export default function GrokScreen() {
  const role = useAuth((state) => state.role)
  const canUseWorkflow = role === 'user-vip' || role === 'admin'

  const [status, setStatus] = useState('Đợi dữ liệu từ ChatGPT hoặc workflow Grok.')
  const [lastPrompt, setLastPrompt] = useState('')
  const [originalLastPrompt, setOriginalLastPrompt] = useState('')
  const [isContentTranslated, setIsContentTranslated] = useState(false)
  const [isTranslating, setIsTranslating] = useState(false)
  const [lastImageDataUrl, setLastImageDataUrl] = useState('')
  const [isPushingToGrok, setIsPushingToGrok] = useState(false)

  const [isGrokWorkflowRunning, setIsGrokWorkflowRunning] = useState(false)
  const [isGrokWorkflowStopping, setIsGrokWorkflowStopping] = useState(false)
  const [grokWorkflowStatus, setGrokWorkflowStatus] = useState('')

  const grokWorkflowStopRef = useRef(false)
  const workflowCancelledRemotelyRef = useRef(false)
  const runningGrokWorkflowRunIdRef = useRef('')
  const isGrokWorkflowRunningRef = useRef(false)
  const lockedGrokTabIdRef = useRef(0)
  const grokPipelineVideoShortIdRef = useRef('')
  const grokCapturedVideoUrlsRef = useRef<string[]>([])
  const grokVideoBaselineRef = useRef<GrokMediaBaseline>({
    videoUrls: [],
    postUrls: [],
    videoCards: [],
    postCards: [],
    visibleVideoCount: 0,
    submittedAt: 0,
  })
  const grokRunPairIndexRef = useRef<number | null>(null)
  const grokWorkspaceRootRef = useRef<FileSystemDirectoryHandle | null>(null)
  const pendingGrokRunsRef = useRef<Array<{ runId: string; workflowId: string }>>([])

  const enqueueGrokWorkflowRun = (run: { _id: string; workflowId: string }) => {
    const runId = (run._id || '').trim()
    const workflowId = (run.workflowId || '').trim()
    if (!runId || !workflowId) return
    if (runningGrokWorkflowRunIdRef.current === runId) return

    if (isGrokWorkflowRunningRef.current) {
      const exists = pendingGrokRunsRef.current.some((item) => item.runId === runId)
      if (!exists) {
        pendingGrokRunsRef.current.push({ runId, workflowId })
        setGrokWorkflowStatus(`Đã xếp hàng Grok (${pendingGrokRunsRef.current.length} chờ)…`)
      }
      return
    }

    setGrokWorkflowStatus(`SSE: chạy workflow Grok ${runId}`)
    void runGrokWorkflow({ runId, workflowId, source: 'sse' })
  }

  const drainGrokWorkflowQueue = () => {
    if (isGrokWorkflowRunningRef.current || grokWorkflowStopRef.current) return
    const next = pendingGrokRunsRef.current.shift()
    if (!next) return
    setGrokWorkflowStatus(`SSE: chạy workflow Grok ${next.runId} (hàng đợi)…`)
    void runGrokWorkflow({ runId: next.runId, workflowId: next.workflowId, source: 'sse' })
  }

  const statusLower = status.toLowerCase()
  const statusTone = statusLower.includes('không thể') || statusLower.includes('không tìm thấy') || statusLower.includes('thất bại') || statusLower.includes('lỗi')
    ? 'error'
    : statusLower.includes('đang ')
      ? 'loading'
      : statusLower.includes('đã ')
        ? 'success'
        : 'info'

  const { data: grokWorkflowSteps = [], isLoading: isLoadingGrokWorkflowSteps } = useQuery<GrokProcessStep[]>({
    queryKey: ['grok-workflow-steps'],
    queryFn: async () => {
      const workflows = await getUserWorkflows({ platform: 'grok' })
      const target = workflows[0] || null
      if (!target?._id) return []
      const detail = await getUserWorkflowDetail(target._id)
      return (detail.steps || [])
        .slice()
        .sort((a, b) => (a.stepNo || 0) - (b.stepNo || 0))
        .map((step) => ({
          id: `grok-step-${step.stepNo}`,
          label: (step.title || '').trim() || `Bước ${step.stepNo}`,
          workflowId: target._id,
          workflowPlatform: (target.platform || 'grok').trim().toLowerCase(),
          backendStepId: (step._id || '').trim(),
          stepNo: Number(step.stepNo) || 0,
          actionType: (step.actionType || 'custom').trim(),
          inputSchema: (step.inputSchema || {}) as Record<string, unknown>,
        }))
        .filter((step) => step.backendStepId && step.workflowId)
    },
    staleTime: 60_000,
    enabled: canUseWorkflow,
  })

  const pushToGrokTab = async (
    prompt: string,
    imageDataUrl: string,
    options?: { part?: 1 | 2; single?: boolean; fromRetry?: boolean; submit?: boolean },
  ) => {
    const trimmedPrompt = withGrokVideoPromptSuffix(prompt)
    if (!trimmedPrompt && !imageDataUrl) {
      setStatus('Không có nội dung để điền vào Grok.')
      return false
    }

    const isSingle = options?.single === true
    const part = options?.part === 2 ? 2 : 1
    const assetLabel = isSingle ? 'ảnh + VIDEO đơn' : `ảnh ${part} + VIDEO ${part}`

    setStatus(options?.fromRetry ? 'Đang đẩy lại nội dung lên Grok...' : 'Đang mở Grok và điền nội dung...')

    const target = await pickGrokTab(true)
    if (!target?.id) {
      setStatus('Không thể mở tab Grok.')
      return false
    }
    lockedGrokTabIdRef.current = target.id

    try {
      const injected = await fillGrokFromVideoShortPair(target.id, trimmedPrompt, imageDataUrl, {
        submit: options?.submit !== false,
      })
      const submitted = options?.submit !== false
      setStatus(
        injected.foundInput
          ? injected.wroteText
            ? imageDataUrl
              ? submitted
                ? options?.fromRetry
                  ? `Đã đẩy lại ${assetLabel} và Enter trên Grok.`
                  : `Đã paste ${assetLabel} và Enter trên Grok.`
                : options?.fromRetry
                  ? `Đã đẩy lại ${assetLabel} (chưa Enter).`
                  : `Đã paste ${assetLabel} (chưa Enter).`
              : submitted
                ? 'Đã điền prompt và Enter trên Grok.'
                : 'Đã điền prompt (chưa Enter).'
            : 'Đã paste ảnh; text có thể chưa xác nhận (Grok hay re-render).'
          : 'Không tìm thấy ô nhập của Grok.',
      )
      return Boolean(injected.foundInput)
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Lỗi điền Grok'
      setStatus(msg)
      return false
    }
  }

  const resolveVideoShortIdForGrok = async (workflowRunId: string): Promise<string> => {
    const cached = grokPipelineVideoShortIdRef.current.trim()
    if (cached) return cached

    if (workflowRunId) {
      try {
        const run = await getWorkflowRunById(workflowRunId)
        const payload = (run.payload || {}) as Record<string, unknown>
        const fromPayload = String(payload.videoShortId || '').trim()
        if (fromPayload) {
          grokPipelineVideoShortIdRef.current = fromPayload
          return fromPayload
        }
      } catch {
        /* ignore */
      }
    }

    try {
      const latest = await getLatestGrokReadyVideoShort({ maxAgeMs: 3_600_000 })
      const fromLatest = (latest._id || '').trim()
      if (fromLatest) {
        grokPipelineVideoShortIdRef.current = fromLatest
        return fromLatest
      }
    } catch {
      /* ignore */
    }

    return ''
  }

  const loadVideoShortPair = async (videoShortId: string, index: number) => {
    const story = await getVideoShortById(videoShortId)
    const prompts = (story.videoPrompts || []).map((s) => s.trim()).filter(Boolean)
    const images = (story.imageUrls || []).map((s) => s.trim()).filter(Boolean)
    const prompt = prompts[index] || prompts[0] || ''
    const imageUrl = images[index] || images[0] || ''
    if (!prompt) throw new Error('Video ngắn không có videoPrompt — chạy workflow ChatGPT trước.')
    if (!imageUrl) throw new Error('Video ngắn không có imageUrl — chạy bước tạo ảnh ChatGPT trước.')
    return { story, prompt, imageUrl }
  }

  const executeGrokWorkflowStep = async (step: GrokProcessStep) => {
    if (grokWorkflowStopRef.current) throw new Error('Workflow đã dừng.')

    const tabId = lockedGrokTabIdRef.current
    if (!tabId) throw new Error('Chưa khóa tab Grok.')

    const videoShortId = await resolveVideoShortIdForGrok(runningGrokWorkflowRunIdRef.current)
    if (!videoShortId) {
      throw new Error(
        'Không tìm thấy video ngắn có ảnh + videoPrompt trong 1 giờ gần đây — chạy workflow ChatGPT trước.',
      )
    }

    const pairIndex = grokRunPairIndexRef.current ?? readGrokPairIndex(step.inputSchema)

    if (isGrokFillFromVideoShortStep(step)) {
      const { prompt, imageUrl } = await loadVideoShortPair(videoShortId, pairIndex)
      setLastPrompt(prompt)
      setLastImageDataUrl(imageUrl)
      setGrokWorkflowStatus(`${step.label}: điền ảnh + VIDEO ${pairIndex + 1} và Enter…`)
      const filled = await fillGrokFromVideoShortPair(
        tabId,
        withGrokVideoPromptSuffix(prompt),
        imageUrl,
        { submit: true },
      )
      grokVideoBaselineRef.current = {
        ...filled.videoBaseline,
        submittedAt: filled.submittedAt || filled.videoBaseline.submittedAt || Date.now(),
        submittedImageUrl: filled.submittedImageUrl || imageUrl,
      }
      return {
        filled: true,
        pairIndex,
        imageUrl,
        promptLength: prompt.length,
        baselineVideoCount: filled.videoBaseline.videoUrls.length,
        baselinePostCount: filled.videoBaseline.postUrls.length,
        submittedAt: filled.submittedAt,
      }
    }

    if (isGrokCaptureVideoLinkStep(step)) {
      const timeoutMs = readGrokTimeoutMs(step.inputSchema)
      let root = grokWorkspaceRootRef.current
      if (!root) {
        root = await resolveWritableContentRootDirectory({ allowPicker: false, allowRequest: true })
        if (root) grokWorkspaceRootRef.current = root
      }
      if (!root) {
        throw new Error(
          'Chưa có quyền ghi thư mục workspace. Vào Hồ sơ → Chọn thư mục gốc (hoặc Khôi phục quyền), rồi chạy lại Grok.',
        )
      }

      const videoShortForFolder = await getVideoShortById(videoShortId)
      const folderSegment = sanitizeWorkspaceFolderSegment(
        (videoShortForFolder.name || '').trim(),
        `story-${videoShortId.replace(/[^a-zA-Z0-9]/g, '').slice(-12) || 'id'}`,
      )
      const videoShortsSeg = await getVideoShortsFolderSegmentFromStorage(
        (globalThis as { chrome?: { storage?: { local?: Parameters<typeof getVideoShortsFolderSegmentFromStorage>[0] } } })
          .chrome?.storage?.local,
      )
      const dirs = await ensureVideoShortWorkspaceLayout(root, videoShortsSeg, folderSegment)
      const filename = `video-${pairIndex + 1}.mp4`
      const relativePath = `${videoShortsSeg}/${folderSegment}/videos/${filename}`

      setGrokWorkflowStatus(
        `${step.label}: chờ video mới (so khớp ảnh nguồn, tối đa ${Math.round(timeoutMs / 1000)}s)…`,
      )
      const { grokUrl, localPath, byteLength } = await captureAndSaveGrokVideoLocally(
        tabId,
        timeoutMs,
        { dirHandle: dirs.videosDir, filename, relativePath },
        { mediaBaseline: grokVideoBaselineRef.current },
      )
      if (!grokUrl || !localPath) {
        throw new Error('Hết thời gian chờ — chưa tải được video Grok.')
      }

      grokVideoBaselineRef.current = mergeGrokMediaBaseline(grokVideoBaselineRef.current, grokUrl)

      const story = await getVideoShortById(videoShortId)
      const merged = [...(story.videoStorageAddresses || [])]
      while (merged.length <= pairIndex) merged.push('')
      merged[pairIndex] = localPath
      await patchVideoShort(videoShortId, { videoStorageAddresses: merged })
      grokCapturedVideoUrlsRef.current = merged

      const sizeMb = byteLength > 0 ? ` (${(byteLength / (1024 * 1024)).toFixed(1)} MB)` : ''
      setGrokWorkflowStatus(`${step.label}: đã lưu ${relativePath}${sizeMb}.`)
      return { captured: true, grokUrl, localPath, relativePath, byteLength, videoStorageAddresses: merged }
    }

    throw new Error(`Bước Grok chưa hỗ trợ: ${step.actionType}`)
  }

  const stopGrokWorkflow = () => {
    if (!isGrokWorkflowRunningRef.current || grokWorkflowStopRef.current) return
    grokWorkflowStopRef.current = true
    setIsGrokWorkflowStopping(true)
    setGrokWorkflowStatus('Đang dừng workflow sau bước hiện tại…')
  }

  const stopGrokWorkflowRunFromWeb = () => {
    if (!isGrokWorkflowRunningRef.current || grokWorkflowStopRef.current) return
    workflowCancelledRemotelyRef.current = true
    grokWorkflowStopRef.current = true
    setIsGrokWorkflowStopping(true)
    setGrokWorkflowStatus('Đã hủy từ web — dừng sau bước hiện tại…')
  }

  const runGrokWorkflow = async (options?: { runId?: string; workflowId?: string; source?: string }) => {
    if (!canUseWorkflow) {
      setGrokWorkflowStatus('Workflow Grok chỉ dành cho VIP hoặc admin.')
      return
    }
    if (!grokWorkflowSteps.length || isGrokWorkflowRunning) return

    const first = grokWorkflowSteps[0]
    if (!first?.workflowId) {
      setGrokWorkflowStatus('Chưa có workflow Grok trên backend.')
      return
    }
    if (options?.workflowId && options.workflowId !== first.workflowId) {
      setGrokWorkflowStatus('Workflow Grok không khớp dữ liệu đang tải.')
      return
    }

    isGrokWorkflowRunningRef.current = true
    setIsGrokWorkflowRunning(true)
    setIsGrokWorkflowStopping(false)
    grokWorkflowStopRef.current = false
    workflowCancelledRemotelyRef.current = false
    grokCapturedVideoUrlsRef.current = []
    grokVideoBaselineRef.current = {
      videoUrls: [],
      postUrls: [],
      videoCards: [],
      postCards: [],
      visibleVideoCount: 0,
      submittedAt: 0,
    }
    grokRunPairIndexRef.current = null

    let workflowRunId = options?.runId || ''
    runningGrokWorkflowRunIdRef.current = workflowRunId
    let mwOutcome: 'completed' | 'failed' | 'cancelled' | null = null
    let mwErrorMessage = ''

    try {
      grokWorkspaceRootRef.current = null
      grokPipelineVideoShortIdRef.current = ''

      if (grokWorkflowSteps.some(isGrokCaptureVideoLinkStep)) {
        const fromUserClick = options?.source !== 'sse'
        setGrokWorkflowStatus(
          fromUserClick ? 'Chọn / khôi phục quyền thư mục workspace…' : 'Khôi phục quyền thư mục workspace…',
        )
        const root = await resolveWritableContentRootDirectory({
          allowPicker: fromUserClick,
          allowRequest: true,
        })
        if (!root) {
          setGrokWorkflowStatus(
            fromUserClick
              ? 'Cần chọn thư mục workspace (Hồ sơ → Cấu hình) để lưu video Grok.'
              : 'Chưa có quyền workspace. Mở extension → Hồ sơ → chọn thư mục gốc, rồi chạy lại từ web.',
          )
          return
        }
        grokWorkspaceRootRef.current = root
      }

      const grokTab = await pickGrokTab(true)
      lockedGrokTabIdRef.current = grokTab?.id || 0
      if (!lockedGrokTabIdRef.current) {
        setGrokWorkflowStatus('Không thể mở tab Grok.')
        return
      }

      if (!workflowRunId) {
        setGrokWorkflowStatus(`Tạo workflow run (${grokWorkflowSteps.length} bước)…`)
        const run = await createWorkflowRun({
          workflowId: first.workflowId,
          payload: { source: options?.source || 'grok_screen', totalSteps: grokWorkflowSteps.length },
        })
        workflowRunId = run._id
        runningGrokWorkflowRunIdRef.current = workflowRunId
      } else {
        try {
          const existingRun = await getWorkflowRunById(workflowRunId)
          const payload = (existingRun.payload || {}) as Record<string, unknown>
          const videoShortId = String(payload.videoShortId || '').trim()
          if (videoShortId) {
            grokPipelineVideoShortIdRef.current = videoShortId
            try {
              const story = await getVideoShortById(videoShortId)
              grokCapturedVideoUrlsRef.current = [...(story.videoStorageAddresses || [])]
            } catch {
              grokCapturedVideoUrlsRef.current = []
            }
          }
          const runPairIndex = readGrokRunPairIndex(payload)
          if (runPairIndex !== null) grokRunPairIndexRef.current = runPairIndex
        } catch {
          /* ignore */
        }
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

      for (let index = 0; index < grokWorkflowSteps.length; index += 1) {
        if (grokWorkflowStopRef.current) {
          mwOutcome = 'cancelled'
          break
        }

        const step = grokWorkflowSteps[index]
        const stepNo = step.stepNo || index + 1
        const progress = Math.round((index / grokWorkflowSteps.length) * 100)

        await updateWorkflowRun(workflowRunId, {
          status: 'running',
          currentStepNo: stepNo,
          progress,
        })

        setGrokWorkflowStatus(`Workflow: ${step.label} (${index + 1}/${grokWorkflowSteps.length})`)

        const stepRun = await createStepRun({
          workflowRunId,
          workflowId: step.workflowId,
          stepId: step.backendStepId,
          stepNo,
          stepTitle: step.label,
          status: 'running',
          input: { actionType: step.actionType, inputSchema: step.inputSchema || {} },
        })

        try {
          const output = await executeGrokWorkflowStep(step)
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
      }

      if (grokWorkflowStopRef.current) {
        mwOutcome = 'cancelled'
      } else {
        await updateWorkflowRun(workflowRunId, {
          status: 'completed',
          progress: 100,
          currentStepNo: grokWorkflowSteps[grokWorkflowSteps.length - 1]?.stepNo || grokWorkflowSteps.length,
          result: {
            completedSteps: grokWorkflowSteps.length,
            videoStorageAddresses: grokCapturedVideoUrlsRef.current,
          },
          finishedAt: new Date().toISOString(),
        })
        setGrokWorkflowStatus(`Hoàn tất ${grokWorkflowSteps.length} bước Grok.`)
        mwOutcome = 'completed'
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Workflow lỗi'
      if (grokWorkflowStopRef.current) {
        mwOutcome = 'cancelled'
      } else {
        mwOutcome = 'failed'
        mwErrorMessage = msg
        setGrokWorkflowStatus(`Lỗi: ${msg}`)
      }
    } finally {
      if (workflowRunId && mwOutcome && !workflowCancelledRemotelyRef.current) {
        try {
          await finalizeMultiWorkflowJobAfterWorkflowRun(workflowRunId, mwOutcome, {
            videoShortId: grokPipelineVideoShortIdRef.current.trim() || undefined,
            errorMessage: mwErrorMessage,
            result: {
              videoStorageAddresses: grokCapturedVideoUrlsRef.current,
            },
          })
        } catch {
          /* ignore */
        }
      }
      workflowCancelledRemotelyRef.current = false
      grokWorkflowStopRef.current = false
      lockedGrokTabIdRef.current = 0
      runningGrokWorkflowRunIdRef.current = ''
      grokPipelineVideoShortIdRef.current = ''
      grokCapturedVideoUrlsRef.current = []
      grokRunPairIndexRef.current = null
      grokWorkspaceRootRef.current = null
      isGrokWorkflowRunningRef.current = false
      setIsGrokWorkflowRunning(false)
      setIsGrokWorkflowStopping(false)
      drainGrokWorkflowQueue()
    }
  }

  useEffect(() => {
    const onFillFromChatgpt = async (event: Event) => {
      const custom = event as CustomEvent<{
        prompt?: string
        imageDataUrl?: string
        part?: 1 | 2
        single?: boolean
      }>
      const prompt = custom.detail?.prompt?.trim() || ''
      const imageDataUrl = custom.detail?.imageDataUrl || ''
      const isSingle = custom.detail?.single === true
      const part = custom.detail?.part === 2 ? 2 : 1
      if (!prompt && !imageDataUrl) {
        setStatus('Không có nội dung để điền vào Grok.')
        return
      }

      setLastPrompt(prompt)
      setOriginalLastPrompt('')
      setIsContentTranslated(false)
      setLastImageDataUrl(imageDataUrl)

      await pushToGrokTab(prompt, imageDataUrl, { part, single: isSingle, submit: false })
    }

    window.addEventListener('fill-grok-from-chatgpt-video1-image', onFillFromChatgpt as EventListener)
    return () => window.removeEventListener('fill-grok-from-chatgpt-video1-image', onFillFromChatgpt as EventListener)
  }, [])

  useEffect(() => {
    if (!canUseWorkflow || !grokWorkflowSteps.length) return
    const eventSource = createWorkflowRunEventSource()
    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(String(event.data || '{}')) as WorkflowRunStreamEvent
        const cancelledRun = getCancelledWorkflowRunFromStream(payload)
        if (
          cancelledRun &&
          shouldStopLocalWorkflowForCancelledRun(cancelledRun._id, runningGrokWorkflowRunIdRef.current)
        ) {
          stopGrokWorkflowRunFromWeb()
          return
        }
        if (payload?.type !== 'workflow_run_created') return
        const run = payload.run
        if (!run?._id || !run?.workflowId) return
        if (!shouldAcceptWorkflowRunFromStream(run, grokWorkflowSteps[0]?.workflowId || '')) return
        enqueueGrokWorkflowRun(run)
      } catch {
        /* ignore */
      }
    }
    eventSource.onerror = () => {}
    return () => eventSource.close()
  }, [canUseWorkflow, grokWorkflowSteps])

  const retryPushToGrok = async () => {
    if (isPushingToGrok) return
    const prompt = lastPrompt.trim()
    const imageDataUrl = lastImageDataUrl || ''
    if (!prompt && !imageDataUrl) {
      setStatus('Chưa có prompt hoặc ảnh để đẩy lại.')
      return
    }
    setIsPushingToGrok(true)
    try {
      await pushToGrokTab(prompt, imageDataUrl, { fromRetry: true, submit: false })
    } finally {
      setIsPushingToGrok(false)
    }
  }

  const translateLastPrompt = async () => {
    if (isContentTranslated) {
      setLastPrompt(originalLastPrompt)
      setIsContentTranslated(false)
      setStatus('Đã khôi phục nội dung gốc.')
      return
    }

    const source = lastPrompt.trim()
    if (!source || isTranslating) return

    if (!originalLastPrompt.trim()) {
      setOriginalLastPrompt(source)
    }

    setIsTranslating(true)
    setStatus('Đang dịch nội dung sang tiếng Việt...')
    try {
      const translated = await translateInChunks(source)
      if (!translated) {
        setStatus('Không nhận được bản dịch.')
        return
      }
      setLastPrompt(translated)
      setIsContentTranslated(true)
      setStatus('Đã dịch nội dung gần nhất sang tiếng Việt.')
    } catch {
      setStatus('Dịch nội dung thất bại. Hãy thử lại.')
    } finally {
      setIsTranslating(false)
    }
  }

  return (
    <section className="glass-panel flex h-full min-h-0 flex-col rounded-3xl p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-white">Grok</h2>
        {canUseWorkflow ? (
          <div className="flex shrink-0 items-center gap-2">
            {isGrokWorkflowRunning ? (
              <button
                type="button"
                onClick={stopGrokWorkflow}
                disabled={isGrokWorkflowStopping}
                className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-rose-500/30 bg-rose-500/15 text-rose-100 transition hover:bg-rose-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                title={isGrokWorkflowStopping ? 'Đang dừng…' : 'Dừng workflow'}
                aria-label={isGrokWorkflowStopping ? 'Đang dừng workflow' : 'Dừng workflow'}
              >
                <FiSquare className="h-3.5 w-3.5" aria-hidden />
              </button>
            ) : (
              <button
                type="button"
                disabled={!grokWorkflowSteps.length || isLoadingGrokWorkflowSteps}
                onClick={() => void runGrokWorkflow()}
                className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-violet-500/25 text-violet-100 transition hover:bg-violet-500/35 disabled:cursor-not-allowed disabled:opacity-40"
                title="Chạy workflow Grok"
                aria-label="Chạy workflow Grok"
              >
                <FiPlay className="h-3.5 w-3.5" aria-hidden />
              </button>
            )}
          </div>
        ) : null}
      </div>
      {canUseWorkflow && grokWorkflowStatus ? (
        <p className="mt-1 text-[10px] text-violet-100/90">{grokWorkflowStatus}</p>
      ) : null}

      <p
        className={`mt-2 inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-[11px] ${
          statusTone === 'success'
            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
            : statusTone === 'error'
              ? 'border-rose-500/30 bg-rose-500/10 text-rose-100'
              : statusTone === 'loading'
                ? 'border-amber-500/30 bg-amber-500/10 text-amber-100'
                : 'border-white/10 bg-black/40 text-slate-300'
        }`}
      >
        {statusTone === 'success' ? (
          <FiCheck className="h-3.5 w-3.5" />
        ) : statusTone === 'error' ? (
          <FiAlertTriangle className="h-3.5 w-3.5" />
        ) : statusTone === 'loading' ? (
          <FiImage className="h-3.5 w-3.5 animate-pulse" />
        ) : (
          <FiInfo className="h-3.5 w-3.5" />
        )}
        {status}
      </p>

      <div className="mt-2 flex min-h-0 flex-1 flex-col rounded-xl border border-white/10 bg-slate-900/70 p-2">
        {lastImageDataUrl ? (
          <div className="mb-2 rounded-lg border border-white/10 bg-black/20 p-1.5">
            <p className="mb-1 text-[10px] text-slate-500">Ảnh gần nhất</p>
            <img src={lastImageDataUrl} alt="Ảnh gần nhất" className="max-h-36 w-full rounded-md object-contain" />
          </div>
        ) : null}
        <div className="flex shrink-0 items-center justify-between gap-2">
          <p className="text-[10px] text-slate-500">Nội dung gần nhất</p>
          <div className="inline-flex items-center gap-1">
            <button
              type="button"
              onClick={() => void retryPushToGrok()}
              disabled={(!lastPrompt.trim() && !lastImageDataUrl) || isPushingToGrok || isTranslating}
              title="Đẩy lại prompt + ảnh lên Grok"
              aria-label="Đẩy lại lên Grok"
              className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md bg-emerald-500/20 text-emerald-100 transition hover:bg-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <FiRefreshCw className={`h-3.5 w-3.5 ${isPushingToGrok ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => void translateLastPrompt()}
              disabled={!lastPrompt.trim() || isTranslating || isPushingToGrok}
              title={isContentTranslated ? 'Quay về nội dung gốc' : 'Dịch sang tiếng Việt'}
              aria-label={isContentTranslated ? 'Quay về nội dung gốc' : 'Dịch nội dung'}
              className="relative inline-flex cursor-pointer items-center rounded-md bg-violet-500/20 px-2 py-1 text-[10px] font-semibold text-violet-100 transition hover:bg-violet-500/30 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isTranslating ? (
                <span className="animate-pulse">…</span>
              ) : isContentTranslated ? (
                <FiRotateCcw className="h-3.5 w-3.5" />
              ) : (
                <FiGlobe className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>
        <div className="mt-1 min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap text-[11px] text-slate-200">
          {lastPrompt ? (
            <>
              {renderTextWithQuotedHighlights(lastPrompt)}
              <p className="mt-3 border-t border-white/10 pt-3 text-slate-300">{GROK_VIDEO_PROMPT_SUFFIX}</p>
            </>
          ) : (
            'Chưa có dữ liệu.'
          )}
        </div>
      </div>
    </section>
  )
}

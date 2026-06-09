import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { isAxiosError } from 'axios'
import {
  FiArrowLeft,
  FiCheck,
  FiExternalLink,
  FiFilm,
  FiFolder,
  FiImage,
  FiLink,
  FiTable,
  FiType,
  FiVideo,
} from 'react-icons/fi'
import EmptyState from '@/components/EmptyState'
import GgSheetPushButton from '@/components/GgSheetPushButton'
import GrokRunButton from '@/components/GrokRunButton'
import VideoShortVideoPlayer from '@/components/VideoShortVideoPlayer'
import { useWorkspaceRoot } from '@/hooks/useWorkspaceRoot'
import { buildGgSheetPushPayloadFromVideoShort, pushGgSheetContent } from '@/services/GgSheetService'
import { getVideoShortById, type VideoShortItem } from '@/services/VideoShortService'
import { createWorkflowRun, getExtensionPresence, getUserWorkflows } from '@/services/WorkflowService'
import {
  formatVideoShortDate,
  getPipelineSteps,
  getVideoShortStats,
  isGgSheetPushable,
  isGrokIncomplete,
  isGrokReady,
  pipelineProgress,
} from '@/utils/videoShortHelpers'

function Section({
  title,
  icon,
  count,
  children,
}: {
  title: string
  icon: React.ReactNode
  count?: number
  children: React.ReactNode
}) {
  return (
    <section className="surface-card overflow-hidden rounded-2xl">
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3 sm:px-5">
        <span className="text-violet-400">{icon}</span>
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        {count !== undefined ? (
          <span className="ml-auto rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-slate-400">{count}</span>
        ) : null}
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  )
}

function PipelineTimeline({ story, stats }: { story: VideoShortItem; stats: ReturnType<typeof getVideoShortStats> }) {
  const steps = getPipelineSteps(story, stats)
  const progress = pipelineProgress(story, stats)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-400">Tiến độ quy trình</span>
        <span className="font-medium text-white">{progress.percent}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/5">
        <div
          className="h-full rounded-full bg-linear-to-r from-violet-500 to-sky-400 transition-all"
          style={{ width: `${progress.percent}%` }}
        />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {steps.map((step) => (
          <div
            key={step.key}
            className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs ${
              step.done
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
                : 'border-white/10 bg-black/20 text-slate-500'
            }`}
          >
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                step.done ? 'bg-emerald-500 text-white' : 'bg-white/10'
              }`}
            >
              {step.done ? <FiCheck className="h-3 w-3" /> : null}
            </span>
            <span className="font-medium">{step.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function VideoShortDetailPage() {
  const { id = '' } = useParams()
  const queryClient = useQueryClient()
  const [contentTab, setContentTab] = useState<'short' | 'long'>('short')
  const [selectedImage, setSelectedImage] = useState(0)
  const [sheetMessage, setSheetMessage] = useState('')
  const [grokMessage, setGrokMessage] = useState('')
  const { workspaceRoot, workspaceLabel, pickingWorkspace, pickWorkspace } = useWorkspaceRoot()

  const storyQuery = useQuery({
    queryKey: ['video-shorts', 'detail', id],
    queryFn: () => getVideoShortById(id),
    enabled: Boolean(id.trim()),
    refetchInterval: 15_000,
  })

  const extensionPresenceQuery = useQuery({
    queryKey: ['extension-presence'],
    queryFn: getExtensionPresence,
    refetchInterval: 5000,
  })

  const grokWorkflowQuery = useQuery({
    queryKey: ['workflows', 'grok'],
    queryFn: () => getUserWorkflows({ platform: 'grok' }),
  })

  const extensionOnline = extensionPresenceQuery.data?.online === true
  const grokWorkflowId = grokWorkflowQuery.data?.[0]?._id || ''

  const story = storyQuery.data

  const grokMutation = useMutation({
    mutationFn: async (item: VideoShortItem) => {
      if (!grokWorkflowId) throw new Error('Chưa có workflow Grok trên hệ thống.')
      if (!extensionOnline) {
        throw new Error('Extension chưa online — mở extension tab Grok và đăng nhập.')
      }
      await createWorkflowRun({
        workflowId: grokWorkflowId,
        payload: {
          videoShortId: item._id,
          source: 'web_story_detail',
          trigger: 'web_console',
        },
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['video-shorts', 'detail', id] })
      void queryClient.invalidateQueries({ queryKey: ['video-shorts', 'my'] })
      setGrokMessage('Đã gửi lệnh Grok — extension xử lý trên tab Grok.')
    },
    onError: (error: unknown) => {
      if (isAxiosError(error) && error.response?.status === 503) {
        setGrokMessage('Extension chưa online — mở tab Grok trong extension.')
        return
      }
      setGrokMessage(error instanceof Error ? error.message : 'Không thể chạy Grok.')
    },
  })

  const sheetPushMutation = useMutation({
    mutationFn: async (item: VideoShortItem) => pushGgSheetContent(buildGgSheetPushPayloadFromVideoShort(item)),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['video-shorts', 'detail', id] })
      void queryClient.invalidateQueries({ queryKey: ['video-shorts', 'my'] })
      void queryClient.invalidateQueries({ queryKey: ['ggsheet', 'compare'] })
      setSheetMessage(
        result.targetRow
          ? `Đã đẩy lên GG Sheet — dòng ${result.targetRow}.`
          : 'Đã đẩy lên GG Sheet.',
      )
    },
    onError: (error: unknown) => {
      if (isAxiosError(error)) {
        const raw = String(error.response?.data?.message || '')
        if (raw.toLowerCase().includes('duplicate')) {
          setSheetMessage('Tiêu đề và nội dung ngắn đã tồn tại trên sheet.')
          return
        }
        if (raw.toLowerCase().includes('not configured') || raw.toLowerCase().includes('ggsheetpath')) {
          setSheetMessage('Chưa cấu hình GG Sheet — mở Cài đặt tại trang GG Sheet.')
          return
        }
        if (raw) {
          setSheetMessage(raw)
          return
        }
      }
      setSheetMessage(error instanceof Error ? error.message : 'Không thể đẩy GG Sheet.')
    },
  })

  useEffect(() => {
    if (!story) return
    const s = getVideoShortStats(story)
    if (!s.hasShortContent && s.hasLongContent) setContentTab('long')
    else if (s.hasShortContent) setContentTab('short')
  }, [story])

  if (!id.trim()) {
    return (
      <EmptyState title="Thiếu mã video ngắn" description="Quay lại danh sách video ngắn để chọn một video ngắn." />
    )
  }

  if (storyQuery.isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-white/5" />
        <div className="surface-card h-64 animate-pulse rounded-2xl" />
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="surface-card h-96 animate-pulse rounded-2xl lg:col-span-2" />
          <div className="surface-card h-96 animate-pulse rounded-2xl" />
        </div>
      </div>
    )
  }

  if (storyQuery.isError || !story) {
    return (
      <div className="space-y-4">
        <Link
          to="/video-shorts"
          className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"
        >
          <FiArrowLeft className="h-4 w-4" />
          Quay lại danh sách
        </Link>
        <EmptyState
          title="Không tìm thấy video ngắn"
          description="Video ngắn có thể đã bị xóa hoặc bạn không có quyền truy cập."
        />
      </div>
    )
  }

  const stats = getVideoShortStats(story)
  const images = (story.imageUrls || []).filter(Boolean)
  const videos = (story.videoStorageAddresses || []).filter(Boolean)
  const prompts = (story.videoPrompts || []).filter(Boolean)
  const heroImage = images[selectedImage] || stats.firstImage
  const canPushSheet = isGgSheetPushable(story)
  const sheetPushed = Boolean(story.ggsheetPush?.pushed)
  const canRunGrok = isGrokIncomplete(story, stats)
  const missingGrokPrereq = stats.videoCount === 0 && !isGrokReady(story, stats)

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Top bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          to="/video-shorts"
          className="inline-flex w-fit items-center gap-2 rounded-lg border border-white/10 px-3 py-1.5 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white"
        >
          <FiArrowLeft className="h-4 w-4" />
          Video ngắn
        </Link>
        <button
          type="button"
          onClick={() => void pickWorkspace()}
          disabled={pickingWorkspace}
          className="inline-flex items-center gap-2 rounded-xl border border-teal-500/30 bg-teal-500/10 px-3 py-2 text-xs text-teal-100 hover:bg-teal-500/20 disabled:opacity-50"
        >
          <FiFolder className="h-4 w-4" />
          {workspaceRoot
            ? `Thư mục: ${workspaceLabel || 'đã chọn'}`
            : pickingWorkspace
              ? 'Đang chọn…'
              : 'Chọn thư mục để xem video trên máy'}
        </button>
      </div>

      {/* Hero */}
      <div className="surface-card overflow-hidden rounded-2xl">
        <div className="grid lg:grid-cols-5">
          <div className="relative bg-black lg:col-span-2">
            {heroImage ? (
              <img src={heroImage} alt="" className="aspect-4/3 w-full object-cover lg:min-h-[280px] lg:h-full" />
            ) : (
              <div className="flex aspect-4/3 w-full flex-col items-center justify-center gap-2 text-slate-600 lg:min-h-[280px]">
                <FiImage className="h-12 w-12" />
                <span className="text-sm">Chưa có ảnh</span>
              </div>
            )}
            {images.length > 1 ? (
              <div className="absolute inset-x-0 bottom-0 flex gap-1 overflow-x-auto bg-linear-to-t from-black/90 to-transparent p-3 pt-8">
                {images.map((url, idx) => (
                  <button
                    key={url}
                    type="button"
                    onClick={() => setSelectedImage(idx)}
                    className={`h-12 w-12 shrink-0 overflow-hidden rounded-lg border-2 transition ${
                      selectedImage === idx ? 'border-violet-400' : 'border-transparent opacity-70 hover:opacity-100'
                    }`}
                  >
                    <img src={url} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="flex flex-col gap-4 p-5 lg:col-span-3 lg:p-6">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-violet-400">Video ngắn</p>
              <h1 className="mt-1 text-2xl font-semibold text-white">{story.name || 'Không tên'}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                <span>{formatVideoShortDate(story.createdAt)}</span>
                {story.usageCount != null ? (
                  <>
                    <span>·</span>
                    <span>Lượt dùng reel: {story.usageCount}</span>
                  </>
                ) : null}
              </div>
            </div>

            <PipelineTimeline story={story} stats={stats} />

            {story.sourceReelUrl ? (
              <a
                href={story.sourceReelUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-sky-500/25 bg-sky-500/10 px-3 py-2 text-xs text-sky-200 hover:bg-sky-500/20"
              >
                <FiLink className="h-3.5 w-3.5" />
                Mở reel nguồn
                <FiExternalLink className="h-3 w-3" />
              </a>
            ) : null}
          </div>
        </div>
      </div>

      {/* Main grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Videos — prominent */}
          {videos.length > 0 ? (
            <Section title="Video Grok" icon={<FiFilm className="h-4 w-4" />} count={videos.length}>
              <div className="space-y-5">
                {videos.map((entry, idx) => (
                  <div key={`${entry}-${idx}`}>
                    <p className="mb-2 text-xs font-medium text-slate-400">Video {idx + 1}</p>
                    <VideoShortVideoPlayer
                      entry={entry}
                      workspaceRoot={workspaceRoot}
                      onPickWorkspace={() => void pickWorkspace()}
                      pickingWorkspace={pickingWorkspace}
                    />
                  </div>
                ))}
              </div>
            </Section>
          ) : (
            <Section title="Video Grok" icon={<FiFilm className="h-4 w-4" />} count={0}>
              <div className="space-y-3">
                <p className="text-sm text-slate-500">Chưa có video — chạy quy trình Grok trên extension để tạo.</p>
                {canRunGrok ? (
                  <>
                    <GrokRunButton
                      disabled={grokMutation.isPending || !grokWorkflowId}
                      onClick={() => {
                        setGrokMessage('')
                        grokMutation.mutate(story)
                      }}
                    >
                      {grokMutation.isPending ? 'Đang gửi Grok…' : 'Chạy Grok'}
                    </GrokRunButton>
                    {!extensionOnline ? (
                      <p className="text-[11px] text-amber-300/90">
                        Extension đang offline — mở tab Grok trong extension trước khi chạy.
                      </p>
                    ) : null}
                  </>
                ) : null}
                {missingGrokPrereq ? (
                  <p className="text-[11px] text-slate-500">
                    Cần có ảnh và prompt video (bước ChatGPT) trước khi chạy Grok.
                  </p>
                ) : null}
                {grokMessage ? <p className="text-[11px] text-slate-300">{grokMessage}</p> : null}
              </div>
            </Section>
          )}

          {/* Images gallery */}
          {images.length > 0 ? (
            <Section title="Ảnh ChatGPT" icon={<FiImage className="h-4 w-4" />} count={images.length}>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {images.map((url, idx) => (
                  <a
                    key={url}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`group overflow-hidden rounded-xl border transition ${
                      selectedImage === idx ? 'border-violet-400/50' : 'border-white/10 hover:border-white/20'
                    }`}
                  >
                    <img
                      src={url}
                      alt=""
                      className="aspect-square w-full object-cover transition group-hover:scale-[1.02]"
                    />
                  </a>
                ))}
              </div>
            </Section>
          ) : null}

          {/* Content tabs */}
          {(stats.hasShortContent || stats.hasLongContent) ? (
            <Section title="Nội dung video ngắn" icon={<FiType className="h-4 w-4" />}>
              <div className="mb-3 flex gap-1 rounded-lg border border-white/10 bg-black/20 p-1">
                {stats.hasShortContent ? (
                  <button
                    type="button"
                    onClick={() => setContentTab('short')}
                    className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                      contentTab === 'short' ? 'bg-white/10 text-white' : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    Ngắn
                  </button>
                ) : null}
                {stats.hasLongContent ? (
                  <button
                    type="button"
                    onClick={() => setContentTab('long')}
                    className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                      contentTab === 'long' ? 'bg-white/10 text-white' : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    Dài
                  </button>
                ) : null}
              </div>
              <div className="max-h-[480px] overflow-y-auto rounded-xl border border-white/10 bg-black/20 p-4">
                <p className="text-sm leading-relaxed whitespace-pre-wrap text-slate-300">
                  {contentTab === 'long' ? story.longContent : story.shortContent}
                </p>
              </div>
            </Section>
          ) : null}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {prompts.length > 0 ? (
            <Section title="Prompt video" icon={<FiVideo className="h-4 w-4" />} count={prompts.length}>
              <div className="space-y-3">
                {prompts.map((prompt, index) => (
                  <div
                    key={`prompt-${index}`}
                    className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-3"
                  >
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-violet-300">
                      Prompt {index + 1}
                    </p>
                    <p className="max-h-48 overflow-y-auto text-xs leading-relaxed whitespace-pre-wrap text-slate-300">
                      {prompt}
                    </p>
                  </div>
                ))}
              </div>
            </Section>
          ) : null}

          <Section title="Thông tin" icon={<FiLink className="h-4 w-4" />}>
            <dl className="space-y-3 text-xs">
              <div>
                <dt className="text-slate-500">Nguồn reel</dt>
                <dd className="mt-0.5 break-all font-mono text-slate-300">{story.videoSourceId || '—'}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Chủ đề</dt>
                <dd className="mt-0.5 break-all font-mono text-slate-300">{story.videoShortTopicId || '—'}</dd>
              </div>
              {story.blogPostUrl ? (
                <div>
                  <dt className="text-slate-500">Bài blog</dt>
                  <dd className="mt-0.5">
                    <a
                      href={story.blogPostUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="break-all text-sky-300 hover:underline"
                    >
                      {story.blogPostUrl}
                    </a>
                  </dd>
                </div>
              ) : null}
              {story.fbReelUrl ? (
                <div>
                  <dt className="text-slate-500">Reel Facebook</dt>
                  <dd className="mt-0.5">
                    <a
                      href={story.fbReelUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="break-all text-sky-300 hover:underline"
                    >
                      {story.fbReelUrl}
                    </a>
                  </dd>
                </div>
              ) : null}
              <div>
                <dt className="text-slate-500">GG Sheet</dt>
                <dd className="mt-0.5 space-y-2">
                  {sheetPushed ? (
                    <span className="inline-flex items-center gap-1.5 text-emerald-300">
                      <FiTable className="h-3.5 w-3.5" />
                      Đã có trên sheet
                      {story.ggsheetPush?.targetRow ? ` · dòng ${story.ggsheetPush.targetRow}` : ''}
                    </span>
                  ) : (
                    <span className="text-slate-500">Chưa thấy trên sheet</span>
                  )}
                  {!sheetPushed ? (
                    <div className="space-y-2">
                      <GgSheetPushButton
                        className="w-full mt-2"
                        disabled={!canPushSheet || sheetPushMutation.isPending}
                        onClick={() => {
                          setSheetMessage('')
                          sheetPushMutation.mutate(story)
                        }}
                      >
                        {sheetPushMutation.isPending ? 'Đang đẩy…' : 'Đẩy GG Sheet'}
                      </GgSheetPushButton>
                      {!canPushSheet ? (
                        <p className="text-[11px] text-slate-500">
                          Cần có tiêu đề và nội dung ngắn hoặc dài trước khi đẩy.
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  {sheetMessage ? <p className="text-[11px] text-slate-300">{sheetMessage}</p> : null}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Cập nhật</dt>
                <dd className="mt-0.5 text-slate-300">{formatVideoShortDate(story.updatedAt)}</dd>
              </div>
            </dl>
          </Section>
        </div>
      </div>
    </div>
  )
}

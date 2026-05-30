import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
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
import StoryVideoPlayer from '@/components/StoryVideoPlayer'
import { useWorkspaceRoot } from '@/hooks/useWorkspaceRoot'
import { getStoryById, type StoryItem } from '@/services/StoryService'
import {
  formatStoryDate,
  getPipelineSteps,
  getStoryStats,
  pipelineProgress,
} from '@/utils/storyHelpers'

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

function PipelineTimeline({ story, stats }: { story: StoryItem; stats: ReturnType<typeof getStoryStats> }) {
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

export default function StoryDetailPage() {
  const { id = '' } = useParams()
  const [contentTab, setContentTab] = useState<'short' | 'long'>('short')
  const [selectedImage, setSelectedImage] = useState(0)
  const { workspaceRoot, workspaceLabel, pickingWorkspace, pickWorkspace } = useWorkspaceRoot()

  const storyQuery = useQuery({
    queryKey: ['stories', 'detail', id],
    queryFn: () => getStoryById(id),
    enabled: Boolean(id.trim()),
    refetchInterval: 15_000,
  })

  const story = storyQuery.data

  useEffect(() => {
    if (!story) return
    const s = getStoryStats(story)
    if (!s.hasShortContent && s.hasLongContent) setContentTab('long')
    else if (s.hasShortContent) setContentTab('short')
  }, [story])

  if (!id.trim()) {
    return (
      <EmptyState title="Thiếu mã câu chuyện" description="Quay lại danh sách câu chuyện để chọn một câu chuyện." />
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
          to="/stories"
          className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"
        >
          <FiArrowLeft className="h-4 w-4" />
          Quay lại danh sách
        </Link>
        <EmptyState
          title="Không tìm thấy câu chuyện"
          description="Câu chuyện có thể đã bị xóa hoặc bạn không có quyền truy cập."
        />
      </div>
    )
  }

  const stats = getStoryStats(story)
  const images = (story.imageUrls || []).filter(Boolean)
  const videos = (story.videoStorageAddresses || []).filter(Boolean)
  const prompts = (story.videoPrompts || []).filter(Boolean)
  const heroImage = images[selectedImage] || stats.firstImage

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Top bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          to="/stories"
          className="inline-flex w-fit items-center gap-2 rounded-lg border border-white/10 px-3 py-1.5 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white"
        >
          <FiArrowLeft className="h-4 w-4" />
          Câu chuyện
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
              <p className="text-[11px] font-medium uppercase tracking-wider text-violet-400">Câu chuyện</p>
              <h1 className="mt-1 text-2xl font-semibold text-white">{story.name || 'Không tên'}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                <span>{formatStoryDate(story.createdAt)}</span>
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
                    <StoryVideoPlayer
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
              <p className="text-sm text-slate-500">Chưa có video — chạy quy trình Grok để tạo.</p>
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
            <Section title="Nội dung câu chuyện" icon={<FiType className="h-4 w-4" />}>
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
                <dd className="mt-0.5 break-all font-mono text-slate-300">{story.storySourceId || '—'}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Chủ đề</dt>
                <dd className="mt-0.5 break-all font-mono text-slate-300">{story.topicId || '—'}</dd>
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
                <dd className="mt-0.5">
                  {story.ggsheetPush?.pushed ? (
                    <span className="inline-flex items-center gap-1.5 text-emerald-300">
                      <FiTable className="h-3.5 w-3.5" />
                      Đã có trên sheet
                      {story.ggsheetPush.targetRow ? ` · dòng ${story.ggsheetPush.targetRow}` : ''}
                    </span>
                  ) : (
                    <span className="text-slate-500">Chưa thấy trên sheet</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Cập nhật</dt>
                <dd className="mt-0.5 text-slate-300">{formatStoryDate(story.updatedAt)}</dd>
              </div>
            </dl>
          </Section>
        </div>
      </div>
    </div>
  )
}

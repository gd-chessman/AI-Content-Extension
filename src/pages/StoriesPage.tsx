import { useQuery } from '@tanstack/react-query'
import {
  FiChevronLeft,
  FiChevronRight,
  FiFilm,
  FiImage,
  FiSearch,
  FiTable,
  FiType,
  FiVideo,
} from 'react-icons/fi'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import EmptyState from '@/components/EmptyState'
import { getMyStories, type StoryItem } from '@/services/StoryService'
import {
  formatStoryDate,
  getStoryStats,
  pipelineProgress,
} from '@/utils/storyHelpers'

function StatPill({
  icon,
  label,
  active,
}: {
  icon: React.ReactNode
  label: string
  active: boolean
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium ${
        active ? 'bg-white/10 text-slate-200' : 'bg-black/20 text-slate-600'
      }`}
    >
      {icon}
      {label}
    </span>
  )
}

function StoryCard({ story }: { story: StoryItem }) {
  const stats = getStoryStats(story)
  const progress = pipelineProgress(story, stats)
  const excerpt = (story.shortContent || story.longContent || '').trim().slice(0, 120)

  return (
    <Link
      to={`/stories/${story._id}`}
      className="group surface-card flex h-full flex-col overflow-hidden rounded-2xl transition-all hover:border-violet-500/30 hover:shadow-lg hover:shadow-violet-950/20"
    >
      <div className="relative aspect-16/10 w-full overflow-hidden bg-black/40">
        {stats.firstImage ? (
          <img
            src={stats.firstImage}
            alt=""
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-slate-600">
            <FiImage className="h-8 w-8" />
            <span className="text-[11px]">Chưa có ảnh</span>
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/80 via-black/40 to-transparent px-3 pb-3 pt-8">
          <p className="line-clamp-2 text-sm font-semibold text-white">{story.name || 'Không tên'}</p>
        </div>
        {progress.percent === 100 ? (
          <span className="absolute right-2 top-2 rounded-full bg-emerald-500/90 px-2 py-0.5 text-[10px] font-semibold text-white">
            Hoàn tất
          </span>
        ) : (
          <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-slate-300 backdrop-blur-sm">
            {progress.percent}%
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-3">
        <div className="flex flex-wrap gap-1.5">
          <StatPill icon={<FiImage className="h-3 w-3" />} label={`${stats.imageCount} ảnh`} active={stats.imageCount > 0} />
          <StatPill icon={<FiVideo className="h-3 w-3" />} label={`${stats.promptCount} prompt`} active={stats.promptCount > 0} />
          <StatPill icon={<FiFilm className="h-3 w-3" />} label={`${stats.videoCount} video`} active={stats.videoCount > 0} />
          {stats.hasLongContent ? (
            <StatPill icon={<FiType className="h-3 w-3" />} label="Nội dung" active />
          ) : null}
          <StatPill
            icon={<FiTable className="h-3 w-3" />}
            label={story.ggsheetPush?.pushed ? 'GG Sheet ✓' : 'GG Sheet'}
            active={Boolean(story.ggsheetPush?.pushed)}
          />
        </div>

        {excerpt ? (
          <p className="line-clamp-2 text-xs leading-relaxed text-slate-400">
            {excerpt}
            {excerpt.length >= 120 ? '…' : ''}
          </p>
        ) : (
          <p className="text-xs italic text-slate-600">Chưa có nội dung tóm tắt.</p>
        )}

        <div className="mt-auto space-y-2">
          <div className="h-1 overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full rounded-full bg-linear-to-r from-violet-500 to-sky-400 transition-all"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
          <div className="flex items-center justify-between gap-2 text-[10px] text-slate-500">
            <span>{formatStoryDate(story.createdAt)}</span>
          </div>
        </div>
      </div>
    </Link>
  )
}

export default function StoriesPage() {
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const limit = 20

  const storiesQuery = useQuery({
    queryKey: ['stories', 'my', page, searchQuery],
    queryFn: () => getMyStories({ page, limit, q: searchQuery }),
    refetchInterval: 15_000,
  })

  const items = storiesQuery.data?.items || []
  const pagination = storiesQuery.data?.pagination

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault()
    setPage(1)
    setSearchQuery(searchInput.trim())
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Câu chuyện</h1>
        <p className="mt-1 text-sm text-slate-400">
          Danh sách câu chuyện từ quy trình — bấm thẻ để xem chi tiết.
        </p>
      </div>

      <form onSubmit={handleSearch} className="flex max-w-xl gap-2">
        <div className="relative min-w-0 flex-1">
          <FiSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Tìm theo tên…"
            className="w-full rounded-xl border border-white/10 bg-black/30 py-2.5 pl-9 pr-3 text-sm text-white outline-none focus:border-violet-400/40"
          />
        </div>
        <button
          type="submit"
          className="shrink-0 rounded-xl border border-violet-500/30 bg-violet-500/15 px-4 py-2 text-sm text-violet-100 hover:bg-violet-500/25"
        >
          Tìm
        </button>
      </form>

      {storiesQuery.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="surface-card animate-pulse overflow-hidden rounded-2xl">
              <div className="aspect-16/10 bg-white/5" />
              <div className="space-y-2 p-3">
                <div className="h-3 w-2/3 rounded bg-white/5" />
                <div className="h-2 w-full rounded bg-white/5" />
                <div className="h-1 w-full rounded bg-white/5" />
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title="Chưa có câu chuyện nào"
          description="Câu chuyện được tạo sau bước lưu ChatGPT trong quy trình đa bước hoặc extension."
        />
      ) : (
        <>
          <p className="text-xs text-slate-500">
            {pagination?.total ?? items.length} câu chuyện
            {searchQuery ? ` · tìm: "${searchQuery}"` : ''}
          </p>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((story) => (
              <StoryCard key={story._id} story={story} />
            ))}
          </div>

          {pagination && pagination.totalPages > 1 ? (
            <div className="flex items-center justify-between gap-3 pt-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300 disabled:opacity-40"
              >
                <FiChevronLeft className="h-4 w-4" />
                Trước
              </button>
              <span className="text-xs text-slate-500">
                Trang {pagination.page} / {pagination.totalPages}
              </span>
              <button
                type="button"
                disabled={page >= pagination.totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300 disabled:opacity-40"
              >
                Sau
                <FiChevronRight className="h-4 w-4" />
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { SiOpenai } from 'react-icons/si'
import {
  FiCheckCircle,
  FiCheckSquare,
  FiCalendar,
  FiChevronLeft,
  FiChevronRight,
  FiClock,
  FiExternalLink,
  FiFilm,
  FiImage,
  FiLayers,
  FiPlay,
  FiSearch,
  FiSquare,
  FiTable,
  FiType,
  FiUpload,
  FiVideo,
  FiX,
} from 'react-icons/fi'
import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { isAxiosError } from 'axios'
import EmptyState from '@/components/EmptyState'
import GgSheetPushButton from '@/components/GgSheetPushButton'
import { useVideoShortMarqueeSelection } from '@/hooks/useVideoShortMarqueeSelection'
import { buildGgSheetPushPayloadFromVideoShort, pushGgSheetContent } from '@/services/GgSheetService'
import { getMyVideoShorts, type VideoShortItem } from '@/services/VideoShortService'
import {
  createWorkflowRun,
  getExtensionPresence,
  getUserWorkflows,
} from '@/services/WorkflowService'
import {
  formatVideoShortDate,
  getVideoShortListStatusLabel,
  getVideoShortStats,
  isGgSheetPushable,
  isGrokIncomplete,
  pipelineProgress,
  STORY_LIST_STATUS_FILTERS,
  type VideoShortListStatusFilter,
} from '@/utils/videoShortHelpers'
import {
  matchVideoShortDatePreset,
  resolveVideoShortDatePresetRange,
  VIDEO_SHORT_DATE_PRESETS,
  type VideoShortDatePresetId,
} from '@/utils/videoShortDatePresets'

const STORY_STATUS_ICONS: Record<
  VideoShortListStatusFilter,
  React.ComponentType<{ className?: string }>
> = {
  '': FiLayers,
  in_progress: FiClock,
  complete: FiCheckCircle,
  missing_chatgpt: SiOpenai,
  missing_videos: FiFilm,
  ggsheet_pending: FiUpload,
  ggsheet_pushed: FiTable,
}

const STORY_STATUS_ICON_COLORS: Record<VideoShortListStatusFilter, string> = {
  '': 'text-slate-400',
  in_progress: 'text-amber-400',
  complete: 'text-emerald-400',
  missing_chatgpt: 'text-emerald-400',
  missing_videos: 'text-orange-400',
  ggsheet_pending: 'text-rose-400',
  ggsheet_pushed: 'text-teal-400',
}

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

function VideoShortCard({
  story,
  selected,
  selectionMode,
  registerCard,
  onToggleSelect,
}: {
  story: VideoShortItem
  selected: boolean
  selectionMode: boolean
  registerCard: (id: string, el: HTMLElement | null) => void
  onToggleSelect: (id: string) => void
}) {
  const stats = getVideoShortStats(story)
  const progress = pipelineProgress(story, stats)
  const excerpt = (story.shortContent || story.longContent || '').trim().slice(0, 120)

  return (
    <article
      ref={(el) => registerCard(story._id, el)}
      data-story-id={story._id}
      className={`group surface-card relative flex h-full flex-col overflow-hidden rounded-2xl transition-all ${
        selectionMode ? 'cursor-crosshair' : ''
      } ${
        selected
          ? 'border-blue-300/50 ring-2 ring-blue-300/35'
          : selectionMode
            ? 'hover:border-blue-300/30 hover:shadow-lg hover:shadow-blue-950/20'
            : 'hover:border-blue-300/20 hover:shadow-lg hover:shadow-blue-950/20'
      }`}
    >
      <button
        type="button"
        data-no-marquee
        onClick={(e) => {
          e.stopPropagation()
          onToggleSelect(story._id)
        }}
        className={`absolute left-2 top-2 z-20 flex h-7 w-7 items-center justify-center rounded-lg border transition-all ${
          selected
            ? 'border-blue-300 bg-blue-500 text-white shadow-md shadow-blue-950/40'
            : selectionMode
              ? 'border-white/25 bg-black/70 text-slate-300 hover:border-blue-300/50 hover:bg-black/90'
              : 'border-white/20 bg-black/60 text-slate-400 opacity-0 group-hover:opacity-100 hover:border-blue-300/40'
        } ${selected || selectionMode ? 'opacity-100' : ''}`}
        aria-label={selected ? `Bỏ chọn ${story.name || 'video ngắn'}` : `Chọn ${story.name || 'video ngắn'}`}
        aria-pressed={selected}
      >
        {selected ? <FiCheckSquare className="h-4 w-4" /> : <FiSquare className="h-4 w-4" />}
      </button>

      <div className="flex h-full flex-col overflow-hidden">
        <div className="relative aspect-16/10 w-full overflow-hidden bg-black/40">
          {stats.firstImage ? (
            <img
              src={stats.firstImage}
              alt=""
              className={`h-full w-full object-cover transition-transform duration-300 ${
                selectionMode ? '' : 'group-hover:scale-[1.03]'
              }`}
              draggable={false}
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
              <span>{formatVideoShortDate(story.createdAt)}</span>
              {selectionMode ? (
                <Link
                  to={`/video-shorts/${story._id}`}
                  data-no-marquee
                  className="inline-flex items-center gap-0.5 text-blue-300 hover:text-blue-200"
                  onClick={(e) => e.stopPropagation()}
                >
                  Chi tiết
                  <FiExternalLink className="h-3 w-3" />
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {!selectionMode ? (
        <Link
          to={`/video-shorts/${story._id}`}
          data-no-marquee
          className="absolute inset-0 z-10 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/50"
          aria-label={`Xem ${story.name || 'video ngắn'}`}
        />
      ) : null}
    </article>
  )
}

export default function VideoShortsPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<VideoShortListStatusFilter>('')
  const [dateFromFilter, setDateFromFilter] = useState('')
  const [dateToFilter, setDateToFilter] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [actionMessage, setActionMessage] = useState('')
  const limit = 20

  /** Chọn + hành động bulk chỉ trên hai tab lọc này. */
  const bulkActionMode =
    statusFilter === 'missing_videos' ? 'grok' : statusFilter === 'ggsheet_pending' ? 'sheet' : null
  const selectionMode = bulkActionMode !== null

  const storiesQuery = useQuery({
    queryKey: ['video-shorts', 'my', page, searchQuery, statusFilter, dateFromFilter, dateToFilter],
    queryFn: () =>
      getMyVideoShorts({
        page,
        limit,
        q: searchQuery,
        status: statusFilter || undefined,
        dateFrom: dateFromFilter || undefined,
        dateTo: dateToFilter || undefined,
      }),
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

  const items = storiesQuery.data?.items || []
  const pagination = storiesQuery.data?.pagination
  const extensionOnline = extensionPresenceQuery.data?.online === true
  const grokWorkflowId = grokWorkflowQuery.data?.[0]?._id || ''

  const toggleSelect = useCallback((id: string) => {
    if (!bulkActionMode) return
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [bulkActionMode])

  const selectIds = useCallback((ids: string[], mode: 'add' | 'replace') => {
    if (!bulkActionMode || ids.length === 0) return
    setSelectedIds((prev) => {
      const next = mode === 'replace' ? new Set<string>() : new Set(prev)
      for (const id of ids) next.add(id)
      return next
    })
  }, [bulkActionMode])

  const { containerRef, registerCard, marquee, onContainerMouseDown, isDragging } =
    useVideoShortMarqueeSelection({
      enabled: selectionMode,
      onToggleId: toggleSelect,
      onSelectIds: selectIds,
    })

  const selectedStories = useMemo(
    () => items.filter((story) => selectedIds.has(story._id)),
    [items, selectedIds],
  )

  const grokTargets = useMemo(() => {
    if (bulkActionMode !== 'grok') return []
    return selectedStories.filter((story) => {
      const stats = getVideoShortStats(story)
      return isGrokIncomplete(story, stats)
    })
  }, [bulkActionMode, selectedStories])

  const sheetTargets = useMemo(() => {
    if (bulkActionMode !== 'sheet') return []
    return selectedStories.filter((story) => isGgSheetPushable(story))
  }, [bulkActionMode, selectedStories])

  const clearSelection = () => setSelectedIds(new Set())

  const pageEligibleIds = useMemo(() => {
    if (bulkActionMode === 'grok') {
      return items
        .filter((story) => {
          const stats = getVideoShortStats(story)
          return isGrokIncomplete(story, stats)
        })
        .map((story) => story._id)
    }
    if (bulkActionMode === 'sheet') {
      return items.filter((story) => isGgSheetPushable(story)).map((story) => story._id)
    }
    return []
  }, [bulkActionMode, items])

  const allOnPageSelected =
    pageEligibleIds.length > 0 && pageEligibleIds.every((id) => selectedIds.has(id))

  const selectAllOnPage = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const id of pageEligibleIds) next.add(id)
      return next
    })
  }

  const deselectAllOnPage = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const id of pageEligibleIds) next.delete(id)
      return next
    })
  }

  const grokMutation = useMutation({
    mutationFn: async (stories: VideoShortItem[]) => {
      if (!grokWorkflowId) throw new Error('Chưa có workflow Grok trên hệ thống.')
      if (!extensionOnline) {
        throw new Error('Extension chưa online — mở extension tab Grok và đăng nhập.')
      }
      for (const story of stories) {
        await createWorkflowRun({
          workflowId: grokWorkflowId,
          payload: {
            videoShortId: story._id,
            source: 'web_stories_batch',
            trigger: 'web_console',
          },
        })
      }
      return stories.length
    },
    onSuccess: (count) => {
      setActionMessage(`Đã gửi ${count} lệnh Grok — extension xử lý lần lượt.`)
      clearSelection()
    },
    onError: (error: unknown) => {
      if (isAxiosError(error) && error.response?.status === 503) {
        setActionMessage('Extension chưa online — mở tab Grok trong extension.')
        return
      }
      setActionMessage(error instanceof Error ? error.message : 'Không thể chạy Grok.')
    },
  })

  const sheetMutation = useMutation({
    mutationFn: async (stories: VideoShortItem[]) => {
      let ok = 0
      const errors: string[] = []
      for (const story of stories) {
        try {
          await pushGgSheetContent(buildGgSheetPushPayloadFromVideoShort(story))
          ok += 1
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Lỗi đẩy sheet'
          errors.push(`${story.name || story._id}: ${msg}`)
        }
      }
      return { ok, failed: errors }
    },
    onSuccess: ({ ok, failed }) => {
      void queryClient.invalidateQueries({ queryKey: ['video-shorts', 'my'] })
      if (failed.length === 0) {
        setActionMessage(`Đã đẩy ${ok} video ngắn lên GG Sheet.`)
      } else {
        setActionMessage(`Đã đẩy ${ok}/${ok + failed.length} — lỗi: ${failed[0]}`)
      }
      clearSelection()
    },
    onError: (error: unknown) => {
      setActionMessage(error instanceof Error ? error.message : 'Không thể đẩy GG Sheet.')
    },
  })

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault()
    setPage(1)
    setSearchQuery(searchInput.trim())
  }

  const handleStatusChange = (next: VideoShortListStatusFilter) => {
    setStatusFilter(next)
    setPage(1)
    setSelectedIds(new Set())
    setActionMessage('')
  }

  const handleDateRangeChange = (which: 'from' | 'to', next: string) => {
    if (which === 'from') setDateFromFilter(next)
    else setDateToFilter(next)
    setPage(1)
    setSelectedIds(new Set())
    setActionMessage('')
  }

  const clearDateRange = () => {
    setDateFromFilter('')
    setDateToFilter('')
    setPage(1)
    setSelectedIds(new Set())
    setActionMessage('')
  }

  const applyDatePreset = (preset: VideoShortDatePresetId) => {
    const { from, to } = resolveVideoShortDatePresetRange(preset)
    setDateFromFilter(from)
    setDateToFilter(to)
    setPage(1)
    setSelectedIds(new Set())
    setActionMessage('')
  }

  const hasDateRangeFilter = Boolean(dateFromFilter || dateToFilter)
  const activeDatePreset = useMemo(
    () => matchVideoShortDatePreset(dateFromFilter, dateToFilter),
    [dateFromFilter, dateToFilter],
  )

  const formatDateFilterLabel = (isoDate: string) => {
    const [y, m, d] = isoDate.split('-').map(Number)
    if (!y || !m || !d) return isoDate
    return new Date(y, m - 1, d).toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  }

  const dateRangeSummary = useMemo(() => {
    if (dateFromFilter && dateToFilter) {
      return `${formatDateFilterLabel(dateFromFilter)} → ${formatDateFilterLabel(dateToFilter)}`
    }
    if (dateFromFilter) return `từ ${formatDateFilterLabel(dateFromFilter)}`
    if (dateToFilter) return `đến ${formatDateFilterLabel(dateToFilter)}`
    return ''
  }, [dateFromFilter, dateToFilter])

  const pageHint =
    bulkActionMode === 'grok'
      ? 'Tab Thiếu video — tick hoặc kéo vùng chọn video ngắn, rồi Chạy Grok trên extension.'
      : bulkActionMode === 'sheet'
        ? 'Tab Chưa lên sheet — tick hoặc kéo vùng chọn video ngắn, rồi đẩy GG Sheet.'
        : 'Lọc «Thiếu video» hoặc «Chưa lên sheet» để chọn hàng loạt và xử lý.'

  const statusLabel = statusFilter ? getVideoShortListStatusLabel(statusFilter) : ''
  const selectionCount = selectedIds.size
  const isBulkPending = grokMutation.isPending || sheetMutation.isPending

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Video ngắn</h1>
          <p className="mt-1 text-sm text-slate-400">{pageHint}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <form onSubmit={handleSearch} className="flex min-w-[min(100%,20rem)] flex-1 gap-2">
          <div className="relative min-w-0 flex-1">
            <FiSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Tìm theo tên…"
              className="w-full rounded-xl border border-white/10 bg-black/30 py-2.5 pl-9 pr-3 text-sm text-white outline-none focus:border-blue-300/40"
            />
          </div>
          <button
            type="submit"
            className="shrink-0 rounded-xl border border-blue-300/30 bg-blue-500/20 px-4 py-2 text-sm text-blue-100 hover:bg-blue-500/30"
          >
            Tìm
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2">
            <FiCalendar className="h-4 w-4 shrink-0 text-slate-500" />
            <label className="inline-flex items-center gap-1.5 text-sm text-slate-300">
              <span className="text-xs text-slate-500">Từ</span>
              <input
                type="date"
                value={dateFromFilter}
                max={dateToFilter || undefined}
                onChange={(e) => handleDateRangeChange('from', e.target.value)}
                className="bg-transparent text-sm text-white outline-none scheme-dark"
              />
            </label>
            <span className="text-slate-600">—</span>
            <label className="inline-flex items-center gap-1.5 text-sm text-slate-300">
              <span className="text-xs text-slate-500">Đến</span>
              <input
                type="date"
                value={dateToFilter}
                min={dateFromFilter || undefined}
                onChange={(e) => handleDateRangeChange('to', e.target.value)}
                className="bg-transparent text-sm text-white outline-none scheme-dark"
              />
            </label>
          </div>
          {hasDateRangeFilter ? (
            <button
              type="button"
              onClick={clearDateRange}
              className="inline-flex items-center gap-1 rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-400 hover:bg-white/5 hover:text-slate-200"
            >
              <FiX className="h-3.5 w-3.5" />
              Bỏ khoảng ngày
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] text-slate-500">Chọn nhanh:</span>
        {VIDEO_SHORT_DATE_PRESETS.map((preset) => {
          const active = activeDatePreset === preset.id
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => applyDatePreset(preset.id)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                active
                  ? 'border-violet-400/40 bg-violet-500/20 text-violet-100 ring-1 ring-violet-400/25'
                  : 'border-white/10 bg-black/20 text-slate-400 hover:border-violet-400/25 hover:bg-violet-500/10 hover:text-slate-200'
              }`}
            >
              {preset.label}
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        {STORY_LIST_STATUS_FILTERS.map((item) => {
          const active = statusFilter === item.value
          const Icon = STORY_STATUS_ICONS[item.value]
          return (
            <button
              key={item.value || 'all'}
              type="button"
              onClick={() => handleStatusChange(item.value)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                active
                  ? 'border-blue-300/30 bg-blue-500/20 text-blue-100 ring-1 ring-blue-300/25'
                  : 'border-white/10 bg-black/20 text-slate-400 hover:border-blue-300/20 hover:bg-blue-500/10 hover:text-slate-200'
              }`}
            >
              <Icon className={`h-3.5 w-3.5 shrink-0 ${STORY_STATUS_ICON_COLORS[item.value]}`} />
              {item.label}
            </button>
          )
        })}
      </div>

      {bulkActionMode ? (
        <div className="surface-card sticky top-2 z-30 flex flex-wrap items-center gap-2 rounded-xl px-4 py-3 shadow-lg shadow-black/30 backdrop-blur-sm">
          {pageEligibleIds.length > 0 ? (
            allOnPageSelected ? (
              <button
                type="button"
                onClick={deselectAllOnPage}
                className="inline-flex items-center gap-1.5 rounded-lg border border-blue-300/30 bg-blue-500/20 px-3 py-1.5 text-xs text-blue-100 hover:bg-blue-500/30"
              >
                <FiSquare className="h-3.5 w-3.5" />
                Bỏ chọn trang ({pageEligibleIds.length})
              </button>
            ) : (
              <button
                type="button"
                onClick={selectAllOnPage}
                className="inline-flex items-center gap-1.5 rounded-lg border border-blue-300/30 bg-blue-500/20 px-3 py-1.5 text-xs text-blue-100 hover:bg-blue-500/30"
              >
                <FiCheckSquare className="h-3.5 w-3.5" />
                Chọn tất cả ({pageEligibleIds.length})
              </button>
            )
          ) : null}
          {selectionCount > 0 ? (
            <>
              <span className="text-sm text-slate-200">{selectionCount} đã chọn</span>
              <button
                type="button"
                onClick={clearSelection}
                className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-slate-400 hover:bg-white/5 hover:text-slate-200"
              >
                <FiX className="h-3.5 w-3.5" />
                Bỏ hết
              </button>
            </>
          ) : (
            <span className="text-xs text-slate-400">Tick, kéo vùng hoặc chọn tất cả trên trang này.</span>
          )}
          {bulkActionMode === 'grok' ? (
            <button
              type="button"
              disabled={grokTargets.length === 0 || isBulkPending || !grokWorkflowId}
              onClick={() => {
                setActionMessage('')
                grokMutation.mutate(grokTargets)
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-300/30 bg-blue-500/20 px-3 py-1.5 text-xs text-blue-100 hover:bg-blue-500/30 disabled:opacity-40"
            >
              <FiPlay className="h-3.5 w-3.5" />
              {grokMutation.isPending ? 'Đang gửi Grok…' : `Chạy Grok (${grokTargets.length})`}
            </button>
          ) : null}
          {bulkActionMode === 'sheet' ? (
            <GgSheetPushButton
              size="sm"
              disabled={sheetTargets.length === 0 || isBulkPending}
              onClick={() => {
                setActionMessage('')
                sheetMutation.mutate(sheetTargets)
              }}
            >
              {sheetMutation.isPending ? 'Đang đẩy sheet…' : `Đẩy GG Sheet (${sheetTargets.length})`}
            </GgSheetPushButton>
          ) : null}
        </div>
      ) : null}

      {actionMessage ? <p className="text-xs text-slate-300">{actionMessage}</p> : null}

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
          title={statusFilter || searchQuery || hasDateRangeFilter ? 'Không có video ngắn khớp bộ lọc' : 'Chưa có video ngắn nào'}
          description={
            statusFilter || searchQuery || hasDateRangeFilter
              ? 'Thử bộ lọc khác hoặc xóa tìm kiếm / khoảng ngày.'
              : 'Video ngắn được tạo sau bước lưu ChatGPT trong quy trình đa bước hoặc extension.'
          }
        />
      ) : (
        <>
          <p className="text-xs text-slate-500">
            {pagination?.total ?? items.length} video ngắn
            {searchQuery ? ` · tìm: "${searchQuery}"` : ''}
            {statusLabel ? ` · lọc: ${statusLabel}` : ''}
            {dateRangeSummary ? ` · ${dateRangeSummary}` : ''}
          </p>

          <div
            ref={containerRef}
            onMouseDown={onContainerMouseDown}
            className={`relative grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 ${
              selectionMode ? 'select-none' : ''
            } ${isDragging ? 'cursor-crosshair' : ''}`}
          >
            {marquee ? (
              <div
                className="pointer-events-none absolute z-40 rounded border-2 border-blue-300 bg-blue-500/20"
                style={{
                  left: marquee.box.left,
                  top: marquee.box.top,
                  width: marquee.box.width,
                  height: marquee.box.height,
                }}
              />
            ) : null}

            {items.map((story) => (
              <VideoShortCard
                key={story._id}
                story={story}
                selected={selectedIds.has(story._id)}
                selectionMode={selectionMode}
                registerCard={registerCard}
                onToggleSelect={toggleSelect}
              />
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

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FiChevronLeft, FiChevronRight, FiExternalLink, FiRefreshCw } from 'react-icons/fi'
import { SiGooglesheets } from 'react-icons/si'
import { Link } from 'react-router-dom'
import EmptyState from '@/components/EmptyState'
import GgSheetSettingsPanel, { GgSheetSettingsButton } from '@/components/GgSheetSettingsPanel'
import { compareGgSheetWithStories, getMyGgSheetSetting } from '@/services/GgSheetService'

type ViewFilter = 'all' | 'matched' | 'sheet_only' | 'db_only'

const SHEET_ROWS_PAGE_SIZE = 20

function MatchBadge({ status }: { status: 'matched' | 'sheet_only' | 'db_only' }) {
  if (status === 'matched') {
    return (
      <span className="inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-200">
        Khớp DB
      </span>
    )
  }
  if (status === 'sheet_only') {
    return (
      <span className="inline-flex rounded-full border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-200">
        Chỉ trên Sheet
      </span>
    )
  }
  return (
    <span className="inline-flex rounded-full border border-sky-500/30 bg-sky-500/15 px-2 py-0.5 text-[10px] font-medium text-sky-200">
      Chỉ trong DB
    </span>
  )
}

export default function GgSheetPage() {
  const [viewFilter, setViewFilter] = useState<ViewFilter>('all')
  const [sheetPage, setSheetPage] = useState(1)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const settingQuery = useQuery({
    queryKey: ['ggsheet', 'me'],
    queryFn: getMyGgSheetSetting,
  })

  const compareQuery = useQuery({
    queryKey: ['ggsheet', 'compare'],
    queryFn: compareGgSheetWithStories,
    enabled: Boolean(settingQuery.data?.ggSheetPath?.trim()),
    refetchInterval: 60_000,
  })

  const data = compareQuery.data
  const setting = settingQuery.data

  const filteredSheetRows = useMemo(() => {
    if (!data) return []
    let rows = data.rows
    if (viewFilter === 'matched') rows = rows.filter((row) => row.matchStatus === 'matched')
    else if (viewFilter === 'sheet_only') rows = rows.filter((row) => row.matchStatus === 'sheet_only')
    else if (viewFilter === 'db_only') rows = []
    return [...rows].sort((a, b) => b.rowNumber - a.rowNumber)
  }, [data, viewFilter])

  const sheetPagination = useMemo(() => {
    const total = filteredSheetRows.length
    const totalPages = Math.max(1, Math.ceil(total / SHEET_ROWS_PAGE_SIZE))
    const page = Math.min(sheetPage, totalPages)
    const start = (page - 1) * SHEET_ROWS_PAGE_SIZE
    return {
      page,
      totalPages,
      total,
      items: filteredSheetRows.slice(start, start + SHEET_ROWS_PAGE_SIZE),
      rangeStart: total === 0 ? 0 : start + 1,
      rangeEnd: Math.min(start + SHEET_ROWS_PAGE_SIZE, total),
    }
  }, [filteredSheetRows, sheetPage])

  useEffect(() => {
    if (sheetPage > sheetPagination.totalPages) {
      setSheetPage(sheetPagination.totalPages)
    }
  }, [sheetPage, sheetPagination.totalPages])

  const showDbOnly = viewFilter === 'all' || viewFilter === 'db_only'

  const handleViewFilterChange = (next: ViewFilter) => {
    setViewFilter(next)
    setSheetPage(1)
  }

  const filterButtons: Array<{ value: ViewFilter; label: string; count: number }> = [
    { value: 'all', label: 'Tất cả Sheet', count: data?.summary.sheetRows || 0 },
    { value: 'matched', label: 'Khớp DB', count: data?.summary.matched || 0 },
    { value: 'sheet_only', label: 'Chỉ Sheet', count: data?.summary.sheetOnly || 0 },
    { value: 'db_only', label: 'Chỉ DB', count: data?.summary.dbOnly || 0 },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-white">
            <SiGooglesheets className="h-5 w-5 text-green-500" />
            GG Sheet
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            Đối chiếu dữ liệu trên Google Sheet với video ngắn trong database — khớp theo tiêu đề và
            prefix nội dung ngắn (120 ký tự). Dòng có trên Sheet nhưng không có trong DB vẫn hiển thị.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <GgSheetSettingsButton onClick={() => setSettingsOpen(true)} />
          <button
            type="button"
            disabled={compareQuery.isFetching || !setting?.ggSheetPath?.trim()}
            onClick={() => void compareQuery.refetch()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-blue-300/30 bg-blue-500/20 px-3 py-2 text-xs text-blue-100 hover:bg-blue-500/30 disabled:opacity-40"
          >
            <FiRefreshCw className={`h-3.5 w-3.5 ${compareQuery.isFetching ? 'animate-spin' : ''}`} />
            Làm mới
          </button>
        </div>
      </div>

      <GgSheetSettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        initial={setting}
      />

      {!setting?.ggSheetPath?.trim() && !settingsOpen ? (
        <EmptyState
          title="Chưa cấu hình Google Sheet"
          description="Bấm Cài đặt để nhập đường dẫn sheet và các cột tiêu đề / nội dung ngắn / nội dung dài."
          action={
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-blue-300/30 bg-blue-500/20 px-4 py-2 text-sm text-blue-100 hover:bg-blue-500/30"
            >
              Mở cài đặt
            </button>
          }
        />
      ) : data && !data.configured && !compareQuery.isLoading && !settingsOpen ? (
        <EmptyState
          title="Thiếu cấu hình cột"
          description="Cần cấu hình cột tiêu đề và nội dung ngắn trong phần Cài đặt."
          action={
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-blue-300/30 bg-blue-500/20 px-4 py-2 text-sm text-blue-100 hover:bg-blue-500/30"
            >
              Mở cài đặt
            </button>
          }
        />
      ) : null}

      {setting?.ggSheetPath?.trim() ? (
        <div className="surface-card rounded-2xl p-4 text-xs text-slate-400">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>
              Tab: <span className="text-slate-200">{data?.sheetTitle || '—'}</span>
            </span>
            <span>
              Cột tiêu đề: <span className="text-slate-200">{data?.columns.title || setting.titleColumn || '—'}</span>
            </span>
            <span>
              Cột ngắn:{' '}
              <span className="text-slate-200">{data?.columns.shortContent || setting.shortContentColumn || '—'}</span>
            </span>
            {data?.sheetUrl || setting.ggSheetPath ? (
              <a
                href={data?.sheetUrl || setting.ggSheetPath}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-blue-300 hover:text-blue-200"
              >
                Mở Sheet
                <FiExternalLink className="h-3 w-3" />
              </a>
            ) : null}
          </div>
        </div>
      ) : null}

      {data?.configured ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Dòng trên Sheet', value: data.summary.sheetRows, tone: 'text-green-400' },
            { label: 'Khớp database', value: data.summary.matched, tone: 'text-emerald-400' },
            { label: 'Chỉ trên Sheet', value: data.summary.sheetOnly, tone: 'text-amber-400' },
            { label: 'Chỉ trong DB', value: data.summary.dbOnly, tone: 'text-sky-400' },
          ].map((item) => (
            <div key={item.label} className="surface-card rounded-2xl p-4">
              <p className="text-xs text-slate-400">{item.label}</p>
              <p className={`mt-1 text-2xl font-semibold ${item.tone}`}>{item.value}</p>
            </div>
          ))}
        </div>
      ) : null}

      {setting?.ggSheetPath?.trim() ? (
        <div className="flex flex-wrap gap-2">
          {filterButtons.map((item) => {
            const active = viewFilter === item.value
            return (
              <button
                key={item.value}
                type="button"
                onClick={() => handleViewFilterChange(item.value)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                  active
                    ? 'border-blue-300/30 bg-blue-500/20 text-blue-100 ring-1 ring-blue-300/25'
                    : 'border-white/10 bg-black/20 text-slate-400 hover:border-blue-300/20 hover:bg-blue-500/10 hover:text-slate-200'
                }`}
              >
                {item.label}
                <span className="rounded-full bg-black/30 px-1.5 py-0.5 text-[10px]">{item.count}</span>
              </button>
            )
          })}
        </div>
      ) : null}

      {compareQuery.isLoading ? (
        <div className="surface-card h-48 animate-pulse rounded-2xl" />
      ) : null}

      {compareQuery.isError ? (
        <EmptyState
          title="Không đọc được Google Sheet"
          description="Kiểm tra quyền Editor cho service account và cấu hình cột trong extension."
        />
      ) : null}

      {data?.configured && viewFilter !== 'db_only' ? (
        <section className="surface-card overflow-hidden rounded-2xl">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-white">Dữ liệu từ Google Sheet</h2>
              <p className="mt-0.5 text-[11px] text-slate-500">Hiển thị từ dòng cuối Sheet lên đầu (mới nhất trước).</p>
            </div>
            {sheetPagination.total > 0 ? (
              <span className="text-[11px] text-slate-500">
                {sheetPagination.rangeStart}–{sheetPagination.rangeEnd} / {sheetPagination.total} dòng
              </span>
            ) : null}
          </div>
          {filteredSheetRows.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">Không có dòng nào phù hợp bộ lọc.</p>
          ) : (
            <>
            <div className="overflow-x-auto">
              <table className="w-full table-fixed text-left text-xs">
                <colgroup>
                  <col className="w-[52px]" />
                  <col className="w-[22%]" />
                  <col className="w-[36%]" />
                  <col className="w-[120px]" />
                  <col className="w-auto" />
                </colgroup>
                <thead className="bg-black/20 text-slate-400">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Dòng</th>
                    <th className="px-4 py-2.5 font-medium">Tiêu đề (Sheet)</th>
                    <th className="px-4 py-2.5 font-medium">Nội dung ngắn (Sheet)</th>
                    <th className="px-4 py-2.5 font-medium">Trạng thái</th>
                    <th className="px-4 py-2.5 font-medium">Video ngắn (DB)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {sheetPagination.items.map((row) => (
                    <tr key={row.rowNumber} className="align-top hover:bg-white/2">
                      <td className="whitespace-nowrap px-4 py-3 text-slate-300">{row.rowNumber}</td>
                      <td className="px-4 py-3 font-medium leading-snug break-words text-white">
                        {row.title || '—'}
                      </td>
                      <td className="px-4 py-3 leading-relaxed text-slate-400">
                        <p className="line-clamp-4 whitespace-pre-wrap break-words">
                          {row.shortContentPreview || '—'}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <MatchBadge status={row.matchStatus} />
                      </td>
                      <td className="px-4 py-3">
                        {row.story ? (
                          <Link
                            to={`/video-shorts/${row.story.id}`}
                            className="inline-flex max-w-full flex-col gap-0.5 text-blue-300 hover:text-blue-200"
                          >
                            <span className="line-clamp-2 font-medium break-words">{row.story.name || 'Không tên'}</span>
                            <span className="line-clamp-3 text-[10px] leading-relaxed text-slate-500">
                              {row.story.shortContentPreview || '—'}
                            </span>
                          </Link>
                        ) : (
                          <span className="inline-flex rounded-lg border border-white/8 bg-white/5 px-2 py-1 text-[10px] text-slate-500">
                            Chưa có video ngắn khớp
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {sheetPagination.totalPages > 1 ? (
              <div className="flex items-center justify-between gap-3 border-t border-white/10 px-4 py-3">
                <button
                  type="button"
                  disabled={sheetPagination.page <= 1}
                  onClick={() => setSheetPage((p) => Math.max(1, p - 1))}
                  className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300 disabled:opacity-40"
                >
                  <FiChevronLeft className="h-4 w-4" />
                  Trước
                </button>
                <span className="text-xs text-slate-500">
                  Trang {sheetPagination.page} / {sheetPagination.totalPages}
                </span>
                <button
                  type="button"
                  disabled={sheetPagination.page >= sheetPagination.totalPages}
                  onClick={() => setSheetPage((p) => p + 1)}
                  className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300 disabled:opacity-40"
                >
                  Sau
                  <FiChevronRight className="h-4 w-4" />
                </button>
              </div>
            ) : null}
            </>
          )}
        </section>
      ) : null}

      {data?.configured && showDbOnly && data.unmatchedStories.length > 0 ? (
        <section className="surface-card overflow-hidden rounded-2xl">
          <div className="border-b border-white/10 px-4 py-3">
            <h2 className="text-sm font-semibold text-white">Video ngắn chưa có trên Sheet</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full table-fixed text-left text-xs">
              <colgroup>
                <col className="w-[28%]" />
                <col className="w-[42%]" />
                <col className="w-[120px]" />
                <col className="w-auto" />
              </colgroup>
              <thead className="bg-black/20 text-slate-400">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Tiêu đề (DB)</th>
                  <th className="px-4 py-2.5 font-medium">Nội dung ngắn (DB)</th>
                  <th className="px-4 py-2.5 font-medium">Trạng thái</th>
                  <th className="px-4 py-2.5 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {data.unmatchedStories.map((story) => (
                  <tr key={story.id} className="align-top hover:bg-white/2">
                    <td className="px-4 py-3 font-medium leading-snug break-words text-white">
                      {story.name || 'Không tên'}
                    </td>
                    <td className="px-4 py-3 leading-relaxed text-slate-400">
                      <p className="line-clamp-4 whitespace-pre-wrap break-words">
                        {story.shortContentPreview || '—'}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <MatchBadge status="db_only" />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link to={`/video-shorts/${story.id}`} className="text-blue-300 hover:text-blue-200">
                        Xem video ngắn
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {data?.configured && viewFilter === 'db_only' && data.unmatchedStories.length === 0 ? (
        <EmptyState title="Không có video ngắn thiếu trên Sheet" description="Mọi video ngắn đều đã khớp với một dòng trên Google Sheet." />
      ) : null}
    </div>
  )
}

export type VideoShortDatePresetId = 'today' | 'this_week' | 'two_weeks' | 'last_30_days'

export const VIDEO_SHORT_DATE_PRESETS: Array<{ id: VideoShortDatePresetId; label: string }> = [
  { id: 'today', label: 'Hôm nay' },
  { id: 'this_week', label: 'Tuần này' },
  { id: 'two_weeks', label: '2 tuần' },
  { id: 'last_30_days', label: '30 ngày' },
]

const VN_TZ = 'Asia/Ho_Chi_Minh'

export function getVnCalendarDateIso(reference = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: VN_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(reference)
}

function shiftVnIsoDate(iso: string, deltaDays: number): string {
  const base = new Date(`${iso}T12:00:00+07:00`)
  const shifted = new Date(base.getTime() + deltaDays * 86_400_000)
  return getVnCalendarDateIso(shifted)
}

/** Thứ Hai = 0 … Chủ nhật = 6 (theo lịch VN). */
function vnWeekdayMondayZero(iso: string): number {
  const d = new Date(`${iso}T12:00:00+07:00`)
  const map: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: VN_TZ, weekday: 'short' }).format(d)
  return map[wd] ?? 0
}

export function resolveVideoShortDatePresetRange(
  preset: VideoShortDatePresetId,
  reference = new Date(),
): { from: string; to: string } {
  const to = getVnCalendarDateIso(reference)
  switch (preset) {
    case 'today':
      return { from: to, to }
    case 'this_week':
      return { from: shiftVnIsoDate(to, -vnWeekdayMondayZero(to)), to }
    case 'two_weeks':
      return { from: shiftVnIsoDate(to, -13), to }
    case 'last_30_days':
      return { from: shiftVnIsoDate(to, -29), to }
    default:
      return { from: to, to }
  }
}

export function matchVideoShortDatePreset(
  dateFrom: string,
  dateTo: string,
  reference = new Date(),
): VideoShortDatePresetId | '' {
  if (!dateFrom && !dateTo) return ''
  for (const preset of VIDEO_SHORT_DATE_PRESETS) {
    const range = resolveVideoShortDatePresetRange(preset.id, reference)
    if (range.from === dateFrom && range.to === dateTo) return preset.id
  }
  return ''
}

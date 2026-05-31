import { BadRequestException } from '@nestjs/common';
import { WorkflowScheduleKind } from './workflow-schedule.schema';

export const DEFAULT_SCHEDULE_TIMEZONE = 'Asia/Ho_Chi_Minh';

export type ScheduleTimeInput = {
  scheduleKind: WorkflowScheduleKind;
  runAt?: Date | string | null;
  timeOfDay?: string;
  daysOfWeek?: number[];
  timezone?: string;
};

export function parseTimeOfDay(raw: string): { hour: number; minute: number } {
  const trimmed = (raw || '').trim();
  const match = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
  if (!match) {
    throw new BadRequestException('timeOfDay must be HH:mm (e.g. 08:30).');
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new BadRequestException('Invalid timeOfDay.');
  }
  return { hour, minute };
}

export function normalizeDaysOfWeek(days?: number[]): number[] {
  const unique = [...new Set((days || []).map((d) => Number(d)).filter((d) => d >= 0 && d <= 6))];
  unique.sort((a, b) => a - b);
  return unique;
}

function getZonedParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    weekday: 'short',
  });
  const parts = formatter.formatToParts(date);
  const map: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') map[part.type] = part.value;
  }
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour === '24' ? '0' : map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
    dayOfWeek: weekdayMap[map.weekday] ?? 0,
  };
}

function zonedLocalToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  let guess = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  for (let i = 0; i < 3; i += 1) {
    const parts = getZonedParts(new Date(guess), timeZone);
    const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0, 0);
    const diff = Date.UTC(year, month - 1, day, hour, minute, 0, 0) - asUtc;
    guess += diff;
  }
  return new Date(guess);
}

function addDaysInZone(
  year: number,
  month: number,
  day: number,
  addDays: number,
  timeZone: string,
): { year: number; month: number; day: number } {
  const base = zonedLocalToUtc(year, month, day, 12, 0, timeZone);
  const shifted = new Date(base.getTime() + addDays * 86_400_000);
  const parts = getZonedParts(shifted, timeZone);
  return { year: parts.year, month: parts.month, day: parts.day };
}

export function computeNextRunAt(input: ScheduleTimeInput, from: Date = new Date()): Date | null {
  const timezone = (input.timezone || DEFAULT_SCHEDULE_TIMEZONE).trim() || DEFAULT_SCHEDULE_TIMEZONE;

  if (input.scheduleKind === WorkflowScheduleKind.ONCE) {
    if (!input.runAt) return null;
    const runAt = input.runAt instanceof Date ? input.runAt : new Date(input.runAt);
    if (Number.isNaN(runAt.getTime())) {
      throw new BadRequestException('Invalid runAt.');
    }
    return runAt > from ? runAt : null;
  }

  if (input.scheduleKind === WorkflowScheduleKind.DAILY) {
    const { hour, minute } = parseTimeOfDay(input.timeOfDay || '');
    const nowParts = getZonedParts(from, timezone);
    let candidate = zonedLocalToUtc(nowParts.year, nowParts.month, nowParts.day, hour, minute, timezone);
    if (candidate <= from) {
      const nextDay = addDaysInZone(nowParts.year, nowParts.month, nowParts.day, 1, timezone);
      candidate = zonedLocalToUtc(nextDay.year, nextDay.month, nextDay.day, hour, minute, timezone);
    }
    return candidate;
  }

  if (input.scheduleKind === WorkflowScheduleKind.WEEKLY) {
    const days = normalizeDaysOfWeek(input.daysOfWeek);
    if (!days.length) {
      throw new BadRequestException('daysOfWeek must include at least one day (0=Sun … 6=Sat).');
    }
    const { hour, minute } = parseTimeOfDay(input.timeOfDay || '');
    const nowParts = getZonedParts(from, timezone);

    for (let offset = 0; offset <= 7; offset += 1) {
      const dayParts = addDaysInZone(nowParts.year, nowParts.month, nowParts.day, offset, timezone);
      const dayDate = zonedLocalToUtc(dayParts.year, dayParts.month, dayParts.day, 12, 0, timezone);
      const dow = getZonedParts(dayDate, timezone).dayOfWeek;
      if (!days.includes(dow)) continue;
      const candidate = zonedLocalToUtc(dayParts.year, dayParts.month, dayParts.day, hour, minute, timezone);
      if (candidate > from) return candidate;
    }

    for (let offset = 8; offset <= 14; offset += 1) {
      const dayParts = addDaysInZone(nowParts.year, nowParts.month, nowParts.day, offset, timezone);
      const dayDate = zonedLocalToUtc(dayParts.year, dayParts.month, dayParts.day, 12, 0, timezone);
      const dow = getZonedParts(dayDate, timezone).dayOfWeek;
      if (!days.includes(dow)) continue;
      return zonedLocalToUtc(dayParts.year, dayParts.month, dayParts.day, hour, minute, timezone);
    }
  }

  return null;
}

export function formatScheduleSummary(input: ScheduleTimeInput): string {
  const tz = input.timezone || DEFAULT_SCHEDULE_TIMEZONE;
  if (input.scheduleKind === WorkflowScheduleKind.ONCE) {
    if (!input.runAt) return 'Once — no time set';
    const d = input.runAt instanceof Date ? input.runAt : new Date(input.runAt);
    return `Once · ${d.toLocaleString('en-US', { timeZone: tz })}`;
  }
  if (input.scheduleKind === WorkflowScheduleKind.DAILY) {
    return `Daily · ${input.timeOfDay || '??:??'} (${tz})`;
  }
  const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const days = normalizeDaysOfWeek(input.daysOfWeek)
    .map((d) => labels[d])
    .join(', ');
  return `Weekly · ${days || '—'} · ${input.timeOfDay || '??:??'} (${tz})`;
}

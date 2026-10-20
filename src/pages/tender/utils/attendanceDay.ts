import type { TimesheetEntry } from '../types'
import type { FotEmployeeEvent } from './fotEmployeeEvents'
import { calculateFotSkudDay } from './skudTimeCalculation'
import { getDailyHoursNorm, isWeekendOrHoliday, roundTimesheetHours } from './salaryCalculator'
import { isWorkedTimesheetStatus, TIMESHEET_STATUS_META } from './timesheetStatus'
import {
  formatHoursValue,
  MONTH_GENITIVE,
  toIsoDate,
  WEEKDAYS_LONG
} from './employeeFormat'

export type DayTone = 'green' | 'yellow' | 'red' | 'leave' | 'neutral' | 'none'
export type DayKind = 'full' | 'partial' | 'absent' | 'leave' | 'weekend' | 'other' | 'empty'

export interface DayClass {
  tone: DayTone
  kind: DayKind
  // Текст в ячейке: «9», «6/9», «Н», «+5», «—»
  value: string
  // Часы по табелю (для дня без записи по СКУД — часы СКУД)
  hours: number
  skudHours: number | null
  norm: number
  off: boolean
  isToday: boolean
  isFuture: boolean
  disabled: boolean
  // Прошедший будний день без записи
  dashed: boolean
  // Тон посчитан по СКУД, а не по табелю
  fromSkud: boolean
  remote: boolean
  // Есть отработанные часы (по табелю или СКУД)
  worked: boolean
  corrected: boolean
  // Часы табеля и СКУД различаются на 2 часа и больше
  mismatch: boolean
  statusLabel: string
  verdict: string
}

export interface LegendCounts {
  full: number
  partial: number
  absent: number
  leave: number
}

const WEEKEND_WORK_MIN_HOURS = 3
export const MISMATCH_HOURS = 2

export function resolveTimesheetWorkedHours(entry: TimesheetEntry, date: Date): number {
  const expectedHours = getDailyHoursNorm(date)

  if (entry.status === 'sick_worked') {
    return roundTimesheetHours(entry.hours_worked) || expectedHours
  }

  if (
    entry.status === 'remote'
    && !isWeekendOrHoliday(date)
    && entry.hours_worked === 8
    && !entry.is_correction
  ) {
    return expectedHours
  }

  return roundTimesheetHours(entry.hours_worked, expectedHours)
}

function dayKey(date: Date): number {
  return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate()
}

interface WorkedResult {
  tone: DayTone
  kind: DayKind
  value: string
  verdict: string
}

function classifyWorkedHours(hours: number, norm: number, off: boolean, isToday: boolean): WorkedResult {
  const hoursText = formatHoursValue(hours)

  if (off) {
    if (hours >= WEEKEND_WORK_MIN_HOURS) {
      return { tone: 'green', kind: 'weekend', value: `+${hoursText}`, verdict: 'работа в выходной' }
    }
    return { tone: 'neutral', kind: 'other', value: hoursText, verdict: 'меньше 3 ч, не оплачивается' }
  }

  if (hours >= norm) {
    return { tone: 'green', kind: 'full', value: hoursText, verdict: 'полный день' }
  }
  if (isToday) {
    return {
      tone: 'neutral',
      kind: 'other',
      value: hours > 0 ? `${hoursText}/${norm}` : '',
      verdict: 'день ещё идёт'
    }
  }
  if (hours > 0) {
    return { tone: 'yellow', kind: 'partial', value: `${hoursText}/${norm}`, verdict: 'неполный день' }
  }
  return { tone: 'red', kind: 'absent', value: '0', verdict: 'неявка, часов нет' }
}

export function classifyDay(
  entry: TimesheetEntry | undefined,
  date: Date,
  today: Date,
  skudHours: number | null = null
): DayClass {
  const norm = getDailyHoursNorm(date)
  const off = isWeekendOrHoliday(date)
  const key = dayKey(date)
  const todayKey = dayKey(today)
  const isToday = key === todayKey
  const isFuture = key > todayKey
  const isPast = key < todayKey

  const base: DayClass = {
    tone: 'none',
    kind: 'empty',
    value: '',
    hours: 0,
    skudHours,
    norm,
    off,
    isToday,
    isFuture,
    disabled: false,
    dashed: false,
    fromSkud: false,
    remote: false,
    worked: false,
    corrected: false,
    mismatch: false,
    statusLabel: '',
    verdict: ''
  }

  if (!entry) {
    if (isFuture) return { ...base, disabled: true, statusLabel: 'Нет данных' }
    if (off) return { ...base, statusLabel: 'Выходной' }
    // Запасной источник: табеля нет, но есть проходы СКУД
    if (isPast && skudHours !== null && skudHours > 0) {
      const result = classifyWorkedHours(skudHours, norm, false, false)
      return { ...base, ...result, hours: skudHours, fromSkud: true, worked: true, statusLabel: 'Нет записи в табеле' }
    }
    if (isToday) return { ...base, statusLabel: 'Нет записи' }
    return { ...base, dashed: true, value: '—', statusLabel: 'Данные не загружены' }
  }

  const meta = TIMESHEET_STATUS_META[entry.status]
  const corrected = entry.is_correction
  const common: DayClass = { ...base, corrected, statusLabel: meta.label }

  if (entry.status === 'dayoff') return common
  if (entry.status === 'absent') return { ...common, tone: 'red', kind: 'absent', value: meta.short }
  if (!isWorkedTimesheetStatus(entry.status)) {
    return { ...common, tone: 'leave', kind: 'leave', value: meta.short }
  }

  const hours = resolveTimesheetWorkedHours(entry, date)
  const result = classifyWorkedHours(hours, norm, off, isToday)
  const mismatch = skudHours !== null && !isToday && !isFuture && Math.abs(hours - skudHours) >= MISMATCH_HOURS

  return {
    ...common,
    ...result,
    value: entry.status === 'sick_worked' ? meta.short : result.value,
    hours,
    worked: true,
    remote: entry.status === 'remote',
    mismatch
  }
}

export function getDayAriaLabel(date: Date, info: DayClass): string {
  const parts = [info.statusLabel]
  if (info.worked) {
    const hoursText = formatHoursValue(info.hours)
    parts.push(info.off ? `${hoursText} ч` : `${hoursText} из ${info.norm} ч`)
  }
  if (info.verdict) parts.push(info.verdict)
  if (info.fromSkud) parts.push('по СКУД')
  if (info.mismatch && info.skudHours !== null) {
    parts.push(`расхождение с СКУД: ${formatHoursValue(info.skudHours)} ч`)
  }
  if (info.corrected) parts.push('исправлено вручную')
  return `${date.getDate()} ${MONTH_GENITIVE[date.getMonth()]}, ${WEEKDAYS_LONG[date.getDay()]}. ${parts.join(', ')}`
}

export function countLegend(days: DayClass[]): LegendCounts {
  const counts: LegendCounts = { full: 0, partial: 0, absent: 0, leave: 0 }
  for (const day of days) {
    if (day.tone === 'green' && !day.off) counts.full += 1
    else if (day.tone === 'yellow') counts.partial += 1
    else if (day.tone === 'red') counts.absent += 1
    else if (day.tone === 'leave') counts.leave += 1
  }
  return counts
}

// Оплачиваемые часы СКУД по прошедшим дням месяца (сегодняшний день не считаем — он ещё идёт)
export function getSkudHoursByDate(
  eventsByDate: Map<string, FotEmployeeEvent[]>,
  today: Date
): Map<string, number> {
  const todayIso = toIsoDate(today.getFullYear(), today.getMonth() + 1, today.getDate())
  const result = new Map<string, number>()
  for (const [dateIso, events] of eventsByDate) {
    if (dateIso >= todayIso || events.length === 0) continue
    const paid = calculateFotSkudDay(events, dateIso, today).paidSeconds / 3600
    result.set(dateIso, Math.round(paid * 10) / 10)
  }
  return result
}

export function buildMonthDays(
  year: number,
  month: number,
  entriesByDay: Map<number, TimesheetEntry>,
  skudHoursByDate: Map<string, number>,
  today: Date
): DayClass[] {
  const daysInMonth = new Date(year, month, 0).getDate()
  return Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1
    const skudHours = skudHoursByDate.get(toIsoDate(year, month, day)) ?? null
    return classifyDay(entriesByDay.get(day), new Date(year, month - 1, day), today, skudHours)
  })
}

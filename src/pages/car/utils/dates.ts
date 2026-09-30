import { MONTHS, MONTHS_SHORT } from '../../../lib/constants'
import type { DateRange } from '../types'

const DAY_MS = 24 * 60 * 60 * 1000

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

export function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function todayIso(): string {
  return toIsoDate(new Date())
}

// Дата записи из БД (YYYY-MM-DD) как локальная полночь, без сдвига часового пояса
export function parseIsoDate(iso: string): Date {
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function isoToTime(iso: string): number {
  return parseIsoDate(iso).getTime()
}

export function addDays(iso: string, days: number): string {
  const date = parseIsoDate(iso)
  date.setDate(date.getDate() + days)
  return toIsoDate(date)
}

export function startOfMonthShifted(date: Date, monthsBack: number): string {
  return toIsoDate(new Date(date.getFullYear(), date.getMonth() - monthsBack, 1))
}

export function daysInRange(range: DateRange): number {
  return Math.round((isoToTime(range.to) - isoToTime(range.from)) / DAY_MS) + 1
}

export function isInRange(iso: string, range: DateRange): boolean {
  const day = iso.slice(0, 10)
  return day >= range.from && day <= range.to
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7)
}

export function formatMonthTitle(key: string): string {
  const [year, month] = key.split('-').map(Number)
  return `${MONTHS[month - 1]} ${year}`
}

export function formatMonthShort(key: string): string {
  const [year, month] = key.split('-').map(Number)
  return `${MONTHS_SHORT[month - 1]} ${year}`
}

// «12 сен», для прошлых лет — «12 сен 2024»
export function formatDayShort(iso: string, withYear = false): string {
  const date = parseIsoDate(iso)
  const base = `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`
  return withYear || date.getFullYear() !== new Date().getFullYear() ? `${base} ${date.getFullYear()}` : base
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const date = parseIsoDate(iso)
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`
}

export function formatTimeTick(time: number): string {
  const date = new Date(time)
  return `${MONTHS_SHORT[date.getMonth()]} ’${String(date.getFullYear()).slice(2)}`
}

export interface TimeAxis {
  ticks: number[]
  format: (time: number) => string
}

// Подписи временной оси: начала месяцев (не больше maxTicks); диапазон короче двух месяцев — края днями
export function buildTimeAxis(times: number[], maxTicks = 5): TimeAxis {
  if (times.length === 0) return { ticks: [], format: formatTimeTick }
  const min = Math.min(...times)
  const max = Math.max(...times)

  const months: number[] = []
  const cursor = new Date(min)
  cursor.setHours(0, 0, 0, 0)
  if (cursor.getDate() !== 1 || cursor.getTime() < min) cursor.setMonth(cursor.getMonth() + 1, 1)
  while (cursor.getTime() <= max) {
    months.push(cursor.getTime())
    cursor.setMonth(cursor.getMonth() + 1, 1)
  }

  if (months.length >= 2) {
    const step = Math.ceil(months.length / maxTicks)
    return { ticks: months.filter((_, index) => index % step === 0), format: formatTimeTick }
  }
  return {
    ticks: min === max ? [min] : [min, max],
    format: time => formatDayShort(toIsoDate(new Date(time)))
  }
}

export function formatTimeLabel(time: number | string): string {
  return formatDayShort(toIsoDate(new Date(Number(time))), true)
}

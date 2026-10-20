import { toLocalIsoDate } from '../../lib/dateUtils'

const parseIso = (iso: string): Date => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

// 2026-10-12 -> 12.10
export const formatShortDate = (iso: string): string => {
  const [, m, d] = iso.split('-')
  return `${d}.${m}`
}

// 2026-10-12 -> 12.10.2026
export const formatFullDate = (iso: string): string => {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

// 2026-10-12 -> 12 окт 2026
export const formatLongDate = (iso: string): string =>
  parseIso(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }).replace(' г.', '')

export const addDays = (iso: string, days: number): string => {
  const d = parseIso(iso)
  d.setDate(d.getDate() + days)
  return toLocalIsoDate(d)
}

export const addMonths = (iso: string, months: number): string => {
  const d = parseIso(iso)
  d.setMonth(d.getMonth() + months)
  return toLocalIsoDate(d)
}

// Число без хвостовых нулей, точка как разделитель (как в поле ввода)
export const formatNum = (value: number, decimals: number): string =>
  String(Math.round(value * 10 ** decimals) / 10 ** decimals)

export const formatDelta = (delta: number, decimals: number): string => {
  const text = formatNum(Math.abs(delta), decimals)
  if (delta > 0) return `+${text}`
  if (delta < 0) return `−${text}`
  return text
}

// Класс цвета: снижение — зелёный токен, рост — danger
export const deltaClass = (delta: number): string => {
  if (delta < 0) return 'down'
  if (delta > 0) return 'up'
  return ''
}

// Разбор числа из поля: запятая -> точка; null — пусто, NaN — ошибка
export const parseDecimal = (text: string): number | null => {
  const clean = text.trim().replace(',', '.')
  if (clean === '') return null
  return /^\d+(\.\d+)?$/.test(clean) ? Number(clean) : NaN
}

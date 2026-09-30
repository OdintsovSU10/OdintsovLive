import type { ExpenseTransaction, ExpenseUserCategory } from '../types'

export const MONTHS = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек']
export const WEEK_DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
export const CHART_COLORS = Array.from({ length: 8 }, (_, index) => `var(--fp-cat-${index + 1})`)

export function pad(value: number): string {
  return String(value).padStart(2, '0')
}

export function toIsoDate(value: Date): string {
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
}

export function formatAmount(value: number, digits = 0): string {
  return value.toLocaleString('ru-RU', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  })
}

export function formatRub(value: number, digits = 0): string {
  return `${formatAmount(value, digits)} ₽`
}

export function formatDate(isoDate: string | null): string {
  if (!isoDate) return '—'
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return isoDate
  return `${match[3]}.${match[2]}.${match[1]}`
}

export function formatDateTime(value: string): string {
  const normalized = value.replace('T', ' ')
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})\s(\d{2}):(\d{2})(?::\d{2})?/)
  if (!match) return value
  return `${match[3]}.${match[2]}.${match[1]} ${match[4]}:${match[5]}`
}

export function parseOperationDate(value: string): Date {
  const normalized = value.includes('T') ? value : value.replace(' ', 'T')
  const parsed = new Date(normalized)
  return Number.isNaN(parsed.getTime()) ? new Date(Number.NaN) : parsed
}

export function formatAxisTick(value: number | string | undefined): string {
  const numeric = typeof value === 'number' ? value : Number(value || 0)
  if (!Number.isFinite(numeric)) return '0'
  if (Math.abs(numeric) < 1000) return formatAmount(numeric)

  return new Intl.NumberFormat('ru-RU', {
    notation: 'compact',
    compactDisplay: 'short',
    maximumFractionDigits: 1
  }).format(numeric)
}

export function getMappedCategoryName(
  transaction: ExpenseTransaction,
  categoriesById: Map<string, ExpenseUserCategory>
): string {
  if (transaction.mapped_category_id) {
    return categoriesById.get(transaction.mapped_category_id)?.name || 'Удалённая категория'
  }

  return transaction.bank_category || 'Без категории'
}

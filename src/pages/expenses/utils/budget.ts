import type { ExpenseTransaction } from '../types'
import { isCountable } from './analysis'

export type BudgetStatus = 'ok' | 'warn' | 'over'

export interface BudgetLimit {
  category_id: string
  monthly_limit: number
}

export interface BudgetCategoryRow {
  categoryId: string
  limit: number
  spent: number
  left: number
  share: number
  status: BudgetStatus
}

export interface BudgetPeriod {
  start: string
  next: string
  daysLeft: number
}

export interface BudgetSummary extends BudgetPeriod {
  rows: BudgetCategoryRow[]
  totalLimit: number
  totalSpent: number
  allowancePerDay: number
}

type BudgetTransaction = Pick<
  ExpenseTransaction,
  'operation_date' | 'flow_direction' | 'status' | 'description' | 'include_in_analytics' | 'payment_amount' | 'mapped_category_id'
>

const DAY_MS = 24 * 60 * 60 * 1000
export const BUDGET_WARN_SHARE = 0.8

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function parseIso(iso: string): number {
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number)
  return Date.UTC(year, month - 1, day)
}

/** Сегодняшняя дата YYYY-MM-DD по Москве */
export function getMoscowToday(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'Europe/Moscow' })
}

// День зарплаты в месяце: в коротких месяцах — последний день
function paydayIso(year: number, monthIndex: number, payday: number): string {
  const normalizedYear = year + Math.floor(monthIndex / 12)
  const normalizedMonth = ((monthIndex % 12) + 12) % 12
  const daysInMonth = new Date(Date.UTC(normalizedYear, normalizedMonth + 1, 0)).getUTCDate()
  return `${normalizedYear}-${pad(normalizedMonth + 1)}-${pad(Math.min(payday, daysInMonth))}`
}

/** Период «от зарплаты до зарплаты»: [start, next), daysLeft включает сегодняшний день (минимум 1) */
export function getBudgetPeriod(today: string, payday: number): BudgetPeriod {
  const year = Number(today.slice(0, 4))
  const monthIndex = Number(today.slice(5, 7)) - 1

  const thisMonth = paydayIso(year, monthIndex, payday)
  const startMonthIndex = thisMonth <= today ? monthIndex : monthIndex - 1
  const start = paydayIso(year, startMonthIndex, payday)
  const next = paydayIso(year, startMonthIndex + 1, payday)

  const daysLeft = Math.max(1, Math.round((parseIso(next) - parseIso(today)) / DAY_MS))
  return { start, next, daysLeft }
}

export function getBudgetStatus(share: number): BudgetStatus {
  if (share >= 1) return 'over'
  if (share >= BUDGET_WARN_SHARE) return 'warn'
  return 'ok'
}

/**
 * Транзакции должны быть уже с mapped_category_id (с учётом правил мерчантов) и без фильтра по периоду страницы.
 */
export function calculateBudget(
  transactions: BudgetTransaction[],
  limits: BudgetLimit[],
  payday: number,
  today: string = getMoscowToday()
): BudgetSummary {
  const period = getBudgetPeriod(today, payday)

  const spentByCategory = new Map<string, number>()
  for (const transaction of transactions) {
    if (transaction.flow_direction !== 'out' || !isCountable(transaction)) continue
    const date = transaction.operation_date.slice(0, 10)
    if (date < period.start || date >= period.next) continue
    if (!transaction.mapped_category_id) continue
    spentByCategory.set(
      transaction.mapped_category_id,
      (spentByCategory.get(transaction.mapped_category_id) || 0) + Math.abs(transaction.payment_amount)
    )
  }

  const rows: BudgetCategoryRow[] = limits
    .filter(item => item.monthly_limit > 0)
    .map(item => {
      const limit = Number(item.monthly_limit)
      const spent = spentByCategory.get(item.category_id) || 0
      const share = spent / limit
      return { categoryId: item.category_id, limit, spent, left: limit - spent, share, status: getBudgetStatus(share) }
    })
    .sort((a, b) => b.share - a.share)

  const totalLimit = rows.reduce((sum, row) => sum + row.limit, 0)
  const totalSpent = rows.reduce((sum, row) => sum + row.spent, 0)
  const allowancePerDay = Math.floor(Math.max(0, totalLimit - totalSpent) / period.daysLeft)

  return { ...period, rows, totalLimit, totalSpent, allowancePerDay }
}

/** «10 ноября» из YYYY-MM-DD */
export function formatBudgetDate(iso: string): string {
  return new Date(parseIso(iso)).toLocaleDateString('ru-RU', { timeZone: 'UTC', day: 'numeric', month: 'long' })
}

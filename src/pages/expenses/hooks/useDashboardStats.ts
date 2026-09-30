import { useMemo } from 'react'
import type { ExpenseTransaction, ExpenseUserCategory } from '../types'
import { isCountable } from '../utils/analysis'
import { getMappedCategoryName, MONTHS, pad, parseOperationDate, WEEK_DAYS, formatDate } from '../utils/format'

export type PeriodPreset = 'month' | 'quarter' | 'half' | 'year' | 'all'
export type CategoryType = 'income' | 'expense'

export interface CategoryBreakdownItem {
  [key: string]: string | number
  name: string
  type: CategoryType
  value: number
}

export interface TimeSeriesPoint {
  name: string
  income: number
  expense: number
  sortKey: number
}

export interface DashboardStats {
  totals: { income: number; expense: number; cashback: number; count: number }
  expenseBreakdown: CategoryBreakdownItem[]
  incomeBreakdown: CategoryBreakdownItem[]
  topCategories: CategoryBreakdownItem[]
  timeSeries: TimeSeriesPoint[]
  weekdayAverage: Array<{ name: string; avg: number }>
}

export function useDashboardStats(
  transactions: ExpenseTransaction[],
  categoriesById: Map<string, ExpenseUserCategory>,
  period: PeriodPreset
): DashboardStats {
  const countable = useMemo(() => transactions.filter(isCountable), [transactions])

  const totals = useMemo(() => {
    return countable.reduce(
      (acc, transaction) => {
        if (transaction.flow_direction === 'in') acc.income += transaction.payment_amount
        if (transaction.flow_direction === 'out') acc.expense += Math.abs(transaction.payment_amount)
        acc.cashback += transaction.cashback_amount || transaction.bonuses_amount || 0
        acc.count += 1
        return acc
      },
      { income: 0, expense: 0, cashback: 0, count: 0 }
    )
  }, [countable])

  const categoryBreakdown = useMemo(() => {
    const grouped = new Map<string, CategoryBreakdownItem>()

    for (const transaction of countable) {
      if (transaction.flow_direction === 'zero') continue

      const type: CategoryType = transaction.flow_direction === 'in' ? 'income' : 'expense'
      const name = getMappedCategoryName(transaction, categoriesById)
      const value = Math.abs(transaction.payment_amount)
      const current = grouped.get(`${type}:${name}`)

      if (current) current.value += value
      else grouped.set(`${type}:${name}`, { name, type, value })
    }

    return Array.from(grouped.values()).sort((a, b) => b.value - a.value)
  }, [categoriesById, countable])

  const expenseBreakdown = useMemo(() => categoryBreakdown.filter(item => item.type === 'expense'), [categoryBreakdown])
  const incomeBreakdown = useMemo(() => categoryBreakdown.filter(item => item.type === 'income'), [categoryBreakdown])

  const timeSeries = useMemo(() => {
    const grouped = new Map<string, TimeSeriesPoint>()

    for (const transaction of countable) {
      const date = parseOperationDate(transaction.operation_at)
      if (Number.isNaN(date.getTime())) continue

      const daily = period === 'month'
      const key = daily ? transaction.operation_date : `${date.getFullYear()}-${pad(date.getMonth() + 1)}`
      const bucket = grouped.get(key) || {
        name: daily ? formatDate(transaction.operation_date).slice(0, 5) : `${MONTHS[date.getMonth()]} ${String(date.getFullYear()).slice(2)}`,
        income: 0,
        expense: 0,
        sortKey: daily ? date.getTime() : date.getFullYear() * 100 + date.getMonth()
      }

      if (transaction.flow_direction === 'in') bucket.income += transaction.payment_amount
      if (transaction.flow_direction === 'out') bucket.expense += Math.abs(transaction.payment_amount)
      grouped.set(key, bucket)
    }

    return Array.from(grouped.values()).sort((a, b) => a.sortKey - b.sortKey)
  }, [countable, period])

  const weekdayAverage = useMemo(() => {
    const grouped = WEEK_DAYS.map(name => ({ name, total: 0, count: 0 }))

    for (const transaction of countable) {
      if (transaction.flow_direction !== 'out') continue
      const date = parseOperationDate(transaction.operation_at)
      if (Number.isNaN(date.getTime())) continue

      const day = (date.getDay() + 6) % 7
      grouped[day].total += Math.abs(transaction.payment_amount)
      grouped[day].count += 1
    }

    return grouped.map(day => ({ name: day.name, avg: day.count > 0 ? Math.round(day.total / day.count) : 0 }))
  }, [countable])

  return {
    totals,
    expenseBreakdown,
    incomeBreakdown,
    topCategories: expenseBreakdown.slice(0, 5),
    timeSeries,
    weekdayAverage
  }
}

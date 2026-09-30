import { useMemo } from 'react'
import type { ExpenseTransaction, ExpenseUserCategory } from '../types'
import { isCountable, merchantKey } from '../utils/analysis'
import { getMappedCategoryName, MONTHS } from '../utils/format'
import { getSpendingGroup, SPENDING_GROUPS } from '../utils/spendingGroups'

export type PeriodPreset = 'month' | 'quarter' | 'half' | 'year' | 'all'

export interface BreakdownItem {
  name: string
  value: number
}

export interface GroupStat {
  key: string
  name: string
  color: string
  value: number
  share: number
  prevValue: number | null
}

export interface MonthStat {
  [groupKey: string]: string | number | boolean
  key: string
  name: string
  title: string
  total: number
  partial: boolean
}

export interface DashboardStats {
  totals: {
    spent: number
    purchases: number
    perDay: number
    days: number
    cashback: number
    prevSpent: number | null
  }
  groups: GroupStat[]
  monthly: MonthStat[]
  /** Группы по каждому месяцу графика, сравнение — с предыдущим месяцем */
  monthGroups: Record<string, GroupStat[]>
  expenseBreakdown: BreakdownItem[]
  merchants: BreakdownItem[]
}

const DAY_MS = 24 * 60 * 60 * 1000
const MONTHS_LIMIT = 12
const MERCHANTS_LIMIT = 10
const PARTIAL_EDGE_DAYS = 3
const MONTH_TITLES = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']

const dayNumber = (isoDate: string) => Math.round(Date.parse(`${isoDate.slice(0, 10)}T00:00:00Z`) / DAY_MS)
const isoFromDay = (day: number) => new Date(day * DAY_MS).toISOString().slice(0, 10)
const isSpend = (t: ExpenseTransaction) => t.flow_direction === 'out' && isCountable(t)
const spent = (t: ExpenseTransaction) => Math.abs(t.payment_amount)

function sumByGroup(transactions: ExpenseTransaction[]): Map<string, number> {
  const sums = new Map<string, number>()
  for (const t of transactions) {
    const key = getSpendingGroup(t.bank_category).key
    sums.set(key, (sums.get(key) || 0) + spent(t))
  }
  return sums
}

function buildGroups(spend: ExpenseTransaction[], prevSpend: ExpenseTransaction[] | null): GroupStat[] {
  const total = spend.reduce((acc, t) => acc + spent(t), 0)
  const current = sumByGroup(spend)
  const previous = prevSpend ? sumByGroup(prevSpend) : null

  return SPENDING_GROUPS
    .map(group => ({
      ...group,
      value: current.get(group.key) || 0,
      share: total > 0 ? (current.get(group.key) || 0) / total : 0,
      prevValue: previous ? previous.get(group.key) || 0 : null
    }))
    .filter(group => group.value > 0)
    .sort((a, b) => b.value - a.value)
}

function previousMonthKey(key: string): string {
  const [year, month] = key.split('-').map(Number)
  return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}`
}

function buildMonthGroups(pool: ExpenseTransaction[], months: MonthStat[]): Record<string, GroupStat[]> {
  const byMonth = new Map<string, ExpenseTransaction[]>()
  for (const t of pool) {
    const key = t.operation_date.slice(0, 7)
    const list = byMonth.get(key)
    if (list) list.push(t)
    else byMonth.set(key, [t])
  }

  return Object.fromEntries(months.map(month => {
    const prev = byMonth.get(previousMonthKey(month.key))
    return [month.key, buildGroups((byMonth.get(month.key) || []).filter(isSpend), prev ? prev.filter(isSpend) : null)]
  }))
}

function topBy(transactions: ExpenseTransaction[], getName: (t: ExpenseTransaction) => string, limit?: number): BreakdownItem[] {
  const sums = new Map<string, BreakdownItem>()
  for (const t of transactions) {
    const name = getName(t)
    const item = sums.get(name) || { name, value: 0 }
    item.value += spent(t)
    sums.set(name, item)
  }
  const sorted = Array.from(sums.values()).sort((a, b) => b.value - a.value)
  return limit ? sorted.slice(0, limit) : sorted
}

function buildMonthly(pool: ExpenseTransaction[]): MonthStat[] {
  const months = new Map<string, MonthStat & { minDay: number; maxDay: number }>()

  for (const t of pool) {
    const key = t.operation_date.slice(0, 7)
    const day = Number(t.operation_date.slice(8, 10))
    const month = months.get(key) || {
      key,
      name: `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(2, 4)}`,
      title: `${MONTH_TITLES[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`,
      total: 0,
      partial: false,
      minDay: day,
      maxDay: day,
      ...Object.fromEntries(SPENDING_GROUPS.map(group => [group.key, 0]))
    }
    month.minDay = Math.min(month.minDay, day)
    month.maxDay = Math.max(month.maxDay, day)

    if (isSpend(t)) {
      const group = getSpendingGroup(t.bank_category).key
      month[group] = Number(month[group]) + spent(t)
      month.total += spent(t)
    }
    months.set(key, month)
  }

  return Array.from(months.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-MONTHS_LIMIT)
    .map(([key, { minDay, maxDay, ...month }]) => {
      const [year, monthIndex] = key.split('-').map(Number)
      const daysInMonth = new Date(year, monthIndex, 0).getDate()
      const partial = minDay > 1 + PARTIAL_EDGE_DAYS || maxDay < daysInMonth - PARTIAL_EDGE_DAYS
      return { ...month, name: partial ? `${month.name}*` : month.name, partial }
    })
}

/**
 * periodTransactions — операции под текущими фильтрами (период, категории);
 * pool — те же фильтры категорий без периода: для сравнения с прошлым периодом и помесячного графика.
 */
export function useDashboardStats(
  periodTransactions: ExpenseTransaction[],
  pool: ExpenseTransaction[],
  categoriesById: Map<string, ExpenseUserCategory>,
  dateFrom: string,
  dateTo: string
): DashboardStats {
  return useMemo(() => {
    const spend = periodTransactions.filter(isSpend)
    const spentTotal = spend.reduce((acc, t) => acc + spent(t), 0)
    const purchases = spend.filter(t => getSpendingGroup(t.bank_category).key !== 'transfers').reduce((acc, t) => acc + spent(t), 0)
    const cashback = periodTransactions
      .filter(isCountable)
      .reduce((acc, t) => acc + (t.cashback_amount || t.bonuses_amount || 0), 0)

    const dates = periodTransactions.map(t => t.operation_date).sort()
    const fromDay = dateFrom ? dayNumber(dateFrom) : dates.length ? dayNumber(dates[0]) : 0
    const toDay = dateTo ? dayNumber(dateTo) : dates.length ? dayNumber(dates[dates.length - 1]) : 0
    const days = Math.max(1, toDay - fromDay + 1)

    // Прошлый период той же длины — только когда период задан явно
    let prevSpend: ExpenseTransaction[] | null = null
    if (dateFrom && dateTo) {
      const prevTo = isoFromDay(fromDay - 1)
      const prevFrom = isoFromDay(fromDay - days)
      const prevAll = pool.filter(t => t.operation_date >= prevFrom && t.operation_date <= prevTo)
      if (prevAll.length > 0) prevSpend = prevAll.filter(isSpend)
    }
    const prevSpent = prevSpend ? prevSpend.reduce((acc, t) => acc + spent(t), 0) : null
    const monthly = buildMonthly(pool)

    return {
      totals: { spent: spentTotal, purchases, perDay: spentTotal / days, days, cashback, prevSpent },
      groups: buildGroups(spend, prevSpend),
      monthly,
      monthGroups: buildMonthGroups(pool, monthly),
      expenseBreakdown: topBy(spend, t => getMappedCategoryName(t, categoriesById)),
      merchants: topBy(
        spend.filter(t => getSpendingGroup(t.bank_category).key !== 'transfers'),
        t => (merchantKey(t.description) ? t.description || '' : 'Без описания'),
        MERCHANTS_LIMIT
      )
    }
  }, [categoriesById, dateFrom, dateTo, periodTransactions, pool])
}

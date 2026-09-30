import { MONTHS_SHORT } from '../../../lib/constants'
import { KIND_META, MAX_MONTH_BUCKETS } from '../constants'
import type { DateRange, JournalEntry, RecordKind } from '../types'
import { addDays, formatMonthTitle, isInRange, toIsoDate } from './dates'

export interface CostBucket {
  key: string
  label: string
  title: string
  range: DateRange
  maintenance: number
  fuel: number
  expense: number
  total: number
}

export interface BreakdownItem {
  key: string
  name: string
  color: string
  kind: RecordKind
  value: number
  prevValue: number | null
  share: number
}

const QUARTER_NAMES = ['I', 'II', 'III', 'IV']

function monthRange(year: number, month: number): DateRange {
  return {
    from: toIsoDate(new Date(year, month, 1)),
    to: toIsoDate(new Date(year, month + 1, 0))
  }
}

function monthsBetween(range: DateRange): { year: number; month: number }[] {
  const [fromYear, fromMonth] = range.from.split('-').map(Number)
  const [toYear, toMonth] = range.to.split('-').map(Number)
  const result: { year: number; month: number }[] = []
  for (let index = fromYear * 12 + fromMonth - 1; index <= toYear * 12 + toMonth - 1; index++) {
    result.push({ year: Math.floor(index / 12), month: index % 12 })
  }
  return result
}

function emptyBucket(key: string, label: string, title: string, range: DateRange): CostBucket {
  return { key, label, title, range, maintenance: 0, fuel: 0, expense: 0, total: 0 }
}

// Корзины по месяцам (или кварталам, если месяцев слишком много); пустые — нулями,
// чтобы ось времени не «сжимала» месяцы без трат
export function buildCostBuckets(entries: JournalEntry[], range: DateRange): CostBucket[] {
  const months = monthsBetween(range)
  const byQuarter = months.length > MAX_MONTH_BUCKETS
  const buckets: CostBucket[] = []

  for (const { year, month } of months) {
    if (byQuarter) {
      const quarter = Math.floor(month / 3)
      const key = `${year}-Q${quarter + 1}`
      if (buckets[buckets.length - 1]?.key === key) continue
      const first = monthRange(year, quarter * 3)
      const last = monthRange(year, quarter * 3 + 2)
      buckets.push(emptyBucket(
        key,
        `${QUARTER_NAMES[quarter]} ’${String(year).slice(2)}`,
        `${QUARTER_NAMES[quarter]} квартал ${year}`,
        { from: first.from, to: last.to }
      ))
    } else {
      const key = `${year}-${String(month + 1).padStart(2, '0')}`
      const label = month === 0 || buckets.length === 0
        ? `${MONTHS_SHORT[month]} ’${String(year).slice(2)}`
        : MONTHS_SHORT[month]
      buckets.push(emptyBucket(key, label, formatMonthTitle(key), monthRange(year, month)))
    }
  }

  for (const entry of entries) {
    if (!isInRange(entry.date, range)) continue
    const bucket = buckets.find(item => isInRange(entry.date, item.range))
    if (!bucket) continue
    bucket[entry.kind] += entry.amount
    bucket.total += entry.amount
  }
  return buckets
}

// Корзина перед данной — для сравнения «к прошлому месяцу/кварталу»
export function previousBucketRange(bucket: CostBucket): DateRange {
  const to = addDays(bucket.range.from, -1)
  const [year, month] = to.split('-').map(Number)
  const isQuarter = bucket.key.includes('Q')
  const from = toIsoDate(new Date(year, month - (isQuarter ? 3 : 1), 1))
  return { from, to }
}

function sumByGroup(entries: JournalEntry[], range: DateRange): Map<string, { entry: JournalEntry; value: number }> {
  const totals = new Map<string, { entry: JournalEntry; value: number }>()
  for (const entry of entries) {
    if (!isInRange(entry.date, range) || entry.amount <= 0) continue
    const current = totals.get(entry.groupKey)
    totals.set(entry.groupKey, { entry, value: (current?.value ?? 0) + entry.amount })
  }
  return totals
}

// «Куда уходят деньги»: ТО, бензин и каждая категория допов — цветом своего вида
export function buildBreakdown(entries: JournalEntry[], range: DateRange, previous: DateRange | null): BreakdownItem[] {
  const current = sumByGroup(entries, range)
  const prev = previous ? sumByGroup(entries, previous) : null
  const total = Array.from(current.values()).reduce((acc, item) => acc + item.value, 0)

  return Array.from(current.entries())
    .map(([key, { entry, value }]) => ({
      key,
      name: entry.kind === 'expense' ? entry.title : KIND_META[entry.kind].label,
      color: KIND_META[entry.kind].color,
      kind: entry.kind,
      value,
      prevValue: prev ? prev.get(key)?.value ?? 0 : null,
      share: total > 0 ? value / total : 0
    }))
    .sort((a, b) => b.value - a.value)
}

export function sumInRange(entries: JournalEntry[], range: DateRange): number {
  return entries.reduce((acc, entry) => acc + (isInRange(entry.date, range) ? entry.amount : 0), 0)
}

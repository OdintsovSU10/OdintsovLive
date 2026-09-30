import { KIND_META } from '../constants'
import type {
  ExpenseType, FuelType, JournalEntry, JournalFilter, MaintenanceType, SortDir, SortField
} from '../types'
import { formatMonthTitle, isInRange, monthKey } from './dates'
import { formatNumber } from './format'

export interface JournalGroup {
  key: string
  title: string
  total: number
  entries: JournalEntry[]
}

export function expenseGroupKey(category: string): string {
  return `expense:${category}`
}

export function buildJournalEntries(
  maintenance: MaintenanceType[],
  fuel: FuelType[],
  expenses: ExpenseType[],
  consumptionByFuelId: Map<string, number>
): JournalEntry[] {
  const maintenanceEntries: JournalEntry[] = maintenance.map(row => ({
    id: row.id,
    kind: 'maintenance',
    date: row.date,
    mileage: row.mileage,
    title: row.type,
    details: row.description,
    amount: Number(row.cost || 0),
    groupKey: 'maintenance',
    record: { kind: 'maintenance', row }
  }))

  const fuelEntries: JournalEntry[] = fuel.map(row => {
    const l100 = consumptionByFuelId.get(row.id)
    const parts = [
      row.fuel_type,
      row.liters ? `${formatNumber(Number(row.liters), 1)} л` : null,
      l100 ? `${formatNumber(l100, 1)} л/100` : null
    ].filter(Boolean)
    return {
      id: row.id,
      kind: 'fuel',
      date: row.date,
      mileage: row.mileage,
      title: 'Заправка',
      details: parts.join(' · '),
      amount: Number(row.total_cost || 0),
      groupKey: 'fuel',
      record: { kind: 'fuel', row }
    }
  })

  const expenseEntries: JournalEntry[] = expenses.map(row => ({
    id: row.id,
    kind: 'expense',
    date: row.date,
    mileage: null,
    title: row.category,
    details: row.description,
    amount: Number(row.cost || 0),
    groupKey: expenseGroupKey(row.category),
    record: { kind: 'expense', row }
  }))

  return [...maintenanceEntries, ...fuelEntries, ...expenseEntries]
}

export function filterEntries(entries: JournalEntry[], filter: JournalFilter): JournalEntry[] {
  const query = filter.query.trim().toLowerCase()
  return entries.filter(entry => {
    if (filter.kind !== 'all' && entry.kind !== filter.kind) return false
    if (filter.range && !isInRange(entry.date, filter.range)) return false
    if (filter.group && entry.groupKey !== filter.group.key) return false
    if (!query) return true
    const haystack = `${entry.title} ${entry.details ?? ''} ${KIND_META[entry.kind].label}`.toLowerCase()
    return haystack.includes(query)
  })
}

export function sortEntries(entries: JournalEntry[], field: SortField, dir: SortDir): JournalEntry[] {
  const sign = dir === 'desc' ? -1 : 1
  return [...entries].sort((a, b) => {
    const primary = field === 'date' ? a.date.localeCompare(b.date) : a.amount - b.amount
    if (primary !== 0) return primary * sign
    return (a.mileage ?? 0) - (b.mileage ?? 0) || a.id.localeCompare(b.id)
  })
}

// Группы по месяцам — только при сортировке по дате; по сумме — одним списком
export function groupEntries(entries: JournalEntry[], field: SortField): JournalGroup[] {
  if (field === 'amount') {
    return entries.length === 0 ? [] : [{
      key: 'all',
      title: 'По сумме',
      total: entries.reduce((acc, entry) => acc + entry.amount, 0),
      entries
    }]
  }

  const groups: JournalGroup[] = []
  for (const entry of entries) {
    const key = monthKey(entry.date)
    const last = groups[groups.length - 1]
    if (last && last.key === key) {
      last.entries.push(entry)
      last.total += entry.amount
    } else {
      groups.push({ key, title: formatMonthTitle(key), total: entry.amount, entries: [entry] })
    }
  }
  return groups
}

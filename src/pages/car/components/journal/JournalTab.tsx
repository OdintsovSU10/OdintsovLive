import { useMemo, useState } from 'react'
import { ListX, NotebookPen } from 'lucide-react'
import { EMPTY_JOURNAL_FILTER } from '../../constants'
import type { JournalEntry, JournalFilter, SortDir, SortField } from '../../types'
import { averageConsumption } from '../../utils/consumption'
import type { ConsumptionInterval } from '../../utils/consumption'
import { formatL100, formatNumber, formatRub, plural } from '../../utils/format'
import { filterEntries, groupEntries, sortEntries } from '../../utils/journal'
import { JournalFilters } from './JournalFilters'
import { JournalRow } from './JournalRow'

const SKELETON_ROWS = 6

interface Props {
  entries: JournalEntry[]
  intervals: ConsumptionInterval[]
  loading: boolean
  filter: JournalFilter
  onFilterChange: (filter: JournalFilter) => void
  onOpen: (entry: JournalEntry) => void
  onAdd: () => void
}

export function JournalTab({ entries, intervals, loading, filter, onFilterChange, onOpen, onAdd }: Props) {
  const [sortField, setSortField] = useState<SortField>('date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const filtered = useMemo(() => filterEntries(entries, filter), [entries, filter])
  const groups = useMemo(
    () => groupEntries(sortEntries(filtered, sortField, sortDir), sortField),
    [filtered, sortField, sortDir]
  )
  const total = filtered.reduce((acc, entry) => acc + entry.amount, 0)

  // Сводка по топливу — когда смотрим только заправки
  const fuelSummary = useMemo(() => {
    if (filter.kind !== 'fuel') return null
    const ids = new Set(filtered.map(entry => entry.id))
    let liters = 0
    let cost = 0
    for (const entry of filtered) {
      if (entry.record.kind !== 'fuel' || !entry.record.row.liters) continue
      liters += Number(entry.record.row.liters)
      cost += Number(entry.record.row.total_cost || 0)
    }
    return {
      liters,
      price: liters > 0 ? cost / liters : null,
      l100: averageConsumption(intervals.filter(item => ids.has(item.fuelId)))
    }
  }, [filter.kind, filtered, intervals])

  const hasFilters = filter.kind !== 'all' || filter.range || filter.group || filter.query

  return (
    <div className="car-journal">
      <JournalFilters
        filter={filter}
        onChange={onFilterChange}
        sortField={sortField}
        sortDir={sortDir}
        onSortChange={(field, dir) => { setSortField(field); setSortDir(dir) }}
      />

      {!loading && filtered.length > 0 && (
        <div className="car-journal-summary">
          <span>{filtered.length} {plural(filtered.length, ['запись', 'записи', 'записей'])}</span>
          <strong>{formatRub(total)}</strong>
        </div>
      )}

      {fuelSummary && filtered.length > 0 && (
        <div className="car-fuel-strip">
          <div><span>Расход</span><strong>{fuelSummary.l100 ? formatL100(fuelSummary.l100) : '—'}</strong></div>
          <div><span>Цена литра</span><strong>{fuelSummary.price ? formatRub(fuelSummary.price, 2) : '—'}</strong></div>
          <div><span>Залито</span><strong>{formatNumber(fuelSummary.liters)} л</strong></div>
        </div>
      )}

      {loading ? (
        <ul className="car-rows" aria-busy="true">
          {Array.from({ length: SKELETON_ROWS }, (_, index) => <li key={index} className="car-row-skeleton" />)}
        </ul>
      ) : groups.length === 0 ? (
        <div className="car-empty">
          {hasFilters ? <ListX size={40} strokeWidth={1.25} /> : <NotebookPen size={40} strokeWidth={1.25} />}
          <p>{hasFilters ? 'Ничего не найдено' : 'Записей пока нет'}</p>
          {hasFilters ? (
            <button type="button" className="car-btn ghost" onClick={() => onFilterChange(EMPTY_JOURNAL_FILTER)}>
              Сбросить фильтры
            </button>
          ) : (
            <button type="button" className="car-btn primary" onClick={onAdd}>Добавить запись</button>
          )}
        </div>
      ) : (
        groups.map(group => (
          <section key={group.key} className="car-journal-group" aria-label={group.title}>
            <h3 className="car-journal-month">
              <span>{group.title}</span>
              <span className="car-journal-month-total">{formatRub(group.total)}</span>
            </h3>
            <ul className="car-rows">
              {group.entries.map(entry => <JournalRow key={`${entry.kind}-${entry.id}`} entry={entry} onOpen={onOpen} />)}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}

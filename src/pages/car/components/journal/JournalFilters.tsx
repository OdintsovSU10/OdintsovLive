import { Search, X } from 'lucide-react'
import { SegmentedControl } from '../../../../components/ui/SegmentedControl'
import { KIND_META } from '../../constants'
import type { JournalFilter, RecordKind, SortDir, SortField } from '../../types'

type KindOption = RecordKind | 'all'
type SortOption = `${SortField}:${SortDir}`

const KIND_OPTIONS: { value: KindOption; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'fuel', label: KIND_META.fuel.label },
  { value: 'maintenance', label: KIND_META.maintenance.label },
  { value: 'expense', label: KIND_META.expense.label }
]

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'date:desc', label: 'Сначала новые' },
  { value: 'date:asc', label: 'Сначала старые' },
  { value: 'amount:desc', label: 'Сначала дорогие' },
  { value: 'amount:asc', label: 'Сначала дешёвые' }
]

interface Props {
  filter: JournalFilter
  onChange: (filter: JournalFilter) => void
  sortField: SortField
  sortDir: SortDir
  onSortChange: (field: SortField, dir: SortDir) => void
}

export function JournalFilters({ filter, onChange, sortField, sortDir, onSortChange }: Props) {
  const handleSort = (value: string) => {
    const [field, dir] = value.split(':') as [SortField, SortDir]
    onSortChange(field, dir)
  }

  return (
    <div className="car-journal-filters">
      <SegmentedControl
        options={KIND_OPTIONS}
        value={filter.kind}
        onChange={kind => onChange({ ...filter, kind, group: null })}
        ariaLabel="Вид записей"
        stretch
      />

      <div className="car-journal-tools">
        <label className="car-search">
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            placeholder="Поиск по записям"
            aria-label="Поиск по записям"
            value={filter.query}
            onChange={e => onChange({ ...filter, query: e.target.value })}
          />
        </label>
        <select
          className="car-select"
          aria-label="Сортировка"
          value={`${sortField}:${sortDir}`}
          onChange={e => handleSort(e.target.value)}
        >
          {SORT_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </div>

      {(filter.range || filter.group) && (
        <div className="car-active-filters">
          {filter.range && (
            <button type="button" className="car-filter-chip" onClick={() => onChange({ ...filter, range: null })}>
              {filter.range.label}
              <X size={14} aria-label="Убрать фильтр" />
            </button>
          )}
          {filter.group && (
            <button type="button" className="car-filter-chip" onClick={() => onChange({ ...filter, group: null })}>
              {filter.group.label}
              <X size={14} aria-label="Убрать фильтр" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}

import { useMemo, useState, type FC } from 'react'
import { ClearableInput } from '../../../components/ui/ClearableInput'
import { matchTenderEmployee, type ITenderEmployeeRef } from '../utils/matchTenderEmployee'
import type { ParsedEmployee } from '../types'

type PickStatus = 'new' | 'existing' | 'archived'
type PickFilter = 'all' | 'new' | 'existing'

interface IFotEmployeePickerProps {
  employees: ParsedEmployee[]
  refs: ITenderEmployeeRef[]
  selected: Set<number>
  onChange: (next: Set<number>) => void
  showWork: boolean
}

const STATUS_LABEL: Record<PickStatus, string> = {
  new: 'Новый',
  existing: 'Есть',
  archived: 'В архиве'
}

export const getPickStatuses = (employees: ParsedEmployee[], refs: ITenderEmployeeRef[]): PickStatus[] =>
  employees.map(emp => {
    const match = matchTenderEmployee(emp, refs)
    if (!match) return 'new'
    return match.is_archived ? 'archived' : 'existing'
  })

export const getDefaultSelection = (statuses: PickStatus[]): Set<number> => {
  const next = new Set<number>()
  statuses.forEach((status, index) => {
    if (status !== 'archived') next.add(index)
  })
  return next
}

const normalizeSearch = (value: string): string => value.trim().toLowerCase().replace(/ё/g, 'е')

export const FotEmployeePicker: FC<IFotEmployeePickerProps> = ({
  employees,
  refs,
  selected,
  onChange,
  showWork
}) => {
  const [filter, setFilter] = useState<PickFilter>('all')
  const [query, setQuery] = useState('')

  const statuses = useMemo(() => getPickStatuses(employees, refs), [employees, refs])

  const counts = useMemo(() => {
    const newCount = statuses.filter(status => status === 'new').length
    return { all: statuses.length, new: newCount, existing: statuses.length - newCount }
  }, [statuses])

  const visible = useMemo(() => {
    const needle = normalizeSearch(query)
    const result: number[] = []
    employees.forEach((emp, index) => {
      const isNew = statuses[index] === 'new'
      if (filter === 'new' && !isNew) return
      if (filter === 'existing' && isNew) return
      if (needle && !normalizeSearch(emp.full_name).includes(needle)) return
      result.push(index)
    })
    return result
  }, [employees, statuses, filter, query])

  const toggle = (index: number) => {
    const next = new Set(selected)
    if (next.has(index)) next.delete(index)
    else next.add(index)
    onChange(next)
  }

  const selectVisible = () => {
    const next = new Set(selected)
    visible.forEach(index => next.add(index))
    onChange(next)
  }

  const clearVisible = () => {
    const next = new Set(selected)
    visible.forEach(index => next.delete(index))
    onChange(next)
  }

  const filters: Array<{ key: PickFilter; label: string; count: number }> = [
    { key: 'all', label: 'Все', count: counts.all },
    { key: 'new', label: 'Новые', count: counts.new },
    { key: 'existing', label: 'Есть', count: counts.existing }
  ]

  return (
    <div className="fot-pick">
      <div className="fot-pick-filters" role="group" aria-label="Фильтр сотрудников">
        {filters.map(item => (
          <button
            key={item.key}
            type="button"
            className={`fot-pick-filter${filter === item.key ? ' active' : ''}`}
            aria-pressed={filter === item.key}
            onClick={() => setFilter(item.key)}
          >
            {item.label} {item.count}
          </button>
        ))}
      </div>

      <ClearableInput
        type="search"
        className="fot-pick-search"
        wrapperClassName="fot-pick-search-wrap"
        placeholder="Поиск по ФИО"
        value={query}
        onChange={event => setQuery(event.target.value)}
        onClear={() => setQuery('')}
        clearLabel="Очистить поиск"
      />

      <div className="fot-pick-toolbar">
        <span className="fot-pick-count">Выбрано {selected.size} из {employees.length}</span>
        <div className="fot-pick-bulk">
          <button type="button" className="fot-pick-bulk-btn" onClick={selectVisible} disabled={visible.length === 0}>
            Отметить все
          </button>
          <button type="button" className="fot-pick-bulk-btn" onClick={clearVisible} disabled={visible.length === 0}>
            Снять все
          </button>
        </div>
      </div>

      <div className="fot-pick-list">
        {visible.length === 0 ? (
          <div className="fot-pick-empty">Никого не найдено</div>
        ) : (
          visible.map(index => {
            const emp = employees[index]
            const status = statuses[index]
            const work = [emp.position, emp.department].filter(Boolean).join(' · ')
            return (
              <label key={index} className="fot-pick-row">
                <input
                  type="checkbox"
                  checked={selected.has(index)}
                  onChange={() => toggle(index)}
                />
                <span className="fot-pick-main">
                  <span className="fot-pick-name">{emp.full_name}</span>
                  {showWork && work && <span className="fot-pick-sub">{work}</span>}
                </span>
                <span className={`fot-pick-badge fot-pick-badge-${status}`}>{STATUS_LABEL[status]}</span>
              </label>
            )
          })
        )}
      </div>
    </div>
  )
}

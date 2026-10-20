import { memo, useMemo, useState, type FC, type ReactNode } from 'react'
import { ArrowLeft, Eye, EyeOff, X } from 'lucide-react'
import { ClearableInput } from '../../../../components/ui/ClearableInput'
import type { EmployeeWithStats } from '../../types'
import type { IListScore } from '../../hooks/useEmployeeScores'
import { EmployeeRow, type IAdminRowActions } from './EmployeeRow'
import type { Tone } from './dashboardMetrics'
import type { IEmployeeTrend, PresenceMap } from './dashboardTypes'
import {
  ADMIN_SORT_KEYS,
  buildPanelRows,
  COMMON_SORT_KEYS,
  filterPanelRows,
  SORT_LABELS,
  sortPanelRows,
  type PanelFilterKey,
  type PanelSortKey
} from './employeesPanelUtils'

export interface IEmployeesPanelProps {
  title: string
  trends: IEmployeeTrend[]
  isLive: boolean
  // Доля месяца (округлена снаружи, чтобы список не перерисовывался каждую секунду)
  progress: number
  // Статусы «сегодня»; null — не текущий месяц
  statuses: PresenceMap | null
  scores: ReadonlyMap<number, IListScore>
  scoresLoading: boolean
  severity: ReadonlyMap<number, Tone>
  admin: IAdminRowActions | null
  onToggleHideSalaries: () => void
  onSelectEmployee: (employee: EmployeeWithStats) => void
  // Закрыть панель: на широком экране — крестик, на узком — «← Подразделения»
  onClose: () => void
  compact: boolean
  // Кнопки администратора справа от заголовка (телефон)
  headExtra?: ReactNode
}

// Люди выбранной области: поиск, фильтры, сортировка; админу — оклады и действия в строке
const EmployeesPanelBase: FC<IEmployeesPanelProps> = ({
  title,
  trends,
  isLive,
  progress,
  statuses,
  scores,
  scoresLoading,
  severity,
  admin,
  onToggleHideSalaries,
  onSelectEmployee,
  onClose,
  compact,
  headExtra
}) => {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<PanelFilterKey>('all')
  const [sort, setSort] = useState<PanelSortKey>('accrued')

  const rows = useMemo(
    () => buildPanelRows({ trends, isLive, progress, scores, severity }),
    [trends, isLive, progress, scores, severity]
  )
  const attentionCount = useMemo(() => rows.filter(row => row.severity !== null).length, [rows])
  const incompleteCount = useMemo(() => rows.filter(row => row.incomplete).length, [rows])

  const activeFilter: PanelFilterKey = filter === 'incomplete' && !admin ? 'all' : filter
  const visible = useMemo(
    () => sortPanelRows(filterPanelRows(rows, search, activeFilter), sort),
    [rows, search, activeFilter, sort]
  )

  const sortKeys = admin ? [...COMMON_SORT_KEYS, ...ADMIN_SORT_KEYS] : COMMON_SORT_KEYS
  const filters: Array<{ key: PanelFilterKey; label: string; count: number | null }> = [
    { key: 'all', label: 'Все', count: rows.length },
    { key: 'attention', label: 'Требуют внимания', count: attentionCount },
    ...(admin ? [{ key: 'incomplete' as const, label: 'Неполные данные', count: incompleteCount }] : [])
  ]

  return (
    <div className="dash-emp-panel">
      <div className="dash-emp-panel-head">
        {compact && (
          <button type="button" className="dash-emp-back" onClick={onClose}>
            <ArrowLeft size={16} strokeWidth={1.5} />
            Подразделения
          </button>
        )}
        <h3 className="dash-emp-panel-title">
          {title}
          <span className="dash-emp-panel-count">{rows.length}</span>
        </h3>
        {compact && headExtra}
        {!compact && (
          <button type="button" className="dash-emp-close" onClick={onClose} aria-label="Закрыть список сотрудников">
            <X size={18} strokeWidth={1.5} />
          </button>
        )}
      </div>

      <div className="dash-emp-tools">
        <ClearableInput
          wrapperClassName="dash-emp-search"
          className="dash-emp-input"
          value={search}
          onChange={event => setSearch(event.target.value)}
          onClear={() => setSearch('')}
          clearLabel="Очистить поиск"
          placeholder="Поиск по ФИО и должности"
          aria-label="Поиск сотрудников"
          autoComplete="off"
        />
        <label className="dash-emp-sort">
          <span className="dash-emp-sort-label">Сортировка</span>
          <select
            className="dash-emp-select"
            value={sort}
            onChange={event => setSort(event.target.value as PanelSortKey)}
          >
            {sortKeys.map(key => <option key={key} value={key}>{SORT_LABELS[key]}</option>)}
          </select>
        </label>
        {admin && (
          <button
            type="button"
            className={`dash-emp-icon-toggle${admin.hideSalaries ? ' active' : ''}`}
            onClick={onToggleHideSalaries}
            aria-pressed={admin.hideSalaries}
            aria-label={admin.hideSalaries ? 'Показать оклады' : 'Скрыть оклады'}
            title={admin.hideSalaries ? 'Показать оклады' : 'Скрыть оклады'}
          >
            {admin.hideSalaries ? <EyeOff size={16} strokeWidth={1.5} /> : <Eye size={16} strokeWidth={1.5} />}
          </button>
        )}
      </div>

      <div className="dash-emp-filters" role="group" aria-label="Фильтр сотрудников">
        {filters.map(item => (
          <button
            key={item.key}
            type="button"
            className="dash-filter-chip"
            aria-pressed={activeFilter === item.key}
            onClick={() => setFilter(item.key)}
          >
            {item.label}
            {item.count !== null && <span className="dash-emp-filter-count">{item.count}</span>}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="dash-empty">Сотрудники не найдены</div>
      ) : (
        <ul className="dash-emp-list">
          {visible.map(row => (
            <EmployeeRow
              key={row.trend.employee.id}
              row={row}
              status={statuses ? statuses.get(row.trend.employee.id) : undefined}
              score={scores.get(row.trend.employee.id)}
              scoresLoading={scoresLoading}
              admin={admin}
              onSelect={onSelectEmployee}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

export const EmployeesPanel = memo(EmployeesPanelBase)

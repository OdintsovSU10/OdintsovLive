import { memo, useMemo, useState, type FC } from 'react'
import { Building2, Eye, EyeOff, Plus } from 'lucide-react'
import { ClearableInput } from '../../../../components/ui/ClearableInput'
import type { EmployeeWithStats } from '../../types'
import type { IListScore } from '../../hooks/useEmployeeScores'
import type { Tone } from './dashboardMetrics'
import type { AdminPanelSheet, FirstEntryMap, IEmployeeTrend, PresenceMap } from './dashboardTypes'
import {
  ADMIN_SORT_KEYS,
  buildPanelRows,
  COMMON_SORT_KEYS,
  filterPanelRows,
  matchesTab,
  SORT_LABELS,
  sortPanelRows,
  type PanelSortKey,
  type PanelTabKey
} from './employeesPanelUtils'
import { PersonRow, type IAdminRowActions } from './PersonRow'

interface IPeopleColumnProps {
  trends: IEmployeeTrend[]
  isLive: boolean
  // Доля месяца (округлена снаружи, чтобы список не перерисовывался каждую секунду)
  progress: number
  // Статусы «сегодня»; null — не текущий месяц
  statuses: PresenceMap | null
  firstEntries: FirstEntryMap
  scores: ReadonlyMap<number, IListScore>
  scoresLoading: boolean
  severity: ReadonlyMap<number, Tone>
  admin: IAdminRowActions | null
  onToggleHideSalaries: () => void
  onSelectEmployee: (employee: EmployeeWithStats) => void
  // Открыть лист администратора; null — не админ. Кнопки видны только на телефоне, выше — они в строке вкладок
  onOpenSheet: ((sheet: AdminPanelSheet) => void) | null
}

const TAB_LABELS: Record<PanelTabKey, string> = {
  all: 'Все',
  onsite: 'На месте',
  away: 'Нет на месте',
  attention: 'Внимание'
}

const TODAY_TABS: PanelTabKey[] = ['all', 'onsite', 'away', 'attention']
const MONTH_TABS: PanelTabKey[] = ['all', 'attention']

// Колонка «Люди»: вкладки по присутствию, поиск, сортировка; админу — оклады и меню действий в строке
const PeopleColumnBase: FC<IPeopleColumnProps> = ({
  trends,
  isLive,
  progress,
  statuses,
  firstEntries,
  scores,
  scoresLoading,
  severity,
  admin,
  onToggleHideSalaries,
  onSelectEmployee,
  onOpenSheet
}) => {
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<PanelTabKey>('all')
  const [sort, setSort] = useState<PanelSortKey | null>(null)

  const hasPresence = statuses !== null
  const tabs = hasPresence ? TODAY_TABS : MONTH_TABS
  const activeTab: PanelTabKey = tabs.includes(tab) ? tab : 'all'

  const sortKeys = useMemo(() => {
    const keys = admin ? [...COMMON_SORT_KEYS, ...ADMIN_SORT_KEYS] : COMMON_SORT_KEYS
    return hasPresence ? keys : keys.filter(key => key !== 'arrival')
  }, [admin, hasPresence])
  const defaultSort: PanelSortKey = hasPresence ? 'arrival' : 'accrued'
  const activeSort: PanelSortKey = sort && sortKeys.includes(sort) ? sort : defaultSort

  const rows = useMemo(
    () => buildPanelRows({ trends, isLive, progress, scores, severity, statuses, firstEntries }),
    [trends, isLive, progress, scores, severity, statuses, firstEntries]
  )
  const tabCounts = useMemo(() => Object.fromEntries(
    tabs.map(key => [key, rows.filter(row => matchesTab(row, key)).length])
  ) as Record<PanelTabKey, number>, [rows, tabs])

  const visible = useMemo(
    () => sortPanelRows(filterPanelRows(rows, search, activeTab), activeSort),
    [rows, search, activeTab, activeSort]
  )

  return (
    <section className="dash-card dash-people">
      <div className="dash-people-head">
        <h3 className="dash-card-title">
          Люди
          <span className="dash-people-count">{rows.length}</span>
        </h3>
        {onOpenSheet && (
          <div className="dash-people-actions">
            <button
              type="button"
              className="dash-icon-btn"
              onClick={() => onOpenSheet('subdivisions')}
              aria-label="Подразделения"
              title="Подразделения"
            >
              <Building2 size={18} strokeWidth={1.5} />
            </button>
            <button
              type="button"
              className="dash-icon-btn is-primary"
              onClick={() => onOpenSheet('addEmployee')}
              aria-label="Добавить сотрудника"
              title="Добавить сотрудника"
            >
              <Plus size={18} strokeWidth={1.5} />
            </button>
          </div>
        )}
      </div>

      <div className="dash-tabs" role="group" aria-label="Фильтр сотрудников">
        {tabs.map(key => (
          <button
            key={key}
            type="button"
            className="dash-tab"
            aria-pressed={activeTab === key}
            onClick={() => setTab(key)}
          >
            {TAB_LABELS[key]}
            <span className="dash-tab-count">{tabCounts[key]}</span>
          </button>
        ))}
      </div>

      <div className="dash-people-tools">
        <ClearableInput
          wrapperClassName="dash-people-search"
          className="dash-field"
          value={search}
          onChange={event => setSearch(event.target.value)}
          onClear={() => setSearch('')}
          clearLabel="Очистить поиск"
          placeholder="Поиск"
          aria-label="Поиск сотрудников"
          autoComplete="off"
        />
        <select
          className="dash-field dash-people-sort"
          value={activeSort}
          onChange={event => setSort(event.target.value as PanelSortKey)}
          aria-label="Сортировка"
        >
          {sortKeys.map(key => <option key={key} value={key}>{SORT_LABELS[key]}</option>)}
        </select>
        {admin && (
          <button
            type="button"
            className={`dash-icon-btn${admin.hideSalaries ? ' active' : ''}`}
            onClick={onToggleHideSalaries}
            aria-pressed={admin.hideSalaries}
            aria-label={admin.hideSalaries ? 'Показать оклады' : 'Скрыть оклады'}
            title={admin.hideSalaries ? 'Показать оклады' : 'Скрыть оклады'}
          >
            {admin.hideSalaries ? <EyeOff size={16} strokeWidth={1.5} /> : <Eye size={16} strokeWidth={1.5} />}
          </button>
        )}
      </div>

      {visible.length === 0 ? (
        <div className="dash-empty">Сотрудники не найдены</div>
      ) : (
        <ul className="dash-people-list">
          {visible.map(row => (
            <PersonRow
              key={row.trend.employee.id}
              row={row}
              score={scores.get(row.trend.employee.id)}
              scoresLoading={scoresLoading}
              admin={admin}
              onSelect={onSelectEmployee}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

export const PeopleColumn = memo(PeopleColumnBase)

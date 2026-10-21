import type { EmployeeWithStats } from '../../types'
import type { IListScore } from '../../hooks/useEmployeeScores'
import { getEffectiveSalaryForDate, getTodayIsoDate } from '../../utils/adminTenderHelpers'
import { getAccrued, type Tone } from './dashboardMetrics'
import type { FirstEntryMap, IEmployeeTrend, PresenceMap, PresenceStatus } from './dashboardTypes'

export type PanelSortKey = 'arrival' | 'score' | 'accrued' | 'name' | 'salary'
export type PanelTabKey = 'all' | 'onsite' | 'away' | 'attention'

export const SORT_LABELS: Record<PanelSortKey, string> = {
  arrival: 'Приход',
  score: 'Оценка',
  accrued: 'Начислено',
  name: 'ФИО',
  salary: 'Оклад'
}

// «Приход» есть только в текущем месяце (нужны проходы за сегодня)
export const COMMON_SORT_KEYS: PanelSortKey[] = ['arrival', 'score', 'accrued', 'name']
export const ADMIN_SORT_KEYS: PanelSortKey[] = ['salary']

export interface IPanelRow {
  trend: IEmployeeTrend
  accrued: number
  score: number | null
  salary: number
  severity: Tone | null
  // Статус «сегодня»; undefined — не текущий месяц или сотрудник вне табеля
  status: PresenceStatus | undefined
  // Время первого входа за сегодня (HH:MM:SS)
  firstEntry: string | null
}

interface IBuildRowsInput {
  trends: IEmployeeTrend[]
  isLive: boolean
  progress: number
  scores: ReadonlyMap<number, IListScore>
  severity: ReadonlyMap<number, Tone>
  // null — не текущий месяц
  statuses: PresenceMap | null
  firstEntries: FirstEntryMap
}

export function buildPanelRows({
  trends,
  isLive,
  progress,
  scores,
  severity,
  statuses,
  firstEntries
}: IBuildRowsInput): IPanelRow[] {
  const live = { isLive, progress }
  const todayIso = getTodayIsoDate()

  return trends.map(trend => {
    const { employee } = trend
    return {
      trend,
      accrued: getAccrued(trend, live),
      score: scores.get(employee.id)?.total ?? null,
      salary: getEffectiveSalaryForDate(employee.salaryHistory || [], employee.current_salary, todayIso),
      severity: severity.get(employee.id) ?? null,
      status: statuses ? statuses.get(employee.id) : undefined,
      firstEntry: statuses ? firstEntries.get(employee.id) ?? null : null
    }
  })
}

const matchesQuery = (employee: EmployeeWithStats, query: string): boolean => (
  !query
  || employee.full_name.toLowerCase().includes(query)
  || employee.position.toLowerCase().includes(query)
)

// Сейчас на объекте: в офисе или удалённо
export const isOnSiteStatus = (status: PresenceStatus | undefined): boolean => (
  status === 'office' || status === 'remote'
)

export function matchesTab(row: IPanelRow, tab: PanelTabKey): boolean {
  switch (tab) {
    case 'onsite':
      return isOnSiteStatus(row.status)
    case 'away':
      return row.status !== undefined && !isOnSiteStatus(row.status)
    case 'attention':
      return row.severity !== null
    default:
      return true
  }
}

export function filterPanelRows(rows: IPanelRow[], query: string, tab: PanelTabKey): IPanelRow[] {
  const normalized = query.trim().toLowerCase()
  return rows.filter(row => matchesQuery(row.trend.employee, normalized) && matchesTab(row, tab))
}

// Оценка, начисления и оклад — от большего к меньшему, приход — от раннего, ФИО — по алфавиту;
// без значения («—», не пришёл) всегда в конце
export function sortPanelRows(rows: IPanelRow[], sort: PanelSortKey): IPanelRow[] {
  const byName = (left: IPanelRow, right: IPanelRow) => (
    left.trend.employee.full_name.localeCompare(right.trend.employee.full_name, 'ru')
  )

  return [...rows].sort((left, right) => {
    switch (sort) {
      case 'name':
        return byName(left, right)
      case 'arrival':
        if (left.firstEntry === null || right.firstEntry === null) {
          if (left.firstEntry === right.firstEntry) return byName(left, right)
          return left.firstEntry === null ? 1 : -1
        }
        return left.firstEntry.localeCompare(right.firstEntry) || byName(left, right)
      case 'score':
        if (left.score === null || right.score === null) {
          if (left.score === right.score) return byName(left, right)
          return left.score === null ? 1 : -1
        }
        return right.score - left.score || byName(left, right)
      case 'salary':
        return right.salary - left.salary || byName(left, right)
      default:
        return right.accrued - left.accrued || byName(left, right)
    }
  })
}

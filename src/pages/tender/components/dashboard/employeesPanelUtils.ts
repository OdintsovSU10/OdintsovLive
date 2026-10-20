import type { EmployeeWithStats } from '../../types'
import type { IListScore } from '../../hooks/useEmployeeScores'
import { getEffectiveSalaryForDate, getTodayIsoDate } from '../../utils/adminTenderHelpers'
import { isIncompleteEmployee } from '../../utils/employeeGrouping'
import { getMonthsSinceLastRaise } from '../../utils/tenderPresentation'
import { getAccrued, type Tone } from './dashboardMetrics'
import type { IEmployeeTrend } from './dashboardTypes'

export type PanelSortKey = 'score' | 'accrued' | 'name' | 'salary' | 'noRaise'
export type PanelFilterKey = 'all' | 'attention' | 'incomplete'

export const SORT_LABELS: Record<PanelSortKey, string> = {
  score: 'Оценка',
  accrued: 'Начислено',
  name: 'ФИО',
  salary: 'Оклад',
  noRaise: 'Без повышения'
}

export const COMMON_SORT_KEYS: PanelSortKey[] = ['score', 'accrued', 'name']
export const ADMIN_SORT_KEYS: PanelSortKey[] = ['salary', 'noRaise']

export interface IPanelRow {
  trend: IEmployeeTrend
  accrued: number
  score: number | null
  salary: number
  noRaiseMonths: number
  severity: Tone | null
  incomplete: boolean
}

interface IBuildRowsInput {
  trends: IEmployeeTrend[]
  isLive: boolean
  progress: number
  scores: ReadonlyMap<number, IListScore>
  severity: ReadonlyMap<number, Tone>
}

export function buildPanelRows({ trends, isLive, progress, scores, severity }: IBuildRowsInput): IPanelRow[] {
  const live = { isLive, progress }
  const todayIso = getTodayIsoDate()

  return trends.map(trend => {
    const { employee } = trend
    return {
      trend,
      accrued: getAccrued(trend, live),
      score: scores.get(employee.id)?.total ?? null,
      salary: getEffectiveSalaryForDate(employee.salaryHistory || [], employee.current_salary, todayIso),
      noRaiseMonths: getMonthsSinceLastRaise(employee),
      severity: severity.get(employee.id) ?? null,
      incomplete: isIncompleteEmployee(employee)
    }
  })
}

const matchesQuery = (employee: EmployeeWithStats, query: string): boolean => (
  !query
  || employee.full_name.toLowerCase().includes(query)
  || employee.position.toLowerCase().includes(query)
)

export function filterPanelRows(rows: IPanelRow[], query: string, filter: PanelFilterKey): IPanelRow[] {
  const normalized = query.trim().toLowerCase()
  return rows.filter(row => (
    matchesQuery(row.trend.employee, normalized)
    && (filter !== 'attention' || row.severity !== null)
    && (filter !== 'incomplete' || row.incomplete)
  ))
}

// Оценка и начисления — от большего к меньшему, ФИО — по алфавиту; без оценки («—») всегда в конце
export function sortPanelRows(rows: IPanelRow[], sort: PanelSortKey): IPanelRow[] {
  const byName = (left: IPanelRow, right: IPanelRow) => (
    left.trend.employee.full_name.localeCompare(right.trend.employee.full_name, 'ru')
  )

  return [...rows].sort((left, right) => {
    switch (sort) {
      case 'name':
        return byName(left, right)
      case 'score':
        if (left.score === null || right.score === null) {
          if (left.score === right.score) return byName(left, right)
          return left.score === null ? 1 : -1
        }
        return right.score - left.score || byName(left, right)
      case 'salary':
        return right.salary - left.salary || byName(left, right)
      case 'noRaise':
        return right.noRaiseMonths - left.noRaiseMonths || byName(left, right)
      default:
        return right.accrued - left.accrued || byName(left, right)
    }
  })
}

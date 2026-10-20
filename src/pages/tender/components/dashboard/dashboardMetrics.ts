import type { EmployeeWithStats } from '../../types'
import { getMoscowParts, type LivePayrollSnapshot } from '../../utils/livePayroll'
import { isWeekendOrHoliday } from '../../utils/salaryCalculator'
import { toIsoDate } from '../../utils/employeeFormat'
import { formatHours, formatNumber, pluralize } from './dashboardFormat'
import {
  PRESENCE_ORDER,
  type IEmployeeTrend,
  type PresenceMap,
  type PresenceStatus,
  type StatusCounts
} from './dashboardTypes'
import { createEmptyTimesheetStatusCounts } from '../../utils/timesheetStatus'

export const OVERTIME_ATTENTION_HOURS = 20

type LiveInfo = Pick<LivePayrollSnapshot, 'isLive' | 'progress'>

// Начислено сотрудником: в текущем месяце — доля плана по времени, иначе факт табеля
export function getAccrued(trend: IEmployeeTrend, live: LiveInfo): number {
  return live.isLive ? trend.latest.plan * live.progress : trend.latest.earned
}

// База сравнения: факт прошлого месяца; в текущем месяце — на ту же долю месяца
export function getPreviousBaseline(trend: IEmployeeTrend, live: LiveInfo): number {
  const previous = trend.previous?.earned ?? 0
  return live.isLive ? previous * live.progress : previous
}

export const getGrowthPercent = (delta: number, baseline: number): number => (
  baseline > 0 ? (delta / baseline) * 100 : 0
)

export interface IScopeSummary {
  plan: number
  accrued: number
  baseline: number
  overtime: number
  previousOvertime: number
  // Табель выбранного месяца: отработанные будни / норма по сотрудникам с табелем
  workedDays: number
  normDays: number
  // absent + unpaid + sick
  missedDays: number
  statusCounts: StatusCounts
}

export function summarizeScope(trends: IEmployeeTrend[], live: LiveInfo): IScopeSummary {
  const summary: IScopeSummary = {
    plan: 0,
    accrued: 0,
    baseline: 0,
    overtime: 0,
    previousOvertime: 0,
    workedDays: 0,
    normDays: 0,
    missedDays: 0,
    statusCounts: createEmptyTimesheetStatusCounts()
  }

  for (const trend of trends) {
    const { latest } = trend
    summary.plan += latest.plan
    summary.accrued += getAccrued(trend, live)
    summary.baseline += getPreviousBaseline(trend, live)
    summary.overtime += latest.overtime
    summary.previousOvertime += trend.previous?.overtime ?? 0

    if (!latest.hasTimesheet) continue
    summary.workedDays += latest.workedWeekdays
    summary.normDays += latest.normWorkdays
    summary.missedDays += latest.statusCounts.absent + latest.statusCounts.unpaid + latest.statusCounts.sick
    for (const key of Object.keys(summary.statusCounts) as Array<keyof StatusCounts>) {
      summary.statusCounts[key] += latest.statusCounts[key]
    }
  }

  return summary
}

export type PresenceCounts = Record<PresenceStatus, number>

export function countPresence(trends: IEmployeeTrend[], statuses: PresenceMap): PresenceCounts {
  const counts = Object.fromEntries(PRESENCE_ORDER.map(status => [status, 0])) as PresenceCounts

  for (const { employee } of trends) {
    const status = statuses.get(employee.id)
    if (status) counts[status] += 1
  }

  return counts
}

export const countOnSite = (counts: PresenceCounts): number => counts.office + counts.remote + counts.left

export const countAbsentNow = (counts: PresenceCounts): number => counts.vacation + counts.sick + counts.noMark

// Сколько сотрудников учитывается в посещаемости (без исключённых из табеля)
export const countAccounted = (trends: IEmployeeTrend[]): number => (
  trends.filter(trend => !trend.employee.excluded_from_timesheet).length
)

export interface ISubdivisionRow {
  name: string
  employeesCount: number
  onSite: number
  accounted: number
  accrued: number
  overtime: number
  delta: number
  deltaPercent: number
}

function buildRow(name: string, trends: IEmployeeTrend[], statuses: PresenceMap, live: LiveInfo): ISubdivisionRow {
  const summary = summarizeScope(trends, live)
  const delta = summary.accrued - summary.baseline
  return {
    name,
    employeesCount: trends.length,
    onSite: countOnSite(countPresence(trends, statuses)),
    accounted: countAccounted(trends),
    accrued: summary.accrued,
    overtime: summary.overtime,
    delta,
    deltaPercent: getGrowthPercent(delta, summary.baseline)
  }
}

export function buildSubdivisionRows(
  trends: IEmployeeTrend[],
  statuses: PresenceMap,
  live: LiveInfo
): { rows: ISubdivisionRow[]; total: ISubdivisionRow } {
  const groups = new Map<string, IEmployeeTrend[]>()
  for (const trend of trends) {
    const list = groups.get(trend.subdivision) || []
    list.push(trend)
    groups.set(trend.subdivision, list)
  }

  const rows = Array.from(groups.entries())
    .map(([name, list]) => buildRow(name, list, statuses, live))
    .sort((left, right) => right.accrued - left.accrued || left.name.localeCompare(right.name, 'ru'))

  return { rows, total: buildRow('Итого', trends, statuses, live) }
}

// Последний день выбранного месяца, который уже можно проверять на заполненность табеля (вчера включительно)
function getLastCheckedDay(year: number, month: number): number {
  const moscow = getMoscowParts(new Date())
  const currentIndex = moscow.year * 12 + moscow.month
  const selectedIndex = year * 12 + month
  if (selectedIndex < currentIndex) return new Date(year, month, 0).getDate()
  if (selectedIndex > currentIndex) return 0
  return Math.max(0, moscow.day - 1)
}

// Прошедшие рабочие дни месяца (с даты приёма) без записи в табеле
export function countMissingTimesheetDays(employee: EmployeeWithStats, year: number, month: number): number {
  if (employee.excluded_from_timesheet) return 0

  const lastDay = getLastCheckedDay(year, month)
  const filled = new Set((employee.timesheet || []).map(entry => entry.work_date))
  let missing = 0

  for (let day = 1; day <= lastDay; day++) {
    const iso = toIsoDate(year, month, day)
    if (employee.hire_date && iso < employee.hire_date) continue
    if (isWeekendOrHoliday(new Date(year, month - 1, day, 12))) continue
    if (!filled.has(iso)) missing += 1
  }

  return missing
}

export type AttentionKind = 'noMark' | 'absent' | 'unfilled' | 'overtime'

export interface IAttentionItem {
  key: string
  employee: EmployeeWithStats
  kind: AttentionKind
  title: string
  value: string
  count: number
}

const ATTENTION_ORDER: AttentionKind[] = ['noMark', 'absent', 'unfilled', 'overtime']

const formatDays = (count: number): string => `${formatNumber(count)} ${pluralize(count, 'день', 'дня', 'дней')}`

interface IAttentionInput {
  trends: IEmployeeTrend[]
  year: number
  month: number
  // null — «сегодня» не считается (не текущий месяц)
  statuses: PresenceMap | null
}

export function buildAttentionItems({ trends, year, month, statuses }: IAttentionInput): IAttentionItem[] {
  const items: IAttentionItem[] = []

  for (const trend of trends) {
    const { employee, latest } = trend

    if (statuses?.get(employee.id) === 'noMark') {
      items.push({
        key: `noMark-${employee.id}`,
        employee,
        kind: 'noMark',
        title: 'Нет отметки сегодня',
        value: '',
        count: 1
      })
    }

    if (latest.statusCounts.absent >= 1) {
      items.push({
        key: `absent-${employee.id}`,
        employee,
        kind: 'absent',
        title: 'Прогулы',
        value: formatDays(latest.statusCounts.absent),
        count: latest.statusCounts.absent
      })
    }

    const missing = countMissingTimesheetDays(employee, year, month)
    if (missing > 0) {
      items.push({
        key: `unfilled-${employee.id}`,
        employee,
        kind: 'unfilled',
        title: 'Не заполнен табель',
        value: formatDays(missing),
        count: missing
      })
    }

    if (latest.overtime > OVERTIME_ATTENTION_HOURS) {
      items.push({
        key: `overtime-${employee.id}`,
        employee,
        kind: 'overtime',
        title: 'Переработки за месяц',
        value: `${formatHours(latest.overtime)} ч`,
        count: latest.overtime
      })
    }
  }

  return items.sort((left, right) => (
    ATTENTION_ORDER.indexOf(left.kind) - ATTENTION_ORDER.indexOf(right.kind)
    || right.count - left.count
    || left.employee.full_name.localeCompare(right.employee.full_name, 'ru')
  ))
}

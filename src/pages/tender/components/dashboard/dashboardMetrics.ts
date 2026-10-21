import type { EmployeeWithStats } from '../../types'
import type { IListScore } from '../../hooks/useEmployeeScores'
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

// Тон состояния: ok — норма/хорошо, warn — внимание, bad — критично
export type Tone = 'ok' | 'warn' | 'bad'

const TONE_RANK: Record<Tone, number> = { ok: 1, warn: 2, bad: 3 }

export const getWorstTone = (left: Tone | null, right: Tone | null): Tone | null => {
  if (!left) return right
  if (!right) return left
  return TONE_RANK[right] > TONE_RANK[left] ? right : left
}

// Явка и «на месте»: доля в процентах
const PRESENCE_OK_PERCENT = 90
const PRESENCE_WARN_PERCENT = 75
// Факт ФОТ выше плана больше чем на 2% считается перерасходом
const PAYROLL_OVERRUN_FACTOR = 1.02
// Переработки выросли к прошлому месяцу на 10% и больше
const OVERTIME_GROWTH_FACTOR = 1.1

export const getPercentTone = (percent: number): Tone => (
  percent >= PRESENCE_OK_PERCENT ? 'ok' : percent >= PRESENCE_WARN_PERCENT ? 'warn' : 'bad'
)

export const isPayrollOverrun = (fact: number, plan: number): boolean => (
  plan > 0 && fact > plan * PAYROLL_OVERRUN_FACTOR
)

// Прошедший месяц: перерасход — bad, в рамках плана — ok; текущий месяц и «около плана» — без тона
export function getPayrollTone(fact: number, plan: number, isLive: boolean): Tone | null {
  if (isLive || plan <= 0) return null
  if (isPayrollOverrun(fact, plan)) return 'bad'
  return fact > 0 && fact <= plan ? 'ok' : null
}

export const getOvertimeTone = (overtime: number, previousOvertime: number): Tone | null => (
  overtime > 0 && overtime > previousOvertime * OVERTIME_GROWTH_FACTOR ? 'warn' : null
)

export const getPresenceStatusTone = (status: PresenceStatus): Tone | null => {
  if (status === 'office') return 'ok'
  if (status === 'noMark') return 'bad'
  if (status === 'notYet') return 'warn'
  return null
}

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

// Сколько сотрудников учитывается в посещаемости (без исключённых из табеля)
export const countAccounted = (trends: IEmployeeTrend[]): number => (
  trends.filter(trend => !trend.employee.excluded_from_timesheet).length
)

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

export type AttentionKind = 'noMark' | 'absent' | 'unfilled' | 'overtime' | 'attention' | 'overpaid' | 'promotion'

// Тяжесть пункта: прогул и «нет отметки» — критично; табель, переработки, сигналы оценки — внимание; повышение — информация
const ATTENTION_TONES: Record<AttentionKind, Tone> = {
  noMark: 'bad',
  absent: 'bad',
  unfilled: 'warn',
  overtime: 'warn',
  attention: 'warn',
  overpaid: 'warn',
  promotion: 'ok'
}

export const getAttentionTone = (kind: AttentionKind): Tone => ATTENTION_TONES[kind]

export interface IAttentionItem {
  key: string
  employee: EmployeeWithStats
  subdivision: string
  kind: AttentionKind
  tone: Tone
  title: string
  value: string
  count: number
}

const ATTENTION_ORDER: AttentionKind[] = ['noMark', 'absent', 'unfilled', 'overtime', 'attention', 'overpaid', 'promotion']

const formatDays = (count: number): string => `${formatNumber(count)} ${pluralize(count, 'день', 'дня', 'дней')}`

interface IAttentionInput {
  trends: IEmployeeTrend[]
  year: number
  month: number
  // null — «сегодня» не считается (не текущий месяц)
  statuses: PresenceMap | null
  // Оценки сотрудников: из сигналов берутся пункты по оценке
  scores?: ReadonlyMap<number, IListScore>
}

export function buildAttentionItems({ trends, year, month, statuses, scores }: IAttentionInput): IAttentionItem[] {
  const items: IAttentionItem[] = []

  for (const trend of trends) {
    const { employee, latest, subdivision } = trend
    const push = (kind: AttentionKind, title: string, value: string, count: number) => items.push({
      key: `${kind}-${employee.id}`,
      employee,
      subdivision,
      kind,
      tone: getAttentionTone(kind),
      title,
      value,
      count
    })

    if (statuses?.get(employee.id) === 'noMark') push('noMark', 'Нет отметки сегодня', '', 1)

    if (latest.statusCounts.absent >= 1) {
      push('absent', 'Прогулы', formatDays(latest.statusCounts.absent), latest.statusCounts.absent)
    }

    const missing = countMissingTimesheetDays(employee, year, month)
    if (missing > 0) push('unfilled', 'Не заполнен табель', formatDays(missing), missing)

    if (latest.overtime > OVERTIME_ATTENTION_HOURS) {
      push('overtime', 'Переработки за месяц', `${formatHours(latest.overtime)} ч`, latest.overtime)
    }

    const score = scores?.get(employee.id)
    if (score?.signals.includes('attention')) {
      push('attention', 'Зона внимания по оценке', score.total !== null ? String(score.total) : '', 1)
    }
    if (score?.signals.includes('overpaid')) push('overpaid', 'Зарплата выше отдачи', '', 1)
    if (score?.signals.includes('promotion')) push('promotion', 'Кандидат на повышение', '', 1)
  }

  return items.sort((left, right) => (
    TONE_RANK[right.tone] - TONE_RANK[left.tone]
    || ATTENTION_ORDER.indexOf(left.kind) - ATTENTION_ORDER.indexOf(right.kind)
    || right.count - left.count
    || left.employee.full_name.localeCompare(right.employee.full_name, 'ru')
  ))
}

// Худшая тяжесть (bad/warn) по сотруднику; «кандидат на повышение» тяжестью не считается
export function buildSeverityMap(items: IAttentionItem[]): Map<number, Tone> {
  const map = new Map<number, Tone>()
  for (const item of items) {
    if (item.tone === 'ok') continue
    const worst = getWorstTone(map.get(item.employee.id) ?? null, item.tone)
    if (worst) map.set(item.employee.id, worst)
  }
  return map
}

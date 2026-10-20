import type { SalaryHistory, TimesheetEntry, TimesheetStatus } from '../types'
import { getFullDayThresholdHours, resolveTimesheetWorkedHours, type WorkPlan } from './attendanceDay'
import { parseIsoDate, toIsoDate } from './employeeFormat'
import { isWorkedTimesheetStatus } from './timesheetStatus'

// Оценка сотрудника 0–100 за окно в 90 дней, заканчивающееся вчера.
// Модуль чистый: данные приходят параметрами, сеть и время снаружи.

export const SCORE_WINDOW_DAYS = 90
export const SCORE_MIN_PLANNED_DAYS = 10
export const SCORE_MIN_PEERS = 3

export const SCORE_MAX = {
  attendance: 45,
  hours: 25,
  overtime: 10,
  peer: 20
} as const

const PARTIAL_WEIGHT = 0.6
const ABSENT_PENALTY = 5
// Сколько «единиц сверх нормы» ждём на 60 плановых дней (единица = рабочий выходной или 8 часов сверх порога)
const OVERTIME_TARGET_UNITS = 4
const OVERTIME_TARGET_PER_DAYS = 60
const OVERTIME_UNIT_HOURS = 8
const PEER_NEUTRAL_POINTS = 10
const PROMOTION_MIN_SCORE = 75
const PROMOTION_MIN_NO_RAISE_MONTHS = 9
const ATTENTION_MAX_SCORE = 55
const ATTENTION_ABSENTS = 2
const ATTENTION_DAYS = 30
const OVERPAID_MAX_SCORE = 60
const PREVIOUS_SHIFT_DAYS = 30

// Уважительные причины: дни не входят в плановые
const EXCUSED_STATUSES: ReadonlySet<TimesheetStatus> = new Set<TimesheetStatus>([
  'vacation',
  'sick',
  'educational_leave',
  'dayoff',
  'unpaid'
])

export type ScoreGradeKey = 'excellent' | 'good' | 'average' | 'attention'

export interface ScoreGrade {
  key: ScoreGradeKey
  label: string
}

export type ScoreSignalKey = 'promotion' | 'attention' | 'overpaid'

export const SCORE_SIGNAL_LABELS: Record<ScoreSignalKey, string> = {
  promotion: 'Кандидат на повышение',
  attention: 'Зона внимания',
  overpaid: 'Зарплата выше отдачи'
}

export interface ScoreWindow {
  from: string
  to: string
}

export interface ScoreMember {
  id: number
  hireDate: string | null
  currentSalary: number
  salaryHistory: SalaryHistory[]
  entriesByDate: Map<string, TimesheetEntry>
  plans: Map<string, WorkPlan>
}

export interface WindowMetrics {
  planned: number
  full: number
  partial: number
  absent: number
  attendance: number
  hours: number
  overtime: number
  // Явка + Часы + Сверх нормы: «отдача» без сравнения с отделом
  base: number
  absentDates: string[]
}

export interface WindowScore {
  state: 'ok' | 'insufficient'
  total: number | null
  grade: ScoreGrade | null
  attendance: number
  hours: number
  overtime: number
  peer: number
  planned: number
  full: number
  partial: number
  absent: number
  // Сколько коллег участвовало в сравнении (без самого сотрудника)
  peerCount: number
  lowPeers: boolean
  rank: number | null
  rankTotal: number
  absentLast30: number
  salary: number
  salaryMedian: number | null
  salaryP75: number | null
  window: ScoreWindow
}

export interface EmployeeScoreView {
  current: WindowScore
  previous: WindowScore | null
  // Изменение к значению 30 дней назад; null — сравнивать не с чем
  delta: number | null
  // Помесячная оценка выбранного года, null — месяца нет или данных мало
  monthly: Array<WindowScore | null>
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6
}

export function addDaysIso(iso: string, days: number): string {
  const date = parseIsoDate(iso)
  const shifted = new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
  return toIsoDate(shifted.getFullYear(), shifted.getMonth() + 1, shifted.getDate())
}

// Окно из 90 дней, последний день включительно
export function getScoreWindow(endIso: string): ScoreWindow {
  return { from: addDaysIso(endIso, -(SCORE_WINDOW_DAYS - 1)), to: endIso }
}

export function getScoreGrade(total: number): ScoreGrade {
  if (total >= 85) return { key: 'excellent', label: 'Отлично' }
  if (total >= 70) return { key: 'good', label: 'Хорошо' }
  if (total >= 55) return { key: 'average', label: 'Средне' }
  return { key: 'attention', label: 'Внимание' }
}

// Оклад на дату: последняя запись истории не позже даты, иначе текущий
export function getSalaryAt(history: SalaryHistory[], currentSalary: number, dateIso: string): number {
  let result: SalaryHistory | null = null
  for (const item of history) {
    if (item.effective_date > dateIso) continue
    if (!result || item.effective_date >= result.effective_date) result = item
  }
  return result ? result.salary : currentSalary
}

// Доля коллег, которых сотрудник превосходит (равные считаются за половину)
export function percentileAmong(value: number, others: number[]): number {
  if (others.length === 0) return 0.5
  const target = round6(value)
  let below = 0
  let equal = 0
  for (const item of others) {
    const rounded = round6(item)
    if (rounded < target) below += 1
    else if (rounded === target) equal += 1
  }
  return (below + equal / 2) / others.length
}

// Квантиль с линейной интерполяцией
export function quantile(values: number[], q: number): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const position = (sorted.length - 1) * q
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower)
}

export function computeWindowMetrics(member: ScoreMember, window: ScoreWindow): WindowMetrics {
  let planned = 0
  let full = 0
  let partial = 0
  let absent = 0
  let sumHours = 0
  let sumThreshold = 0
  let overtimeUnits = 0
  const absentDates: string[] = []

  for (let iso = window.from; iso <= window.to; iso = addDaysIso(iso, 1)) {
    // Дни до приёма и дни без записи табеля не оцениваем
    if (member.hireDate && iso < member.hireDate) continue
    const entry = member.entriesByDate.get(iso)
    if (!entry || EXCUSED_STATUSES.has(entry.status)) continue

    const date = parseIsoDate(iso)
    const plan = member.plans.get(iso)
    const threshold = getFullDayThresholdHours(date, plan)
    const worked = isWorkedTimesheetStatus(entry.status)
    const hours = worked ? resolveTimesheetWorkedHours(entry, date, plan) : 0

    if (threshold === null) {
      // Выходной или праздник: не плановый день, но работа в нём — плюс
      if (hours > 0) overtimeUnits += 1
      continue
    }

    planned += 1
    sumThreshold += threshold
    if (hours <= 0) {
      absent += 1
      absentDates.push(iso)
      continue
    }

    sumHours += hours
    overtimeUnits += Math.max(0, hours - threshold) / OVERTIME_UNIT_HOURS
    if (hours >= threshold) full += 1
    else partial += 1
  }

  if (planned === 0) {
    return { planned, full, partial, absent, attendance: 0, hours: 0, overtime: 0, base: 0, absentDates }
  }

  const attendance = clamp(
    SCORE_MAX.attendance * ((full + PARTIAL_WEIGHT * partial) / planned) - ABSENT_PENALTY * absent,
    0,
    SCORE_MAX.attendance
  )
  const hoursPoints = sumThreshold > 0
    ? SCORE_MAX.hours * Math.min(1, sumHours / sumThreshold)
    : 0
  const target = (OVERTIME_TARGET_UNITS * planned) / OVERTIME_TARGET_PER_DAYS
  const overtime = target > 0 ? SCORE_MAX.overtime * Math.min(1, overtimeUnits / target) : 0

  return {
    planned,
    full,
    partial,
    absent,
    attendance,
    hours: hoursPoints,
    overtime,
    base: attendance + hoursPoints + overtime,
    absentDates
  }
}

function emptyScore(window: ScoreWindow, metrics: WindowMetrics, salary: number, rankTotal: number): WindowScore {
  return {
    state: 'insufficient',
    total: null,
    grade: null,
    attendance: metrics.attendance,
    hours: metrics.hours,
    overtime: metrics.overtime,
    peer: 0,
    planned: metrics.planned,
    full: metrics.full,
    partial: metrics.partial,
    absent: metrics.absent,
    peerCount: 0,
    lowPeers: false,
    rank: null,
    rankTotal,
    absentLast30: 0,
    salary,
    salaryMedian: null,
    salaryP75: null,
    window
  }
}

// Баллы «отдачи к отделу» сотрудника index среди остальных подходящих коллег
function computePeerPoints(
  index: number,
  bases: number[],
  salaries: number[]
): { points: number; peerCount: number; low: boolean } {
  const otherBases = bases.filter((_, i) => i !== index)
  const otherSalaries = salaries.filter((_, i) => i !== index)
  if (otherBases.length < SCORE_MIN_PEERS) {
    return { points: PEER_NEUTRAL_POINTS, peerCount: otherBases.length, low: true }
  }
  const perfPct = percentileAmong(bases[index], otherBases)
  const salaryPct = percentileAmong(salaries[index], otherSalaries)
  const value = clamp(0.5 + (perfPct - salaryPct) / 2, 0, 1)
  return { points: SCORE_MAX.peer * value, peerCount: otherBases.length, low: false }
}

// Оценка сотрудника selfId за окно; members — весь отдел, включая самого сотрудника
export function computeWindowScore(members: ScoreMember[], selfId: number, window: ScoreWindow): WindowScore {
  const metricsList = members.map(member => computeWindowMetrics(member, window))
  const salaries = members.map(member => getSalaryAt(member.salaryHistory, member.currentSalary, window.to))
  const selfIndex = members.findIndex(member => member.id === selfId)
  if (selfIndex < 0) throw new Error('Сотрудник не найден среди участников оценки')

  const qualified = members
    .map((_, index) => index)
    .filter(index => metricsList[index].planned >= SCORE_MIN_PLANNED_DAYS)
  const rankTotal = qualified.length
  const selfMetrics = metricsList[selfIndex]
  if (selfMetrics.planned < SCORE_MIN_PLANNED_DAYS) {
    return emptyScore(window, selfMetrics, salaries[selfIndex], rankTotal)
  }

  const qualifiedBases = qualified.map(index => metricsList[index].base)
  const qualifiedSalaries = qualified.map(index => salaries[index])
  const totals = qualified.map((_, position) => {
    const peer = computePeerPoints(position, qualifiedBases, qualifiedSalaries)
    return Math.round(qualifiedBases[position] + peer.points)
  })

  const selfPosition = qualified.indexOf(selfIndex)
  const selfPeer = computePeerPoints(selfPosition, qualifiedBases, qualifiedSalaries)
  const total = totals[selfPosition]
  const rank = 1 + totals.filter(value => value > total).length

  const absentSince = addDaysIso(window.to, -(ATTENTION_DAYS - 1))
  const absentLast30 = selfMetrics.absentDates.filter(iso => iso >= absentSince).length
  const enoughPeers = !selfPeer.low

  return {
    state: 'ok',
    total,
    grade: getScoreGrade(total),
    attendance: selfMetrics.attendance,
    hours: selfMetrics.hours,
    overtime: selfMetrics.overtime,
    peer: selfPeer.points,
    planned: selfMetrics.planned,
    full: selfMetrics.full,
    partial: selfMetrics.partial,
    absent: selfMetrics.absent,
    peerCount: selfPeer.peerCount,
    lowPeers: selfPeer.low,
    rank,
    rankTotal,
    absentLast30,
    salary: salaries[selfIndex],
    // Медиана и 75-й перцентиль — по окладам всего отдела
    salaryMedian: enoughPeers ? quantile(salaries, 0.5) : null,
    salaryP75: enoughPeers ? quantile(salaries, 0.75) : null,
    window
  }
}

// Сигналы по оценке; noRaiseMonths — месяцев без повышения оклада
export function getScoreSignals(score: WindowScore, noRaiseMonths: number): ScoreSignalKey[] {
  if (score.state !== 'ok' || score.total === null) return []
  const signals: ScoreSignalKey[] = []

  if (
    score.total >= PROMOTION_MIN_SCORE
    && score.salaryMedian !== null
    && score.salary < score.salaryMedian
    && noRaiseMonths >= PROMOTION_MIN_NO_RAISE_MONTHS
  ) {
    signals.push('promotion')
  }
  if (score.total < ATTENTION_MAX_SCORE || score.absentLast30 >= ATTENTION_ABSENTS) {
    signals.push('attention')
  }
  if (score.total < OVERPAID_MAX_SCORE && score.salaryP75 !== null && score.salary > score.salaryP75) {
    signals.push('overpaid')
  }
  return signals
}

function monthWindow(year: number, month: number, lastDayIso: string): ScoreWindow | null {
  const from = toIsoDate(year, month, 1)
  if (from > lastDayIso) return null
  const monthEnd = toIsoDate(year, month, new Date(year, month, 0).getDate())
  return { from, to: monthEnd < lastDayIso ? monthEnd : lastDayIso }
}

// Всё для карточки: текущее окно, значение 30 дней назад и помесячная оценка года.
// todayIso — сегодняшний день, он не учитывается: окна заканчиваются вчера.
export function buildEmployeeScoreView(
  members: ScoreMember[],
  selfId: number,
  todayIso: string,
  year: number
): EmployeeScoreView {
  const yesterday = addDaysIso(todayIso, -1)
  const current = computeWindowScore(members, selfId, getScoreWindow(yesterday))
  // Окно, заканчивающееся на 31 день раньше сегодняшнего дня
  const previous = computeWindowScore(members, selfId, getScoreWindow(addDaysIso(yesterday, -PREVIOUS_SHIFT_DAYS)))
  const delta = current.total !== null && previous.total !== null ? current.total - previous.total : null

  const monthly = Array.from({ length: 12 }, (_, index) => {
    const window = monthWindow(year, index + 1, yesterday)
    if (!window) return null
    const score = computeWindowScore(members, selfId, window)
    return score.state === 'ok' ? score : null
  })

  return { current, previous, delta, monthly }
}

import type { EmployeeWithStats } from '../types'
import { getDailyHoursNorm, getSalaryForMonth, isWeekendOrHoliday } from './salaryCalculator'

export const TRANSPORT_KEY = 'fot_base_transport'
export const DEFAULT_TRANSPORT = 2730
export const EXTRA_BONUS_PREFIX = 'fot_extra_bonuses'

export interface LivePayrollSnapshot {
  accrued: number
  planned: number
  progress: number
  ratePerSecond: number
  isLive: boolean
  isAccruing: boolean
  accrualState: LivePayrollAccrualState
}

export type LivePayrollAccrualState =
  | 'completed'
  | 'upcoming'
  | 'accruing'
  | 'before-workday'
  | 'after-workday'
  | 'non-working-day'

const WORKDAY_START_HOUR = 9

const MOSCOW_PARTS_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Europe/Moscow',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23'
})

export function getExtraBonusKey(year: number, month: number): string {
  return `${EXTRA_BONUS_PREFIX}_${year}_${month}`
}

export function parseExtraBonuses(raw: string | null): Record<number, number> {
  if (!raw) return {}

  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}

    return Object.entries(parsed).reduce<Record<number, number>>((acc, [id, value]) => {
      const employeeId = Number(id)
      const bonus = Number(value)
      if (Number.isFinite(employeeId) && Number.isFinite(bonus)) {
        acc[employeeId] = bonus
      }
      return acc
    }, {})
  } catch {
    return {}
  }
}

export function getSavedTransport(): number {
  const saved = Number(localStorage.getItem(TRANSPORT_KEY))
  return Number.isFinite(saved) && saved > 0 ? saved : DEFAULT_TRANSPORT
}

export function calculateMonthlyPayrollPlan(
  employees: EmployeeWithStats[],
  year: number,
  month: number,
  transport: number,
  extraBonuses: Record<number, number> = {}
): number {
  return employees.reduce((total, employee) => (
    total + calculateEmployeeMonthlyPayrollPlan(employee, year, month, transport, extraBonuses)
  ), 0)
}

export function calculateEmployeeMonthlyPayrollPlan(
  employee: EmployeeWithStats,
  year: number,
  month: number,
  transport: number,
  extraBonuses: Record<number, number> = {}
): number {
  const safeTransport = Number.isFinite(transport) ? Math.max(0, transport) : 0
  const salary = getSalaryForMonth(employee.salaryHistory || [], employee.current_salary, year, month)
  const monthlyBonus = Number(employee.monthly_bonus || 0)
  const extraBonus = Number(extraBonuses[employee.id] || 0)
  return salary + monthlyBonus + extraBonus + safeTransport
}

function getMoscowParts(date: Date) {
  const parts = Object.fromEntries(
    MOSCOW_PARTS_FORMATTER
      .formatToParts(date)
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, Number(part.value)])
  )

  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second
  }
}

export function calculateLivePayrollSnapshot(
  plannedMonthlyTotal: number,
  year: number,
  month: number,
  now = new Date()
): LivePayrollSnapshot {
  const planned = Number.isFinite(plannedMonthlyTotal) ? Math.max(0, plannedMonthlyTotal) : 0
  const moscow = getMoscowParts(now)
  const selectedMonthIndex = year * 12 + month
  const currentMonthIndex = moscow.year * 12 + moscow.month

  if (selectedMonthIndex < currentMonthIndex) {
    return {
      accrued: planned,
      planned,
      progress: 1,
      ratePerSecond: 0,
      isLive: false,
      isAccruing: false,
      accrualState: 'completed'
    }
  }

  if (selectedMonthIndex > currentMonthIndex) {
    return {
      accrued: 0,
      planned,
      progress: 0,
      ratePerSecond: 0,
      isLive: false,
      isAccruing: false,
      accrualState: 'upcoming'
    }
  }

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const currentSecondOfDay = moscow.hour * 60 * 60 + moscow.minute * 60 + moscow.second
  const workdayStartSecond = WORKDAY_START_HOUR * 60 * 60
  let totalNormSeconds = 0
  let elapsedNormSeconds = 0
  let isAccruing = false
  let todayNormSeconds = 0

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month - 1, day, 12, 0, 0)
    if (isWeekendOrHoliday(date)) continue

    const dailyNormSeconds = getDailyHoursNorm(date) * 60 * 60
    totalNormSeconds += dailyNormSeconds

    if (day < moscow.day) {
      elapsedNormSeconds += dailyNormSeconds
      continue
    }

    if (day > moscow.day) continue

    todayNormSeconds = dailyNormSeconds
    const todayElapsed = Math.min(
      dailyNormSeconds,
      Math.max(0, currentSecondOfDay - workdayStartSecond)
    )
    elapsedNormSeconds += todayElapsed
    isAccruing = todayElapsed < dailyNormSeconds && currentSecondOfDay >= workdayStartSecond
  }

  const progress = totalNormSeconds > 0 ? elapsedNormSeconds / totalNormSeconds : 0
  const baseRatePerSecond = totalNormSeconds > 0 ? planned / totalNormSeconds : 0
  const accrualState: LivePayrollAccrualState = isAccruing
    ? 'accruing'
    : todayNormSeconds === 0
      ? 'non-working-day'
      : currentSecondOfDay < workdayStartSecond
        ? 'before-workday'
        : 'after-workday'

  return {
    accrued: planned * progress,
    planned,
    progress,
    ratePerSecond: isAccruing ? baseRatePerSecond : 0,
    isLive: true,
    isAccruing,
    accrualState
  }
}

export function getLivePayrollPauseLabel(state: LivePayrollAccrualState): string {
  switch (state) {
    case 'before-workday':
      return 'Начисление начнётся в 09:00'
    case 'after-workday':
      return 'Рабочий день завершён'
    case 'non-working-day':
      return 'Сегодня нерабочий день'
    default:
      return 'Начисление на паузе'
  }
}

export function formatLiveMoney(amount: number): string {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount)
}

export function formatLiveNumber(amount: number): string {
  return amount.toLocaleString('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
}

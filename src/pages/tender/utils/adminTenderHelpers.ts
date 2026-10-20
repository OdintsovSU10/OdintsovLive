import type { SalaryHistory } from '../types'

export function parseMoneyInput(value: string): number {
  const digits = value.replace(/\D/g, '')
  if (!digits) return 0
  return Number(digits)
}

export function formatMoneyInput(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return ''
  return Math.round(value).toLocaleString('ru-RU')
}
function toStableDate(value: string): Date | null {
  if (!value) return null
  const parsed = new Date(`${value}T12:00:00`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function getMonthsFromDate(date: Date): number {
  const now = new Date()
  return Math.max(0, (now.getFullYear() - date.getFullYear()) * 12 + (now.getMonth() - date.getMonth()))
}

export function getTenureMonthsFromHistory(_salaryHistory: SalaryHistory[], hireDate: string): number {
  const hireDateValue = toStableDate(hireDate)
  return hireDateValue ? getMonthsFromDate(hireDateValue) : 0
}

export function getNoRaiseMonthsFromHistory(salaryHistory: SalaryHistory[], hireDate: string): number {
  const todayIsoDate = getTodayIsoDate()
  const sorted = [...salaryHistory]
    .filter(item => item.effective_date <= todayIsoDate)
    .sort((left, right) => (
      new Date(`${left.effective_date}T12:00:00`).getTime() - new Date(`${right.effective_date}T12:00:00`).getTime()
    ))

  if (sorted.length === 0) {
    const fallbackDate = toStableDate(hireDate)
    return fallbackDate ? getMonthsFromDate(fallbackDate) : 0
  }

  let lastRaiseDate: Date | null = null
  for (let i = 1; i < sorted.length; i++) {
    const previous = sorted[i - 1]
    const current = sorted[i]
    if (current.salary > previous.salary) {
      lastRaiseDate = toStableDate(current.effective_date)
    }
  }

  if (lastRaiseDate) {
    return getMonthsFromDate(lastRaiseDate)
  }

  const firstDate = toStableDate(sorted[0].effective_date)
  if (firstDate) {
    return getMonthsFromDate(firstDate)
  }

  const fallbackDate = toStableDate(hireDate)
  return fallbackDate ? getMonthsFromDate(fallbackDate) : 0
}

export function getTodayIsoDate(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getEffectiveSalaryForDate(
  salaryHistory: SalaryHistory[],
  fallbackSalary: number,
  targetDateIso: string
): number {
  if (!salaryHistory || salaryHistory.length === 0) return fallbackSalary

  const sorted = [...salaryHistory]
    .sort((left, right) => (
      new Date(`${left.effective_date}T12:00:00`).getTime() - new Date(`${right.effective_date}T12:00:00`).getTime()
    ))

  let effectiveSalary = fallbackSalary
  for (const item of sorted) {
    if (item.effective_date <= targetDateIso) {
      effectiveSalary = item.salary
    }
  }

  return effectiveSalary
}

export function normalizeSubdivisionName(name: string): string {
  return name.trim().toLowerCase()
}

export interface EditableEmployee {
  id: number
  full_name: string
  last_name: string
  first_name: string
  middle_name: string
  position: string
  department: string
  subdivision: string
  current_salary: number
  monthly_bonus: number
  hire_date: string
  birth_date: string
  email: string
  phone: string
  snils: string
  company: string
  country: string
}

type SupabaseErrorLike = { code?: string; message?: string | null; details?: string | null; hint?: string | null } | null

export function isMissingRpcError(error: SupabaseErrorLike, status?: number | null): boolean {
  if (status === 404) return true
  if (!error) return false
  if (error.code === 'PGRST202') return true
  const combined = `${error.message || ''} ${error.details || ''}`.toLowerCase()
  return combined.includes('could not find the function') || combined.includes('schema cache')
}

export function isMissingRelationError(error: SupabaseErrorLike, status?: number | null): boolean {
  if (status === 404) return true
  if (!error) return false
  if (error.code === '42P01' || error.code === 'PGRST205') return true
  const combined = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`.toLowerCase()
  return combined.includes('does not exist') || combined.includes('could not find the table') || combined.includes('not found')
}

export function isMissingEmployeeEventsTableError(error: SupabaseErrorLike, status?: number | null): boolean {
  if (!isMissingRelationError(error, status)) return false
  if (status === 404) return true
  const combined = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase()
  return combined.includes('tender_employee_events')
}

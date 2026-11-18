import type { Employee, TenderEmployeeEvent } from '../types'

// Период работы: end — дата архивации, исключительно (в этот день сотрудник уже не работает)
export interface IEmploymentPeriod {
  start: string
  end: string | null
}

type EmploymentSource = Pick<Employee, 'hire_date' | 'is_archived' | 'archived_at'>

const MIN_DATE = '0000-01-01'
const ISO_DATE = /^\d{4}-\d{2}-\d{2}/

const toDay = (value: string | null | undefined): string | null => (
  value && ISO_DATE.test(value) ? value.slice(0, 10) : null
)

const compareEvents = (left: TenderEmployeeEvent, right: TenderEmployeeEvent): number => (
  left.event_date.localeCompare(right.event_date)
  || (left.created_at || '').localeCompare(right.created_at || '')
  || left.id - right.id
)

// Периоды работы по дате приёма и событиям архивации/восстановления
export function buildEmploymentPeriods(
  employee: EmploymentSource,
  events: TenderEmployeeEvent[]
): IEmploymentPeriod[] {
  const periods: IEmploymentPeriod[] = [{ start: toDay(employee.hire_date) ?? MIN_DATE, end: null }]
  const sorted = events
    .filter(event => (event.event_type === 'archive' || event.event_type === 'unarchive') && toDay(event.event_date))
    .map(event => ({ ...event, event_date: event.event_date.slice(0, 10) }))
    .sort(compareEvents)

  for (const event of sorted) {
    const last = periods[periods.length - 1]
    if (event.event_type === 'archive' && last.end === null) {
      last.end = event.event_date
    } else if (event.event_type === 'unarchive' && last.end !== null) {
      periods.push({ start: event.event_date, end: null })
    }
  }

  const last = periods[periods.length - 1]
  if (employee.is_archived && last.end === null) {
    // Архивный без события archive (или без событий вовсе): закрываем по дате архивации
    last.end = toDay(employee.archived_at)
  } else if (!employee.is_archived && last.end !== null) {
    // Восстановлен без события unarchive: работает до сих пор
    last.end = null
  }

  // Пустые периоды (архивация в день приёма или раньше) не считаются
  return periods.filter(period => period.end === null || period.end > period.start)
}

export function isEmployedInMonth(periods: IEmploymentPeriod[], year: number, month: number): boolean {
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return periods.some(period => period.start <= monthEnd && (period.end === null || period.end > monthStart))
}

export function isEmployedOnDate(periods: IEmploymentPeriod[], isoDate: string): boolean {
  return periods.some(period => period.start <= isoDate && (period.end === null || period.end > isoDate))
}

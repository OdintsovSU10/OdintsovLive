import type { EmployeeWithStats } from '../../types'
import { countMissingTimesheetDays } from './dashboardMetrics'
import { formatHours, formatNumber, formatPercent } from './dashboardFormat'
import type { IEmployeeTrend, StatusCounts } from './dashboardTypes'

// Ключи строк блока «Посещаемость за месяц»
export type AttendanceStatusKey = 'work' | 'remote' | 'vacation' | 'sick' | 'absent' | 'unpaid'

export type MetricKind = 'attendance' | 'missed' | 'overtime' | 'unfilled' | `status:${AttendanceStatusKey}`

export interface IMetricPerson {
  employee: EmployeeWithStats
  subdivision: string
  value: string
  detail?: string
  // Порядок по возрастанию: у «чем больше, тем выше» значение со знаком минус
  sort: number
}

export const ATTENDANCE_STATUS_ROWS: Array<{ key: AttendanceStatusKey; label: string }> = [
  { key: 'work', label: 'Работа' },
  { key: 'remote', label: 'Удалённо' },
  { key: 'vacation', label: 'Отпуск' },
  { key: 'sick', label: 'Больничный' },
  { key: 'absent', label: 'Прогул' },
  { key: 'unpaid', label: 'За свой счёт' }
]

// Дни статуса: работа включает «больничный с работой», отпуск — учебный
export const getStatusDays = (counts: StatusCounts, key: AttendanceStatusKey): number => {
  if (key === 'work') return counts.work + counts.sick_worked
  if (key === 'vacation') return counts.vacation + counts.educational_leave
  return counts[key]
}

const METRIC_TITLES: Record<'attendance' | 'missed' | 'overtime' | 'unfilled', string> = {
  attendance: 'Явка',
  missed: 'Пропуски',
  overtime: 'Переработки',
  unfilled: 'Не заполнен табель'
}

export const getMetricTitle = (kind: MetricKind): string => {
  if (kind.startsWith('status:')) {
    const key = kind.slice('status:'.length)
    return ATTENDANCE_STATUS_ROWS.find(row => row.key === key)?.label ?? key
  }
  return METRIC_TITLES[kind as keyof typeof METRIC_TITLES]
}

const formatDays = (count: number): string => `${formatNumber(count)} дн`

// Строки мини-окна показателя: кто вошёл в цифру и с каким значением
export function buildMetricPeople(
  kind: MetricKind,
  trends: IEmployeeTrend[],
  year: number,
  month: number
): IMetricPerson[] {
  const result: IMetricPerson[] = []

  for (const trend of trends) {
    const { employee, subdivision, latest } = trend
    const base = { employee, subdivision }

    if (kind === 'attendance') {
      if (!latest.hasTimesheet || latest.normWorkdays <= 0) continue
      const percent = Math.min(100, (latest.workedWeekdays / latest.normWorkdays) * 100)
      result.push({
        ...base,
        value: formatPercent(percent),
        detail: `${formatNumber(latest.workedWeekdays)} из ${formatNumber(latest.normWorkdays)} дн`,
        sort: percent
      })
    } else if (kind === 'missed') {
      const { absent, unpaid, sick } = latest.statusCounts
      const days = absent + unpaid + sick
      if (days <= 0) continue
      const parts = [
        absent > 0 ? `прогул ${absent}` : null,
        sick > 0 ? `больничный ${sick}` : null,
        unpaid > 0 ? `за свой счёт ${unpaid}` : null
      ].filter((part): part is string => part !== null)
      result.push({ ...base, value: formatDays(days), detail: parts.join(' · '), sort: -days })
    } else if (kind === 'overtime') {
      if (latest.overtime <= 0) continue
      result.push({ ...base, value: `${formatHours(latest.overtime)} ч`, sort: -latest.overtime })
    } else if (kind === 'unfilled') {
      const missing = countMissingTimesheetDays(employee, year, month)
      if (missing <= 0) continue
      result.push({ ...base, value: formatDays(missing), sort: -missing })
    } else {
      const days = getStatusDays(latest.statusCounts, kind.slice('status:'.length) as AttendanceStatusKey)
      if (days <= 0) continue
      result.push({ ...base, value: formatDays(days), sort: -days })
    }
  }

  return result.sort((left, right) => (
    left.sort - right.sort || left.employee.full_name.localeCompare(right.employee.full_name, 'ru')
  ))
}

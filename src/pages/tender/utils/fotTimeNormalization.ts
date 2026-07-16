import type { TimesheetStatus } from '../types'
import { getRemoteFullDayHours, roundTimesheetHours } from './salaryCalculator'

/**
 * FOT API отдаёт готовые нетто-часы: обеденная квота уже вычтена.
 * Обычные часы только округляются, а удалёнка всегда закрывает полную норму дня.
 */
export function normalizeFotHours(
  hours: number | null,
  status: TimesheetStatus,
  workDate: string,
  _hoursOverridden: boolean
): number | null {
  if (status === 'remote') {
    return getRemoteFullDayHours(hours, new Date(`${workDate}T12:00:00`))
  }
  if (hours == null) return null
  return roundTimesheetHours(hours)
}

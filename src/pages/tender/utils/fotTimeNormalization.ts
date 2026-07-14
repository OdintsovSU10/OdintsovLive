import type { TimesheetStatus } from '../types'
import { roundTimesheetHours } from './salaryCalculator'

/**
 * FOT API отдаёт готовые нетто-часы: обеденная квота уже вычтена.
 * Портал не меняет это значение и только округляет его до целого часа по правилу FOT.
 */
export function normalizeFotHours(
  hours: number | null,
  _status: TimesheetStatus,
  _workDate: string,
  _hoursOverridden: boolean
): number | null {
  if (hours == null) return null
  return roundTimesheetHours(hours)
}

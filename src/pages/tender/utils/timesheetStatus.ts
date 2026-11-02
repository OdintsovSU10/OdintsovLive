import type { TimesheetStatus } from '../types'

export interface TimesheetStatusMeta {
  label: string
  short: string
  className: string
  color: string
}

export const TIMESHEET_STATUS_META: Record<TimesheetStatus, TimesheetStatusMeta> = {
  work: { label: 'Работа', short: '', className: 'work', color: 'var(--tone-ok)' },
  remote: { label: 'Удалёнка', short: 'УУ', className: 'remote', color: 'var(--chart-7)' },
  vacation: { label: 'Отпуск', short: 'От', className: 'vacation', color: 'var(--tone-warn)' },
  sick: { label: 'Больничный', short: 'Б', className: 'sick', color: 'var(--chart-2)' },
  dayoff: { label: 'Выходной', short: 'В', className: 'dayoff', color: 'var(--text-muted)' },
  absent: { label: 'Неявка', short: 'Н', className: 'absent', color: 'var(--tone-bad)' },
  unpaid: { label: 'За свой счёт', short: 'С', className: 'unpaid', color: 'var(--chart-3)' },
  educational_leave: { label: 'Учебный отпуск', short: 'У', className: 'educational', color: 'var(--chart-5)' },
  sick_worked: { label: 'Работа на больничном', short: 'РБ', className: 'sick-worked', color: 'var(--chart-4)' }
}

export const TIMESHEET_STATUS_ORDER: TimesheetStatus[] = [
  'work',
  'remote',
  'vacation',
  'sick',
  'dayoff',
  'absent',
  'unpaid',
  'educational_leave',
  'sick_worked'
]

export type TimesheetStatusCounts = Record<TimesheetStatus, number>

export function createEmptyTimesheetStatusCounts(): TimesheetStatusCounts {
  return {
    work: 0,
    remote: 0,
    vacation: 0,
    sick: 0,
    dayoff: 0,
    absent: 0,
    unpaid: 0,
    educational_leave: 0,
    sick_worked: 0
  }
}

export function isWorkedTimesheetStatus(status: TimesheetStatus): boolean {
  return status === 'work' || status === 'remote' || status === 'sick_worked'
}

import type { TimesheetStatus } from '../types'

export interface TimesheetStatusMeta {
  label: string
  short: string
  className: string
  color: string
}

export const TIMESHEET_STATUS_META: Record<TimesheetStatus, TimesheetStatusMeta> = {
  work: { label: 'Работа', short: '', className: 'work', color: '#6ee7b7' },
  remote: { label: 'Удалёнка', short: 'УУ', className: 'remote', color: '#38bdf8' },
  vacation: { label: 'Отпуск', short: 'От', className: 'vacation', color: '#fbbf24' },
  sick: { label: 'Больничный', short: 'Б', className: 'sick', color: '#60a5fa' },
  dayoff: { label: 'Выходной', short: 'В', className: 'dayoff', color: '#94a3b8' },
  absent: { label: 'Неявка', short: 'Н', className: 'absent', color: '#f87171' },
  unpaid: { label: 'За свой счёт', short: 'С', className: 'unpaid', color: '#fb923c' },
  educational_leave: { label: 'Учебный отпуск', short: 'У', className: 'educational', color: '#a78bfa' },
  sick_worked: { label: 'Работа на больничном', short: 'РБ', className: 'sick-worked', color: '#2dd4bf' }
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

import type { EmployeeWithStats, TimesheetStatus } from '../../types'

// Окно аналитики: выбранный месяц + столько же месяцев назад
export const MONTHS_WINDOW = 5

export const NO_SUBDIVISION = 'Без подразделения'

export interface IMonthSlot {
  year: number
  month: number
  key: string
  label: string
  short: string
}

// Листы администратора, которые открываются кнопками в строке вкладок оболочки
export type AdminPanelSheet = 'subdivisions' | 'addEmployee'

export type StatusCounts = Record<TimesheetStatus, number>

export interface IEmployeeTrendPoint {
  hasTimesheet: boolean
  hours: number
  normHoursWeekdays: number
  normWorkdays: number
  // Отработанные будни (work + remote + sick_worked)
  workedWeekdays: number
  overtime: number
  weekendDays: number
  // Факт по табелю (как раньше: final_salary)
  earned: number
  // План месяца: оклад + бонус + проезд месяца
  plan: number
  statusCounts: StatusCounts
  // Даты прогулов месяца (ISO), по возрастанию
  absentDates: string[]
}

export interface IEmployeeTrend {
  employee: EmployeeWithStats
  subdivision: string
  points: IEmployeeTrendPoint[]
  latest: IEmployeeTrendPoint
  previous: IEmployeeTrendPoint | null
}

export type PresenceStatus =
  | 'office'
  | 'remote'
  | 'left'
  | 'vacation'
  | 'sick'
  | 'dayoff'
  | 'noMark'
  | 'notYet'
  | 'noData'

export const PRESENCE_ORDER: PresenceStatus[] = [
  'office',
  'remote',
  'left',
  'vacation',
  'sick',
  'dayoff',
  'noMark',
  'notYet',
  'noData'
]

export const PRESENCE_LABELS: Record<PresenceStatus, string> = {
  office: 'В офисе',
  remote: 'Удалённо',
  left: 'Ушёл',
  vacation: 'Отпуск',
  sick: 'Больничный',
  dayoff: 'Выходной',
  noMark: 'Нет отметки',
  notYet: 'Ещё не пришёл',
  noData: 'Нет данных СКУД'
}

export type PresenceMap = ReadonlyMap<number, PresenceStatus>

// Внешний проход за сегодня (без внутренних точек и отказов без направления)
export interface ITodayPass {
  id: string
  // Время события как в СКУД: HH:MM:SS
  time: string
  direction: 'entry' | 'exit'
  accessPoint: string | null
}

// Проходы за сегодня по id сотрудника, по возрастанию времени
export type PassesMap = ReadonlyMap<number, ITodayPass[]>

// Время первого входа за сегодня (HH:MM:SS) по id сотрудника
export type FirstEntryMap = ReadonlyMap<number, string>

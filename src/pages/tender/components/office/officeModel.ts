// Модель вкладки «Офис»: чистые функции без React. Кто за каким местом, в какой позе и с какой подписью.
import type { EmployeeWithStats } from '../../types'
import {
  PRESENCE_LABELS,
  type FirstEntryMap,
  type PassesMap,
  type PresenceMap,
  type PresenceStatus
} from '../dashboard/dashboardTypes'
import { OFFICE_SEATS, type IOfficeSeat } from './officeLayout'

export type TWorkPose = 'edit' | 'read' | 'think' | 'web'
export type TOfficePose = TWorkPose | 'empty'

// office — на месте; left — ушёл; none — нет на месте без причины; leave — отпуск, больничный, выходной, удалённо
export type TSeatTone = 'office' | 'left' | 'none' | 'leave' | 'loading' | 'unavailable'

// loading — первая загрузка; ready — данные получены; unavailable — табель или СКУД недоступны
export type TOfficePhase = 'loading' | 'ready' | 'unavailable'

export interface IPresenceData {
  statuses: PresenceMap
  passes: PassesMap
  firstEntries: FirstEntryMap
}

export interface IOfficeSeatState {
  seat: IOfficeSeat
  // Индекс места по порядку — цвет рубашки
  index: number
  name: string
  fullName: string
  subdivision: string
  pose: TOfficePose
  // Пустая строка — подписи статуса нет (идёт загрузка)
  status: string
  tone: TSeatTone
  inOffice: boolean
}

const WORK_POSES: readonly TWorkPose[] = ['edit', 'read', 'think', 'web']
const MIN_POSE_PERIOD_S = 25
const POSE_PERIOD_SPREAD_S = 36
const NO_SUBDIVISION_LABEL = 'без подразделения'

const assertNever = (value: never): never => {
  throw new Error(`Неизвестный статус присутствия: ${String(value)}`)
}

// Стабильный хэш строки: одна и та же поза у одного места в один и тот же момент на любой машине
const hashOf = (text: string): number => {
  let hash = 0
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0
  }
  return hash
}

// Рабочая поза места: меняется раз в 25–60 с, у каждого места свой период и сдвиг — не синхронно
export const workPose = (seatNo: number, nowMs: number): TWorkPose => {
  const periodMs = (MIN_POSE_PERIOD_S + ((seatNo * 7) % POSE_PERIOD_SPREAD_S)) * 1000
  const slot = Math.floor((nowMs + seatNo * 17_321) / periodMs)
  return WORK_POSES[hashOf(`${seatNo}:${slot}`) % WORK_POSES.length]
}

export const shortName = (employee: EmployeeWithStats): string => {
  const parts = employee.full_name.trim().split(/\s+/)
  const last = employee.last_name?.trim() || parts[0] || ''
  const first = employee.first_name?.trim() || parts[1] || ''
  return first ? `${last} ${first[0]}.` : last
}

// Сотрудники мест в порядке мест; кого нет в списке — пропускаются
export const pickSeatEmployees = (employees: readonly EmployeeWithStats[]): EmployeeWithStats[] => {
  const byId = new Map(employees.map(employee => [employee.id, employee] as const))
  return OFFICE_SEATS.flatMap(seat => {
    const employee = byId.get(seat.employeeId)
    return employee ? [employee] : []
  })
}

const toHm = (time: string): string => time.slice(0, 5)

interface IStatusText {
  pose: TOfficePose
  status: string
  tone: TSeatTone
}

const describePresence = (
  status: PresenceStatus,
  employeeId: number,
  seatNo: number,
  nowMs: number,
  data: IPresenceData
): IStatusText => {
  switch (status) {
    case 'office': {
      const since = data.firstEntries.get(employeeId)
      return {
        pose: workPose(seatNo, nowMs),
        status: since ? `${PRESENCE_LABELS.office} с ${toHm(since)}` : PRESENCE_LABELS.office,
        tone: 'office'
      }
    }
    case 'left': {
      const passes = data.passes.get(employeeId) ?? []
      const lastExit = [...passes].reverse().find(pass => pass.direction === 'exit')
      return {
        pose: 'empty',
        status: lastExit ? `${PRESENCE_LABELS.left} в ${toHm(lastExit.time)}` : PRESENCE_LABELS.left,
        tone: 'left'
      }
    }
    case 'notYet':
      return { pose: 'empty', status: PRESENCE_LABELS.notYet, tone: 'none' }
    case 'noMark':
      return { pose: 'empty', status: PRESENCE_LABELS.noMark, tone: 'none' }
    case 'noData':
      return { pose: 'empty', status: PRESENCE_LABELS.noData, tone: 'none' }
    case 'vacation':
      return { pose: 'empty', status: PRESENCE_LABELS.vacation, tone: 'leave' }
    case 'sick':
      return { pose: 'empty', status: PRESENCE_LABELS.sick, tone: 'leave' }
    case 'dayoff':
      return { pose: 'empty', status: PRESENCE_LABELS.dayoff, tone: 'leave' }
    case 'remote':
      return { pose: 'empty', status: PRESENCE_LABELS.remote, tone: 'leave' }
    default:
      return assertNever(status)
  }
}

const UNAVAILABLE_TEXT = 'Данные недоступны'
// Хук не дал статуса: сотрудник исключён из табеля или не работает сегодня
const NOT_TRACKED_TEXT = 'Не в табеле'
const NOT_FOUND_TEXT = 'Нет в списке'

const describeSeat = (
  employee: EmployeeWithStats | undefined,
  seat: IOfficeSeat,
  phase: TOfficePhase,
  nowMs: number,
  data: IPresenceData
): IStatusText => {
  switch (phase) {
    case 'loading':
      return { pose: 'empty', status: '', tone: 'loading' }
    case 'unavailable':
      return { pose: 'empty', status: UNAVAILABLE_TEXT, tone: 'unavailable' }
    case 'ready': {
      if (!employee) return { pose: 'empty', status: NOT_FOUND_TEXT, tone: 'none' }
      const status = data.statuses.get(employee.id)
      if (status === undefined) return { pose: 'empty', status: NOT_TRACKED_TEXT, tone: 'none' }
      return describePresence(status, employee.id, seat.no, nowMs, data)
    }
    default:
      return assertNever(phase)
  }
}

export const buildSeatStates = (
  employees: readonly EmployeeWithStats[],
  phase: TOfficePhase,
  data: IPresenceData,
  nowMs: number
): IOfficeSeatState[] => {
  const byId = new Map(employees.map(employee => [employee.id, employee] as const))
  return OFFICE_SEATS.map((seat, index) => {
    const employee = byId.get(seat.employeeId)
    const described = describeSeat(employee, seat, phase, nowMs, data)
    return {
      seat,
      index,
      name: employee ? shortName(employee) : seat.surname,
      fullName: employee?.full_name ?? seat.surname,
      subdivision: employee?.subdivision || employee?.department || NO_SUBDIVISION_LABEL,
      pose: described.pose,
      status: described.status,
      tone: described.tone,
      inOffice: described.tone === 'office'
    }
  })
}

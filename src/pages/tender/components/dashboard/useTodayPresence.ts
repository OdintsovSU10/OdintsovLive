import { useEffect, useRef, useState } from 'react'
import type { EmployeeWithStats, TimesheetStatus } from '../../types'
import { fetchFotEmployeeEvents, type FotEmployeeEvent } from '../../utils/fotEmployeeEvents'
import { getMoscowParts } from '../../utils/livePayroll'
import { isWeekendOrHoliday } from '../../utils/salaryCalculator'
import { toIsoDate } from '../../utils/employeeFormat'
import type { PresenceMap, PresenceStatus } from './dashboardTypes'

const MAX_PARALLEL_REQUESTS = 4
const REFRESH_INTERVAL_MS = 5 * 60 * 1000
// С этого часа по Москве отсутствие прохода считается «нет отметки»
const MARK_DEADLINE_HOUR = 10

const TIMESHEET_PRESENCE: Partial<Record<TimesheetStatus, PresenceStatus>> = {
  vacation: 'vacation',
  educational_leave: 'vacation',
  sick: 'sick',
  remote: 'remote',
  dayoff: 'dayoff',
  unpaid: 'dayoff'
}

const EMPTY_MAP: PresenceMap = new Map<number, PresenceStatus>()

function getLastDirection(events: FotEmployeeEvent[]): 'entry' | 'exit' | null {
  // Внутренние точки (коридоры) не показывают, на объекте человек или нет
  const directed = events
    .filter(event => event.direction !== null && !event.is_internal)
    .sort((left, right) => left.event_time.localeCompare(right.event_time))
  return directed.length > 0 ? directed[directed.length - 1].direction : null
}

function getStatusWithoutPasses(isDayOff: boolean, hour: number): PresenceStatus {
  if (isDayOff) return 'dayoff'
  return hour >= MARK_DEADLINE_HOUR ? 'noMark' : 'notYet'
}

// Запускает задачи не более limit одновременно
async function runLimited<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor]
      cursor += 1
      await worker(item)
    }
  })
  await Promise.all(runners)
}

export interface ITodayPresence {
  statuses: PresenceMap
  loading: boolean
  // Дата «сегодня» по Москве (YYYY-MM-DD), по которой посчитаны статусы
  todayIso: string
}

// Статус «сегодня» по сотрудникам: табель → проходы СКУД → выходной/нет отметки
export function useTodayPresence(employees: EmployeeWithStats[], enabled: boolean): ITodayPresence {
  const [statuses, setStatuses] = useState<PresenceMap>(EMPTY_MAP)
  const [loading, setLoading] = useState(enabled)
  const [refreshTick, setRefreshTick] = useState(0)
  const [todayIso, setTodayIso] = useState('')
  const loadedRef = useRef(false)

  useEffect(() => {
    if (!enabled) return
    const timer = window.setInterval(() => setRefreshTick(tick => tick + 1), REFRESH_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [enabled])

  useEffect(() => {
    if (!enabled) {
      loadedRef.current = false
      setStatuses(EMPTY_MAP)
      setLoading(false)
      return
    }

    const controller = new AbortController()
    const moscow = getMoscowParts(new Date())
    const today = toIsoDate(moscow.year, moscow.month, moscow.day)
    const isDayOff = isWeekendOrHoliday(new Date(moscow.year, moscow.month - 1, moscow.day, 12))
    const result = new Map<number, PresenceStatus>()
    const needEvents: EmployeeWithStats[] = []

    for (const employee of employees) {
      if (employee.excluded_from_timesheet) continue

      const entry = (employee.timesheet || []).find(item => item.work_date === today)
      const fromTimesheet = entry ? TIMESHEET_PRESENCE[entry.status] : undefined
      if (fromTimesheet) {
        result.set(employee.id, fromTimesheet)
      } else if (!employee.fot_employee_id) {
        result.set(employee.id, 'noData')
      } else {
        needEvents.push(employee)
      }
    }

    setTodayIso(today)
    // Повторные обновления идут без «мигания»: прежние статусы остаются до прихода новых
    if (!loadedRef.current) setLoading(true)

    const load = async () => {
      await runLimited(needEvents, MAX_PARALLEL_REQUESTS, async employee => {
        if (controller.signal.aborted) return
        try {
          const events = await fetchFotEmployeeEvents(
            employee.fot_employee_id as string,
            today,
            today,
            controller.signal
          )
          const direction = getLastDirection(events)
          if (direction === 'entry') result.set(employee.id, 'office')
          else if (direction === 'exit') result.set(employee.id, 'left')
          else result.set(employee.id, getStatusWithoutPasses(isDayOff, moscow.hour))
        } catch {
          result.set(employee.id, 'noData')
        }
      })

      if (controller.signal.aborted) return
      loadedRef.current = true
      setStatuses(result)
      setLoading(false)
    }

    load()
    return () => controller.abort()
  }, [employees, enabled, refreshTick])

  return { statuses, loading, todayIso }
}

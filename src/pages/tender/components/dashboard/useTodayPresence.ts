import { useCallback, useEffect, useRef, useState } from 'react'
import type { EmployeeWithStats, TimesheetStatus } from '../../types'
import { fetchFotEmployeeEvents, type FotEmployeeEvent } from '../../utils/fotEmployeeEvents'
import { getMoscowParts } from '../../utils/livePayroll'
import { isWeekendOrHoliday } from '../../utils/salaryCalculator'
import { toIsoDate } from '../../utils/employeeFormat'
import type { FirstEntryMap, ITodayPass, PassesMap, PresenceMap, PresenceStatus } from './dashboardTypes'

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
const EMPTY_PASSES: PassesMap = new Map<number, ITodayPass[]>()
const EMPTY_FIRST_ENTRIES: FirstEntryMap = new Map<number, string>()

// Внутренние точки (коридоры) не показывают, на объекте человек или нет; отказы без направления тоже отбрасываем
function toExternalPasses(events: FotEmployeeEvent[]): ITodayPass[] {
  return [...events]
    .sort((left, right) => left.event_time.localeCompare(right.event_time) || left.id.localeCompare(right.id))
    .flatMap(event => (
      event.direction === null || event.is_internal
        ? []
        : [{ id: event.id, time: event.event_time, direction: event.direction, accessPoint: event.access_point }]
    ))
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
  passes: PassesMap
  firstEntries: FirstEntryMap
  loading: boolean
  // Идёт повторная загрузка поверх уже показанных данных
  refreshing: boolean
  // Перезапросить проходы сейчас
  refresh: () => void
  // Дата «сегодня» по Москве (YYYY-MM-DD), по которой посчитаны статусы
  todayIso: string
}

// Статус «сегодня» по сотрудникам: табель → проходы СКУД → выходной/нет отметки
export function useTodayPresence(employees: EmployeeWithStats[], enabled: boolean): ITodayPresence {
  const [statuses, setStatuses] = useState<PresenceMap>(EMPTY_MAP)
  const [passes, setPasses] = useState<PassesMap>(EMPTY_PASSES)
  const [firstEntries, setFirstEntries] = useState<FirstEntryMap>(EMPTY_FIRST_ENTRIES)
  const [loading, setLoading] = useState(enabled)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshTick, setRefreshTick] = useState(0)
  const [todayIso, setTodayIso] = useState('')
  const loadedRef = useRef(false)

  const refresh = useCallback(() => setRefreshTick(tick => tick + 1), [])

  useEffect(() => {
    if (!enabled) return
    const timer = window.setInterval(() => setRefreshTick(tick => tick + 1), REFRESH_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [enabled])

  useEffect(() => {
    if (!enabled) {
      loadedRef.current = false
      setStatuses(EMPTY_MAP)
      setPasses(EMPTY_PASSES)
      setFirstEntries(EMPTY_FIRST_ENTRIES)
      setLoading(false)
      setRefreshing(false)
      return
    }

    const controller = new AbortController()
    const moscow = getMoscowParts(new Date())
    const today = toIsoDate(moscow.year, moscow.month, moscow.day)
    const isDayOff = isWeekendOrHoliday(new Date(moscow.year, moscow.month - 1, moscow.day, 12))
    const result = new Map<number, PresenceStatus>()
    const resultPasses = new Map<number, ITodayPass[]>()
    const resultFirstEntries = new Map<number, string>()
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
    else setRefreshing(true)

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
          const external = toExternalPasses(events)
          const direction = external.length > 0 ? external[external.length - 1].direction : null
          const firstEntry = external.find(pass => pass.direction === 'entry')
          if (external.length > 0) resultPasses.set(employee.id, external)
          if (firstEntry) resultFirstEntries.set(employee.id, firstEntry.time)
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
      setPasses(resultPasses)
      setFirstEntries(resultFirstEntries)
      setLoading(false)
      setRefreshing(false)
    }

    load()
    return () => controller.abort()
  }, [employees, enabled, refreshTick])

  return { statuses, passes, firstEntries, loading, refreshing, refresh, todayIso }
}

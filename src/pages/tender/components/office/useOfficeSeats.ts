import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../../lib/supabase'
import { useReducedMotion } from '../../../../hooks/useReducedMotion'
import type { EmployeeWithStats, TimesheetEntry } from '../../types'
import { getMoscowParts } from '../../utils/livePayroll'
import { toIsoDate } from '../../utils/employeeFormat'
import { useTodayPresence } from '../dashboard/useTodayPresence'
import { SEAT_EMPLOYEE_IDS } from './officeLayout'
import {
  buildSeatStates,
  pickSeatEmployees,
  type IOfficeSeatState,
  type TOfficePhase
} from './officeModel'

// Один общий таймер этажа: поза каждого места пересчитывается от времени (см. workPose)
const CLOCK_TICK_MS = 5000

const formatMoscowTime = (date: Date): string => date.toLocaleTimeString('ru-RU', {
  timeZone: 'Europe/Moscow',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
})

interface ITodayTimesheet {
  rows: TimesheetEntry[]
  // Запрос выполнен хотя бы раз (успешно или нет)
  ready: boolean
  failed: boolean
  reload: () => Promise<void>
}

// Табель за сегодня (по Москве) только по сотрудникам мест — независимо от месяца, выбранного в Тендере
const useTodayTimesheet = (): ITodayTimesheet => {
  const [rows, setRows] = useState<TimesheetEntry[]>([])
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)

  const reload = useCallback(async () => {
    const moscow = getMoscowParts(new Date())
    const today = toIsoDate(moscow.year, moscow.month, moscow.day)
    const { data, error } = await supabase
      .from('tender_timesheet')
      .select('*')
      .in('employee_id', [...SEAT_EMPLOYEE_IDS])
      .eq('work_date', today)
    if (error) {
      setFailed(true)
    } else {
      setRows((data ?? []) as TimesheetEntry[])
      setFailed(false)
    }
    setReady(true)
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  return { rows, ready, failed, reload }
}

export interface IOfficeSeats {
  states: IOfficeSeatState[]
  phase: TOfficePhase
  inOffice: number
  // Время последнего обновления по Москве; пустая строка — данных ещё не было
  updatedAt: string
  // Идёт первая загрузка или ручное обновление
  busy: boolean
  bannerText: string
  refresh: () => Promise<void>
}

// Данные вкладки «Офис»: табель за сегодня, присутствие по СКУД и состояние каждого места
export const useOfficeSeats = (allEmployees: EmployeeWithStats[]): IOfficeSeats => {
  const timesheet = useTodayTimesheet()
  const reducedMotion = useReducedMotion()
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [updatedAt, setUpdatedAt] = useState('')

  // Сотрудники мест. Ссылка на массив меняется только при смене полей, которые читает хук присутствия:
  // иначе каждая смена месяца в Тендере перезапускала бы эффект хука и слала запросы в СКУД заново.
  const picked = pickSeatEmployees(allEmployees)
  const signature = JSON.stringify(
    picked.map(employee => [employee.id, employee.fot_employee_id, employee.excluded_from_timesheet, employee.employmentPeriods])
  )
  const [stable, setStable] = useState({ signature, list: picked })
  if (stable.signature !== signature) setStable({ signature, list: picked })

  // Табель за сегодня подменяет `timesheet` сотрудника целиком — в форме, которую ожидает хук
  const presenceEmployees = useMemo(
    () => stable.list.map(employee => ({
      ...employee,
      timesheet: timesheet.rows.filter(row => row.employee_id === employee.id)
    })),
    [stable.list, timesheet.rows]
  )

  // Проходы запрашиваем только когда табель уже получен: иначе хук отстрелял бы запросы дважды
  const hookEnabled = timesheet.ready && !timesheet.failed
  const presence = useTodayPresence(presenceEmployees, hookEnabled)
  const loaded = hookEnabled && presence.todayIso !== '' && !presence.loading

  let phase: TOfficePhase = 'loading'
  if (timesheet.failed || (loaded && presence.error)) phase = 'unavailable'
  else if (loaded) phase = 'ready'

  const animate = phase === 'ready' && !reducedMotion
  useEffect(() => {
    if (!animate) return
    const timer = window.setInterval(() => setNowMs(Date.now()), CLOCK_TICK_MS)
    return () => window.clearInterval(timer)
  }, [animate])

  const { statuses, passes, firstEntries } = presence
  useEffect(() => {
    if (statuses.size > 0) setUpdatedAt(formatMoscowTime(new Date()))
  }, [statuses])

  const states = useMemo(
    () => buildSeatStates(stable.list, phase, { statuses, passes, firstEntries }, nowMs),
    [stable.list, phase, statuses, passes, firstEntries, nowMs]
  )
  const inOffice = states.filter(state => state.inOffice).length

  const refresh = async (): Promise<void> => {
    await timesheet.reload()
    presence.refresh()
  }

  return {
    states,
    phase,
    inOffice,
    updatedAt,
    busy: phase === 'loading' || presence.refreshing,
    bannerText: timesheet.failed ? 'Не удалось загрузить табель' : 'Нет связи со СКУД',
    refresh
  }
}

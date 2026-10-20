import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { roundTimesheetHours } from '../utils/salaryCalculator'
import { toIsoDate } from '../utils/employeeFormat'
import type { WorkPlan } from '../utils/attendanceDay'
import type { TimesheetEntry } from '../types'

const CACHE_TTL_MS = 2 * 60 * 1000
const EMPTY_PLANS = new Map<string, WorkPlan>()

interface YearData {
  entries: TimesheetEntry[]
  // Планы графика FOT по дате; пусто, если таблица пуста или не загрузилась
  plans: Map<string, WorkPlan>
}

interface CacheItem extends YearData {
  at: number
}

// Кеш по id сотрудника и году: смена месяца внутри года не ходит в сеть
const yearCache = new Map<string, CacheItem>()
const inflight = new Map<string, Promise<YearData>>()

function getKey(employeeId: number, year: number): string {
  return `${employeeId}-${year}`
}

function readCache(key: string): YearData | null {
  const item = yearCache.get(key)
  if (!item) return null
  if (Date.now() - item.at > CACHE_TTL_MS) {
    yearCache.delete(key)
    return null
  }
  return item
}

// Планы нужны только для порога полного дня: любая ошибка или пустота — запасной расчёт по календарю
async function fetchPlans(employeeId: number, year: number): Promise<Map<string, WorkPlan>> {
  const plans = new Map<string, WorkPlan>()
  try {
    const { data, error } = await supabase
      .from('tender_work_plans')
      .select('work_date,is_working_day,planned_hours,full_day_threshold_hours')
      .eq('employee_id', employeeId)
      .gte('work_date', toIsoDate(year, 1, 1))
      .lte('work_date', toIsoDate(year, 12, 31))
    if (error) return plans
    for (const row of (data || []) as WorkPlan[]) plans.set(row.work_date, row)
  } catch {
    // запасной расчёт по календарю
  }
  return plans
}

function fetchYear(key: string, employeeId: number, year: number): Promise<YearData> {
  const pending = inflight.get(key)
  if (pending) return pending

  const request = (async () => {
    const [timesheet, plans] = await Promise.all([
      supabase
        .from('tender_timesheet')
        .select('id,employee_id,work_date,status,hours_worked,is_correction')
        .eq('employee_id', employeeId)
        .gte('work_date', toIsoDate(year, 1, 1))
        .lte('work_date', toIsoDate(year, 12, 31)),
      fetchPlans(employeeId, year)
    ])

    if (timesheet.error) throw timesheet.error

    const entries = ((timesheet.data || []) as TimesheetEntry[]).map(entry => ({
      ...entry,
      hours_worked: entry.hours_worked == null ? null : roundTimesheetHours(entry.hours_worked)
    }))
    const result: YearData = { entries, plans }
    yearCache.set(key, { at: Date.now(), ...result })
    return result
  })().finally(() => {
    inflight.delete(key)
  })

  inflight.set(key, request)
  return request
}

interface YearState {
  key: string
  data: YearData | null
  error: string | null
}

export function useEmployeeYearTimesheet(employeeId: number, year: number) {
  const key = getKey(employeeId, year)
  const [state, setState] = useState<YearState>(() => ({ key, data: readCache(key), error: null }))
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const cached = readCache(key)
    if (cached) {
      setState({ key, data: cached, error: null })
      return undefined
    }

    let cancelled = false
    setState({ key, data: null, error: null })
    fetchYear(key, employeeId, year)
      .then(data => {
        if (!cancelled) setState({ key, data, error: null })
      })
      .catch(err => {
        console.error('Error loading employee year timesheet:', err)
        if (!cancelled) {
          setState({ key, data: null, error: err instanceof Error ? err.message : 'Не удалось загрузить табель' })
        }
      })

    return () => {
      cancelled = true
    }
  }, [attempt, employeeId, key, year])

  const reload = useCallback(() => {
    yearCache.delete(key)
    setAttempt(value => value + 1)
  }, [key])

  // Пока состояние относится к другому ключу — считаем, что идёт загрузка
  const current = state.key === key ? state : null
  return {
    entries: current?.data?.entries ?? null,
    plans: current?.data?.plans ?? EMPTY_PLANS,
    loading: !current || (current.data === null && current.error === null),
    error: current?.error ?? null,
    reload
  }
}

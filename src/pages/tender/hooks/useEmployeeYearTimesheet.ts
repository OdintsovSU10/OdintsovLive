import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { roundTimesheetHours } from '../utils/salaryCalculator'
import { toIsoDate } from '../utils/employeeFormat'
import type { TimesheetEntry } from '../types'

const CACHE_TTL_MS = 2 * 60 * 1000

interface CacheItem {
  at: number
  entries: TimesheetEntry[]
}

// Кеш по id сотрудника и году: смена месяца внутри года не ходит в сеть
const yearCache = new Map<string, CacheItem>()
const inflight = new Map<string, Promise<TimesheetEntry[]>>()

function getKey(employeeId: number, year: number): string {
  return `${employeeId}-${year}`
}

function readCache(key: string): TimesheetEntry[] | null {
  const item = yearCache.get(key)
  if (!item) return null
  if (Date.now() - item.at > CACHE_TTL_MS) {
    yearCache.delete(key)
    return null
  }
  return item.entries
}

function fetchYear(key: string, employeeId: number, year: number): Promise<TimesheetEntry[]> {
  const pending = inflight.get(key)
  if (pending) return pending

  const request = (async () => {
    const { data, error } = await supabase
      .from('tender_timesheet')
      .select('id,employee_id,work_date,status,hours_worked,is_correction')
      .eq('employee_id', employeeId)
      .gte('work_date', toIsoDate(year, 1, 1))
      .lte('work_date', toIsoDate(year, 12, 31))

    if (error) throw error

    const entries = ((data || []) as TimesheetEntry[]).map(entry => ({
      ...entry,
      hours_worked: entry.hours_worked == null ? null : roundTimesheetHours(entry.hours_worked)
    }))
    yearCache.set(key, { at: Date.now(), entries })
    return entries
  })().finally(() => {
    inflight.delete(key)
  })

  inflight.set(key, request)
  return request
}

interface YearState {
  key: string
  entries: TimesheetEntry[] | null
  error: string | null
}

export function useEmployeeYearTimesheet(employeeId: number, year: number) {
  const key = getKey(employeeId, year)
  const [state, setState] = useState<YearState>(() => ({ key, entries: readCache(key), error: null }))
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const cached = readCache(key)
    if (cached) {
      setState({ key, entries: cached, error: null })
      return undefined
    }

    let cancelled = false
    setState({ key, entries: null, error: null })
    fetchYear(key, employeeId, year)
      .then(entries => {
        if (!cancelled) setState({ key, entries, error: null })
      })
      .catch(err => {
        console.error('Error loading employee year timesheet:', err)
        if (!cancelled) {
          setState({ key, entries: null, error: err instanceof Error ? err.message : 'Не удалось загрузить табель' })
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
    entries: current?.entries ?? null,
    loading: !current || (current.entries === null && current.error === null),
    error: current?.error ?? null,
    reload
  }
}

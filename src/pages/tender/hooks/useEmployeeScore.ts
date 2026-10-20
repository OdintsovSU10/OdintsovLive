import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { roundTimesheetHours } from '../utils/salaryCalculator'
import { toIsoDate } from '../utils/employeeFormat'
import type { WorkPlan } from '../utils/attendanceDay'
import { addDaysIso, buildEmployeeScoreView, type EmployeeScoreView, type ScoreMember } from '../utils/employeeScore'
import type { EmployeeWithStats, TimesheetEntry } from '../types'

const CACHE_TTL_MS = 5 * 60 * 1000
const PAGE_SIZE = 1000
// Запас для окна «30 дней назад»: 90 + 90 дней и ещё день
const HISTORY_DAYS = 181
const LOAD_ERROR = 'Не удалось загрузить данные для оценки'

interface PlanRow extends WorkPlan {
  employee_id: number
}

interface ScoreData {
  at: number
  ids: Set<number>
  entries: Map<number, TimesheetEntry[]>
  plans: Map<number, Map<string, WorkPlan>>
}

// Кеш по отделу и началу периода: карточки коллег одного отдела не грузят табель повторно
const scoreCache = new Map<string, ScoreData>()
const inflight = new Map<string, Promise<ScoreData>>()

function readCache(key: string, ids: number[]): ScoreData | null {
  const item = scoreCache.get(key)
  if (!item) return null
  if (Date.now() - item.at > CACHE_TTL_MS) {
    scoreCache.delete(key)
    return null
  }
  return ids.every(id => item.ids.has(id)) ? item : null
}

// PostgREST отдаёт не больше 1000 строк за запрос: забираем страницами через range
async function fetchAllPages<T>(
  loadPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const rows: T[] = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await loadPage(offset, offset + PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    const page = data || []
    rows.push(...page)
    if (page.length < PAGE_SIZE) return rows
  }
}

async function fetchTimesheet(ids: number[], from: string, to: string): Promise<TimesheetEntry[]> {
  const rows = await fetchAllPages<TimesheetEntry>((start, end) => supabase
    .from('tender_timesheet')
    .select('id,employee_id,work_date,status,hours_worked,is_correction')
    .in('employee_id', ids)
    .gte('work_date', from)
    .lte('work_date', to)
    .order('id', { ascending: true })
    .range(start, end))
  return rows.map(row => ({
    ...row,
    hours_worked: row.hours_worked == null ? null : roundTimesheetHours(row.hours_worked)
  }))
}

// Планы необязательны: при ошибке или пустой таблице считаем по календарю
async function fetchPlans(ids: number[], from: string, to: string): Promise<PlanRow[]> {
  try {
    return await fetchAllPages<PlanRow>((start, end) => supabase
      .from('tender_work_plans')
      .select('employee_id,work_date,is_working_day,planned_hours,full_day_threshold_hours')
      .in('employee_id', ids)
      .gte('work_date', from)
      .lte('work_date', to)
      .order('employee_id', { ascending: true })
      .order('work_date', { ascending: true })
      .range(start, end))
  } catch {
    return []
  }
}

function fetchScoreData(key: string, ids: number[], from: string, to: string): Promise<ScoreData> {
  const pending = inflight.get(key)
  if (pending) return pending

  const request = (async () => {
    const [timesheet, planRows] = await Promise.all([fetchTimesheet(ids, from, to), fetchPlans(ids, from, to)])

    const entries = new Map<number, TimesheetEntry[]>()
    for (const row of timesheet) {
      const list = entries.get(row.employee_id) || []
      list.push(row)
      entries.set(row.employee_id, list)
    }
    const plans = new Map<number, Map<string, WorkPlan>>()
    for (const row of planRows) {
      const byDate = plans.get(row.employee_id) || new Map<string, WorkPlan>()
      byDate.set(row.work_date, row)
      plans.set(row.employee_id, byDate)
    }

    const data: ScoreData = { at: Date.now(), ids: new Set(ids), entries, plans }
    scoreCache.set(key, data)
    return data
  })().finally(() => {
    inflight.delete(key)
  })

  inflight.set(key, request)
  return request
}

function toMember(employee: EmployeeWithStats, data: ScoreData): ScoreMember {
  const entriesByDate = new Map<string, TimesheetEntry>()
  // Если на день несколько записей — берём последнюю, как в календаре
  for (const entry of data.entries.get(employee.id) || []) entriesByDate.set(entry.work_date, entry)
  return {
    id: employee.id,
    hireDate: employee.hire_date || null,
    currentSalary: employee.current_salary,
    salaryHistory: employee.salaryHistory || [],
    entriesByDate,
    plans: data.plans.get(employee.id) || new Map<string, WorkPlan>()
  }
}

interface LoadState {
  key: string
  data: ScoreData | null
  error: string | null
}

// Оценка сотрудника: табель и планы всего отдела с начала года (или за последние 181 день) по вчера
export function useEmployeeScore(employee: EmployeeWithStats, peers: EmployeeWithStats[], year: number) {
  const [today] = useState(() => new Date())
  const todayIso = toIsoDate(today.getFullYear(), today.getMonth() + 1, today.getDate())
  const yesterday = addDaysIso(todayIso, -1)
  const yearStart = toIsoDate(year, 1, 1)
  const historyStart = addDaysIso(todayIso, -HISTORY_DAYS)
  const from = yearStart < historyStart ? yearStart : historyStart

  // Отдел: активные участники табеля плюс сам сотрудник
  const department = employee.department
  const roster = useMemo(() => {
    const colleagues = department
      ? peers.filter(peer => (
        peer.id !== employee.id
        && peer.department === department
        && !peer.is_archived
        && !peer.excluded_from_timesheet
      ))
      : []
    return [employee, ...colleagues]
  }, [department, employee, peers])
  const ids = useMemo(() => roster.map(item => item.id).sort((a, b) => a - b), [roster])
  const idsKey = ids.join(',')

  const key = `${department ?? `solo-${employee.id}`}|${from}`
  const [state, setState] = useState<LoadState>(() => ({ key, data: readCache(key, ids), error: null }))
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const cached = readCache(key, ids)
    if (cached) {
      setState({ key, data: cached, error: null })
      return undefined
    }

    let cancelled = false
    setState({ key, data: null, error: null })
    fetchScoreData(key, ids, from, yesterday)
      .then(data => {
        if (!cancelled) setState({ key, data, error: null })
      })
      .catch(err => {
        console.error('Error loading employee score data:', err)
        if (!cancelled) setState({ key, data: null, error: LOAD_ERROR })
      })

    return () => {
      cancelled = true
    }
    // ids пересоздаётся при каждом пересчёте состава, поэтому зависимость — строка idsKey
  }, [attempt, from, idsKey, key, yesterday])

  const reload = useCallback(() => {
    scoreCache.delete(key)
    setAttempt(value => value + 1)
  }, [key])

  const current = state.key === key ? state : null
  const data = current?.data ?? null

  const view = useMemo<EmployeeScoreView | null>(() => {
    if (!data) return null
    return buildEmployeeScoreView(roster.map(item => toMember(item, data)), employee.id, todayIso, year)
  }, [data, employee.id, roster, todayIso, year])

  return {
    view,
    loading: !current || (current.data === null && current.error === null),
    error: current?.error ?? null,
    reload
  }
}

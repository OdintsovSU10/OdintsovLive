import { supabase } from '../../../lib/supabase'
import { roundTimesheetHours } from './salaryCalculator'
import type { WorkPlan } from './attendanceDay'
import type { ScoreMember, ScoreSkudDay } from './employeeScore'
import type { EmployeeWithStats, TimesheetEntry } from '../types'

// Загрузка табеля и планов для оценки сотрудников: общая для карточки и списков

export const SCORE_CACHE_TTL_MS = 5 * 60 * 1000
const PAGE_SIZE = 1000
// Сколько id уходит в один .in(): длинный список раздул бы URL запроса
const IDS_CHUNK_SIZE = 150

export interface PlanRow extends WorkPlan {
  employee_id: number
}

export interface SkudRow {
  employee_id: number
  work_date: string
  exits_count: number
  outside_minutes: number
}

export interface ScoreData {
  at: number
  ids: Set<number>
  entries: Map<number, TimesheetEntry[]>
  plans: Map<number, Map<string, WorkPlan>>
  // СКУД по сотрудникам и датам; null — загрузить не удалось
  skud: Map<number, Map<string, ScoreSkudDay>> | null
}

// PostgREST отдаёт не больше 1000 строк за запрос: забираем страницами через range
export async function fetchAllPages<T>(
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

function chunkIds(ids: number[]): number[][] {
  const chunks: number[][] = []
  for (let index = 0; index < ids.length; index += IDS_CHUNK_SIZE) {
    chunks.push(ids.slice(index, index + IDS_CHUNK_SIZE))
  }
  return chunks
}

async function fetchTimesheetChunk(ids: number[], from: string, to: string): Promise<TimesheetEntry[]> {
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

export async function fetchTimesheet(ids: number[], from: string, to: string): Promise<TimesheetEntry[]> {
  const parts = await Promise.all(chunkIds(ids).map(chunk => fetchTimesheetChunk(chunk, from, to)))
  return parts.flat()
}

// Планы необязательны: при ошибке или пустой таблице считаем по календарю
export async function fetchPlans(ids: number[], from: string, to: string): Promise<PlanRow[]> {
  try {
    const parts = await Promise.all(chunkIds(ids).map(chunk => fetchAllPages<PlanRow>((start, end) => supabase
      .from('tender_work_plans')
      .select('employee_id,work_date,is_working_day,planned_hours,full_day_threshold_hours')
      .in('employee_id', chunk)
      .gte('work_date', from)
      .lte('work_date', to)
      .order('employee_id', { ascending: true })
      .order('work_date', { ascending: true })
      .range(start, end))))
    return parts.flat()
  } catch {
    return []
  }
}

// СКУД необязателен: при ошибке возвращаем null, и перерывы в оценке нейтральные
export async function fetchSkud(ids: number[], from: string, to: string): Promise<SkudRow[] | null> {
  try {
    const parts = await Promise.all(chunkIds(ids).map(chunk => fetchAllPages<SkudRow>((start, end) => supabase
      .from('tender_skud_daily')
      .select('employee_id,work_date,exits_count,outside_minutes')
      .in('employee_id', chunk)
      .gte('work_date', from)
      .lte('work_date', to)
      .order('employee_id', { ascending: true })
      .order('work_date', { ascending: true })
      .range(start, end))))
    return parts.flat()
  } catch (err) {
    console.error('Error loading SKUD data for score:', err)
    return null
  }
}

// Табель, планы и СКУД за период, разложенные по сотрудникам
export async function loadScoreData(ids: number[], from: string, to: string): Promise<ScoreData> {
  const [timesheet, planRows, skudRows] = await Promise.all([
    fetchTimesheet(ids, from, to),
    fetchPlans(ids, from, to),
    fetchSkud(ids, from, to)
  ])

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

  let skud: Map<number, Map<string, ScoreSkudDay>> | null = null
  if (skudRows) {
    skud = new Map<number, Map<string, ScoreSkudDay>>()
    for (const row of skudRows) {
      const byDate = skud.get(row.employee_id) || new Map<string, ScoreSkudDay>()
      byDate.set(row.work_date, { exits: row.exits_count, outsideMinutes: row.outside_minutes })
      skud.set(row.employee_id, byDate)
    }
  }

  return { at: Date.now(), ids: new Set(ids), entries, plans, skud }
}

export function toScoreMember(employee: EmployeeWithStats, data: ScoreData): ScoreMember {
  const entriesByDate = new Map<string, TimesheetEntry>()
  // Если на день несколько записей — берём последнюю, как в календаре
  for (const entry of data.entries.get(employee.id) || []) entriesByDate.set(entry.work_date, entry)
  return {
    id: employee.id,
    hireDate: employee.hire_date || null,
    currentSalary: employee.current_salary,
    salaryHistory: employee.salaryHistory || [],
    entriesByDate,
    plans: data.plans.get(employee.id) || new Map<string, WorkPlan>(),
    // Нет строк у сотрудника — пустая карта; null только если СКУД не загрузился
    skud: data.skud ? data.skud.get(employee.id) || new Map<string, ScoreSkudDay>() : null
  }
}

// Участник оценки отдела: активный и ведущий табель
export function isScoreColleague(employee: EmployeeWithStats): boolean {
  return !employee.is_archived && !employee.excluded_from_timesheet
}

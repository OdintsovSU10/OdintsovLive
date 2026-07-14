import { supabase } from '../../../lib/supabase'
import { getWorkDaysNorm } from '../../../lib/workNorms'
import { roundTimesheetHours } from './salaryCalculator'
import type { Employee, TimesheetStatus } from '../types'

type ApiRecord = Record<string, unknown>

interface FotEmployeeRecord {
  id?: string | number
  full_name?: string
  org_department_id?: string
  sigur_employee_id?: string | number | null
  tab_number?: string | number | null
}

interface FotTimesheetDay {
  status?: string | null
  hours?: string | number | null
  corrected?: boolean | null
  hours_overridden?: boolean | null
}

interface FotTimesheetEmployee {
  id?: string | number
  full_name?: string
  tab_number?: string | number | null
  sigur_employee_id?: string | number | null
  days?: Record<string, FotTimesheetDay | null>
}

interface FotTimesheetDepartment {
  employees?: FotTimesheetEmployee[]
}

interface FotTimesheetPayload {
  departments?: FotTimesheetDepartment[]
}

interface TimesheetRow {
  employee_id: number
  work_date: string
  status: TimesheetStatus
  hours_worked: number | null
  is_correction: boolean
}

export interface FotTimesheetSyncResult {
  period: string
  total: number
  matched: number
  failed: number
  ignored_unmatched: number
  localEmployees: number
}

const FOT_EMPLOYEES_ENDPOINT = import.meta.env.VITE_FOT_API?.trim() || '/fot-api'
const FOT_TIMESHEET_ENDPOINT = import.meta.env.VITE_FOT_TIMESHEET_API?.trim() || '/fot-api-timesheet'
const FOT_PAGE_SIZE = 1000

async function getFotHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const accessToken = data.session?.access_token

  if (!accessToken) {
    throw new Error('Для синхронизации FOT нужна авторизация')
  }

  return {
    Accept: 'application/json',
    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY,
    Authorization: `Bearer ${accessToken}`
  }
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: await getFotHeaders()
  })

  const contentType = response.headers.get('content-type') || ''
  const payload = contentType.toLowerCase().includes('json')
    ? await response.json()
    : await response.text()

  if (!response.ok) {
    const message = isRecord(payload)
      ? String(payload.detail || payload.error || payload.message || '').trim()
      : String(payload || '').trim()
    throw new Error(message || `FOT API вернул HTTP ${response.status}`)
  }

  return payload
}

function isRecord(value: unknown): value is ApiRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function createDatabaseError(error: unknown, fallbackMessage: string): Error {
  if (!isRecord(error)) return new Error(fallbackMessage)

  const code = String(error.code || '').trim()
  const message = String(error.message || error.details || '').trim()

  if (code === '23505') {
    return new Error(`${fallbackMessage}: конфликт идентификаторов в базе данных`)
  }

  return new Error(message ? `${fallbackMessage}: ${message}` : fallbackMessage)
}

function extractRows(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload
  if (!isRecord(payload)) return []

  for (const key of ['data', 'items', 'rows', 'records', 'result']) {
    const value = payload[key]
    if (Array.isArray(value)) return value
  }

  return []
}

async function fetchFotEmployees(maxRecords = 10000): Promise<FotEmployeeRecord[]> {
  const rows: FotEmployeeRecord[] = []
  let offset = 0

  while (rows.length < maxRecords) {
    const pageLimit = Math.min(FOT_PAGE_SIZE, maxRecords - rows.length)
    const url = new URL(FOT_EMPLOYEES_ENDPOINT, window.location.origin)
    url.searchParams.set('limit', String(pageLimit))
    url.searchParams.set('offset', String(offset))
    url.searchParams.set('eq.employment_status', 'active')

    const payload = await fetchJson(url.toString())
    const pageRows = extractRows(payload).filter(isRecord) as FotEmployeeRecord[]
    rows.push(...pageRows)

    if (pageRows.length < pageLimit) break
    offset += pageLimit
  }

  return rows
}

function stringValue(value: unknown): string {
  return String(value ?? '').trim()
}

function normalizeName(value: string | null | undefined): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
}

function createEmployeeIndexes(employees: Employee[]) {
  const byFotId = new Map<string, Employee>()
  const bySigurId = new Map<string, Employee>()
  const byTabNumber = new Map<string, Employee>()
  const byName = new Map<string, Employee>()

  for (const employee of employees) {
    const fotId = stringValue(employee.fot_employee_id)
    const sigurId = stringValue(employee.sigur_employee_id)
    const tabNumber = stringValue(employee.tab_number)
    if (fotId) byFotId.set(fotId, employee)
    if (sigurId) bySigurId.set(sigurId, employee)
    if (tabNumber) byTabNumber.set(tabNumber, employee)
    byName.set(normalizeName(employee.full_name), employee)
  }

  return { byFotId, bySigurId, byTabNumber, byName }
}

function resolveEmployee(
  employee: FotTimesheetEmployee,
  indexes: ReturnType<typeof createEmployeeIndexes>
): Employee | null {
  const fotId = stringValue(employee.id)
  const sigurId = stringValue(employee.sigur_employee_id)
  const tabNumber = stringValue(employee.tab_number)
  const name = normalizeName(employee.full_name)

  return (fotId && indexes.byFotId.get(fotId))
    || (sigurId && indexes.bySigurId.get(sigurId))
    || (tabNumber && indexes.byTabNumber.get(tabNumber))
    || (name && indexes.byName.get(name))
    || null
}

async function discoverDepartmentIds(employees: Employee[]): Promise<string[]> {
  const localFotIds = new Set(employees.map(employee => stringValue(employee.fot_employee_id)).filter(Boolean))
  const localSigurIds = new Set(employees.map(employee => stringValue(employee.sigur_employee_id)).filter(Boolean))
  const localTabNumbers = new Set(employees.map(employee => stringValue(employee.tab_number)).filter(Boolean))
  const departmentIds = new Set<string>()
  const fotEmployees = await fetchFotEmployees()

  for (const employee of fotEmployees) {
    const matchesLocalEmployee = localFotIds.has(stringValue(employee.id))
      || localSigurIds.has(stringValue(employee.sigur_employee_id))
      || localTabNumbers.has(stringValue(employee.tab_number))

    if (matchesLocalEmployee && employee.org_department_id) {
      departmentIds.add(employee.org_department_id)
    }
  }

  return Array.from(departmentIds)
}

function parseHours(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (value === undefined || value === null || value === '') return null

  const parsed = Number(String(value).replace(/[^\d,.-]/g, '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeStatus(value: unknown, hours: number | null): TimesheetStatus | null {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')

  if (['work', 'worked', 'present', 'manual', 'я', 'работа', 'рабочий', 'явка'].includes(normalized)) return 'work'
  if (['remote', 'удаленка', 'удаленная работа', 'удаленно', 'у'].includes(normalized)) return 'remote'
  if (['vacation', 'educational_leave', 'отпуск', 'учебный отпуск', 'о'].includes(normalized)) return 'vacation'
  if (['dayoff', 'weekend', 'holiday', 'выходной', 'праздник', 'в'].includes(normalized)) return 'dayoff'
  if (['unpaid', 'без содержания', 'за свой счет', 'н'].includes(normalized)) return 'unpaid'
  if (['absent', 'sick', 'ill', 'больничный', 'болезнь', 'неявка', 'прогул', 'б'].includes(normalized)) return 'absent'
  if (hours && hours > 0) return 'work'

  return null
}

function getMonthDateRange(year: number, month: number) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const daysInMonth = new Date(year, month, 0).getDate()
  const end = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`
  return { start, end }
}

function calculateStats(rows: Array<Pick<TimesheetRow, 'employee_id' | 'work_date' | 'status' | 'hours_worked'>>) {
  const stats = new Map<string, {
    employee_id: number
    year: number
    month: number
    work_days_actual: number
    work_days_norm: number
    weekend_work_days: number
    total_hours: number
    updated_at: string
  }>()

  for (const row of rows) {
    const [yearText, monthText] = row.work_date.split('-')
    const year = Number(yearText)
    const month = Number(monthText)
    const key = `${row.employee_id}:${year}:${month}`
    const current = stats.get(key) || {
      employee_id: row.employee_id,
      year,
      month,
      work_days_actual: 0,
      work_days_norm: getWorkDaysNorm(year, month - 1),
      weekend_work_days: 0,
      total_hours: 0,
      updated_at: new Date().toISOString()
    }

    const date = new Date(`${row.work_date}T12:00:00`)
    const isWeekend = date.getDay() === 0 || date.getDay() === 6
    const hours = roundTimesheetHours(row.hours_worked)

    if (row.status === 'work' || row.status === 'remote') {
      if (isWeekend) {
        if (hours >= 3) current.weekend_work_days += 1
      } else {
        current.work_days_actual += 1
      }
      current.total_hours += hours
    }

    stats.set(key, current)
  }

  return Array.from(stats.values())
}

async function recalculateMonthStats(year: number, month: number, employeeIds: number[]) {
  if (employeeIds.length === 0) return
  const { start, end } = getMonthDateRange(year, month)

  const { data, error } = await supabase
    .from('tender_timesheet')
    .select('employee_id, work_date, status, hours_worked')
    .in('employee_id', employeeIds)
    .gte('work_date', start)
    .lte('work_date', end)

  if (error) throw createDatabaseError(error, 'Не удалось прочитать записанный табель')

  const stats = calculateStats((data || []) as TimesheetRow[])
  if (stats.length === 0) return

  const { error: statsError } = await supabase
    .from('tender_timesheet_stats')
    .upsert(stats, { onConflict: 'employee_id,year,month' })

  if (statsError) throw createDatabaseError(statsError, 'Не удалось обновить статистику табеля')
}

export async function syncFotTimesheetMonth(year: number, month: number, employees: Employee[]): Promise<FotTimesheetSyncResult> {
  const activeEmployees = employees.filter(employee => !employee.is_archived)
  const departmentIds = await discoverDepartmentIds(activeEmployees)

  if (departmentIds.length === 0) {
    throw new Error('Не удалось определить отделы FOT для импортированных сотрудников')
  }

  const url = new URL(FOT_TIMESHEET_ENDPOINT, window.location.origin)
  url.searchParams.set('department_id', departmentIds.join(','))
  url.searchParams.set('month', `${year}-${String(month).padStart(2, '0')}`)
  url.searchParams.set('half', 'FULL')

  const payload = await fetchJson(url.toString()) as FotTimesheetPayload
  const indexes = createEmployeeIndexes(activeEmployees)
  const rowsToUpsert: TimesheetRow[] = []
  let total = 0
  let failed = 0
  let ignoredUnmatched = 0

  for (const department of payload.departments || []) {
    for (const fotEmployee of department.employees || []) {
      const localEmployee = resolveEmployee(fotEmployee, indexes)
      const days = fotEmployee.days || {}

      for (const [workDate, day] of Object.entries(days)) {
        if (!day || typeof day !== 'object') continue
        const hasStatus = String(day.status ?? '').trim() !== ''
        const hasHours = day.hours !== undefined && day.hours !== null && String(day.hours).trim() !== ''
        if (!hasStatus && !hasHours) continue

        total += 1
        if (!localEmployee) {
          ignoredUnmatched += 1
          continue
        }

        const parsedHours = parseHours(day.hours)
        const hours = parsedHours == null ? null : roundTimesheetHours(parsedHours)
        const status = normalizeStatus(day.status, hours)
        if (!status) {
          failed += 1
          continue
        }

        rowsToUpsert.push({
          employee_id: localEmployee.id,
          work_date: workDate,
          status,
          hours_worked: hours,
          is_correction: Boolean(day.corrected || day.hours_overridden)
        })
      }
    }
  }

  if (rowsToUpsert.length > 0) {
    const { error } = await supabase
      .from('tender_timesheet')
      .upsert(rowsToUpsert, { onConflict: 'employee_id,work_date' })

    if (error) throw createDatabaseError(error, 'Не удалось записать табель')

    const employeeIds = Array.from(new Set(rowsToUpsert.map(row => row.employee_id)))
    await recalculateMonthStats(year, month, employeeIds)
  }

  const { error: importError } = await supabase.from('tender_imports').insert({
    import_type: 'fot_timesheet_sync',
    file_name: `FOT API ${year}-${String(month).padStart(2, '0')}`,
    year,
    month,
    records_total: total,
    records_success: rowsToUpsert.length,
    records_failed: failed,
    errors: failed > 0 ? [`Не распознано строк: ${failed}`] : null
  })

  if (importError) throw createDatabaseError(importError, 'Не удалось записать результат синхронизации')

  return {
    period: `${year}-${String(month).padStart(2, '0')}`,
    total,
    matched: rowsToUpsert.length,
    failed,
    ignored_unmatched: ignoredUnmatched,
    localEmployees: activeEmployees.length
  }
}

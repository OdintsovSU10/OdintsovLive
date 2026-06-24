#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'

const WORK_DAYS_NORM = {
  2025: [17, 19, 20, 22, 18, 19, 23, 21, 22, 23, 19, 22],
  2026: [15, 19, 21, 22, 19, 21, 23, 21, 22, 22, 20, 22]
}

const DEFAULT_PAGE_SIZE = 1000
const DEFAULT_MAX_RECORDS = 10000
const DEFAULT_DATE_FIELD = 'work_date'
const DEFAULT_PUBLIC_TIMESHEET_API = 'https://fot.su10.ru/api/public/v1/timesheet'

const FIELD_ALIASES = {
  employeeId: [
    'employee_id',
    'fot_employee_id',
    'employee.fot_employee_id',
    'employee.employee_id',
    'person_id',
    'worker_id',
    'staff_id'
  ],
  sigurEmployeeId: [
    'sigur_employee_id',
    'employee.sigur_employee_id',
    'sigur_id',
    'employee.sigur_id'
  ],
  tabNumber: [
    'tab_number',
    'employee.tab_number',
    'personnel_number',
    'personnelNumber'
  ],
  employeeName: [
    'full_name',
    'employee.full_name',
    'employee_name',
    'employeeName',
    'fio',
    'name',
    'person_name',
    'worker_name'
  ],
  date: [
    'work_date',
    'date',
    'day',
    'timesheet_date',
    'attendance_date',
    'shift_date'
  ],
  status: [
    'status',
    'timesheet_status',
    'attendance_status',
    'day_status',
    'code',
    'letter',
    'type'
  ],
  hours: [
    'hours_worked',
    'hours',
    'work_hours',
    'worked_hours',
    'total_hours',
    'fact_hours',
    'duration_hours',
    'duration',
    'time'
  ],
  isCorrection: [
    'is_correction',
    'correction',
    'is_adjustment',
    'adjustment',
    'corrected',
    'hours_overridden'
  ]
}

function printHelp() {
  console.log(`Usage: node scripts/sync-fot-timesheet.mjs [options]

Options:
  --date YYYY-MM-DD          Sync one day
  --from YYYY-MM-DD          Sync range start
  --to YYYY-MM-DD            Sync range end
  --lookback-days N          Sync today and N-1 previous days
  --api URL                  FOT timesheet endpoint
  --table NAME               FOT table name under /external/v1/tables
  --department-id UUID       FOT department_id for public timesheet
  --department-ids LIST      Comma-separated FOT department_id list
  --date-field NAME          FOT date field for gte/lte filters
  --limit N                  Maximum records to read
  --dry-run                  Read and match only, do not write
  --help                     Show this help

Env:
  Public timesheet endpoint is used by default.
  FOT_TIMESHEET_API or FOT_TIMESHEET_TABLE can override it.
  FOT_TIMESHEET_DEPARTMENT_IDS can narrow public timesheet sync.
  FOT_API and FOT_API_TOKEN are used for FOT access.
  VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY or VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY are used for writes.`)
}

function parseArgs(argv) {
  const args = {
    dryRun: false,
    date: '',
    from: '',
    to: '',
    api: '',
    table: '',
    departmentIds: [],
    dateField: '',
    limit: 0,
    lookbackDays: 0
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const next = () => {
      i += 1
      if (i >= argv.length) throw new Error(`Missing value for ${arg}`)
      return argv[i]
    }

    switch (arg) {
      case '--help':
      case '-h':
        args.help = true
        break
      case '--dry-run':
        args.dryRun = true
        break
      case '--date':
        args.date = next()
        break
      case '--from':
        args.from = next()
        break
      case '--to':
        args.to = next()
        break
      case '--api':
        args.api = next()
        break
      case '--table':
        args.table = next()
        break
      case '--department-id':
        args.departmentIds.push(next())
        break
      case '--department-ids':
        args.departmentIds.push(...next().split(','))
        break
      case '--date-field':
        args.dateField = next()
        break
      case '--limit':
        args.limit = Number(next()) || 0
        break
      case '--lookback-days':
        args.lookbackDays = Number(next()) || 0
        break
      default:
        throw new Error(`Unknown option: ${arg}`)
    }
  }

  return args
}

function loadEnvFile(path) {
  if (!existsSync(path)) return {}

  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#') && line.includes('='))
      .map(line => {
        const index = line.indexOf('=')
        return [line.slice(0, index), line.slice(index + 1)]
      })
  )
}

function todayIso() {
  return new Date().toISOString().split('T')[0]
}

function shiftDate(isoDate, deltaDays) {
  const date = new Date(`${isoDate}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + deltaDays)
  return date.toISOString().split('T')[0]
}

function assertIsoDate(value, label) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} must be YYYY-MM-DD`)
  }
  return value
}

function getDateRange(args, env) {
  if (args.date) {
    const date = assertIsoDate(args.date, '--date')
    return { from: date, to: date }
  }

  if (args.from || args.to) {
    const from = assertIsoDate(args.from || args.to, '--from')
    const to = assertIsoDate(args.to || args.from, '--to')
    if (from > to) throw new Error('--from must be before --to')
    return { from, to }
  }

  const lookbackDays = args.lookbackDays || Number(env.FOT_TIMESHEET_LOOKBACK_DAYS) || 1
  const to = todayIso()
  return { from: shiftDate(to, -Math.max(lookbackDays - 1, 0)), to }
}

function getMonthKeys(dateRange) {
  const months = []
  const cursor = new Date(`${dateRange.from.slice(0, 7)}-01T12:00:00Z`)
  const endMonth = dateRange.to.slice(0, 7)

  while (true) {
    const monthKey = cursor.toISOString().slice(0, 7)
    months.push(monthKey)
    if (monthKey === endMonth) break
    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  }

  return months
}

function splitList(value) {
  return String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
}

function buildTableUrl(fotApi, tableName) {
  const url = new URL(fotApi)
  const parts = url.pathname.split('/')
  const tablesIndex = parts.lastIndexOf('tables')

  if (tablesIndex < 0) {
    throw new Error('FOT_API must include /tables/{table}')
  }

  url.pathname = [...parts.slice(0, tablesIndex + 1), tableName].join('/')
  url.search = ''
  return url.toString()
}

function isPublicTimesheetEndpoint(url) {
  try {
    return new URL(url).pathname.includes('/api/public/v1/timesheet')
  } catch {
    return false
  }
}

function getFotHeaders(config) {
  return {
    Authorization: `Bearer ${config.fotToken}`,
    Accept: 'application/json'
  }
}

function buildTablesRootUrl(fotApi) {
  const url = new URL(fotApi)
  const parts = url.pathname.split('/')
  const tablesIndex = parts.lastIndexOf('tables')

  if (tablesIndex < 0) return ''

  url.pathname = parts.slice(0, tablesIndex + 1).join('/')
  url.search = ''
  return url.toString()
}

function normalizeKey(key) {
  return String(key)
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[\s_.\-()[\]]/g, '')
}

function addNormalizedEntries(map, value, prefix = '') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return

  for (const [key, item] of Object.entries(value)) {
    const nestedKey = prefix ? `${prefix}.${key}` : key
    map.set(normalizeKey(nestedKey), item)
    map.set(normalizeKey(key), item)

    if (item && typeof item === 'object' && !Array.isArray(item)) {
      addNormalizedEntries(map, item, nestedKey)
    }
  }
}

function createNormalizedRecord(record) {
  const normalized = new Map()
  addNormalizedEntries(normalized, record)
  return normalized
}

function pickValue(record, aliases) {
  for (const alias of aliases) {
    const value = record.get(normalizeKey(alias))
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value
    }
  }
  return ''
}

function pickString(record, aliases) {
  const value = pickValue(record, aliases)
  return value === undefined || value === null ? '' : String(value).trim()
}

function parseBoolean(value) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value === 1

  const normalized = String(value ?? '').trim().toLowerCase()
  return ['true', '1', 'yes', 'y', 'да'].includes(normalized)
}

function parseHours(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (value === undefined || value === null || value === '') return null

  const text = String(value).trim()
  const timeMatch = text.match(/^(\d{1,2}):(\d{2})$/)
  if (timeMatch) {
    return Number(timeMatch[1]) + Number(timeMatch[2]) / 60
  }

  const parsed = Number(text.replace(/[^\d,.-]/g, '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}

function parseDate(value) {
  if (value instanceof Date) return value.toISOString().split('T')[0]
  if (typeof value === 'number') {
    const excelEpoch = Date.UTC(1899, 11, 30)
    return new Date(excelEpoch + value * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  }

  const text = String(value ?? '').trim()
  if (!text) return ''

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`

  const ru = text.match(/^(\d{2})\.(\d{2})\.(\d{4})/)
  if (ru) return `${ru[3]}-${ru[2]}-${ru[1]}`

  const slash = text.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (slash) return `${slash[3]}-${slash[2]}-${slash[1]}`

  const parsed = new Date(text)
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().split('T')[0]
}

function normalizeStatus(value, hours) {
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

function extractRows(payload) {
  if (Array.isArray(payload)) return payload
  if (!payload || typeof payload !== 'object') return []

  for (const key of ['data', 'items', 'rows', 'records', 'result']) {
    const value = payload[key]
    if (Array.isArray(value)) return value
  }

  return []
}

function extractPublicTimesheetRows(payload, dateRange) {
  const rows = []
  const departments = Array.isArray(payload?.departments) ? payload.departments : []

  for (const department of departments) {
    const employees = Array.isArray(department?.employees) ? department.employees : []

    for (const employee of employees) {
      const days = employee?.days && typeof employee.days === 'object' && !Array.isArray(employee.days)
        ? employee.days
        : {}

      for (const [workDate, day] of Object.entries(days)) {
        if (workDate < dateRange.from || workDate > dateRange.to) continue
        if (!day || typeof day !== 'object' || Array.isArray(day)) continue

        const hasStatus = String(day.status ?? '').trim() !== ''
        const hasHours = day.hours !== undefined && day.hours !== null && String(day.hours).trim() !== ''
        if (!hasStatus && !hasHours) continue

        rows.push({
          fot_employee_id: employee.id,
          employee_id: employee.id,
          full_name: employee.full_name,
          tab_number: employee.tab_number,
          sigur_employee_id: employee.sigur_employee_id,
          work_date: workDate,
          status: day.status,
          hours: day.hours,
          corrected: day.corrected,
          hours_overridden: day.hours_overridden
        })
      }
    }
  }

  return rows
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(Number(options.timeoutMs) || 30000)
  })
  const text = await response.text()
  let payload = null

  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = text
  }

  if (!response.ok) {
    const message = payload && typeof payload === 'object'
      ? String(payload.detail || payload.error || payload.message || text)
      : String(payload || response.statusText)
    throw new Error(`HTTP ${response.status}: ${message.slice(0, 500)}`)
  }

  return payload
}

async function fetchAvailableTables(fotApi, fotToken) {
  const rootUrl = buildTablesRootUrl(fotApi)
  if (!rootUrl) return []

  const url = new URL(rootUrl)
  url.searchParams.set('limit', '100')
  url.searchParams.set('offset', '0')

  const payload = await fetchJson(url, {
    headers: {
      Authorization: `Bearer ${fotToken}`,
      Accept: 'application/json'
    }
  })

  return extractRows(payload).map(row => ({
    table: String(row.table_name || ''),
    fields: Array.isArray(row.allowed_fields) ? row.allowed_fields : []
  })).filter(row => row.table)
}

async function fetchFotEmployees(config) {
  const rows = []
  let offset = 0

  while (offset < config.maxRecords) {
    const pageLimit = Math.min(config.pageSize, config.maxRecords - rows.length)
    const url = new URL(config.fotApi)
    url.searchParams.set('limit', String(pageLimit))
    url.searchParams.set('offset', String(offset))

    if (!url.searchParams.has('eq.employment_status')) {
      url.searchParams.set('eq.employment_status', 'active')
    }

    const payload = await fetchJson(url, {
      headers: getFotHeaders(config)
    })
    const pageRows = extractRows(payload)
    rows.push(...pageRows)

    if (pageRows.length < pageLimit) break
    offset += pageLimit
  }

  return rows
}

async function discoverDepartmentIds(config, localEmployees) {
  if (config.departmentIds.length > 0) return config.departmentIds

  const localFotIds = new Set(localEmployees.map(employee => String(employee.fot_employee_id || '').trim()).filter(Boolean))
  const localSigurIds = new Set(localEmployees.map(employee => String(employee.sigur_employee_id || '').trim()).filter(Boolean))
  const localTabNumbers = new Set(localEmployees.map(employee => String(employee.tab_number || '').trim()).filter(Boolean))
  const departmentIds = new Set()
  const fotEmployees = await fetchFotEmployees(config)

  for (const employee of fotEmployees) {
    const matchesLocalEmployee = localFotIds.has(String(employee.id || '').trim())
      || localSigurIds.has(String(employee.sigur_employee_id || '').trim())
      || localTabNumbers.has(String(employee.tab_number || '').trim())

    if (matchesLocalEmployee && employee.org_department_id) {
      departmentIds.add(String(employee.org_department_id))
    }
  }

  return Array.from(departmentIds)
}

async function fetchPublicTimesheetRows(config, dateRange, localEmployees) {
  const departmentIds = await discoverDepartmentIds(config, localEmployees)
  if (departmentIds.length === 0) {
    throw new Error('Не удалось определить FOT department_id для импортированных сотрудников')
  }

  const rows = []

  for (const month of getMonthKeys(dateRange)) {
    const url = new URL(config.timesheetApi)
    url.searchParams.set('department_id', departmentIds.join(','))
    url.searchParams.set('month', month)
    url.searchParams.set('half', config.timesheetHalf)

    const payload = await fetchJson(url, {
      headers: getFotHeaders(config)
    })
    rows.push(...extractPublicTimesheetRows(payload, dateRange))
  }

  return rows
}

async function fetchTableTimesheetRows(config, dateRange) {
  const rows = []
  let offset = 0

  while (rows.length < config.maxRecords) {
    const pageLimit = Math.min(config.pageSize, config.maxRecords - rows.length)
    const url = new URL(config.timesheetApi)

    if (!url.searchParams.has('limit')) url.searchParams.set('limit', String(pageLimit))
    if (!url.searchParams.has('offset')) url.searchParams.set('offset', String(offset))

    if (config.dateField) {
      const gteKey = `gte.${config.dateField}`
      const lteKey = `lte.${config.dateField}`
      if (!url.searchParams.has(gteKey)) url.searchParams.set(gteKey, dateRange.from)
      if (!url.searchParams.has(lteKey)) url.searchParams.set(lteKey, dateRange.to)
    }

    const payload = await fetchJson(url, {
      headers: getFotHeaders(config)
    })
    const pageRows = extractRows(payload)
    rows.push(...pageRows)

    if (pageRows.length < pageLimit) break
    offset += pageLimit
  }

  return rows
}

async function fetchFotTimesheetRows(config, dateRange, localEmployees) {
  if (isPublicTimesheetEndpoint(config.timesheetApi)) {
    return fetchPublicTimesheetRows(config, dateRange, localEmployees)
  }

  return fetchTableTimesheetRows(config, dateRange)
}

async function supabaseRequest(config, path, options = {}) {
  const baseUrl = config.supabaseUrl.replace(/\/$/, '')
  const url = `${baseUrl}/rest/v1/${path}`
  const headers = {
    apikey: config.supabaseKey,
    Authorization: `Bearer ${config.supabaseKey}`,
    Accept: 'application/json',
    ...options.headers
  }

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  const payload = await fetchJson(url, {
    method: options.method || 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  })

  return payload
}

async function loadLocalEmployees(config) {
  const select = [
    'id',
    'full_name',
    'last_name',
    'first_name',
    'middle_name',
    'fot_employee_id',
    'sigur_employee_id',
    'tab_number'
  ].join(',')
  const rows = await supabaseRequest(config, `tender_employees?select=${select}&is_archived=eq.false`)
  return Array.isArray(rows) ? rows : []
}

function normalizePersonName(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
}

function addUniqueIndex(index, key, employee) {
  if (!key) return
  const current = index.get(key)
  if (current && current.id !== employee.id) {
    index.set(key, null)
    return
  }
  if (!current) index.set(key, employee)
}

function createEmployeeIndexes(employees) {
  const byFotId = new Map()
  const bySigurId = new Map()
  const byTabNumber = new Map()
  const byName = new Map()

  for (const employee of employees) {
    addUniqueIndex(byFotId, String(employee.fot_employee_id || '').trim(), employee)
    addUniqueIndex(bySigurId, String(employee.sigur_employee_id || '').trim(), employee)
    addUniqueIndex(byTabNumber, String(employee.tab_number || '').trim(), employee)
    addUniqueIndex(byName, normalizePersonName(employee.full_name), employee)
    addUniqueIndex(
      byName,
      normalizePersonName([employee.last_name, employee.first_name, employee.middle_name].filter(Boolean).join(' ')),
      employee
    )
  }

  return { byFotId, bySigurId, byTabNumber, byName }
}

function resolveEmployee(entry, indexes) {
  if (entry.employeeId && indexes.byFotId.get(entry.employeeId)) return indexes.byFotId.get(entry.employeeId)
  if (entry.sigurEmployeeId && indexes.bySigurId.get(entry.sigurEmployeeId)) return indexes.bySigurId.get(entry.sigurEmployeeId)
  if (entry.tabNumber && indexes.byTabNumber.get(entry.tabNumber)) return indexes.byTabNumber.get(entry.tabNumber)

  const normalizedName = normalizePersonName(entry.employeeName)
  if (normalizedName && indexes.byName.get(normalizedName)) return indexes.byName.get(normalizedName)

  return null
}

function normalizeTimesheetRow(row, dateField) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    return { error: 'Row is not an object' }
  }

  const record = createNormalizedRecord(row)
  const dateAliases = dateField
    ? [dateField, ...FIELD_ALIASES.date.filter(alias => normalizeKey(alias) !== normalizeKey(dateField))]
    : FIELD_ALIASES.date
  const workDate = parseDate(pickValue(record, dateAliases))
  const hours = parseHours(pickValue(record, FIELD_ALIASES.hours))
  const status = normalizeStatus(pickString(record, FIELD_ALIASES.status), hours)

  if (!workDate) return { error: 'Missing work date' }
  if (!status) return { error: `Missing status/hours for ${workDate}` }

  return {
    employeeId: pickString(record, FIELD_ALIASES.employeeId),
    sigurEmployeeId: pickString(record, FIELD_ALIASES.sigurEmployeeId),
    tabNumber: pickString(record, FIELD_ALIASES.tabNumber),
    employeeName: pickString(record, FIELD_ALIASES.employeeName),
    workDate,
    status,
    hours,
    isCorrection: parseBoolean(pickValue(record, FIELD_ALIASES.isCorrection))
  }
}

function getWorkDaysNorm(year, month) {
  const norms = WORK_DAYS_NORM[year]
  return norms?.[month - 1] || 22
}

function getMonthDateRange(year, month) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const daysInMonth = new Date(year, month, 0).getDate()
  const end = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`
  return { start, end }
}

function calculateStats(rows) {
  const stats = new Map()

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
      work_days_norm: getWorkDaysNorm(year, month),
      weekend_work_days: 0,
      total_hours: 0,
      updated_at: new Date().toISOString()
    }

    const date = new Date(`${row.work_date}T12:00:00`)
    const isWeekend = date.getDay() === 0 || date.getDay() === 6
    const hours = Number(row.hours_worked || 0)

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

async function buildStatsFromDatabase(config, changedRows) {
  const groups = new Map()

  for (const row of changedRows) {
    const [yearText, monthText] = row.work_date.split('-')
    const key = `${yearText}-${monthText}`
    const group = groups.get(key) || {
      year: Number(yearText),
      month: Number(monthText),
      employeeIds: new Set()
    }
    group.employeeIds.add(row.employee_id)
    groups.set(key, group)
  }

  const stats = []

  for (const group of groups.values()) {
    const employeeIds = Array.from(group.employeeIds)
    if (employeeIds.length === 0) continue

    const { start, end } = getMonthDateRange(group.year, group.month)
    const path = [
      'tender_timesheet?select=employee_id,work_date,status,hours_worked',
      `employee_id=in.(${employeeIds.join(',')})`,
      `work_date=gte.${start}`,
      `work_date=lte.${end}`
    ].join('&')
    const rows = await supabaseRequest(config, path)
    stats.push(...calculateStats(Array.isArray(rows) ? rows : []))
  }

  return stats
}

async function upsertRows(config, table, conflictColumns, rows) {
  if (rows.length === 0) return
  const query = `${table}?on_conflict=${conflictColumns.join(',')}`
  await supabaseRequest(config, query, {
    method: 'POST',
    headers: {
      Prefer: 'resolution=merge-duplicates,return=minimal'
    },
    body: rows
  })
}

async function logImport(config, dateRange, summary, errors) {
  const [yearText, monthText] = dateRange.to.split('-')
  const payload = {
    import_type: 'fot_timesheet_sync',
    file_name: `FOT API ${dateRange.from}..${dateRange.to}`,
    year: Number(yearText),
    month: Number(monthText),
    records_total: summary.total,
    records_success: summary.matched,
    records_failed: summary.failed,
    errors: errors.length > 0 ? errors.slice(0, 100) : null
  }

  try {
    await supabaseRequest(config, 'tender_imports', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: payload
    })
  } catch (error) {
    await supabaseRequest(config, 'tender_imports', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: { ...payload, import_type: 'timesheet' }
    })
  }
}

function createConfig(args, env) {
  const fotApi = env.FOT_API || ''
  const fotToken = env.FOT_API_TOKEN || ''
  const tableName = args.table || env.FOT_TIMESHEET_TABLE || ''
  const timesheetApi = args.api
    || env.FOT_TIMESHEET_API
    || (tableName && fotApi ? buildTableUrl(fotApi, tableName) : '')
    || DEFAULT_PUBLIC_TIMESHEET_API

  return {
    fotApi,
    fotToken,
    timesheetApi,
    departmentIds: [
      ...splitList(env.FOT_TIMESHEET_DEPARTMENT_IDS),
      ...args.departmentIds
    ],
    timesheetHalf: env.FOT_TIMESHEET_HALF || 'FULL',
    supabaseUrl: env.SUPABASE_URL || env.VITE_SUPABASE_URL || '',
    supabaseKey: env.SUPABASE_SERVICE_ROLE_KEY
      || env.SERVICE_ROLE_KEY
      || env.VITE_SUPABASE_SERVICE_ROLE_KEY
      || env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY
      || '',
    dateField: args.dateField || env.FOT_TIMESHEET_DATE_FIELD || DEFAULT_DATE_FIELD,
    pageSize: Number(env.FOT_TIMESHEET_PAGE_SIZE) || DEFAULT_PAGE_SIZE,
    maxRecords: args.limit || Number(env.FOT_TIMESHEET_MAX_RECORDS) || DEFAULT_MAX_RECORDS,
    dryRun: args.dryRun
  }
}

function validateConfig(config) {
  if (!config.fotToken) throw new Error('FOT_API_TOKEN is required')
  if (!config.fotApi && !config.timesheetApi) throw new Error('FOT_API is required')
  if (!config.supabaseUrl) throw new Error('VITE_SUPABASE_URL or SUPABASE_URL is required')
  if (!config.supabaseKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY or VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY is required')
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    printHelp()
    return
  }

  const env = {
    ...loadEnvFile('.env.local'),
    ...process.env
  }
  const config = createConfig(args, env)
  validateConfig(config)
  const dateRange = getDateRange(args, env)

  if (!config.timesheetApi) {
    const tables = await fetchAvailableTables(config.fotApi, config.fotToken)
    console.error('FOT timesheet endpoint is not configured.')
    console.error('Set FOT_TIMESHEET_API or FOT_TIMESHEET_TABLE after FOT grants access to a timesheet table.')
    console.error(`Currently accessible FOT tables: ${tables.map(table => table.table).join(', ') || 'none'}`)
    process.exitCode = 2
    return
  }

  const localEmployees = await loadLocalEmployees(config)
  const rawRows = await fetchFotTimesheetRows(config, dateRange, localEmployees)
  const indexes = createEmployeeIndexes(localEmployees)
  const upsertPayload = []
  const errors = []
  let ignoredUnmatched = 0

  for (const rawRow of rawRows) {
    const normalized = normalizeTimesheetRow(rawRow, config.dateField)
    if (normalized.error) {
      errors.push(normalized.error)
      continue
    }

    const employee = resolveEmployee(normalized, indexes)
    if (!employee) {
      ignoredUnmatched += 1
      continue
    }

    upsertPayload.push({
      employee_id: employee.id,
      work_date: normalized.workDate,
      status: normalized.status,
      hours_worked: normalized.hours,
      is_correction: normalized.isCorrection
    })
  }

  const summary = {
    period: `${dateRange.from}..${dateRange.to}`,
    total: rawRows.length,
    matched: upsertPayload.length,
    failed: errors.length,
    ignored_unmatched: ignoredUnmatched,
    localEmployees: localEmployees.length,
    dryRun: config.dryRun
  }

  if (!config.dryRun) {
    await upsertRows(config, 'tender_timesheet', ['employee_id', 'work_date'], upsertPayload)
    await upsertRows(config, 'tender_timesheet_stats', ['employee_id', 'year', 'month'], await buildStatsFromDatabase(config, upsertPayload))
    await logImport(config, dateRange, summary, errors)
  }

  console.log(JSON.stringify(summary, null, 2))

  if (errors.length > 0) {
    console.error(`First errors: ${errors.slice(0, 10).join('; ')}`)
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})

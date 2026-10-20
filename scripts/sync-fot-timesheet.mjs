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
  --skip-import-log          Do not append a tender_imports row
  --skud                     Also collect daily SKUD stats into tender_skud_daily
  --help                     Show this help

Env:
  Public timesheet endpoint is used by default.
  FOT_TIMESHEET_API or FOT_TIMESHEET_TABLE can override it.
  FOT_TIMESHEET_DEPARTMENT_IDS can narrow public timesheet sync.
  FOT_API and FOT_API_TOKEN are used for FOT access.
  FOT_EVENTS_API overrides the SKUD events endpoint (--skud).
  VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY or VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY are used for writes.`)
}

function parseArgs(argv) {
  const args = {
    dryRun: false,
    skipImportLog: false,
    skud: false,
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
      case '--skip-import-log':
        args.skipImportLog = true
        break
      case '--skud':
        args.skud = true
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

function todayIso(timeZone = 'Europe/Moscow') {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })
      .formatToParts(new Date())
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, part.value])
  )
  return `${parts.year}-${parts.month}-${parts.day}`
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
  const to = todayIso(env.FOT_TIMESHEET_TIME_ZONE || 'Europe/Moscow')
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
  if (['sick_worked', 'работа на больничном', 'работал на больничном', 'рб'].includes(normalized)) return 'sick_worked'
  if (['remote', 'удаленка', 'удаленная работа', 'удаленно', 'уу', 'уд'].includes(normalized)) return 'remote'
  if (['vacation', 'отпуск', 'от', 'о'].includes(normalized)) return 'vacation'
  if (['sick', 'ill', 'больничный', 'болезнь', 'б'].includes(normalized)) return 'sick'
  if (['dayoff', 'weekend', 'holiday', 'выходной', 'праздник', 'в'].includes(normalized)) return 'dayoff'
  if (['unpaid', 'без содержания', 'за свой счет', 'с', 'до'].includes(normalized)) return 'unpaid'
  if (['educational_leave', 'учебный отпуск', 'у', 'уо'].includes(normalized)) return 'educational_leave'
  if (['absent', 'неявка', 'прогул', 'н'].includes(normalized)) return 'absent'
  if (hours && hours > 0) return 'work'

  return null
}

function normalizeFotHours(hours, status, _workDate, _hoursOverridden) {
  if (status === 'remote' && hours === null) return 9
  if (hours === null) return null

  // FOT API уже вычел обеденную квоту. Округляем готовое нетто-время,
  // не возвращая час обеда повторно.
  return Math.max(0, Math.round(hours))
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

function extractPublicTimesheetData(payload, dateRange) {
  const timesheetRows = []
  const planRows = []
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

        timesheetRows.push({
          fot_employee_id: employee.id,
          employee_id: employee.id,
          full_name: employee.full_name,
          tab_number: employee.tab_number,
          sigur_employee_id: employee.sigur_employee_id,
          work_date: workDate,
          status: day.status,
          hours: day.hours,
          corrected: day.corrected,
          hours_overridden: day.hours_overridden,
          correction_reason: day.correction?.reason,
          correction_author: day.correction?.corrected_by_name,
          correction_at: day.correction?.corrected_at,
          correction_approval_status: day.correction?.approval_status,
          correction_source_type: day.correction?.source_type
        })
      }

      const plans = employee?.plans && typeof employee.plans === 'object' && !Array.isArray(employee.plans)
        ? employee.plans
        : {}
      for (const [workDate, plan] of Object.entries(plans)) {
        if (!plan || typeof plan !== 'object' || Array.isArray(plan)) continue
        if (!String(plan.schedule_id || '').trim()) continue

        planRows.push({
          employeeId: String(employee.id || '').trim(),
          sigurEmployeeId: String(employee.sigur_employee_id || '').trim(),
          tabNumber: String(employee.tab_number || '').trim(),
          employeeName: String(employee.full_name || '').trim(),
          workDate,
          scheduleId: String(plan.schedule_id),
          scheduleName: plan.schedule_name == null ? null : String(plan.schedule_name),
          scheduleType: String(plan.schedule_type || 'office'),
          scheduleSource: String(plan.schedule_source || 'default'),
          isWorkingDay: Boolean(plan.is_working_day),
          plannedHours: Number(plan.planned_hours) || 0,
          fullDayThresholdHours: Number(plan.full_day_threshold_hours) || 0,
          workStart: plan.work_start == null ? null : String(plan.work_start),
          workEnd: plan.work_end == null ? null : String(plan.work_end),
          lunchMinutes: Math.max(0, Math.round(Number(plan.lunch_minutes) || 0))
        })
      }
    }
  }

  return { timesheetRows, planRows }
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
  const planRows = []

  for (const month of getMonthKeys(dateRange)) {
    const url = new URL(config.timesheetApi)
    url.searchParams.set('department_id', departmentIds.join(','))
    url.searchParams.set('month', month)
    url.searchParams.set('half', config.timesheetHalf)

    const payload = await fetchJson(url, {
      headers: getFotHeaders(config)
    })
    const extracted = extractPublicTimesheetData(payload, dateRange)
    rows.push(...extracted.timesheetRows)
    planRows.push(...extracted.planRows)
  }

  return { rows, planRows }
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

  return { rows, planRows: [] }
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
  const parsedHours = parseHours(pickValue(record, FIELD_ALIASES.hours))
  const status = normalizeStatus(pickString(record, FIELD_ALIASES.status), parsedHours)
  const isCorrection = parseBoolean(pickValue(record, FIELD_ALIASES.isCorrection))
  const hoursOverridden = parseBoolean(pickValue(record, ['hours_overridden']))

  if (!workDate) return { error: 'Missing work date' }
  if (!status) return { error: `Missing status/hours for ${workDate}` }

  const hours = normalizeFotHours(parsedHours, status, workDate, hoursOverridden)

  return {
    employeeId: pickString(record, FIELD_ALIASES.employeeId),
    sigurEmployeeId: pickString(record, FIELD_ALIASES.sigurEmployeeId),
    tabNumber: pickString(record, FIELD_ALIASES.tabNumber),
    employeeName: pickString(record, FIELD_ALIASES.employeeName),
    workDate,
    status,
    hours,
    isCorrection,
    correctionReason: pickString(record, ['correction_reason']),
    correctionAuthor: pickString(record, ['correction_author']),
    correctionAt: pickString(record, ['correction_at']),
    correctionApprovalStatus: pickString(record, ['correction_approval_status']),
    correctionSourceType: pickString(record, ['correction_source_type'])
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
    const hours = Number(normalizeFotHours(
      row.hours_worked == null ? null : Number(row.hours_worked),
      row.status,
      row.work_date,
      false
    ) || 0)

    if (row.status === 'work' || row.status === 'remote' || row.status === 'sick_worked') {
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

// ---------------------------------------------------------------------------
// СКУД по дням (флаг --skud).
// Блок самодостаточный: run-скрипт подаёт этот файл в node через stdin,
// поэтому импортировать соседние модули на сервере нельзя.
// ---------------------------------------------------------------------------

const SKUD_PAGE_SIZE = 1000
const SKUD_MAX_PAGES = 50
const SKUD_CONCURRENCY = 3
const SKUD_TIMEOUT_MS = 30000
const DEFAULT_PUBLIC_EVENTS_API = 'https://fot.su10.ru/api/public/v1/employee-events'

function skudTimeToSeconds(value) {
  const [hours = 0, minutes = 0, seconds = 0] = String(value).split(':').map(Number)
  return hours * 3600 + minutes * 60 + seconds
}

// Приводит ответ FOT к виду { id, date, time, accessPoint, direction }.
// Как normalizeEvent на фронте (fotEmployeeEvents.ts), плюс время приводится к HH:MM:SS.
function normalizeSkudEvent(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const date = String(value.event_date ?? '').trim().slice(0, 10)
  const timeMatch = String(value.event_time ?? '').trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !timeMatch) return null

  const time = `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}:${timeMatch[3] ?? '00'}`
  const accessPoint = String(value.access_point ?? '').trim() || null
  const direction = String(value.direction ?? '').trim().toLowerCase()

  return {
    id: String(value.id ?? '').trim() || `${date}-${time}-${accessPoint ?? ''}`,
    date,
    time,
    accessPoint,
    direction: direction === 'entry' || direction === 'exit' ? direction : null
  }
}

/**
 * Дневная статистика СКУД. Повторяет calculateFotSkudDay
 * (src/pages/tender/utils/skudTimeCalculation.ts):
 * - события сортируются по времени, затем по id;
 * - учитываются только закрытые пары вход → выход;
 * - повторный вход на той же точке заменяет незакрытый вход,
 *   вход на другой точке открытую пару не сбрасывает;
 * - выход без входа игнорируется;
 * - перерыв = промежуток между выходом пары и входом следующей (> 0 сек);
 * - открытая пара учитывается (закрывается текущим временем) только если
 *   передан nowSeconds — то есть для сегодняшнего дня; для прошлых дней
 *   она игнорируется, но has_open_pair всё равно true.
 */
export function calculateSkudDayStats(sourceEvents, nowSeconds = null) {
  const events = [...sourceEvents].sort((left, right) => (
    left.time.localeCompare(right.time) || left.id.localeCompare(right.id)
  ))
  let presenceSeconds = 0
  let outsideSeconds = 0
  let exitsCount = 0
  let openEntry = null
  let previousPairExit = null

  const addBreak = (entryTime) => {
    if (!previousPairExit) return
    const breakSeconds = Math.max(0, skudTimeToSeconds(entryTime) - skudTimeToSeconds(previousPairExit.time))
    if (breakSeconds > 0) {
      outsideSeconds += breakSeconds
      exitsCount += 1
    }
  }

  for (const event of events) {
    if (event.direction === 'entry') {
      if (openEntry === null || event.accessPoint === openEntry.accessPoint) {
        openEntry = event
      }
      continue
    }

    if (event.direction !== 'exit' || openEntry === null) continue

    const startSeconds = skudTimeToSeconds(openEntry.time)
    const endSeconds = skudTimeToSeconds(event.time)
    if (endSeconds >= startSeconds) {
      presenceSeconds += endSeconds - startSeconds
      addBreak(openEntry.time)
      previousPairExit = event
    }

    openEntry = null
  }

  const hasOpenPair = openEntry !== null
  if (openEntry && nowSeconds !== null) {
    const startSeconds = skudTimeToSeconds(openEntry.time)
    if (nowSeconds > startSeconds) {
      presenceSeconds += nowSeconds - startSeconds
      addBreak(openEntry.time)
    }
  }

  const firstEntry = events.find(event => event.direction === 'entry') || null
  const lastExit = [...events].reverse().find(event => event.direction === 'exit') || null

  return {
    events_count: events.length,
    exits_count: exitsCount,
    outside_minutes: Math.round(outsideSeconds / 60),
    presence_minutes: Math.round(presenceSeconds / 60),
    first_entry: firstEntry ? firstEntry.time : null,
    last_exit: lastExit ? lastExit.time : null,
    has_open_pair: hasOpenPair
  }
}

function currentSecondsOfDay(timeZone = 'Europe/Moscow') {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
      .formatToParts(new Date())
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, part.value])
  )
  return Number(parts.hour) * 3600 + Number(parts.minute) * 60 + Number(parts.second)
}

function buildEventsUrl(config) {
  if (config.eventsApi) return config.eventsApi
  if (isPublicTimesheetEndpoint(config.timesheetApi)) {
    return config.timesheetApi.replace('/api/public/v1/timesheet', '/api/public/v1/employee-events')
  }
  return DEFAULT_PUBLIC_EVENTS_API
}

// Повтор 1 раз при 5xx, сетевой ошибке и таймауте; 4xx не повторяем.
async function fetchJsonWithRetry(url, options) {
  try {
    return await fetchJson(url, options)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/^HTTP [1-4]\d\d/.test(message)) throw error
    return fetchJson(url, options)
  }
}

// Все события сотрудника за период (пагинация limit/offset, pagination.has_more/next_offset).
async function fetchSkudEvents(config, fotEmployeeId, dateRange) {
  const events = []
  let offset = 0

  for (let page = 0; page < SKUD_MAX_PAGES; page += 1) {
    const url = new URL(buildEventsUrl(config))
    url.searchParams.set('employee_id', fotEmployeeId)
    url.searchParams.set('from', dateRange.from)
    url.searchParams.set('to', dateRange.to)
    url.searchParams.set('limit', String(SKUD_PAGE_SIZE))
    url.searchParams.set('offset', String(offset))

    const payload = await fetchJsonWithRetry(url, {
      headers: getFotHeaders(config),
      timeoutMs: SKUD_TIMEOUT_MS
    })
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new Error('FOT вернул некорректный ответ событий')
    }

    if (Array.isArray(payload.data)) {
      for (const item of payload.data) {
        const event = normalizeSkudEvent(item)
        if (event) events.push(event)
      }
    }

    const pagination = payload.pagination && typeof payload.pagination === 'object' ? payload.pagination : {}
    const nextOffset = Number(pagination.next_offset)
    if (pagination.has_more !== true || !Number.isInteger(nextOffset) || nextOffset <= offset) {
      return events
    }
    offset = nextOffset
  }

  throw new Error(`Больше ${SKUD_MAX_PAGES} страниц событий — прервано`)
}

async function runWithConcurrency(items, limit, worker) {
  let index = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const item = items[index]
      index += 1
      await worker(item)
    }
  })
  await Promise.all(runners)
}

// Обновляет tender_skud_daily за период для сотрудников, у которых есть fot_employee_id.
// Ошибка по одному сотруднику логируется и не прерывает остальных.
async function syncSkudDaily(config, dateRange, employees, today) {
  const summary = { employees: 0, failed: 0, days: 0, deleted: 0 }
  const nowSeconds = currentSecondsOfDay(config.timeZone)

  await runWithConcurrency(employees, SKUD_CONCURRENCY, async (employee) => {
    const fotId = String(employee.fot_employee_id || '').trim()
    try {
      const eventsByDate = new Map()
      for (const event of await fetchSkudEvents(config, fotId, dateRange)) {
        if (event.date < dateRange.from || event.date > dateRange.to) continue
        const dayEvents = eventsByDate.get(event.date) || []
        dayEvents.push(event)
        eventsByDate.set(event.date, dayEvents)
      }

      const updatedAt = new Date().toISOString()
      const rows = Array.from(eventsByDate, ([workDate, dayEvents]) => ({
        employee_id: employee.id,
        work_date: workDate,
        ...calculateSkudDayStats(dayEvents, workDate === today ? nowSeconds : null),
        updated_at: updatedAt
      }))

      if (!config.dryRun) {
        await upsertRows(config, 'tender_skud_daily', ['employee_id', 'work_date'], rows)

        // Удаляем ранее записанные дни этого сотрудника в пределах периода, где событий больше нет.
        const existing = await supabaseRequest(
          config,
          `tender_skud_daily?select=work_date&employee_id=eq.${employee.id}`
            + `&work_date=gte.${dateRange.from}&work_date=lte.${dateRange.to}`
        )
        const staleDates = (Array.isArray(existing) ? existing : [])
          .map(row => String(row.work_date))
          .filter(workDate => !eventsByDate.has(workDate))
        if (staleDates.length > 0) {
          await supabaseRequest(
            config,
            `tender_skud_daily?employee_id=eq.${employee.id}&work_date=in.(${staleDates.join(',')})`,
            { method: 'DELETE', headers: { Prefer: 'return=minimal' } }
          )
          summary.deleted += staleDates.length
        }
      }

      summary.employees += 1
      summary.days += rows.length
    } catch (error) {
      summary.failed += 1
      console.error(`SKUD: сотрудник ${employee.id} (FOT ${fotId}): ${error instanceof Error ? error.message : String(error)}`)
    }
  })

  return summary
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
    eventsApi: env.FOT_EVENTS_API || '',
    timeZone: env.FOT_TIMESHEET_TIME_ZONE || 'Europe/Moscow',
    skud: args.skud,
    dryRun: args.dryRun,
    skipImportLog: args.skipImportLog || env.FOT_TIMESHEET_SKIP_IMPORT_LOG === '1'
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
  const { rows: rawRows, planRows: rawPlanRows } = await fetchFotTimesheetRows(config, dateRange, localEmployees)
  const indexes = createEmployeeIndexes(localEmployees)
  const upsertPayload = []
  const workPlanPayload = []
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
      is_correction: normalized.isCorrection,
      correction_reason: normalized.correctionReason || null,
      correction_author: normalized.correctionAuthor || null,
      correction_at: normalized.correctionAt || null,
      correction_approval_status: normalized.correctionApprovalStatus || null,
      correction_source_type: normalized.correctionSourceType || null
    })
  }

  for (const plan of rawPlanRows) {
    const employee = resolveEmployee(plan, indexes)
    if (!employee) continue
    workPlanPayload.push({
      employee_id: employee.id,
      work_date: plan.workDate,
      schedule_id: plan.scheduleId,
      schedule_name: plan.scheduleName,
      schedule_type: plan.scheduleType,
      schedule_source: plan.scheduleSource,
      is_working_day: plan.isWorkingDay,
      planned_hours: plan.plannedHours,
      full_day_threshold_hours: plan.fullDayThresholdHours,
      work_start: plan.workStart,
      work_end: plan.workEnd,
      lunch_minutes: plan.lunchMinutes,
      updated_at: new Date().toISOString()
    })
  }

  const summary = {
    period: `${dateRange.from}..${dateRange.to}`,
    total: rawRows.length,
    matched: upsertPayload.length,
    failed: errors.length,
    ignored_unmatched: ignoredUnmatched,
    plans: workPlanPayload.length,
    localEmployees: localEmployees.length,
    dryRun: config.dryRun
  }

  if (!config.dryRun) {
    await upsertRows(config, 'tender_timesheet', ['employee_id', 'work_date'], upsertPayload)
    await upsertRows(config, 'tender_work_plans', ['employee_id', 'work_date'], workPlanPayload)
    await upsertRows(config, 'tender_timesheet_stats', ['employee_id', 'year', 'month'], await buildStatsFromDatabase(config, upsertPayload))
    if (!config.skipImportLog) {
      await logImport(config, dateRange, summary, errors)
    }
  }

  if (config.skud) {
    // Сотрудники, попавшие в табель/планы этого прогона, у которых есть FOT ID.
    const syncedIds = new Set([
      ...upsertPayload.map(row => row.employee_id),
      ...workPlanPayload.map(row => row.employee_id)
    ])
    const skudEmployees = localEmployees.filter(employee => (
      syncedIds.has(employee.id) && /^\d+$/.test(String(employee.fot_employee_id || '').trim())
    ))
    summary.skud = await syncSkudDaily(config, dateRange, skudEmployees, todayIso(config.timeZone))
  }

  console.log(JSON.stringify(summary, null, 2))

  if (errors.length > 0) {
    console.error(`First errors: ${errors.slice(0, 10).join('; ')}`)
  }
}

// FOT_SYNC_NO_MAIN=1 — импорт как модуля (тест расчёта дня) без запуска синка.
if (process.env.FOT_SYNC_NO_MAIN !== '1') {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}

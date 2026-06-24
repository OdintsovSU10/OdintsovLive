import type { FotApiDepartment, FotApiLoadOptions, ParsedEmployee } from '../types'
import { supabase } from '../../../lib/supabase'
import { parseExcelDate, splitFullName } from './excelParser'

type ApiRecord = Record<string, unknown>

const DIRECT_FOT_API = import.meta.env.VITE_FOT_API?.trim()
const FOT_API_ENDPOINT = DIRECT_FOT_API || '/fot-api'
const FOT_API_DEPARTMENTS_ENDPOINT = DIRECT_FOT_API
  ? buildDirectFotApiTableEndpoint('org_departments')
  : '/fot-api-departments'
const FOT_API_PAGE_SIZE = 1000
const DEFAULT_FOT_API_LOAD_OPTIONS: FotApiLoadOptions = {
  activeOnly: true,
  departmentId: '',
  maxRecords: 1000
}
const TODAY_ISO = new Date().toISOString().split('T')[0]

const FIELD_ALIASES = {
  fullName: ['full_name', 'fullName', 'fio', 'ФИО', 'name', 'employee', 'employeeName', 'displayName', 'сотрудник'],
  lastName: ['last_name', 'lastName', 'surname', 'family_name', 'Фамилия'],
  firstName: ['first_name', 'firstName', 'given_name', 'Имя'],
  middleName: ['middle_name', 'middleName', 'patronymic', 'Отчество'],
  position: ['position', 'position_name', 'job_title', 'jobTitle', 'title', 'post', 'role', 'Должность'],
  department: ['department', 'dept', 'department_name', 'departmentName', 'org_department', 'org_department_name', 'Отдел'],
  subdivision: ['subdivision', 'unit', 'section', 'group', 'group_name', 'Подразделение', 'Направление'],
  hireDate: ['hire_date', 'hireDate', 'employment_date', 'employmentDate', 'date_start', 'startDate', 'Дата приёма', 'Дата приема'],
  birthDate: ['birth_date', 'birthDate', 'birthday', 'Дата рождения'],
  salary: ['salary', 'current_salary', 'currentSalary', 'salary_actual', 'salary_calculated', 'base_salary', 'Оклад', 'ЗП', 'payroll'],
  country: ['country', 'Страна'],
  snils: ['snils', 'pension_number', 'СНИЛС'],
  company: ['company', 'organization', 'Компания', 'Организация'],
  email: ['email', 'mail', 'e-mail', 'Почта'],
  phone: ['phone', 'mobile', 'Телефон'],
  employmentStatus: ['employment_status', 'current_status', 'status'],
  isArchived: ['is_archived', 'archived'],
  dismissalDate: ['dismissal_date', 'fired_at', 'termination_date', 'Дата увольнения'],
  departmentId: ['org_department_id', 'department_id', 'dept_id']
} as const

const DEPARTMENT_FIELD_ALIASES = {
  id: ['id', 'org_department_id', 'department_id'],
  name: ['name', 'title', 'department_name', 'org_department_name', 'Отдел'],
  description: ['description', 'desc', 'Описание'],
  kind: ['kind', 'type', 'Тип'],
  parentId: ['parent_id', 'parentId']
} as const

function buildDirectFotApiTableEndpoint(tableName: string): string {
  if (!DIRECT_FOT_API) return ''

  try {
    const url = new URL(DIRECT_FOT_API)
    const parts = url.pathname.split('/')
    const tablesIndex = parts.lastIndexOf('tables')

    if (tablesIndex >= 0) {
      url.pathname = [...parts.slice(0, tablesIndex + 1), tableName].join('/')
      url.search = ''
      return url.toString()
    }
  } catch {
    // Ниже вернем исходный endpoint как безопасный fallback для dev-настроек.
  }

  return DIRECT_FOT_API
}

function normalizeKey(key: string): string {
  return key
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[\s_.\-()]/g, '')
}

function createNormalizedRecord(record: ApiRecord): Map<string, unknown> {
  const normalized = new Map<string, unknown>()

  Object.entries(record).forEach(([key, value]) => {
    normalized.set(normalizeKey(key), value)
  })

  return normalized
}

function pickValue(record: Map<string, unknown>, aliases: readonly string[]): unknown {
  for (const alias of aliases) {
    const value = record.get(normalizeKey(alias))
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value
    }
  }
  return ''
}

function pickString(record: Map<string, unknown>, aliases: readonly string[]): string {
  const value = pickValue(record, aliases)
  return value === undefined || value === null ? '' : String(value).trim()
}

function parseMoney(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (!value) return 0

  const normalized = String(value)
    .replace(/[^\d,.-]/g, '')
    .replace(',', '.')

  return parseFloat(normalized) || 0
}

function parseApiDate(value: unknown, fallback: string | null): string | null {
  if (!value) return fallback
  if (value instanceof Date || typeof value === 'number') return parseExcelDate(value)

  const text = String(value).trim()
  if (!text) return fallback

  const canParse = /^(\d{4})-(\d{2})-(\d{2})/.test(text)
    || /(\d{2})\.(\d{2})\.(\d{4})/.test(text)
    || /(\d{2})\/(\d{2})\/(\d{4})/.test(text)

  return canParse ? parseExcelDate(text) : fallback
}

function isTruthyArchiveFlag(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value === 1

  const text = String(value ?? '').trim().toLowerCase()
  return ['true', '1', 'yes', 'y', 'да'].includes(text)
}

function isFalsyFlag(value: unknown): boolean {
  if (typeof value === 'boolean') return !value
  if (typeof value === 'number') return value === 0

  const text = String(value ?? '').trim().toLowerCase()
  return ['false', '0', 'no', 'n', 'нет'].includes(text)
}

function isInactiveEmployee(record: Map<string, unknown>): boolean {
  const archived = pickValue(record, FIELD_ALIASES.isArchived)
  if (isTruthyArchiveFlag(archived)) return true

  const dismissalDate = pickString(record, FIELD_ALIASES.dismissalDate)
  if (dismissalDate) return true

  const status = pickString(record, FIELD_ALIASES.employmentStatus).toLowerCase()
  if (!status) return false

  return ['fired', 'dismissed', 'terminated', 'inactive', 'уволен', 'уволена'].includes(status)
}

function pickDate(record: Map<string, unknown>, aliases: readonly string[], fallback: string | null): string | null {
  return parseApiDate(pickValue(record, aliases), fallback)
}

function isRecord(value: unknown): value is ApiRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function extractEmployeesPayload(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload

  if (!isRecord(payload)) return []

  const candidateKeys = ['employees', 'staff', 'items', 'data', 'result', 'rows', 'records']
  for (const key of candidateKeys) {
    const value = payload[key]
    if (Array.isArray(value)) return value
    if (isRecord(value)) {
      const nested = extractEmployeesPayload(value)
      if (nested.length > 0) return nested
    }
  }

  const firstArray = Object.values(payload).find(Array.isArray)
  return Array.isArray(firstArray) ? firstArray : []
}

function normalizeLoadOptions(options?: Partial<FotApiLoadOptions>): FotApiLoadOptions {
  const maxRecords = Number(options?.maxRecords) || DEFAULT_FOT_API_LOAD_OPTIONS.maxRecords

  return {
    activeOnly: options?.activeOnly ?? DEFAULT_FOT_API_LOAD_OPTIONS.activeOnly,
    departmentId: options?.departmentId?.trim() || '',
    maxRecords: Math.min(Math.max(Math.floor(maxRecords), 1), 10000)
  }
}

function buildFotApiUrl(limit: number, offset: number, options: FotApiLoadOptions): string {
  const baseUrl = new URL(FOT_API_ENDPOINT, window.location.origin)
  baseUrl.searchParams.set('limit', String(limit))
  baseUrl.searchParams.set('offset', String(offset))

  if (options.activeOnly && !baseUrl.searchParams.has('eq.employment_status')) {
    baseUrl.searchParams.set('eq.employment_status', 'active')
  }

  if (options.departmentId && !baseUrl.searchParams.has('eq.org_department_id')) {
    baseUrl.searchParams.set('eq.org_department_id', options.departmentId)
  }

  if (DIRECT_FOT_API) return baseUrl.toString()
  return `${baseUrl.pathname}${baseUrl.search}`
}

function buildFotApiDepartmentsUrl(): string {
  const baseUrl = new URL(FOT_API_DEPARTMENTS_ENDPOINT, window.location.origin)
  baseUrl.searchParams.set('limit', '1000')
  baseUrl.searchParams.set('order', 'name.asc')

  if (DIRECT_FOT_API) return baseUrl.toString()
  return `${baseUrl.pathname}${baseUrl.search}`
}

async function getFotApiHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const accessToken = data.session?.access_token

  if (!accessToken) {
    throw new Error('Для загрузки из FOT API нужна авторизация')
  }

  return {
    Accept: 'application/json',
    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY,
    Authorization: `Bearer ${accessToken}`
  }
}

async function fetchFotApiJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: await getFotApiHeaders()
  })

  if (!response.ok) {
    let apiMessage = ''
    try {
      const payload = await response.clone().json()
      if (isRecord(payload)) {
        apiMessage = String(payload.detail || payload.error || payload.message || '').trim()
      }
    } catch {
      // Ответ ошибки может быть не JSON.
    }
    throw new Error(apiMessage ? `FOT API: ${apiMessage}` : `FOT API вернул HTTP ${response.status}`)
  }

  const contentType = response.headers.get('content-type') || ''
  const normalizedContentType = contentType.toLowerCase()
  if (!normalizedContentType.includes('application/json') && !normalizedContentType.includes('+json')) {
    throw new Error('FOT API должен возвращать JSON')
  }

  return response.json()
}

async function fetchFotApiPage(limit: number, offset: number, options: FotApiLoadOptions): Promise<unknown[]> {
  const payload = await fetchFotApiJson(buildFotApiUrl(limit, offset, options))
  return extractEmployeesPayload(payload)
}

function normalizeEmployee(raw: unknown): ParsedEmployee | null {
  if (!isRecord(raw)) return null

  const record = createNormalizedRecord(raw)
  if (isInactiveEmployee(record)) return null

  const fullNameFromApi = pickString(record, FIELD_ALIASES.fullName)
  const apiLastName = pickString(record, FIELD_ALIASES.lastName)
  const apiFirstName = pickString(record, FIELD_ALIASES.firstName)
  const apiMiddleName = pickString(record, FIELD_ALIASES.middleName)
  const fullName = fullNameFromApi || [apiLastName, apiFirstName, apiMiddleName].filter(Boolean).join(' ')

  if (!fullName) return null

  const nameParts = splitFullName(fullName)
  const salaryValue = pickValue(record, FIELD_ALIASES.salary)

  return {
    full_name: fullName,
    last_name: apiLastName || nameParts.last_name,
    first_name: apiFirstName || nameParts.first_name,
    middle_name: apiMiddleName || nameParts.middle_name,
    position: pickString(record, FIELD_ALIASES.position),
    department: pickString(record, FIELD_ALIASES.department),
    subdivision: pickString(record, FIELD_ALIASES.subdivision),
    hire_date: pickDate(record, FIELD_ALIASES.hireDate, TODAY_ISO) || TODAY_ISO,
    birth_date: pickDate(record, FIELD_ALIASES.birthDate, null),
    salary: parseMoney(salaryValue),
    country: pickString(record, FIELD_ALIASES.country) || 'Россия',
    snils: pickString(record, FIELD_ALIASES.snils),
    company: pickString(record, FIELD_ALIASES.company),
    email: pickString(record, FIELD_ALIASES.email),
    phone: pickString(record, FIELD_ALIASES.phone)
  }
}

function extractDepartmentsPayload(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload
  if (!isRecord(payload)) return []

  const value = payload.data
  return Array.isArray(value) ? value : []
}

function normalizeDepartment(raw: unknown): FotApiDepartment | null {
  if (!isRecord(raw)) return null

  const record = createNormalizedRecord(raw)
  const id = pickString(record, DEPARTMENT_FIELD_ALIASES.id)
  if (!id) return null

  const name = pickString(record, DEPARTMENT_FIELD_ALIASES.name) || id
  const description = pickString(record, DEPARTMENT_FIELD_ALIASES.description)
  const kind = pickString(record, DEPARTMENT_FIELD_ALIASES.kind)
  const parentId = pickString(record, DEPARTMENT_FIELD_ALIASES.parentId)

  return {
    id,
    name,
    description,
    kind,
    parent_id: parentId || null
  }
}

function collectDepartmentFallback(rows: unknown[]): FotApiDepartment[] {
  const departments = new Map<string, FotApiDepartment>()

  rows.forEach(row => {
    if (!isRecord(row)) return

    const record = createNormalizedRecord(row)
    const id = pickString(record, FIELD_ALIASES.departmentId)
    if (!id || departments.has(id)) return

    const name = pickString(record, FIELD_ALIASES.department) || id
    departments.set(id, {
      id,
      name,
      description: '',
      kind: '',
      parent_id: null
    })
  })

  return Array.from(departments.values()).sort((left, right) => (
    left.name.localeCompare(right.name, 'ru-RU')
  ))
}

export async function fetchFotApiDepartments(): Promise<FotApiDepartment[]> {
  try {
    const payload = await fetchFotApiJson(buildFotApiDepartmentsUrl())
    const departments = extractDepartmentsPayload(payload)
      .filter(row => !(isRecord(row) && isFalsyFlag(row.is_active)))
      .map(normalizeDepartment)
      .filter((department): department is FotApiDepartment => department !== null)

    if (departments.length > 0) {
      return departments
    }
  } catch {
    // Если справочник не открыт, ниже соберем доступные отделы из employees.
  }

  const fallbackRows = await fetchFotApiPage(1000, 0, normalizeLoadOptions({
    activeOnly: true,
    maxRecords: 1000
  }))
  return collectDepartmentFallback(fallbackRows)
}

export async function fetchFotApiEmployees(loadOptions?: Partial<FotApiLoadOptions>): Promise<ParsedEmployee[]> {
  const options = normalizeLoadOptions(loadOptions)
  const rows: unknown[] = []
  let offset = 0

  while (rows.length < options.maxRecords) {
    const pageLimit = Math.min(FOT_API_PAGE_SIZE, options.maxRecords - rows.length)
    const pageRows = await fetchFotApiPage(pageLimit, offset, options)
    rows.push(...pageRows)

    if (pageRows.length < pageLimit) break
    offset += pageLimit
  }

  const employees = rows
    .map(normalizeEmployee)
    .filter((employee): employee is ParsedEmployee => employee !== null)

  if (employees.length === 0) {
    throw new Error('В ответе FOT API не найдены действующие сотрудники')
  }

  return employees
}

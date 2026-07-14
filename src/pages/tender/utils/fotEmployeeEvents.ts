import { supabase } from '../../../lib/supabase'

type ApiRecord = Record<string, unknown>

export interface FotEmployeeEvent {
  id: string
  employee_id: string
  event_at: string | null
  event_date: string
  event_time: string
  access_point: string | null
  direction: 'entry' | 'exit' | null
}

interface FotEmployeeEventsPage {
  events: FotEmployeeEvent[]
  hasMore: boolean
  nextOffset: number | null
}

const FOT_EMPLOYEE_EVENTS_ENDPOINT = import.meta.env.VITE_FOT_EMPLOYEE_EVENTS_API?.trim()
  || '/fot-api-employee-events'
const FOT_EMPLOYEE_EVENTS_PAGE_SIZE = 1000
const FOT_EMPLOYEE_EVENTS_MAX_RECORDS = 5000

function isRecord(value: unknown): value is ApiRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringValue(value: unknown): string {
  return String(value ?? '').trim()
}

function normalizeDirection(value: unknown): 'entry' | 'exit' | null {
  const normalized = stringValue(value).toLowerCase()
  if (normalized === 'entry') return 'entry'
  if (normalized === 'exit') return 'exit'
  return null
}

function normalizeEvent(value: unknown): FotEmployeeEvent | null {
  if (!isRecord(value)) return null

  const eventDate = stringValue(value.event_date)
  const eventTime = stringValue(value.event_time)
  if (!eventDate || !eventTime) return null

  return {
    id: stringValue(value.id) || `${eventDate}-${eventTime}-${stringValue(value.access_point)}`,
    employee_id: stringValue(value.employee_id),
    event_at: stringValue(value.event_at) || null,
    event_date: eventDate,
    event_time: eventTime,
    access_point: stringValue(value.access_point) || null,
    direction: normalizeDirection(value.direction)
  }
}

async function getFotHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const accessToken = data.session?.access_token

  if (!accessToken) {
    throw new Error('Для загрузки событий FOT нужна авторизация')
  }

  return {
    Accept: 'application/json',
    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY,
    Authorization: `Bearer ${accessToken}`
  }
}

function getApiError(payload: unknown, status: number): string {
  const message = isRecord(payload)
    ? stringValue(payload.detail || payload.error || payload.message)
    : stringValue(payload)

  if (status === 403) {
    return message || 'FOT API-ключ не имеет доступа к событиям сотрудников'
  }
  if (status === 404) {
    return message || 'Сотрудник не найден в FOT'
  }
  return message || `FOT API вернул HTTP ${status}`
}

async function fetchEventsPage(
  employeeId: string,
  from: string,
  to: string,
  offset: number,
  signal?: AbortSignal
): Promise<FotEmployeeEventsPage> {
  const url = new URL(FOT_EMPLOYEE_EVENTS_ENDPOINT, window.location.origin)
  url.searchParams.set('employee_id', employeeId)
  url.searchParams.set('from', from)
  url.searchParams.set('to', to)
  url.searchParams.set('limit', String(FOT_EMPLOYEE_EVENTS_PAGE_SIZE))
  url.searchParams.set('offset', String(offset))

  const response = await fetch(url.toString(), {
    headers: await getFotHeaders(),
    signal
  })
  const contentType = response.headers.get('content-type') || ''
  const payload: unknown = contentType.toLowerCase().includes('json')
    ? await response.json()
    : await response.text()

  if (!response.ok) {
    throw new Error(getApiError(payload, response.status))
  }
  if (!isRecord(payload)) {
    throw new Error('FOT API вернул некорректный ответ событий')
  }

  const events = Array.isArray(payload.data)
    ? payload.data.map(normalizeEvent).filter((event): event is FotEmployeeEvent => event !== null)
    : []
  const pagination = isRecord(payload.pagination) ? payload.pagination : {}
  const hasMore = pagination.has_more === true
  const nextOffsetValue = Number(pagination.next_offset)

  return {
    events,
    hasMore,
    nextOffset: hasMore && Number.isInteger(nextOffsetValue) && nextOffsetValue >= 0
      ? nextOffsetValue
      : null
  }
}

export async function fetchFotEmployeeEvents(
  employeeId: string,
  from: string,
  to: string,
  signal?: AbortSignal
): Promise<FotEmployeeEvent[]> {
  const normalizedEmployeeId = employeeId.trim()
  if (!/^\d+$/.test(normalizedEmployeeId)) {
    throw new Error('У сотрудника не указан корректный FOT ID')
  }

  const result: FotEmployeeEvent[] = []
  let offset = 0

  while (result.length < FOT_EMPLOYEE_EVENTS_MAX_RECORDS) {
    const page = await fetchEventsPage(normalizedEmployeeId, from, to, offset, signal)
    result.push(...page.events)

    if (!page.hasMore || page.nextOffset === null || page.nextOffset <= offset) break
    offset = page.nextOffset
  }

  return result.slice(0, FOT_EMPLOYEE_EVENTS_MAX_RECORDS)
}

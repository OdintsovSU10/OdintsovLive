export interface SKUDEvent {
  id: number
  employee_id: number
  event_date: string
  event_time: string
  event_datetime: string
  event_type: 'entry' | 'exit'
  physical_person: string | null
  department: string | null
  location: string | null
  card_number: string | null
  controller: string | null
  door: string | null
  manual_entry: boolean
  created_at: string
}

export interface SKUDDailySummary {
  id: number
  employee_id: number
  work_date: string
  first_entry: string | null
  last_exit: string | null
  total_office_hours: number | null
  entries_count: number
  exits_count: number
  status: string
  created_at: string
  updated_at: string
}

export interface SKUDImportRow {
  employee_name: string
  physical_person: string
  department: string
  date: string
  time: string
  location: string
  card: string
  controller: string
  door: string
  manual_entry: boolean
}

export interface SKUDParseResult {
  found: { full_name: string; events: SKUDImportRow[] }[]
  notFound: string[]
}

export interface Employee {
  id: number
  full_name: string
  position: string
  group_name: string | null
}

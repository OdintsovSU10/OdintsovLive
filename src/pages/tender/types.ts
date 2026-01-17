export interface Employee {
  id: number
  full_name: string
  position: string
  hire_date: string
  birth_date: string | null
  group_name: string | null
  current_salary: number
  is_archived: boolean
  archived_at: string | null
  created_at: string
}

export interface ImportPreview {
  full_name: string
  position: string
  hire_date: string
  birth_date: string | null
  salary: number
  group_name: string | null
}

export interface SalaryHistory {
  id: number
  employee_id: number
  salary: number
  effective_date: string
  note: string | null
}

export interface EditedEmployee {
  full_name?: string
  position?: string
}

export interface CalendarDay {
  day: number
  isCurrentMonth: boolean
  birthdays: Employee[]
}

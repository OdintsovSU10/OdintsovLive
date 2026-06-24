export interface Employee {
  id: number
  full_name: string
  last_name: string | null
  first_name: string | null
  middle_name: string | null
  position: string
  department: string | null
  subdivision: string | null
  hire_date: string
  birth_date: string | null
  group_name: string | null
  current_salary: number
  monthly_bonus: number
  country: string | null
  snils: string | null
  company: string | null
  email: string | null
  phone: string | null
  fot_employee_id: string | null
  sigur_employee_id: string | null
  tab_number: string | null
  excluded_from_timesheet: boolean
  is_archived: boolean
  archived_at: string | null
  created_at: string
}

export interface SalaryHistory {
  id: number
  employee_id: number
  salary: number
  effective_date: string
  note: string | null
}

export interface TenderSubdivision {
  id: number
  name: string
  created_at: string
}

export type TenderEmployeeEventType = 'archive' | 'unarchive'

export interface TenderEmployeeEvent {
  id: number
  employee_id: number
  event_type: TenderEmployeeEventType
  event_date: string
  note: string | null
  created_at: string
}

export interface PositionHistory {
  id: number
  employee_id: number
  position: string
  department: string | null
  subdivision: string | null
  effective_date: string
  end_date: string | null
  note: string | null
}

export type TimesheetStatus = 'work' | 'vacation' | 'dayoff' | 'remote' | 'unpaid' | 'absent'

export interface TimesheetEntry {
  id: number
  employee_id: number
  work_date: string
  status: TimesheetStatus
  hours_worked: number | null
  is_correction: boolean
}

export interface AttendanceStats {
  work: number
  remote: number
  vacation: number
  dayoff: number
  absent: number
  // Будни
  work_weekday: number
  remote_weekday: number
  // Выходные
  weekend_work: number
  total_hours: number
}

export interface EmployeeWithStats extends Employee {
  avatar: string
  uiStatus: 'active' | 'vacation' | 'sick' | 'remote'
  attendance: AttendanceStats
  history: HistoryItem[]
  timesheet?: TimesheetEntry[]
  salaryHistory?: SalaryHistory[]
}

export interface HistoryItem {
  date: string
  type: 'hire' | 'promotion' | 'salary_change' | 'transfer' | 'bonus' | 'archive' | 'unarchive'
  desc: string
}

export interface SalaryCalculation {
  id: number
  employee_id: number
  year: number
  month: number
  base_salary: number
  work_days_norm: number
  work_days_actual: number
  work_hours_actual: number
  remote_days: number
  vacation_days: number
  dayoff_days: number
  absent_days: number
  weekend_work_days: number
  calculated_salary: number
  bonus: number
  deductions: number
  final_salary: number
  // Проезд
  transport: number
  transport_payment: number
  weekend_payment: number
}

export interface DepartmentFOT {
  department: string
  employees_count: number
  total_base_salary: number
  total_calculated_salary: number
  total_bonus: number
  total_deductions: number
  total_final_salary: number
  avg_salary: number
  // Проезд
  total_transport_payment: number
  total_weekend_payment: number
}

export interface ImportResult {
  success: boolean
  records_total: number
  records_success: number
  records_failed: number
  errors: string[]
}

export interface EmployeeImportOptions {
  identity: boolean
  work: boolean
  employment: boolean
  salary: boolean
  contacts: boolean
  documents: boolean
  updateExisting: boolean
  createMissing: boolean
}

export interface FotApiLoadOptions {
  activeOnly: boolean
  departmentId: string
  maxRecords: number
}

export interface FotApiDepartment {
  id: string
  name: string
  description: string
  kind: string
  parent_id: string | null
}

export interface ParsedEmployee {
  full_name: string
  last_name: string
  first_name: string
  middle_name: string
  position: string
  department: string
  subdivision: string
  hire_date: string
  birth_date: string | null
  salary: number
  country: string
  snils: string
  company: string
  email: string
  phone: string
  fot_employee_id?: string
  sigur_employee_id?: string
  tab_number?: string
  excluded_from_timesheet?: boolean
}

export interface ParsedTimesheetDay {
  day: number
  status: TimesheetStatus
  hours: number | null
  is_correction: boolean
}

export interface ParsedTimesheetRow {
  employee_name: string
  year: number
  month: number
  days: ParsedTimesheetDay[]
}

export type TenderTab = 'dashboard' | 'employees' | 'timesheet' | 'fot'

export interface ParsedSalaryEntry {
  employee_name: string
  salary: number
  effective_date: string
  note: string
}

export interface TenderEmployeeVM {
  id: number
  fullName: string
  shortName: string
  initials: string
  role: string
  department: string
  group: string
  salary: number
  noRaiseMonths: number
  avatar: string
}

export interface DepartmentSummaryVM {
  department: string
  employeesCount: number
  totalHours: number
  totalOvertime: number
  totalSalary: number
  payrollShare: number
}

export interface TimesheetCellVM {
  employeeId: number
  isoDate: string
  day: number
  isWeekend: boolean
  status: TimesheetStatus | null
  hours: number | null
}

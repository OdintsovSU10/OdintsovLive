import { useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { parseEmployeesExcel } from '../utils/excelParser'
import { fetchFotApiEmployees } from '../utils/fotApi'
import type { EmployeeImportOptions, FotApiLoadOptions, ImportResult, ParsedEmployee } from '../types'

export const DEFAULT_EMPLOYEE_IMPORT_OPTIONS: EmployeeImportOptions = {
  identity: true,
  work: true,
  employment: true,
  salary: true,
  contacts: true,
  documents: true,
  updateExisting: true,
  createMissing: true
}

function hasValue(value: unknown): boolean {
  return value !== undefined && value !== null && String(value).trim() !== ''
}

function addStringUpdate(
  updates: Record<string, unknown>,
  key: string,
  nextValue: string | null | undefined,
  currentValue: unknown
) {
  if (!hasValue(nextValue)) return

  if (String(nextValue) !== String(currentValue ?? '')) {
    updates[key] = nextValue
  }
}

function addDateUpdate(
  updates: Record<string, unknown>,
  key: string,
  nextValue: string | null | undefined,
  currentValue: unknown
) {
  if (!nextValue) return

  if (nextValue !== currentValue) {
    updates[key] = nextValue
  }
}

function addSalaryUpdate(
  updates: Record<string, unknown>,
  nextValue: number,
  currentValue: unknown
) {
  if (!Number.isFinite(nextValue) || nextValue <= 0) return

  if (nextValue !== Number(currentValue || 0)) {
    updates.current_salary = nextValue
  }
}

function addBooleanUpdate(
  updates: Record<string, unknown>,
  key: string,
  nextValue: boolean,
  currentValue: unknown
) {
  if (nextValue !== Boolean(currentValue)) {
    updates[key] = nextValue
  }
}

function createInsertPayload(emp: ParsedEmployee, options: EmployeeImportOptions): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    full_name: emp.full_name,
    last_name: emp.last_name,
    first_name: emp.first_name,
    middle_name: emp.middle_name,
    position: options.work && hasValue(emp.position) ? emp.position : 'Не указана',
    department: options.work && hasValue(emp.department) ? emp.department : null,
    subdivision: options.work && hasValue(emp.subdivision) ? emp.subdivision : null,
    hire_date: options.employment && emp.hire_date ? emp.hire_date : new Date().toISOString().split('T')[0],
    birth_date: options.employment ? emp.birth_date : null,
    current_salary: options.salary && Number.isFinite(emp.salary) ? emp.salary : 0,
    country: options.documents && hasValue(emp.country) ? emp.country : null,
    snils: options.documents && hasValue(emp.snils) ? emp.snils : null,
    company: options.documents && hasValue(emp.company) ? emp.company : null,
    email: options.contacts && hasValue(emp.email) ? emp.email : null,
    phone: options.contacts && hasValue(emp.phone) ? emp.phone : null,
    is_archived: false
  }

  if (emp.fot_employee_id !== undefined) {
    payload.fot_employee_id = hasValue(emp.fot_employee_id) ? emp.fot_employee_id : null
  }
  if (emp.sigur_employee_id !== undefined) {
    payload.sigur_employee_id = hasValue(emp.sigur_employee_id) ? emp.sigur_employee_id : null
  }
  if (emp.tab_number !== undefined) {
    payload.tab_number = hasValue(emp.tab_number) ? emp.tab_number : null
  }
  if (emp.excluded_from_timesheet !== undefined) {
    payload.excluded_from_timesheet = emp.excluded_from_timesheet
  }

  return payload
}

function createUpdatePayload(
  emp: ParsedEmployee,
  existing: Record<string, unknown>,
  options: EmployeeImportOptions
): Record<string, unknown> {
  const updates: Record<string, unknown> = {}

  if (options.identity) {
    addStringUpdate(updates, 'full_name', emp.full_name, existing.full_name)
    addStringUpdate(updates, 'last_name', emp.last_name, existing.last_name)
    addStringUpdate(updates, 'first_name', emp.first_name, existing.first_name)
    addStringUpdate(updates, 'middle_name', emp.middle_name, existing.middle_name)
    if (emp.fot_employee_id !== undefined) {
      addStringUpdate(updates, 'fot_employee_id', emp.fot_employee_id, existing.fot_employee_id)
    }
    if (emp.sigur_employee_id !== undefined) {
      addStringUpdate(updates, 'sigur_employee_id', emp.sigur_employee_id, existing.sigur_employee_id)
    }
    if (emp.tab_number !== undefined) {
      addStringUpdate(updates, 'tab_number', emp.tab_number, existing.tab_number)
    }
    if (emp.excluded_from_timesheet !== undefined) {
      addBooleanUpdate(updates, 'excluded_from_timesheet', emp.excluded_from_timesheet, existing.excluded_from_timesheet)
    }
  }

  if (options.work) {
    addStringUpdate(updates, 'position', emp.position, existing.position)
    addStringUpdate(updates, 'department', emp.department, existing.department)
    addStringUpdate(updates, 'subdivision', emp.subdivision, existing.subdivision)
  }

  if (options.employment) {
    addDateUpdate(updates, 'hire_date', emp.hire_date, existing.hire_date)
    addDateUpdate(updates, 'birth_date', emp.birth_date, existing.birth_date)
  }

  if (options.salary) {
    addSalaryUpdate(updates, emp.salary, existing.current_salary)
  }

  if (options.documents) {
    addStringUpdate(updates, 'country', emp.country, existing.country)
    addStringUpdate(updates, 'snils', emp.snils, existing.snils)
    addStringUpdate(updates, 'company', emp.company, existing.company)
  }

  if (options.contacts) {
    addStringUpdate(updates, 'email', emp.email, existing.email)
    addStringUpdate(updates, 'phone', emp.phone, existing.phone)
  }

  return updates
}

export function useEmployeeImport() {
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<ParsedEmployee[]>([])

  const parseFile = async (file: File): Promise<ParsedEmployee[]> => {
    setLoading(true)
    try {
      const parsed = await parseEmployeesExcel(file)
      setPreview(parsed)
      return parsed
    } finally {
      setLoading(false)
    }
  }

  const loadFromFotApi = async (options?: Partial<FotApiLoadOptions>): Promise<ParsedEmployee[]> => {
    setLoading(true)
    try {
      const parsed = await fetchFotApiEmployees(options)
      setPreview(parsed)
      return parsed
    } finally {
      setLoading(false)
    }
  }

  const importEmployees = async (
    employees: ParsedEmployee[],
    options: EmployeeImportOptions = DEFAULT_EMPLOYEE_IMPORT_OPTIONS
  ): Promise<ImportResult> => {
    setLoading(true)
    const errors: string[] = []
    let success = 0
    let failed = 0

    try {
      for (const emp of employees) {
        try {
          // Проверяем, существует ли сотрудник с такой фамилией
          const { data: existingList } = await supabase
            .from('tender_employees')
            .select('*')
            .ilike('full_name', `${emp.last_name}%`)
            .limit(1)

          const existing = existingList?.[0]

          if (existing) {
            if (!options.updateExisting) {
              success++
              continue
            }

            const updates = createUpdatePayload(emp, existing, options)

            // Обновляем только если есть изменения
            if (Object.keys(updates).length > 0) {
              const { error } = await supabase
                .from('tender_employees')
                .update(updates)
                .eq('id', existing.id)

              if (error) throw error
            }
          } else {
            if (!options.createMissing) {
              success++
              continue
            }

            // Создаём нового
            const { error } = await supabase
              .from('tender_employees')
              .insert(createInsertPayload(emp, options))

            if (error) throw error
          }

          success++
        } catch (err) {
          failed++
          errors.push(`${emp.full_name}: ${err instanceof Error ? err.message : 'Ошибка'}`)
        }
      }

      // Логируем импорт (не блокируем если таблица недоступна)
      try {
        await supabase.from('tender_imports').insert({
          import_type: 'employees',
          records_total: employees.length,
          records_success: success,
          records_failed: failed,
          errors: errors.length > 0 ? errors : null
        })
      } catch {
        console.warn('Could not log import')
      }

      return {
        success: failed === 0,
        records_total: employees.length,
        records_success: success,
        records_failed: failed,
        errors
      }
    } finally {
      setLoading(false)
      setPreview([])
    }
  }

  const clearPreview = () => setPreview([])

  return {
    loading,
    preview,
    parseFile,
    loadFromFotApi,
    importEmployees,
    clearPreview
  }
}

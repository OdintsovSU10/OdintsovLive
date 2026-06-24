import { useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { parseEmployeesExcel } from '../utils/excelParser'
import type { ParsedEmployee, ImportResult } from '../types'

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

  const importEmployees = async (employees: ParsedEmployee[]): Promise<ImportResult> => {
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
            // Собираем только изменённые поля
            const updates: Record<string, unknown> = {}

            if (emp.full_name !== existing.full_name) updates.full_name = emp.full_name
            if (emp.last_name !== existing.last_name) updates.last_name = emp.last_name
            if (emp.first_name !== existing.first_name) updates.first_name = emp.first_name
            if (emp.middle_name !== existing.middle_name) updates.middle_name = emp.middle_name
            if (emp.position !== existing.position) updates.position = emp.position
            if (emp.department !== existing.department) updates.department = emp.department
            if (emp.subdivision !== existing.subdivision) updates.subdivision = emp.subdivision
            if (emp.hire_date !== existing.hire_date) updates.hire_date = emp.hire_date
            if (emp.birth_date !== existing.birth_date) updates.birth_date = emp.birth_date
            if (emp.salary !== Number(existing.current_salary)) updates.current_salary = emp.salary
            if (emp.country !== existing.country) updates.country = emp.country
            if (emp.snils !== existing.snils) updates.snils = emp.snils
            if (emp.company !== existing.company) updates.company = emp.company
            if (emp.email !== existing.email) updates.email = emp.email
            if (emp.phone !== existing.phone) updates.phone = emp.phone

            // Обновляем только если есть изменения
            if (Object.keys(updates).length > 0) {
              const { error } = await supabase
                .from('tender_employees')
                .update(updates)
                .eq('id', existing.id)

              if (error) throw error
            }
          } else {
            // Создаём нового
            const { error } = await supabase
              .from('tender_employees')
              .insert({
                full_name: emp.full_name,
                last_name: emp.last_name,
                first_name: emp.first_name,
                middle_name: emp.middle_name,
                position: emp.position,
                department: emp.department,
                subdivision: emp.subdivision,
                hire_date: emp.hire_date,
                birth_date: emp.birth_date,
                current_salary: emp.salary,
                country: emp.country,
                snils: emp.snils,
                company: emp.company,
                email: emp.email,
                phone: emp.phone,
                is_archived: false
              })

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
    importEmployees,
    clearPreview
  }
}

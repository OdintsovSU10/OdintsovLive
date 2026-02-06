import { useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { parseSalaryHistoryExcel, extractLastName } from '../utils/excelParser'
import type { ParsedSalaryEntry, ImportResult } from '../types'

export function useSalaryHistoryImport() {
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<ParsedSalaryEntry[]>([])

  const parseFile = async (file: File): Promise<ParsedSalaryEntry[]> => {
    setLoading(true)
    try {
      const parsed = await parseSalaryHistoryExcel(file)
      setPreview(parsed)
      return parsed
    } finally {
      setLoading(false)
    }
  }

  const importSalaryHistory = async (entries: ParsedSalaryEntry[]): Promise<ImportResult> => {
    setLoading(true)
    const errors: string[] = []
    let success = 0
    let failed = 0

    try {
      // Загружаем всех сотрудников для маппинга
      const { data: employees } = await supabase
        .from('tender_employees')
        .select('id, full_name')

      if (!employees) {
        return {
          success: false,
          records_total: entries.length,
          records_success: 0,
          records_failed: entries.length,
          errors: ['Не удалось загрузить список сотрудников']
        }
      }

      // Создаём маппинг фамилия -> id
      const employeeMap = new Map<string, number>()
      for (const emp of employees) {
        const lastName = extractLastName(emp.full_name)
        employeeMap.set(lastName, emp.id)
      }

      for (const entry of entries) {
        try {
          const lastName = extractLastName(entry.employee_name)
          const employeeId = employeeMap.get(lastName)

          if (!employeeId) {
            failed++
            errors.push(`${entry.employee_name}: сотрудник не найден`)
            continue
          }

          // Проверяем, существует ли запись
          const { data: existing } = await supabase
            .from('tender_salary_history')
            .select('id, salary, note')
            .eq('employee_id', employeeId)
            .eq('effective_date', entry.effective_date)
            .maybeSingle()

          if (existing) {
            // Обновляем только если изменились данные
            if (existing.salary !== entry.salary || existing.note !== entry.note) {
              const { error } = await supabase
                .from('tender_salary_history')
                .update({ salary: entry.salary, note: entry.note })
                .eq('id', existing.id)
              if (error) throw error
            }
          } else {
            // Вставляем новую запись
            const { error } = await supabase
              .from('tender_salary_history')
              .insert({
                employee_id: employeeId,
                salary: entry.salary,
                effective_date: entry.effective_date,
                note: entry.note
              })
            if (error) throw error
          }
          success++
        } catch (err) {
          failed++
          errors.push(`${entry.employee_name}: ${err instanceof Error ? err.message : 'Ошибка'}`)
        }
      }

      // Логируем импорт
      try {
        await supabase.from('tender_imports').insert({
          import_type: 'salary_history',
          records_total: entries.length,
          records_success: success,
          records_failed: failed,
          errors: errors.length > 0 ? errors : null
        })
      } catch {
        console.warn('Could not log import')
      }

      return {
        success: failed === 0,
        records_total: entries.length,
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
    importSalaryHistory,
    clearPreview
  }
}

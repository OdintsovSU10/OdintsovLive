import { useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { parseTimesheetExcel, extractLastName } from '../utils/excelParser'
import { getWorkDaysNorm } from '../../../lib/workNorms'
import type { ParsedTimesheetRow, ImportResult, Employee } from '../types'

interface TimesheetPreview extends ParsedTimesheetRow {
  matched_employee_id: number | null
  matched_employee_name: string | null
}

export function useTimesheetImport() {
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<TimesheetPreview[]>([])
  const [period, setPeriod] = useState<{ year: number; month: number } | null>(null)

  const parseFile = async (file: File, employees: Employee[]): Promise<TimesheetPreview[]> => {
    setLoading(true)
    try {
      const parsed = await parseTimesheetExcel(file)

      // Сопоставляем с сотрудниками по фамилии
      const previewed: TimesheetPreview[] = parsed.map(row => {
        const rowLastName = extractLastName(row.employee_name)
        const matched = employees.find(emp => {
          const empLastName = extractLastName(emp.full_name)
          return empLastName === rowLastName
        })

        return {
          ...row,
          matched_employee_id: matched?.id || null,
          matched_employee_name: matched?.full_name || null
        }
      })

      // Определяем период из первой записи
      if (parsed.length > 0) {
        setPeriod({ year: parsed[0].year, month: parsed[0].month })
      }

      setPreview(previewed)
      return previewed
    } finally {
      setLoading(false)
    }
  }

  const importTimesheet = async (data: TimesheetPreview[]): Promise<ImportResult> => {
    setLoading(true)
    const errors: string[] = []
    let success = 0
    let failed = 0

    try {
      for (const row of data) {
        if (!row.matched_employee_id) {
          failed++
          errors.push(`${row.employee_name}: Сотрудник не найден`)
          continue
        }

        try {
          // Загружаем существующие записи за месяц
          const startDate = `${row.year}-${String(row.month).padStart(2, '0')}-01`
          const endDate = `${row.year}-${String(row.month).padStart(2, '0')}-${new Date(row.year, row.month, 0).getDate()}`

          const { data: existingRecords } = await supabase
            .from('tender_timesheet')
            .select('id, work_date, status, hours_worked, is_correction')
            .eq('employee_id', row.matched_employee_id)
            .gte('work_date', startDate)
            .lte('work_date', endDate)

          const existingMap = new Map(
            (existingRecords || []).map(r => [r.work_date, r])
          )

          const toInsert: Array<{
            employee_id: number
            work_date: string
            status: string
            hours_worked: number | null
            is_correction: boolean
          }> = []
          const toUpdate: Array<{ id: number; status: string; hours_worked: number | null; is_correction: boolean }> = []

          for (const day of row.days) {
            const workDate = `${row.year}-${String(row.month).padStart(2, '0')}-${String(day.day).padStart(2, '0')}`
            const existing = existingMap.get(workDate)

            if (existing) {
              // Обновляем только если данные изменились
              if (existing.status !== day.status || existing.hours_worked !== day.hours || existing.is_correction !== day.is_correction) {
                toUpdate.push({ id: existing.id, status: day.status, hours_worked: day.hours, is_correction: day.is_correction })
              }
            } else {
              toInsert.push({
                employee_id: row.matched_employee_id!,
                work_date: workDate,
                status: day.status,
                hours_worked: day.hours,
                is_correction: day.is_correction
              })
            }
          }

          // Batch insert новых записей
          if (toInsert.length > 0) {
            const { error } = await supabase.from('tender_timesheet').insert(toInsert)
            if (error) throw error
          }

          // Update изменённых записей
          for (const upd of toUpdate) {
            const { error } = await supabase
              .from('tender_timesheet')
              .update({ status: upd.status, hours_worked: upd.hours_worked, is_correction: upd.is_correction })
              .eq('id', upd.id)
            if (error) throw error
          }

          // Calculate and save stats
          let workDaysActual = 0
          let weekendWorkDays = 0
          let totalHours = 0

          for (const day of row.days) {
            const date = new Date(row.year, row.month - 1, day.day)
            const dayOfWeek = date.getDay()
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6

            if (day.status === 'work') {
              const hours = day.hours || 0
              if (isWeekend) {
                // Выходной засчитывается только если >= 3 часов
                if (hours >= 3) weekendWorkDays++
              } else {
                workDaysActual++
              }
              totalHours += hours
            } else if (day.status === 'remote') {
              const hours = day.hours || 8
              if (isWeekend) {
                // Удалёнка в выходной тоже считается рабочим выходным (>= 3ч)
                if (hours >= 3) weekendWorkDays++
              } else {
                workDaysActual++
              }
              totalHours += hours
            }
          }

          const workDaysNorm = getWorkDaysNorm(row.year, row.month - 1)

          await supabase
            .from('tender_timesheet_stats')
            .upsert({
              employee_id: row.matched_employee_id,
              year: row.year,
              month: row.month,
              work_days_actual: workDaysActual,
              work_days_norm: workDaysNorm,
              weekend_work_days: weekendWorkDays,
              total_hours: totalHours,
              updated_at: new Date().toISOString()
            }, { onConflict: 'employee_id,year,month' })

          success++
        } catch (err) {
          failed++
          errors.push(`${row.employee_name}: ${err instanceof Error ? err.message : 'Ошибка'}`)
        }
      }

      // Логируем импорт
      await supabase.from('tender_imports').insert({
        import_type: 'timesheet',
        year: period?.year,
        month: period?.month,
        records_total: data.length,
        records_success: success,
        records_failed: failed,
        errors: errors.length > 0 ? errors : null
      })

      return {
        success: failed === 0,
        records_total: data.length,
        records_success: success,
        records_failed: failed,
        errors
      }
    } finally {
      setLoading(false)
      setPreview([])
      setPeriod(null)
    }
  }

  const clearPreview = () => {
    setPreview([])
    setPeriod(null)
  }

  return {
    loading,
    preview,
    period,
    parseFile,
    importTimesheet,
    clearPreview
  }
}

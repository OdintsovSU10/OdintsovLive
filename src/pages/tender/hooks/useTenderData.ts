import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import { getRemoteFullDayHours, isWeekendOrHoliday, roundTimesheetHours } from '../utils/salaryCalculator'
import type { Employee, SalaryHistory, TimesheetEntry, AttendanceStats, EmployeeWithStats, HistoryItem } from '../types'

const getAvatar = (fullName: string): string => {
  const parts = fullName.trim().split(' ')
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return fullName.slice(0, 2).toUpperCase()
}

const mapTimesheetToUiStatus = (status: string | null): 'active' | 'vacation' | 'sick' | 'remote' => {
  if (!status) return 'active'
  const map: Record<string, 'active' | 'vacation' | 'sick' | 'remote'> = {
    work: 'active',
    vacation: 'vacation',
    dayoff: 'vacation',
    remote: 'remote',
    sick: 'sick',
    absent: 'sick',
    unpaid: 'sick',
    educational_leave: 'vacation',
    sick_worked: 'active'
  }
  return map[status] || 'active'
}

export function useTenderData() {
  const [employees, setEmployees] = useState<EmployeeWithStats[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)

  const loadEmployees = useCallback(async (year?: number, month?: number, showArchived = false, silent = false) => {
    if (!silent) {
      setLoading(true)
      setError(null)
    }

    const targetYear = year ?? selectedYear
    const targetMonth = month ?? selectedMonth

    try {
      const { data: employeesData, error: empError } = await supabase
        .from('tender_employees')
        .select('*')
        .eq('is_archived', showArchived)
        .order('full_name')

      if (empError) throw empError
      if (!employeesData) {
        setEmployees([])
        return
      }

      const employeeIds = employeesData.map(e => e.id)

      const { data: salaryData } = await supabase
        .from('tender_salary_history')
        .select('*')
        .in('employee_id', employeeIds)
        .order('effective_date', { ascending: false })

      const startOfMonth = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`
      const daysInMonth = new Date(targetYear, targetMonth, 0).getDate()
      const endOfMonth = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${daysInMonth}`

      const { data: timesheetData } = await supabase
        .from('tender_timesheet')
        .select('*')
        .in('employee_id', employeeIds)
        .gte('work_date', startOfMonth)
        .lte('work_date', endOfMonth)

      const roundedTimesheetData = (timesheetData || []).map(entry => ({
        ...entry,
        hours_worked: entry.hours_worked == null ? null : roundTimesheetHours(entry.hours_worked)
      }))

      const latestStatusMap = new Map<number, string>()
      roundedTimesheetData.forEach(t => {
        const existing = latestStatusMap.get(t.employee_id)
        if (!existing || t.work_date > existing) {
          latestStatusMap.set(t.employee_id, t.status)
        }
      })

      const salaryByEmployee = new Map<number, SalaryHistory[]>()
      salaryData?.forEach(s => {
        const list = salaryByEmployee.get(s.employee_id) || []
        list.push(s)
        salaryByEmployee.set(s.employee_id, list)
      })

      const timesheetByEmployee = new Map<number, TimesheetEntry[]>()
      roundedTimesheetData.forEach(t => {
        const list = timesheetByEmployee.get(t.employee_id) || []
        list.push(t)
        timesheetByEmployee.set(t.employee_id, list)
      })

      const enriched: EmployeeWithStats[] = employeesData.map((emp: Employee) => {
        const timesheet = timesheetByEmployee.get(emp.id) || []
        const salaries = salaryByEmployee.get(emp.id) || []

        // Проверка выходного/праздничного дня
        const isHoliday = (dateStr: string) => {
          const date = new Date(dateStr + 'T12:00:00')
          return isWeekendOrHoliday(date)
        }

        // Подсчёт по категориям напрямую из табеля
        const workWeekday = timesheet.filter(t =>
          (t.status === 'work' || t.status === 'sick_worked') && !isHoliday(t.work_date)
        ).length
        const remoteWeekday = timesheet.filter(t => t.status === 'remote' && !isHoliday(t.work_date)).length
        const weekendWork = timesheet.filter(t =>
          (t.status === 'work' || t.status === 'remote' || t.status === 'sick_worked') && isHoliday(t.work_date)
        ).length

        const attendance: AttendanceStats = {
          work: timesheet.filter(t => t.status === 'work' || t.status === 'sick_worked').length,
          remote: timesheet.filter(t => t.status === 'remote').length,
          vacation: timesheet.filter(t => t.status === 'vacation' || t.status === 'educational_leave').length,
          dayoff: timesheet.filter(t => t.status === 'dayoff').length,
          absent: timesheet.filter(t => t.status === 'absent' || t.status === 'unpaid' || t.status === 'sick').length,
          work_weekday: workWeekday,
          remote_weekday: remoteWeekday,
          weekend_work: weekendWork,
          total_hours: timesheet.reduce((sum, t) => {
            if (t.status !== 'remote') return sum + (t.hours_worked || 0)
            return sum + getRemoteFullDayHours(t.hours_worked, new Date(`${t.work_date}T12:00:00`))
          }, 0)
        }

        // Формируем историю изменений оклада с разницей и сроком
        const salaryHistory: HistoryItem[] = salaries.slice(1).map((s, i) => {
          const prevSalary = salaries[i] // предыдущий (более новый) оклад
          const diff = prevSalary.salary - s.salary
          const diffStr = diff > 0 ? `+${diff.toLocaleString('ru-RU')}` : diff.toLocaleString('ru-RU')

          // Вычисляем срок между изменениями
          const prevDate = new Date(prevSalary.effective_date)
          const currDate = new Date(s.effective_date)
          const months = (prevDate.getFullYear() - currDate.getFullYear()) * 12 + (prevDate.getMonth() - currDate.getMonth())
          const periodStr = months >= 12
            ? `${Math.floor(months / 12)} г. ${months % 12 ? (months % 12) + ' мес.' : ''}`.trim()
            : `${months} мес.`

          return {
            date: prevSalary.effective_date,
            type: 'salary_change' as const,
            desc: `${prevSalary.salary.toLocaleString('ru-RU')} ₽ (${diffStr} ₽, через ${periodStr})`
          }
        })

        const history: HistoryItem[] = [
          {
            date: emp.hire_date,
            type: 'hire' as const,
            desc: `Принят на должность ${emp.position}`
          },
          ...salaryHistory
        ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

        return {
          ...emp,
          avatar: getAvatar(emp.full_name),
          uiStatus: mapTimesheetToUiStatus(latestStatusMap.get(emp.id) || null),
          attendance,
          history,
          timesheet,
          salaryHistory: salaries
        }
      })

      setEmployees(enriched)
    } catch (err) {
      console.error('Error loading employees:', err)
      if (!silent) {
        setError(err instanceof Error ? err.message : 'Ошибка загрузки данных')
      }
    } finally {
      if (!silent) {
        setLoading(false)
      }
    }
  }, [selectedYear, selectedMonth])

  const getMonthlyAttendance = useCallback(async (months = 6) => {
    const result: { month: string; present: number; absent: number; late: number; remote: number }[] = []

    for (let i = months - 1; i >= 0; i--) {
      const date = new Date()
      date.setMonth(date.getMonth() - i)
      const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1).toISOString().split('T')[0]
      const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).toISOString().split('T')[0]

      const { data } = await supabase
        .from('tender_timesheet')
        .select('status')
        .gte('work_date', startOfMonth)
        .lte('work_date', endOfMonth)

      const monthName = date.toLocaleDateString('ru-RU', { month: 'short' }).replace('.', '')

      result.push({
        month: monthName.charAt(0).toUpperCase() + monthName.slice(1),
        present: data?.filter(d => d.status === 'work' || d.status === 'sick_worked').length || 0,
        remote: data?.filter(d => d.status === 'remote').length || 0,
        late: 0,
        absent: data?.filter(d => d.status === 'absent' || d.status === 'unpaid' || d.status === 'sick').length || 0
      })
    }

    return result
  }, [])

  const setMonth = useCallback((year: number, month: number) => {
    setSelectedYear(year)
    setSelectedMonth(month)
  }, [])

  const clearAllEmployees = useCallback(async () => {
    setLoading(true)
    try {
      // Удаляем табель (cascade должен сработать, но на всякий случай)
      await supabase.from('tender_timesheet').delete().neq('id', 0)
      // Удаляем историю зарплат
      await supabase.from('tender_salary_history').delete().neq('id', 0)
      // Удаляем сотрудников
      const { error } = await supabase.from('tender_employees').delete().neq('id', 0)
      if (error) throw error
      setEmployees([])
    } catch (err) {
      console.error('Error clearing employees:', err)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadEmployees()
  }, [loadEmployees])

  useEffect(() => {
    const now = new Date()
    const isCurrentMonth = selectedYear === now.getFullYear() && selectedMonth === now.getMonth() + 1
    if (!isCurrentMonth) return undefined

    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadEmployees(selectedYear, selectedMonth, false, true)
      }
    }, 30_000)

    return () => window.clearInterval(interval)
  }, [loadEmployees, selectedMonth, selectedYear])

  return {
    employees,
    loading,
    error,
    selectedYear,
    selectedMonth,
    setMonth,
    loadEmployees,
    getMonthlyAttendance,
    clearAllEmployees
  }
}

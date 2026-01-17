import { useState, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import * as XLSX from 'xlsx'
import { Employee, ImportPreview, SalaryHistory } from '../types'

export function useTenderData() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [salaryHistory, setSalaryHistory] = useState<{ [key: number]: SalaryHistory[] }>({})
  const [loading, setLoading] = useState(true)

  const loadEmployees = useCallback(async (showArchived: boolean) => {
    setLoading(true)
    const { data } = await supabase
      .from('tender_employees')
      .select('*')
      .eq('is_archived', showArchived)
      .order('full_name')

    if (data) {
      setEmployees(data)
      const ids = data.map(e => e.id)
      if (ids.length > 0) {
        const { data: history } = await supabase
          .from('tender_salary_history')
          .select('*')
          .in('employee_id', ids)
          .order('effective_date', { ascending: false })

        if (history) {
          const grouped: { [key: number]: SalaryHistory[] } = {}
          history.forEach(h => {
            if (!grouped[h.employee_id]) grouped[h.employee_id] = []
            grouped[h.employee_id].push(h)
          })
          setSalaryHistory(grouped)
        }
      }
    }
    setLoading(false)
  }, [])

  const addEmployee = async (
    formName: string,
    formPosition: string,
    formHireDate: string,
    formSalary: string
  ) => {
    const salary = parseFloat(formSalary.replace(/\s/g, '')) || 0
    const today = new Date().toISOString().split('T')[0]
    const { data, error } = await supabase
      .from('tender_employees')
      .insert({
        full_name: formName,
        position: formPosition,
        hire_date: formHireDate,
        current_salary: salary
      })
      .select()
      .single()

    if (!error && data) {
      await supabase.from('tender_salary_history').insert({
        employee_id: data.id,
        salary: salary,
        effective_date: today,
        note: 'Текущий оклад'
      })
      return true
    }
    return false
  }

  const archiveEmployee = async (employeeId: number) => {
    await supabase
      .from('tender_employees')
      .update({
        is_archived: true,
        archived_at: new Date().toISOString()
      })
      .eq('id', employeeId)
  }

  const restoreEmployee = async (employeeId: number) => {
    await supabase
      .from('tender_employees')
      .update({
        is_archived: false,
        archived_at: null
      })
      .eq('id', employeeId)
  }

  const massArchive = async (ids: number[]) => {
    await supabase
      .from('tender_employees')
      .update({ is_archived: true, archived_at: new Date().toISOString() })
      .in('id', ids)
  }

  const saveEditedEmployees = async (editedEmployees: { [id: number]: { full_name?: string; position?: string } }) => {
    const entries = Object.entries(editedEmployees)
    for (const [idStr, changes] of entries) {
      const id = parseInt(idStr)
      if (Object.keys(changes).length > 0) {
        await supabase
          .from('tender_employees')
          .update({ ...changes, updated_at: new Date().toISOString() })
          .eq('id', id)
      }
    }
  }

  const addRaise = async (
    employee: Employee,
    raiseAmount: string,
    raiseDate: string,
    raiseNote: string
  ) => {
    const raiseSum = parseFloat(raiseAmount.replace(/\s/g, '')) || 0
    const today = new Date().toISOString().split('T')[0]
    const isHistory = raiseDate < today

    let newSalary: number
    const history = salaryHistory[employee.id] || []

    if (isHistory) {
      const entriesAfter = history.filter(h => h.effective_date > raiseDate)
      if (entriesAfter.length > 0) {
        const nextEntry = entriesAfter[entriesAfter.length - 1]
        newSalary = nextEntry.salary - raiseSum
      } else {
        newSalary = employee.current_salary - raiseSum
      }

      const olderEntries = history.filter(h => h.effective_date < raiseDate)
      for (const entry of olderEntries) {
        await supabase
          .from('tender_salary_history')
          .update({ salary: entry.salary - raiseSum })
          .eq('id', entry.id)
      }
    } else {
      newSalary = employee.current_salary + raiseSum
    }

    await supabase.from('tender_salary_history').insert({
      employee_id: employee.id,
      salary: newSalary,
      effective_date: raiseDate,
      note: raiseNote || null
    })

    if (!isHistory) {
      await supabase
        .from('tender_employees')
        .update({
          current_salary: newSalary,
          updated_at: new Date().toISOString()
        })
        .eq('id', employee.id)
    }
  }

  const deleteRaise = async (historyId: number, employeeId: number) => {
    await supabase.from('tender_salary_history').delete().eq('id', historyId)

    const { data: remaining } = await supabase
      .from('tender_salary_history')
      .select('salary')
      .eq('employee_id', employeeId)
      .order('effective_date', { ascending: false })
      .limit(1)
      .single()

    if (remaining) {
      await supabase
        .from('tender_employees')
        .update({ current_salary: remaining.salary })
        .eq('id', employeeId)
    }
  }

  const parseExcelDate = (raw: unknown): string | null => {
    if (!raw) return null
    if (typeof raw === 'number') {
      const date = XLSX.SSF.parse_date_code(raw)
      return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`
    }
    return String(raw)
  }

  const parseImportFile = (file: File): Promise<ImportPreview[]> => {
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = (evt) => {
        const data = evt.target?.result
        const workbook = XLSX.read(data, { type: 'binary' })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 })

        const dataRows = rows.filter((row: any[], i: number) => i > 0 && row.length >= 4)
        const preview: ImportPreview[] = []

        for (const row of dataRows) {
          const [name, position, hireDateRaw, salaryRaw, birthDateRaw, groupRaw] = row as unknown[]
          if (!name) continue

          const hireDate = parseExcelDate(hireDateRaw)
          const birthDate = parseExcelDate(birthDateRaw)
          const salary = typeof salaryRaw === 'number' ? salaryRaw : parseFloat(String(salaryRaw).replace(/\s/g, '')) || 0
          const groupName = groupRaw ? String(groupRaw).trim() : null

          preview.push({
            full_name: String(name).trim(),
            position: String(position).trim(),
            hire_date: hireDate || '',
            birth_date: birthDate,
            salary,
            group_name: groupName
          })
        }

        resolve(preview)
      }
      reader.readAsBinaryString(file)
    })
  }

  const confirmImport = async (importPreview: ImportPreview[], replaceOnImport: boolean) => {
    const today = new Date().toISOString().split('T')[0]

    if (replaceOnImport) {
      await supabase.from('tender_salary_history').delete().neq('id', 0)
      await supabase.from('tender_employees').delete().neq('id', 0)
    }

    for (const item of importPreview) {
      const { data: emp } = await supabase
        .from('tender_employees')
        .insert({
          full_name: item.full_name,
          position: item.position,
          hire_date: item.hire_date,
          birth_date: item.birth_date,
          group_name: item.group_name,
          current_salary: item.salary
        })
        .select()
        .single()

      if (emp) {
        await supabase.from('tender_salary_history').insert({
          employee_id: emp.id,
          salary: item.salary,
          effective_date: today,
          note: 'Текущий оклад (импорт)'
        })
      }
    }
  }

  return {
    employees,
    salaryHistory,
    loading,
    loadEmployees,
    addEmployee,
    archiveEmployee,
    restoreEmployee,
    massArchive,
    saveEditedEmployees,
    addRaise,
    deleteRaise,
    parseImportFile,
    confirmImport
  }
}

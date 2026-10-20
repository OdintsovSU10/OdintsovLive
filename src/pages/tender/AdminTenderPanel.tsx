import { useState, useEffect, useMemo, useRef, Fragment, type CSSProperties } from 'react'
import { Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useOverlayClose } from '../../hooks/useOverlayClose'
import { formatRuPhone } from '../../lib/formatUtils'
import { useTenderData } from './hooks/useTenderData'
import { ImportEmployeesModal } from './components/ImportEmployeesModal'
import { ImportSalaryHistoryModal } from './components/ImportSalaryHistoryModal'
import { QuickAddEmployee } from './components/QuickAddEmployee'
import { EmployeeDetail } from './components/EmployeeDetail'
import { AddEmployeeModal } from './components/AddEmployeeModal'
import { EmployeeModal } from './components/EmployeeModal'
import type { Employee, EmployeeWithStats, NewEmployee, TenderEmployeeEvent, TenderSubdivision } from './types'
import { syncFotTimesheetMonth } from './utils/fotTimesheetSync'
import {
  formatMonthsSinceRaise,
  getEmployeeTenureMonths,
  getMonthsSinceLastRaise,
  getDurationHighlightColor,
  getNoRaiseColor
} from './utils/tenderPresentation'
import { getEffectiveSalaryForDate, getTodayIsoDate, normalizeSubdivisionName, type EditableEmployee } from './utils/adminTenderHelpers'
import './TenderPage.css'
import './AdminTenderPanel.css'

export type AdminTab = 'employees' | 'subdivisions' | 'archive' | 'settings'

interface ToastAction {
  label: string
  onClick: () => void
}

// Причина для архивации корзиной в строке — без диалога
const QUICK_ARCHIVE_REASON = 'Уволился'
const UNDO_TOAST_DURATION_MS = 6000

interface TimesheetSummary {
  year: number
  month: number
  records_count: number
  employees_count: number
}

interface ArchivedEmployeeRow {
  employee: Employee
  archiveReason: string | null
}

const monthNames = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
]

const SUBDIVISION_ORDER = [
  'Руководитель',
  'Ведущий',
  'Секретариат',
  'Общестрой',
  'Фасады',
  'Отделка',
  'ВИС электрика',
  'ВИС механика',
  'Юр отдел'
]

const SUBDIVISION_ACCENTS = [
  '#818cf8',
  '#38bdf8',
  '#22d3ee',
  '#14b8a6',
  '#a78bfa',
  '#60a5fa',
  '#34d399'
]

function getSubdivisionOrder(subdiv: string | null): number {
  if (!subdiv) return 999
  const lower = subdiv.toLowerCase()
  const idx = SUBDIVISION_ORDER.findIndex(s => lower.includes(s.toLowerCase()))
  return idx >= 0 ? idx : 999
}

function hashText(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i++) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

function getSubdivisionAccent(name: string): string {
  return SUBDIVISION_ACCENTS[hashText(name) % SUBDIVISION_ACCENTS.length]
}

function formatDateTime(value: string | null): string {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return parsed.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function isMissingRpcError(
  error: { code?: string; message?: string | null; details?: string | null } | null,
  status?: number | null
): boolean {
  if (status === 404) return true
  if (!error) return false
  if (error.code === 'PGRST202') return true
  const combined = `${error.message || ''} ${error.details || ''}`.toLowerCase()
  return combined.includes('could not find the function') || combined.includes('schema cache')
}

function isMissingRelationError(
  error: { code?: string; message?: string | null; details?: string | null; hint?: string | null } | null,
  status?: number | null
): boolean {
  if (status === 404) return true
  if (!error) return false
  if (error.code === '42P01' || error.code === 'PGRST205') return true
  const combined = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`.toLowerCase()
  return combined.includes('does not exist') || combined.includes('could not find the table') || combined.includes('not found')
}

function isMissingEmployeeEventsTableError(
  error: { code?: string; message?: string | null; details?: string | null; hint?: string | null } | null,
  status?: number | null
): boolean {
  if (!isMissingRelationError(error, status)) return false
  if (status === 404) return true
  const combined = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase()
  return combined.includes('tender_employee_events')
}

export default function AdminTenderPanel({ tab }: { tab: AdminTab }) {
  const { employees, loading, loadEmployees, clearAllEmployees, selectedYear, selectedMonth } = useTenderData()
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeWithStats | null>(null)
  const [showImportEmployees, setShowImportEmployees] = useState(false)
  const [showImportSalaryHistory, setShowImportSalaryHistory] = useState(false)
  const [showConfirmClearSalaryHistory, setShowConfirmClearSalaryHistory] = useState(false)
  const [showConfirmClear, setShowConfirmClear] = useState(false)
  const [clearingSalaryHistory, setClearingSalaryHistory] = useState(false)
  const [showAddEmployee, setShowAddEmployee] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState<EditableEmployee | null>(null)
  const [toast, setToast] = useState<{ message: string; isError: boolean; action?: ToastAction } | null>(null)
  const toastTimerRef = useRef<number | null>(null)
  const [archivingIds, setArchivingIds] = useState<Set<number>>(() => new Set())
  const [search, setSearch] = useState('')
  const [timesheetSummary, setTimesheetSummary] = useState<TimesheetSummary[]>([])
  const [loadingTimesheet, setLoadingTimesheet] = useState(false)
  const [timesheetYear, setTimesheetYear] = useState<number | null>(null)
  const [timesheetSyncYear, setTimesheetSyncYear] = useState(new Date().getFullYear())
  const [timesheetSyncMonth, setTimesheetSyncMonth] = useState(new Date().getMonth() + 1)
  const [syncingTimesheet, setSyncingTimesheet] = useState(false)
  const [subdivisions, setSubdivisions] = useState<TenderSubdivision[]>([])
  const [newSubdivisionName, setNewSubdivisionName] = useState('')
  const [savingSubdivision, setSavingSubdivision] = useState(false)
  const [archivedEmployees, setArchivedEmployees] = useState<ArchivedEmployeeRow[]>([])
  const [loadingArchived, setLoadingArchived] = useState(false)
  const employeeEventsTableAvailableRef = useRef<boolean | null>(null)
  const employeeArchiveRpcAvailableRef = useRef<boolean | null>(null)

  const subdivisionNames = useMemo(
    () => subdivisions
      .map(item => item.name.trim())
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right, 'ru-RU')),
    [subdivisions]
  )

  const loadSubdivisions = async () => {
    const { data, error } = await supabase
      .from('tender_subdivisions')
      .select('*')
      .order('name', { ascending: true })

    if (error) {
      console.error('Error loading subdivisions:', error)
      return
    }

    const byNormalizedName = new Map<string, TenderSubdivision>()
    ;((data || []) as TenderSubdivision[]).forEach(item => {
      const normalized = normalizeSubdivisionName(item.name)
      if (!normalized) return
      if (!byNormalizedName.has(normalized)) {
        byNormalizedName.set(normalized, item)
      }
    })

    const { data: employeeSubdivisionData } = await supabase
      .from('tender_employees')
      .select('subdivision')
      .not('subdivision', 'is', null)

    ;((employeeSubdivisionData || []) as Array<{ subdivision: string | null }>).forEach((row, index) => {
      const name = row.subdivision?.trim() || ''
      const normalized = normalizeSubdivisionName(name)
      if (!normalized || byNormalizedName.has(normalized)) return
      byNormalizedName.set(normalized, {
        id: -(index + 1),
        name,
        created_at: ''
      })
    })

    const merged = Array.from(byNormalizedName.values())
      .sort((left, right) => left.name.localeCompare(right.name, 'ru-RU'))

    setSubdivisions(merged)
  }

  const loadArchivedEmployees = async () => {
    setLoadingArchived(true)
    try {
      const { data: archivedData, error: archivedError } = await supabase
        .from('tender_employees')
        .select('*')
        .eq('is_archived', true)
        .order('full_name', { ascending: true })

      if (archivedError) throw archivedError

      const archivedList = (archivedData || []) as Employee[]
      if (archivedList.length === 0) {
        setArchivedEmployees([])
        return
      }

      if (employeeEventsTableAvailableRef.current === false) {
        setArchivedEmployees(
          archivedList.map(employee => ({
            employee,
            archiveReason: null
          }))
        )
        return
      }

      const employeeIds = archivedList.map(employee => employee.id)
      const { data: eventsData, error: eventsError, status: eventsStatus } = await supabase
        .from('tender_employee_events')
        .select('*')
        .eq('event_type', 'archive')
        .in('employee_id', employeeIds)
        .order('event_date', { ascending: false })
        .order('created_at', { ascending: false })

      const latestArchiveReasonByEmployee = new Map<number, string | null>()
      if (eventsError) {
        if (!isMissingEmployeeEventsTableError(eventsError, eventsStatus)) {
          throw eventsError
        }
        employeeEventsTableAvailableRef.current = false
      } else {
        employeeEventsTableAvailableRef.current = true
        ;((eventsData || []) as TenderEmployeeEvent[]).forEach(event => {
          if (!latestArchiveReasonByEmployee.has(event.employee_id)) {
            latestArchiveReasonByEmployee.set(event.employee_id, event.note || null)
          }
        })
      }

      setArchivedEmployees(
        archivedList.map(employee => ({
          employee,
          archiveReason: latestArchiveReasonByEmployee.get(employee.id) || null
        }))
      )
    } catch (err) {
      console.error('Error loading archived employees:', err)
      setArchivedEmployees([])
    } finally {
      setLoadingArchived(false)
    }
  }

  const loadTimesheetSummary = async () => {
    setLoadingTimesheet(true)
    try {
      const { data: activeEmployees, error: activeEmployeesError } = await supabase
        .from('tender_employees')
        .select('id')
        .eq('is_archived', false)

      if (activeEmployeesError) throw activeEmployeesError

      const activeEmployeeIds = (activeEmployees || []).map(item => item.id)
      if (activeEmployeeIds.length === 0) {
        setTimesheetSummary([])
        setTimesheetYear(prev => prev ?? new Date().getFullYear())
        return
      }

      const { data, error } = await supabase
        .from('tender_timesheet')
        .select('employee_id, work_date')
        .in('employee_id', activeEmployeeIds)

      if (error) throw error

      const summary: Record<string, { year: number; month: number; records: number; employees: Set<number> }> = {}
      for (const row of data || []) {
        const date = new Date(row.work_date)
        const year = date.getFullYear()
        const month = date.getMonth() + 1
        const key = `${year}-${month}`
        if (!summary[key]) {
          summary[key] = { year, month, records: 0, employees: new Set() }
        }
        summary[key].records++
        summary[key].employees.add(row.employee_id)
      }
      const result: TimesheetSummary[] = Object.values(summary)
        .map(s => ({
          year: s.year,
          month: s.month,
          records_count: s.records,
          employees_count: s.employees.size
        }))

      setTimesheetSummary(result)
      if (result.length > 0) {
        const latestYear = Math.max(...result.map(item => item.year))
        setTimesheetYear(prev => prev ?? latestYear)
      } else {
        setTimesheetYear(prev => prev ?? new Date().getFullYear())
      }
    } catch (err) {
      console.error('Error loading timesheet summary:', err)
      setTimesheetSummary([])
      setTimesheetYear(prev => prev ?? new Date().getFullYear())
    } finally {
      setLoadingTimesheet(false)
    }
  }

  // После правок список перечитывается тихо: спиннер на всю страницу размонтировал бы таблицу и открытую форму
  const reloadEmployees = () => loadEmployees(undefined, undefined, false, true)

  // Сотрудников при открытии грузит сам useTenderData
  const refreshAdminData = async () => {
    await Promise.all([loadSubdivisions(), loadTimesheetSummary()])
    await loadArchivedEmployees()
  }

  useEffect(() => {
    refreshAdminData()
  }, [])

  useEffect(() => {
    if (tab === 'archive') {
      loadArchivedEmployees()
    }
  }, [tab])

  // Открытая карточка сотрудника закрывается при смене вкладки
  useEffect(() => {
    setSelectedEmployee(null)
  }, [tab])

  const getMonthStatus = (month: number) => {
    if (!timesheetYear) return undefined
    return timesheetSummary.find(s => s.year === timesheetYear && s.month === month)
  }

  const displayYear = timesheetYear ?? new Date().getFullYear()

  const showToast = (message: string, isError = false, action?: ToastAction) => {
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current)
    setToast({ message, isError, action })
    const duration = action ? UNDO_TOAST_DURATION_MS : isError ? 7000 : 3000
    toastTimerRef.current = window.setTimeout(() => setToast(null), duration)
  }

  const hideToast = () => {
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current)
    toastTimerRef.current = null
    setToast(null)
  }

  const handleToastAction = () => {
    const action = toast?.action
    hideToast()
    action?.onClick()
  }

  useEffect(() => () => {
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current)
  }, [])

  const handleSyncTimesheetPeriod = async (year: number, month: number) => {
    setSyncingTimesheet(true)
    try {
      const result = await syncFotTimesheetMonth(year, month, employees)
      await Promise.all([loadEmployees(year, month, false, true), loadTimesheetSummary()])
      setTimesheetYear(year)
      showToast(`FOT табель: ${result.matched} строк, ${result.failed} ошибок`)
    } catch (err) {
      console.error('Error syncing FOT timesheet:', err)
      showToast(err instanceof Error ? err.message : 'Ошибка синхронизации FOT', true)
    } finally {
      setSyncingTimesheet(false)
    }
  }

  const handleAddSubdivision = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = newSubdivisionName.trim()
    if (!name) {
      showToast('Введите название подразделения')
      return
    }

    const normalized = normalizeSubdivisionName(name)
    const exists = subdivisions.some(item => normalizeSubdivisionName(item.name) === normalized)
    if (exists) {
      showToast('Такое подразделение уже существует')
      return
    }

    setSavingSubdivision(true)
    try {
      const { error } = await supabase.from('tender_subdivisions').insert({ name })
      if (error) throw error
      setNewSubdivisionName('')
      await loadSubdivisions()
      showToast('Подразделение добавлено')
    } catch (err) {
      console.error('Error adding subdivision:', err)
      showToast('Ошибка при добавлении подразделения')
    } finally {
      setSavingSubdivision(false)
    }
  }

  const handleEditEmployee = (emp: EmployeeWithStats) => {
    const effectiveSalary = getEffectiveSalaryForDate(
      emp.salaryHistory || [],
      emp.current_salary,
      getTodayIsoDate()
    )

    setEditingEmployee({
      id: emp.id,
      full_name: emp.full_name,
      last_name: emp.last_name || '',
      first_name: emp.first_name || '',
      middle_name: emp.middle_name || '',
      position: emp.position,
      department: emp.department || '',
      subdivision: emp.subdivision || '',
      current_salary: effectiveSalary,
      monthly_bonus: emp.monthly_bonus || 0,
      hire_date: emp.hire_date,
      birth_date: emp.birth_date || '',
      email: emp.email || '',
      phone: emp.phone || '',
      snils: emp.snils || '',
      company: emp.company || '',
      country: emp.country || ''
    })
  }

  const handleSaveEmployee = async (emp: EditableEmployee) => {
    try {
      const { error } = await supabase
        .from('tender_employees')
        .update({
          full_name: emp.full_name,
          last_name: emp.last_name || null,
          first_name: emp.first_name || null,
          middle_name: emp.middle_name || null,
          position: emp.position,
          department: emp.department || null,
          subdivision: emp.subdivision || null,
          current_salary: emp.current_salary,
          monthly_bonus: emp.monthly_bonus || 0,
          hire_date: emp.hire_date,
          birth_date: emp.birth_date || null,
          email: emp.email || null,
          phone: emp.phone || null,
          snils: emp.snils || null,
          company: emp.company || null,
          country: emp.country || null
        })
        .eq('id', emp.id)

      if (error) throw error

      setEditingEmployee(null)
      await reloadEmployees()
      showToast('Сотрудник обновлён')
    } catch {
      showToast('Ошибка при сохранении')
    }
  }

  const handleAddEmployee = async (emp: NewEmployee): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('tender_employees')
        .insert({
          full_name: emp.full_name,
          last_name: emp.last_name || null,
          first_name: emp.first_name || null,
          middle_name: emp.middle_name || null,
          position: emp.position,
          department: emp.department || null,
          subdivision: emp.subdivision || null,
          current_salary: emp.current_salary,
          monthly_bonus: emp.monthly_bonus || 0,
          hire_date: emp.hire_date,
          company: emp.company || null
        })

      if (error) throw error

      setShowAddEmployee(false)
      await reloadEmployees()
      showToast('Сотрудник добавлен')
      return true
    } catch (err) {
      showToast('Ошибка при добавлении')
      return false
    }
  }

  const handleClearSalaryHistory = async () => {
    setClearingSalaryHistory(true)
    try {
      const { error } = await supabase
        .from('tender_salary_history')
        .delete()
        .neq('id', 0)

      if (error) throw error

      await reloadEmployees()
      setShowConfirmClearSalaryHistory(false)
      showToast('История повышений очищена')
    } catch (err) {
      console.error('Error clearing salary history:', err)
      showToast('Ошибка при очистке истории повышений')
    } finally {
      setClearingSalaryHistory(false)
    }
  }

  const archiveEmployeeWithoutRpc = async (id: number, reason: string) => {
    const nowIso = new Date().toISOString()
    const eventDate = nowIso.slice(0, 10)

    const { data: previousState, error: previousStateError } = await supabase
      .from('tender_employees')
      .select('is_archived, archived_at')
      .eq('id', id)
      .single()
    if (previousStateError) throw previousStateError

    const { error: updateError } = await supabase
      .from('tender_employees')
      .update({ is_archived: true, archived_at: nowIso })
      .eq('id', id)
    if (updateError) throw updateError

    if (employeeEventsTableAvailableRef.current === false) {
      return
    }

    const { error: eventError, status: eventStatus } = await supabase
      .from('tender_employee_events')
      .insert({
        employee_id: id,
        event_type: 'archive',
        event_date: eventDate,
        note: reason
      })

    if (eventError) {
      if (isMissingEmployeeEventsTableError(eventError, eventStatus)) {
        employeeEventsTableAvailableRef.current = false
        return
      }
      await supabase
        .from('tender_employees')
        .update({
          is_archived: previousState.is_archived,
          archived_at: previousState.archived_at
        })
        .eq('id', id)
      throw eventError
    }

    employeeEventsTableAvailableRef.current = true
  }

  const restoreEmployeeWithoutRpc = async (id: number) => {
    const eventDate = new Date().toISOString().slice(0, 10)
    const restoreNote = 'Возвращён из архива'

    const { data: previousState, error: previousStateError } = await supabase
      .from('tender_employees')
      .select('is_archived, archived_at')
      .eq('id', id)
      .single()
    if (previousStateError) throw previousStateError

    const { error: updateError } = await supabase
      .from('tender_employees')
      .update({ is_archived: false, archived_at: null })
      .eq('id', id)
    if (updateError) throw updateError

    if (employeeEventsTableAvailableRef.current === false) {
      return
    }

    const { error: eventError, status: eventStatus } = await supabase
      .from('tender_employee_events')
      .insert({
        employee_id: id,
        event_type: 'unarchive',
        event_date: eventDate,
        note: restoreNote
      })

    if (eventError) {
      if (isMissingEmployeeEventsTableError(eventError, eventStatus)) {
        employeeEventsTableAvailableRef.current = false
        return
      }
      await supabase
        .from('tender_employees')
        .update({
          is_archived: previousState.is_archived,
          archived_at: previousState.archived_at
        })
        .eq('id', id)
      throw eventError
    }

    employeeEventsTableAvailableRef.current = true
  }

  // undoName — архивация корзиной: тост с ФИО и кнопкой «Отменить»
  const handleArchiveEmployee = async (id: number, reason: string, undoName?: string) => {
    try {
      if (employeeArchiveRpcAvailableRef.current === false) {
        await archiveEmployeeWithoutRpc(id, reason)
      } else {
        const rpcResponse = await supabase.rpc('archive_tender_employee', {
          p_employee_id: id,
          p_reason: reason
        })
        if (rpcResponse.error || rpcResponse.status === 404) {
          if (isMissingRpcError(rpcResponse.error, rpcResponse.status)) {
            employeeArchiveRpcAvailableRef.current = false
            await archiveEmployeeWithoutRpc(id, reason)
          } else {
            throw rpcResponse.error || new Error(`RPC archive_tender_employee failed with status ${rpcResponse.status}`)
          }
        } else {
          employeeArchiveRpcAvailableRef.current = true
        }
      }

      setEditingEmployee(null)
      if (selectedEmployee?.id === id) {
        setSelectedEmployee(null)
      }
      await Promise.all([reloadEmployees(), loadArchivedEmployees(), loadTimesheetSummary()])
      if (undoName) {
        showToast(`${undoName} — в архиве`, false, { label: 'Отменить', onClick: () => handleRestoreEmployee(id) })
      } else {
        showToast('Сотрудник в архиве')
      }
    } catch (err) {
      console.error('Error archiving employee:', err)
      showToast('Ошибка при архивации')
      throw err
    }
  }

  const handleQuickArchive = async (emp: EmployeeWithStats) => {
    if (archivingIds.has(emp.id)) return
    setArchivingIds(prev => new Set(prev).add(emp.id))
    try {
      await handleArchiveEmployee(emp.id, QUICK_ARCHIVE_REASON, emp.full_name)
    } catch {
      // Ошибку уже показал handleArchiveEmployee
    } finally {
      setArchivingIds(prev => {
        const next = new Set(prev)
        next.delete(emp.id)
        return next
      })
    }
  }

  const handleRestoreEmployee = async (id: number) => {
    try {
      if (employeeArchiveRpcAvailableRef.current === false) {
        await restoreEmployeeWithoutRpc(id)
      } else {
        const rpcResponse = await supabase.rpc('restore_tender_employee', { p_employee_id: id })
        if (rpcResponse.error || rpcResponse.status === 404) {
          if (isMissingRpcError(rpcResponse.error, rpcResponse.status)) {
            employeeArchiveRpcAvailableRef.current = false
            await restoreEmployeeWithoutRpc(id)
          } else {
            throw rpcResponse.error || new Error(`RPC restore_tender_employee failed with status ${rpcResponse.status}`)
          }
        } else {
          employeeArchiveRpcAvailableRef.current = true
        }
      }

      await Promise.all([reloadEmployees(), loadArchivedEmployees(), loadTimesheetSummary()])
      showToast('Сотрудник возвращён из архива')
    } catch (err) {
      console.error('Error restoring employee:', err)
      showToast('Ошибка при восстановлении')
    }
  }

  const filteredEmployees = employees.filter(emp =>
    emp.full_name.toLowerCase().includes(search.toLowerCase()) ||
    emp.position.toLowerCase().includes(search.toLowerCase())
  )

  const groupedEmployees = useMemo(() => {
    // Все руководители наверх
    const isHead = (pos: string | undefined) => {
      const p = pos?.toLowerCase() || ''
      return p.includes('руководитель')
    }
    const heads = filteredEmployees.filter(e => isHead(e.position))
    const rest = filteredEmployees.filter(e => !isHead(e.position))

    const groups: Record<string, EmployeeWithStats[]> = {}
    for (const emp of rest) {
      const key = emp.subdivision || 'Без подразделения'
      if (!groups[key]) groups[key] = []
      groups[key].push(emp)
    }

    // Сортировка внутри групп: старший группы первым
    const getPriority = (pos: string | undefined) => {
      const p = pos?.toLowerCase() || ''
      if (p.includes('старший группы')) return 0
      return 1
    }
    for (const key of Object.keys(groups)) {
      groups[key].sort((a, b) => getPriority(a.position) - getPriority(b.position))
    }

    const sorted = Object.entries(groups)
      .sort(([a], [b]) => getSubdivisionOrder(a) - getSubdivisionOrder(b))

    // Добавляем руководителей в начало
    if (heads.length > 0) {
      sorted.unshift(['Руководство', heads])
    }

    return sorted.map(([name, employees]) => ({ name, employees }))
  }, [filteredEmployees])

  const clearSalaryOverlayClose = useOverlayClose(() => {
    if (!clearingSalaryHistory) setShowConfirmClearSalaryHistory(false)
  })
  const clearAllOverlayClose = useOverlayClose(() => setShowConfirmClear(false))

  if (loading) return <div className="tender-loading"><div className="tender-spinner" /><div>Загрузка...</div></div>

  if (selectedEmployee) {
    return (
      <div className="tender-page admin-panel">
        <div className="tender-content">
          <EmployeeDetail
            employee={selectedEmployee}
            year={selectedYear}
            month={selectedMonth}
            onBack={() => setSelectedEmployee(null)}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="tender-page admin-panel">
      <div className="tender-content">
        {tab === 'employees' && (
          <>
            <div className="admin-section">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ margin: 0 }}>Сотрудники ({employees.length})</h3>
                <button className="btn-secondary" onClick={() => setShowAddEmployee(true)}>Полная форма</button>
              </div>
              <QuickAddEmployee
                subdivisions={subdivisionNames}
                existingNames={employees.map(emp => emp.full_name)}
                onAdd={handleAddEmployee}
                onDuplicate={() => showToast('Такой сотрудник уже есть', true)}
              />
          <div className="tender-filters" style={{ marginBottom: 16 }}>
            <div className="search-box">
              <span>🔍</span>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск..." />
            </div>
          </div>
          <div className="emp-list-wrapper">
            <table className="emp-list-table admin-emp-table">
              <thead>
                <tr>
                  <th>ФИО</th>
                  <th>Должность</th>
                  <th>Отдел</th>
                  <th>Оклад</th>
                  <th>Без повыш.</th>
                  <th>Стаж</th>
                  <th>Телефон</th>
                  <th>Email</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {groupedEmployees.map(group => (
                  <Fragment key={group.name}>
                    <tr
                      className="emp-list-subdiv-row"
                      style={{ '--subdiv-accent': getSubdivisionAccent(group.name) } as CSSProperties}
                    >
                      <td colSpan={9}>{group.name} <span>({group.employees.length})</span></td>
                    </tr>
                    {group.employees.map(emp => {
                      const noRaiseMonths = getMonthsSinceLastRaise(emp)
                      const tenureMonths = getEmployeeTenureMonths(emp)
                      const effectiveSalary = getEffectiveSalaryForDate(
                        emp.salaryHistory || [],
                        emp.current_salary,
                        getTodayIsoDate()
                      )
                      return (
                        <tr
                          key={emp.id}
                          className="emp-list-row"
                          onClick={() => setSelectedEmployee(emp)}
                        >
                          <td className="emp-list-name">
                            <span>{emp.full_name}</span>
                          </td>
                          <td className="emp-list-position">{emp.position}</td>
                          <td className="emp-list-dept">{emp.department || '—'}</td>
                          <td className="emp-list-salary">{effectiveSalary.toLocaleString('ru-RU')} ₽</td>
                          <td className="emp-list-no-raise" style={{ color: getNoRaiseColor(noRaiseMonths) }}>
                            {formatMonthsSinceRaise(noRaiseMonths)}
                          </td>
                          <td style={{ color: getDurationHighlightColor(tenureMonths) }}>
                            {formatMonthsSinceRaise(tenureMonths)}
                          </td>
                          <td>{formatRuPhone(emp.phone, { dash: true })}</td>
                          <td>{emp.email || '—'}</td>
                          <td className="emp-list-actions">
                            <button className="btn-edit" onClick={event => { event.stopPropagation(); handleEditEmployee(emp) }}>✎</button>
                            <button
                              type="button"
                              className="btn-archive"
                              title="В архив"
                              aria-label={`В архив: ${emp.full_name}`}
                              disabled={archivingIds.has(emp.id)}
                              onClick={event => { event.stopPropagation(); void handleQuickArchive(emp) }}
                            >
                              <Trash2 size={16} strokeWidth={1.5} />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </Fragment>
                ))}
              </tbody>
            </table>
            {filteredEmployees.length === 0 && (
              <div className="empty-state" style={{ padding: 40 }}>
                <span>👥</span>
                <div>Сотрудники не найдены</div>
              </div>
            )}
          </div>
            </div>
          </>
        )}

        {tab === 'subdivisions' && (
          <div className="admin-section">
            <div className="subdivisions-top">
              <h3>Управление подразделениями</h3>
              <span className="subdivisions-count">Всего: {subdivisionNames.length}</span>
            </div>

            <form className="subdivision-create-form" onSubmit={handleAddSubdivision}>
              <div className="form-group form-group-full">
                <label>Новое подразделение</label>
                <input
                  value={newSubdivisionName}
                  onChange={e => setNewSubdivisionName(e.target.value)}
                  placeholder="Введите название подразделения"
                />
              </div>
              <button type="submit" className="btn-primary" disabled={savingSubdivision || newSubdivisionName.trim().length === 0}>
                {savingSubdivision ? 'Сохранение...' : 'Добавить подразделение'}
              </button>
            </form>

            <div className="subdivision-list">
              {subdivisionNames.length === 0 ? (
                <div className="salary-history-empty">Подразделения не найдены</div>
              ) : (
                subdivisionNames.map(subdivision => (
                  <div key={subdivision} className="subdivision-item">
                    {subdivision}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {tab === 'archive' && (
          <div className="admin-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>Архив сотрудников ({archivedEmployees.length})</h3>
              <button className="btn-secondary" onClick={() => loadArchivedEmployees()} disabled={loadingArchived}>
                Обновить
              </button>
            </div>

            <div className="emp-list-wrapper">
              <table className="emp-list-table archive-list-table">
                <thead>
                  <tr>
                    <th>ФИО</th>
                    <th>Должность</th>
                    <th>Подразделение</th>
                    <th>Дата архива</th>
                    <th>Причина</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {archivedEmployees.map(item => (
                    <tr key={item.employee.id}>
                      <td className="emp-list-name"><span>{item.employee.full_name}</span></td>
                      <td className="emp-list-position">{item.employee.position || '—'}</td>
                      <td className="emp-list-dept">{item.employee.subdivision || '—'}</td>
                      <td>{formatDateTime(item.employee.archived_at)}</td>
                      <td className="archive-reason-cell">{item.archiveReason || '—'}</td>
                      <td>
                        <button className="btn-secondary btn-small" onClick={() => handleRestoreEmployee(item.employee.id)}>
                          Вернуть
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {!loadingArchived && archivedEmployees.length === 0 && (
                <div className="empty-state" style={{ padding: 40 }}>
                  <span>🗃️</span>
                  <div>Архив пуст</div>
                </div>
              )}
              {loadingArchived && (
                <div className="tender-loading" style={{ minHeight: 120 }}>
                  <div className="tender-spinner" />
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'settings' && (
          <div className="settings-list">
            <div className="settings-row">
              <div className="settings-row-copy">
                <h3>Сотрудники</h3>
                <p>Синхронизация сотрудников из FOT API</p>
              </div>
              <button className="btn-primary" onClick={() => setShowImportEmployees(true)}>Синхронизировать</button>
            </div>

            <div className="settings-row">
              <div className="settings-row-copy">
                <h3>История ЗП</h3>
                <p>Импорт изменений окладов сотрудников</p>
              </div>
              <button className="btn-primary" onClick={() => setShowImportSalaryHistory(true)}>Импортировать</button>
            </div>

            <div className="settings-timesheet-status">
              <h3>Загрузка табеля</h3>
              <div className="timesheet-year-nav">
                <button className="month-btn" onClick={() => setTimesheetYear(displayYear - 1)}>←</button>
                <span className="timesheet-year-title">{displayYear}</span>
                <button className="month-btn" onClick={() => setTimesheetYear(displayYear + 1)}>→</button>
              </div>

              {loadingTimesheet ? (
                <div className="tender-loading" style={{ minHeight: 200 }}><div className="tender-spinner" /></div>
              ) : (
                <div className="timesheet-months-grid">
                  {monthNames.map((name, idx) => {
                    const month = idx + 1
                    const status = getMonthStatus(month)
                    const isLoaded = !!status
                    return (
                      <div key={month} className={`timesheet-month-card ${isLoaded ? 'loaded' : 'empty'}`}>
                        <div className="timesheet-month-name">{name}</div>
                        {isLoaded ? (
                          <div className="timesheet-month-status">
                            <span className="timesheet-check">✓</span>
                            <span className="timesheet-count">{status.employees_count} сотр.</span>
                          </div>
                        ) : (
                          <div className="timesheet-month-status">
                            <span className="timesheet-cross">✗</span>
                            <span className="timesheet-count">нет данных</span>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="settings-row settings-row-timesheet">
              <div className="settings-row-copy">
                <h3>Табель</h3>
                <p>Ручная синхронизация табеля из FOT API</p>
              </div>
              <div className="settings-row-actions">
                <label className="settings-period-control settings-period-year">
                  <span>Год</span>
                  <input
                    type="number"
                    min="2000"
                    max="2100"
                    value={timesheetSyncYear}
                    onChange={event => setTimesheetSyncYear(Number(event.target.value))}
                    disabled={syncingTimesheet}
                  />
                </label>
                <label className="settings-period-control">
                  <span>Месяц</span>
                  <select
                    value={timesheetSyncMonth}
                    onChange={event => setTimesheetSyncMonth(Number(event.target.value))}
                    disabled={syncingTimesheet}
                  >
                    {monthNames.map((name, idx) => (
                      <option key={name} value={idx + 1}>{name}</option>
                    ))}
                  </select>
                </label>
                <button
                  className="btn-primary"
                  onClick={() => handleSyncTimesheetPeriod(timesheetSyncYear, timesheetSyncMonth)}
                  disabled={syncingTimesheet || employees.length === 0 || timesheetSyncYear < 2000 || timesheetSyncYear > 2100}
                >
                  {syncingTimesheet ? 'Синхронизация...' : 'Синхронизировать'}
                </button>
              </div>
            </div>

            <div className="settings-row">
              <div className="settings-row-copy">
                <h3>История повышений</h3>
                <p>Удалить всю историю изменений окладов</p>
              </div>
              <button className="btn-danger" onClick={() => setShowConfirmClearSalaryHistory(true)}>Очистить</button>
            </div>

            <div className="settings-row">
              <div className="settings-row-copy">
                <h3>Все данные сотрудников</h3>
                <p>Удалить сотрудников и данные табеля</p>
              </div>
              <button className="btn-danger" onClick={() => setShowConfirmClear(true)}>Удалить всё</button>
            </div>
          </div>
        )}
      </div>

      {showImportEmployees && <ImportEmployeesModal onClose={() => setShowImportEmployees(false)} onSuccess={() => {
        reloadEmployees()
        loadSubdivisions()
        loadArchivedEmployees()
        loadTimesheetSummary()
        showToast('Сотрудники синхронизированы')
      }} />}
      {showImportSalaryHistory && <ImportSalaryHistoryModal onClose={() => setShowImportSalaryHistory(false)} onSuccess={() => {
        reloadEmployees()
        showToast('История окладов импортирована')
      }} />}
      {showConfirmClearSalaryHistory && (
        <div className="modal-overlay" {...clearSalaryOverlayClose}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="confirm-dialog">
              <p>Удалить всю историю повышений окладов? Сотрудники и табель останутся без изменений.</p>
              <div className="confirm-dialog-actions">
                <button
                  className="btn-secondary"
                  onClick={() => setShowConfirmClearSalaryHistory(false)}
                  disabled={clearingSalaryHistory}
                >
                  Отмена
                </button>
                <button className="btn-danger" onClick={handleClearSalaryHistory} disabled={clearingSalaryHistory}>
                  {clearingSalaryHistory ? 'Удаление...' : 'Удалить повышения'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {showConfirmClear && (
        <div className="modal-overlay" {...clearAllOverlayClose}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="confirm-dialog">
              <p>Удалить всех сотрудников и данные табеля?</p>
              <div className="confirm-dialog-actions">
                <button className="btn-secondary" onClick={() => setShowConfirmClear(false)}>Отмена</button>
                <button className="btn-danger" onClick={async () => {
                  try {
                    await clearAllEmployees()
                    await loadSubdivisions()
                    await loadArchivedEmployees()
                    await loadTimesheetSummary()
                    setShowConfirmClear(false)
                    showToast('Данные очищены')
                  } catch {
                    showToast('Ошибка при очистке')
                  }
                }}>Удалить всё</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {editingEmployee && (
        <EmployeeModal
          employee={editingEmployee}
          onClose={() => setEditingEmployee(null)}
          onSave={handleSaveEmployee}
          onSalaryHistoryChange={() => reloadEmployees()}
          onArchive={handleArchiveEmployee}
          subdivisions={subdivisionNames}
        />
      )}
      {showAddEmployee && (
        <AddEmployeeModal
          onClose={() => setShowAddEmployee(false)}
          onSave={handleAddEmployee}
          subdivisions={subdivisionNames}
        />
      )}
      {toast && (
        <div className={`toast${toast.isError ? ' error' : ''}`} role="status" aria-live="polite">
          <span>{toast.isError ? '!' : '✓'}</span>
          {toast.message}
          {toast.action && (
            <button
              type="button"
              className="toast-action"
              onClick={handleToastAction}
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

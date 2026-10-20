import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../../../lib/supabase'
import { useToast } from '../../../../hooks/useToast'
import type { EmployeeWithStats, NewEmployee, TenderSubdivision } from '../../types'
import { getEffectiveSalaryForDate, getTodayIsoDate, type EditableEmployee } from '../../utils/adminTenderHelpers'
import { archiveTenderEmployee, restoreTenderEmployee } from '../../utils/tenderArchive'
import { fetchSubdivisions } from '../../utils/tenderSubdivisions'

// Причина для архивации корзиной в строке — без диалога
const QUICK_ARCHIVE_REASON = 'Уволился'
const UNDO_TOAST_DURATION_MS = 6000

// Скрытие окладов запоминаем в браузере — чтобы не светить суммы при показе экрана
const HIDE_SALARIES_KEY = 'tender-admin-hide-salaries'

const readHideSalaries = (): boolean => {
  try {
    return localStorage.getItem(HIDE_SALARIES_KEY) === '1'
  } catch {
    return false
  }
}

interface IUseEmployeeAdminParams {
  enabled: boolean
  // Растёт, когда листы «Архив»/«Настройки» что-то поменяли — подразделения перечитываются
  refreshKey: number
  // Перечитать сотрудников оболочки (тихо, без спиннера на всю страницу)
  onEmployeesChanged: () => Promise<void> | void
  onSheetClose: () => void
}

// Действия администратора над сотрудниками: правка, добавление, архив с отменой, подразделения
export function useEmployeeAdmin({ enabled, refreshKey, onEmployeesChanged, onSheetClose }: IUseEmployeeAdminParams) {
  const { toast, showToast, hideToast } = useToast()
  const [editingEmployee, setEditingEmployee] = useState<EditableEmployee | null>(null)
  const [archivingIds, setArchivingIds] = useState<Set<number>>(() => new Set())
  const [subdivisions, setSubdivisions] = useState<TenderSubdivision[]>([])
  const [hideSalaries, setHideSalaries] = useState(readHideSalaries)

  const toggleHideSalaries = () => {
    const next = !hideSalaries
    setHideSalaries(next)
    try {
      localStorage.setItem(HIDE_SALARIES_KEY, next ? '1' : '0')
    } catch {
      // Хранилище недоступно (приватный режим) — переключатель работает до перезагрузки
    }
  }

  const subdivisionNames = useMemo(
    () => subdivisions
      .map(item => item.name.trim())
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right, 'ru-RU')),
    [subdivisions]
  )

  const loadSubdivisions = useCallback(async () => {
    const list = await fetchSubdivisions()
    if (list) setSubdivisions(list)
  }, [])

  useEffect(() => {
    if (enabled) void loadSubdivisions()
  }, [enabled, loadSubdivisions])

  const prevRefreshKeyRef = useRef(refreshKey)
  useEffect(() => {
    if (prevRefreshKeyRef.current === refreshKey) return
    prevRefreshKeyRef.current = refreshKey
    if (enabled) void loadSubdivisions()
  }, [enabled, loadSubdivisions, refreshKey])

  const notify = (message: string, isError = false, action?: { label: string; onClick: () => void }) => showToast({
    message,
    tone: isError ? 'error' : 'default',
    duration: action ? UNDO_TOAST_DURATION_MS : isError ? 7000 : 3000,
    actionLabel: action?.label,
    onAction: action?.onClick
  })

  const reloadEmployees = async () => {
    await onEmployeesChanged()
  }

  const startEdit = (emp: EmployeeWithStats) => {
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

  const closeEdit = () => setEditingEmployee(null)

  const saveEmployee = async (emp: EditableEmployee) => {
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
      notify('Сотрудник обновлён')
    } catch {
      notify('Ошибка при сохранении', true)
    }
  }

  const addEmployee = async (emp: NewEmployee): Promise<boolean> => {
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

      onSheetClose()
      await reloadEmployees()
      notify('Сотрудник добавлен')
      return true
    } catch {
      notify('Ошибка при добавлении', true)
      return false
    }
  }

  const restoreEmployee = async (id: number) => {
    try {
      await restoreTenderEmployee(id)
      await reloadEmployees()
      notify('Сотрудник возвращён из архива')
    } catch (err) {
      console.error('Error restoring employee:', err)
      notify('Ошибка при восстановлении', true)
    }
  }

  // undoName — архивация корзиной: тост с ФИО и кнопкой «Отменить»
  const archiveEmployee = async (id: number, reason: string, undoName?: string) => {
    try {
      await archiveTenderEmployee(id, reason)

      setEditingEmployee(null)
      await reloadEmployees()
      if (undoName) {
        notify(`${undoName} — в архиве`, false, { label: 'Отменить', onClick: () => restoreEmployee(id) })
      } else {
        notify('Сотрудник в архиве')
      }
    } catch (err) {
      console.error('Error archiving employee:', err)
      notify('Ошибка при архивации', true)
      throw err
    }
  }

  const quickArchive = async (emp: EmployeeWithStats) => {
    if (archivingIds.has(emp.id)) return
    setArchivingIds(prev => new Set(prev).add(emp.id))
    try {
      await archiveEmployee(emp.id, QUICK_ARCHIVE_REASON, emp.full_name)
    } catch {
      // Ошибку уже показал archiveEmployee
    } finally {
      setArchivingIds(prev => {
        const next = new Set(prev)
        next.delete(emp.id)
        return next
      })
    }
  }

  return {
    toast,
    hideToast,
    editingEmployee,
    archivingIds,
    subdivisions,
    subdivisionNames,
    loadSubdivisions,
    hideSalaries,
    toggleHideSalaries,
    startEdit,
    closeEdit,
    saveEmployee,
    addEmployee,
    archiveEmployee,
    quickArchive,
    reloadEmployees
  }
}

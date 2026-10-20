import { useState, useEffect, useMemo, useRef, Fragment, type CSSProperties } from 'react'
import { Eye, EyeOff, Pencil, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { ClearableInput } from '../../components/ui/ClearableInput'
import { Toast } from '../../components/ui/Toast'
import { useToast } from '../../hooks/useToast'
import { formatRuPhone } from '../../lib/formatUtils'
import { useTenderData } from './hooks/useTenderData'
import { EmployeeDetail } from './components/EmployeeDetail'
import { AddEmployeeModal } from './components/AddEmployeeModal'
import { EmployeeModal } from './components/EmployeeModal'
import { SubdivisionsSheet } from './components/SubdivisionsSheet'
import type { EmployeeWithStats, NewEmployee, TenderSubdivision } from './types'
import {
  formatMonthsSinceRaise,
  getEmployeeTenureMonths,
  getMonthsSinceLastRaise,
  getDurationHighlightColor,
  getNoRaiseColor
} from './utils/tenderPresentation'
import { getEffectiveSalaryForDate, getTodayIsoDate, type EditableEmployee } from './utils/adminTenderHelpers'
import { getMissingFields, getSubdivisionAccent, groupEmployees, isIncompleteEmployee } from './utils/employeeGrouping'
import { archiveTenderEmployee, restoreTenderEmployee } from './utils/tenderArchive'
import { fetchSubdivisions } from './utils/tenderSubdivisions'
import './TenderPage.css'
import './AdminTenderPanel.css'

// Причина для архивации корзиной в строке — без диалога
const QUICK_ARCHIVE_REASON = 'Уволился'
const UNDO_TOAST_DURATION_MS = 6000

const textOrDash = (value: string | null | undefined) => value?.trim() || '—'

// Скрытие окладов запоминаем в браузере — чтобы не светить суммы при показе экрана
const HIDE_SALARIES_KEY = 'tender-admin-hide-salaries'

const readHideSalaries = () => {
  try {
    return localStorage.getItem(HIDE_SALARIES_KEY) === '1'
  } catch {
    return false
  }
}

// Листы панели открываются кнопками в строке вкладок оболочки
export type AdminPanelSheet = 'subdivisions' | 'addEmployee'

interface Props {
  // Растёт, когда листы «Архив»/«Настройки» что-то поменяли — список перечитывается
  refreshKey: number
  sheet: AdminPanelSheet | null
  onSheetClose: () => void
}

export default function AdminTenderPanel({ refreshKey, sheet, onSheetClose }: Props) {
  const { employees, loading, loadEmployees, selectedYear, selectedMonth } = useTenderData()
  const { toast, showToast, hideToast } = useToast()
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeWithStats | null>(null)

  // Позиция прокрутки списка: запоминаем при открытии карточки и возвращаем при закрытии
  const listScrollRef = useRef(0)
  const openEmployee = (employee: EmployeeWithStats) => {
    listScrollRef.current = window.scrollY
    setSelectedEmployee(employee)
    window.scrollTo(0, 0)
  }
  const closeEmployee = () => {
    setSelectedEmployee(null)
    const top = listScrollRef.current
    window.requestAnimationFrame(() => window.scrollTo(0, top))
  }
  const [editingEmployee, setEditingEmployee] = useState<EditableEmployee | null>(null)
  const [archivingIds, setArchivingIds] = useState<Set<number>>(() => new Set())
  const [search, setSearch] = useState('')
  const [incompleteOnly, setIncompleteOnly] = useState(false)
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
  const [subdivisions, setSubdivisions] = useState<TenderSubdivision[]>([])

  const subdivisionNames = useMemo(
    () => subdivisions
      .map(item => item.name.trim())
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right, 'ru-RU')),
    [subdivisions]
  )

  const loadSubdivisions = async () => {
    const list = await fetchSubdivisions()
    if (list) setSubdivisions(list)
  }

  // После правок список перечитывается тихо: спиннер на всю страницу размонтировал бы таблицу и открытую форму
  const reloadEmployees = () => loadEmployees(undefined, undefined, false, true)

  // Сотрудников при открытии грузит сам useTenderData
  useEffect(() => {
    void loadSubdivisions()
  }, [])

  const prevRefreshKeyRef = useRef(refreshKey)
  useEffect(() => {
    if (prevRefreshKeyRef.current === refreshKey) return
    prevRefreshKeyRef.current = refreshKey
    void reloadEmployees()
    void loadSubdivisions()
  }, [refreshKey])

  const notify = (message: string, isError = false, action?: { label: string; onClick: () => void }) => showToast({
    message,
    tone: isError ? 'error' : 'default',
    duration: action ? UNDO_TOAST_DURATION_MS : isError ? 7000 : 3000,
    actionLabel: action?.label,
    onAction: action?.onClick
  })

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
      notify('Сотрудник обновлён')
    } catch {
      notify('Ошибка при сохранении', true)
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

      onSheetClose()
      await reloadEmployees()
      notify('Сотрудник добавлен')
      return true
    } catch {
      notify('Ошибка при добавлении', true)
      return false
    }
  }

  const handleRestoreEmployee = async (id: number) => {
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
  const handleArchiveEmployee = async (id: number, reason: string, undoName?: string) => {
    try {
      await archiveTenderEmployee(id, reason)

      setEditingEmployee(null)
      if (selectedEmployee?.id === id) {
        setSelectedEmployee(null)
      }
      await reloadEmployees()
      if (undoName) {
        notify(`${undoName} — в архиве`, false, { label: 'Отменить', onClick: () => handleRestoreEmployee(id) })
      } else {
        notify('Сотрудник в архиве')
      }
    } catch (err) {
      console.error('Error archiving employee:', err)
      notify('Ошибка при архивации', true)
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

  const incompleteCount = useMemo(() => employees.filter(isIncompleteEmployee).length, [employees])

  const filteredEmployees = useMemo(() => {
    const query = search.toLowerCase()
    return employees.filter(emp => (
      (emp.full_name.toLowerCase().includes(query) || emp.position.toLowerCase().includes(query)) &&
      (!incompleteOnly || isIncompleteEmployee(emp))
    ))
  }, [employees, search, incompleteOnly])

  const groupedEmployees = useMemo(() => groupEmployees(filteredEmployees), [filteredEmployees])
  // Сквозная нумерация по порядку на экране, через все группы
  const rowNumbers = useMemo(() => {
    const numbers = new Map<number, number>()
    groupedEmployees.forEach(group => group.employees.forEach(emp => numbers.set(emp.id, numbers.size + 1)))
    return numbers
  }, [groupedEmployees])

  if (loading) return <div className="tender-loading"><div className="tender-spinner" /><div>Загрузка...</div></div>

  if (selectedEmployee) {
    return (
      <div className="tender-page admin-panel">
        <div className="tender-content">
          <EmployeeDetail
            employee={selectedEmployee}
            year={selectedYear}
            month={selectedMonth}
            onBack={closeEmployee}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="tender-page admin-panel">
      <div className="tender-content">
        <div className="admin-section">
          <div className="tender-filters admin-filters">
            <ClearableInput
              wrapperClassName="admin-search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onClear={() => setSearch('')}
              clearLabel="Очистить поиск"
              placeholder="Поиск по ФИО и должности"
              aria-label="Поиск сотрудников"
              autoComplete="off"
            />
            <label className="admin-check">
              <input type="checkbox" checked={incompleteOnly} onChange={e => setIncompleteOnly(e.target.checked)} />
              <span>Неполные данные ({incompleteCount})</span>
            </label>
            <button
              type="button"
              className={`admin-icon-toggle${hideSalaries ? ' active' : ''}`}
              onClick={toggleHideSalaries}
              aria-pressed={hideSalaries}
              aria-label={hideSalaries ? 'Показать оклады' : 'Скрыть оклады'}
              title={hideSalaries ? 'Показать оклады' : 'Скрыть оклады'}
            >
              {hideSalaries ? <EyeOff size={16} strokeWidth={1.5} /> : <Eye size={16} strokeWidth={1.5} />}
            </button>
          </div>

          <div className="emp-list-wrapper">
            <table className="emp-list-table admin-emp-table">
              <thead>
                <tr>
                  <th className="emp-list-num">№</th>
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
                      <td colSpan={10}>{group.name} <span>({group.employees.length})</span></td>
                    </tr>
                    {group.employees.map(emp => {
                      const noRaiseMonths = getMonthsSinceLastRaise(emp)
                      const tenureMonths = getEmployeeTenureMonths(emp)
                      const missing = getMissingFields(emp)
                      const effectiveSalary = getEffectiveSalaryForDate(
                        emp.salaryHistory || [],
                        emp.current_salary,
                        getTodayIsoDate()
                      )
                      return (
                        <tr
                          key={emp.id}
                          className="emp-list-row"
                          onClick={() => openEmployee(emp)}
                        >
                          <td className="emp-list-num">{rowNumbers.get(emp.id)}</td>
                          <td className="emp-list-name">
                            <span>{emp.full_name}</span>
                          </td>
                          <td className={`emp-list-position${missing.has('position') ? ' is-missing' : ''}`}>
                            {textOrDash(emp.position)}
                          </td>
                          <td className={`emp-list-dept${missing.has('department') ? ' is-missing' : ''}`}>
                            {textOrDash(emp.department)}
                          </td>
                          <td className={`emp-list-salary${missing.has('salary') ? ' is-missing' : ''}`}>
                            {hideSalaries ? '••• ₽' : `${effectiveSalary.toLocaleString('ru-RU')} ₽`}
                          </td>
                          <td className="emp-list-no-raise" style={{ color: getNoRaiseColor(noRaiseMonths) }}>
                            {formatMonthsSinceRaise(noRaiseMonths)}
                          </td>
                          <td style={{ color: getDurationHighlightColor(tenureMonths) }}>
                            {formatMonthsSinceRaise(tenureMonths)}
                          </td>
                          <td className={missing.has('phone') ? 'is-missing' : undefined}>
                            {formatRuPhone(emp.phone, { dash: true })}
                          </td>
                          <td className={missing.has('email') ? 'is-missing' : undefined}>
                            {textOrDash(emp.email)}
                          </td>
                          <td className="emp-list-actions">
                            <button
                              type="button"
                              className="btn-edit"
                              title="Изменить"
                              aria-label={`Изменить: ${emp.full_name}`}
                              onClick={event => { event.stopPropagation(); handleEditEmployee(emp) }}
                            >
                              <Pencil size={16} strokeWidth={1.5} />
                            </button>
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
              <div className="empty-state admin-empty">
                <span>👥</span>
                <div>Сотрудники не найдены</div>
              </div>
            )}
          </div>
        </div>
      </div>

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
      {sheet === 'addEmployee' && (
        <AddEmployeeModal
          onClose={onSheetClose}
          onSave={handleAddEmployee}
          subdivisions={subdivisionNames}
        />
      )}
      {sheet === 'subdivisions' && (
        <SubdivisionsSheet
          subdivisions={subdivisions}
          employees={employees}
          onChanged={loadSubdivisions}
          onClose={onSheetClose}
        />
      )}
      <Toast toast={toast} onClose={hideToast} />
    </div>
  )
}

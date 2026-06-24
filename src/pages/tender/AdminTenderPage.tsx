import { useState, useEffect, useMemo, useRef, Fragment, type CSSProperties } from 'react'
import { supabase } from '../../lib/supabase'
import { formatRuPhone } from '../../lib/formatUtils'
import { useTenderData } from './hooks/useTenderData'
import { ImportEmployeesModal } from './components/ImportEmployeesModal'
import { ImportSalaryHistoryModal } from './components/ImportSalaryHistoryModal'
import { EmployeeDetail } from './TenderPage'
import type { Employee, EmployeeWithStats, SalaryHistory, TenderEmployeeEvent, TenderSubdivision } from './types'
import { syncFotTimesheetMonth } from './utils/fotTimesheetSync'
import {
  formatAgeYears,
  formatMonthsSinceRaise,
  getAgeFromBirthDate,
  getEmployeeTenureMonths,
  getMonthsSinceLastRaise,
  getDurationHighlightColor,
  getNoRaiseColor
} from './utils/tenderPresentation'
import './TenderPage.css'
import './AdminTenderPage.css'

type AdminTab = 'employees' | 'timesheet' | 'subdivisions' | 'archive'

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

function parseMoneyInput(value: string): number {
  const digits = value.replace(/\D/g, '')
  if (!digits) return 0
  return Number(digits)
}

function formatMoneyInput(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return ''
  return Math.round(value).toLocaleString('ru-RU')
}

function toStableDate(value: string): Date | null {
  if (!value) return null
  const parsed = new Date(`${value}T12:00:00`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function getMonthsFromDate(date: Date): number {
  const now = new Date()
  return Math.max(0, (now.getFullYear() - date.getFullYear()) * 12 + (now.getMonth() - date.getMonth()))
}

function getTenureMonthsFromHistory(_salaryHistory: SalaryHistory[], hireDate: string): number {
  const hireDateValue = toStableDate(hireDate)
  return hireDateValue ? getMonthsFromDate(hireDateValue) : 0
}

function getNoRaiseMonthsFromHistory(salaryHistory: SalaryHistory[], hireDate: string): number {
  const todayIsoDate = getTodayIsoDate()
  const sorted = [...salaryHistory]
    .filter(item => item.effective_date <= todayIsoDate)
    .sort((left, right) => (
      new Date(`${left.effective_date}T12:00:00`).getTime() - new Date(`${right.effective_date}T12:00:00`).getTime()
    ))

  if (sorted.length === 0) {
    const fallbackDate = toStableDate(hireDate)
    return fallbackDate ? getMonthsFromDate(fallbackDate) : 0
  }

  let lastRaiseDate: Date | null = null
  for (let i = 1; i < sorted.length; i++) {
    const previous = sorted[i - 1]
    const current = sorted[i]
    if (current.salary > previous.salary) {
      lastRaiseDate = toStableDate(current.effective_date)
    }
  }

  if (lastRaiseDate) {
    return getMonthsFromDate(lastRaiseDate)
  }

  const firstDate = toStableDate(sorted[0].effective_date)
  if (firstDate) {
    return getMonthsFromDate(firstDate)
  }

  const fallbackDate = toStableDate(hireDate)
  return fallbackDate ? getMonthsFromDate(fallbackDate) : 0
}

function getTodayIsoDate(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getEffectiveSalaryForDate(
  salaryHistory: SalaryHistory[],
  fallbackSalary: number,
  targetDateIso: string
): number {
  if (!salaryHistory || salaryHistory.length === 0) return fallbackSalary

  const sorted = [...salaryHistory]
    .sort((left, right) => (
      new Date(`${left.effective_date}T12:00:00`).getTime() - new Date(`${right.effective_date}T12:00:00`).getTime()
    ))

  let effectiveSalary = fallbackSalary
  for (const item of sorted) {
    if (item.effective_date <= targetDateIso) {
      effectiveSalary = item.salary
    }
  }

  return effectiveSalary
}

function formatDateTime(value: string | null): string {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return parsed.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function normalizeSubdivisionName(name: string): string {
  return name.trim().toLowerCase()
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

interface EditableEmployee {
  id: number
  full_name: string
  last_name: string
  first_name: string
  middle_name: string
  position: string
  department: string
  subdivision: string
  current_salary: number
  monthly_bonus: number
  hire_date: string
  birth_date: string
  email: string
  phone: string
  snils: string
  company: string
  country: string
}

interface NewSalaryEntry {
  salary: number
  effective_date: string
  note: string
}

interface NewEmployee {
  full_name: string
  last_name: string
  first_name: string
  middle_name: string
  position: string
  department: string
  subdivision: string
  current_salary: number
  monthly_bonus: number
  hire_date: string
  company: string
}

function AddEmployeeModal({ onClose, onSave, subdivisions }: {
  onClose: () => void
  onSave: (emp: NewEmployee) => void
  subdivisions: string[]
}) {
  const [form, setForm] = useState<NewEmployee>({
    full_name: '',
    last_name: '',
    first_name: '',
    middle_name: '',
    position: '',
    department: '',
    subdivision: '',
    current_salary: 0,
    monthly_bonus: 0,
    hire_date: new Date().toISOString().split('T')[0],
    company: ''
  })
  const [saving, setSaving] = useState(false)

  const handleChange = (field: keyof NewEmployee, value: string | number) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const updateFullName = (lastName: string, firstName: string, middleName: string) => {
    const parts = [lastName, firstName, middleName].filter(Boolean)
    setForm(prev => ({ ...prev, full_name: parts.join(' ') }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.full_name.trim() || !form.position.trim()) return
    setSaving(true)
    try {
      await onSave(form)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-lg" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Добавить сотрудника</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-body">
          <div className="edit-form-grid">
            <div className="form-group">
              <label>Фамилия *</label>
              <input value={form.last_name} onChange={e => { handleChange('last_name', e.target.value); updateFullName(e.target.value, form.first_name, form.middle_name) }} />
            </div>
            <div className="form-group">
              <label>Имя *</label>
              <input value={form.first_name} onChange={e => { handleChange('first_name', e.target.value); updateFullName(form.last_name, e.target.value, form.middle_name) }} />
            </div>
            <div className="form-group">
              <label>Отчество</label>
              <input value={form.middle_name} onChange={e => { handleChange('middle_name', e.target.value); updateFullName(form.last_name, form.first_name, e.target.value) }} />
            </div>
            <div className="form-group">
              <label>Дата приёма</label>
              <input type="date" value={form.hire_date} onChange={e => handleChange('hire_date', e.target.value)} />
            </div>
            <div className="form-group form-group-full">
              <label>Должность *</label>
              <input value={form.position} onChange={e => handleChange('position', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Отдел</label>
              <input value={form.department} onChange={e => handleChange('department', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Подразделение</label>
              <select value={form.subdivision} onChange={e => handleChange('subdivision', e.target.value)}>
                <option value="">— Без подразделения —</option>
                {subdivisions.map(subdivision => (
                  <option key={subdivision} value={subdivision}>
                    {subdivision}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Оклад</label>
              <input
                type="text"
                inputMode="numeric"
                value={formatMoneyInput(form.current_salary)}
                onChange={e => handleChange('current_salary', parseMoneyInput(e.target.value))}
                placeholder="0"
              />
            </div>
            <div className="form-group">
              <label>Ежемес. бонус</label>
              <input
                type="text"
                inputMode="numeric"
                value={formatMoneyInput(form.monthly_bonus)}
                onChange={e => handleChange('monthly_bonus', parseMoneyInput(e.target.value))}
                placeholder="0"
              />
            </div>
            <div className="form-group">
              <label>Компания</label>
              <input value={form.company} onChange={e => handleChange('company', e.target.value)} />
            </div>
          </div>
          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Отмена</button>
            <button type="submit" className="btn-primary" disabled={saving || !form.full_name.trim() || !form.position.trim()}>
              {saving ? 'Сохранение...' : 'Добавить'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function EmployeeModal({ employee, onClose, onSave, onSalaryHistoryChange, onArchive, subdivisions }: {
  employee: EditableEmployee
  onClose: () => void
  onSave: (emp: EditableEmployee) => void
  onSalaryHistoryChange: () => void
  onArchive: (id: number, reason: string) => Promise<void>
  subdivisions: string[]
}) {
  const [editMode, setEditMode] = useState(false)
  const [form, setForm] = useState<EditableEmployee>(employee)
  const [saving, setSaving] = useState(false)
  const [salaryHistory, setSalaryHistory] = useState<SalaryHistory[]>([])
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [showAddSalary, setShowAddSalary] = useState(false)
  const [displaySalary, setDisplaySalary] = useState(employee.current_salary)
  const [newSalary, setNewSalary] = useState<NewSalaryEntry>({
    salary: employee.current_salary,
    effective_date: getTodayIsoDate(),
    note: 'Повышение оклада'
  })
  const [savingSalary, setSavingSalary] = useState(false)
  const [showArchiveReasonModal, setShowArchiveReasonModal] = useState(false)
  const [archiveReason, setArchiveReason] = useState('')
  const [archiving, setArchiving] = useState(false)
  const salaryHistoryChronological = useMemo(() => (
    [...salaryHistory].sort((left, right) => (
      new Date(`${left.effective_date}T12:00:00`).getTime() - new Date(`${right.effective_date}T12:00:00`).getTime()
    ))
  ), [salaryHistory])
  const noRaiseMonths = useMemo(
    () => getNoRaiseMonthsFromHistory(salaryHistoryChronological, employee.hire_date),
    [employee.hire_date, salaryHistoryChronological]
  )
  const tenureMonths = useMemo(
    () => getTenureMonthsFromHistory(salaryHistoryChronological, employee.hire_date),
    [employee.hire_date, salaryHistoryChronological]
  )
  const employeeAgeYears = useMemo(
    () => getAgeFromBirthDate(employee.birth_date),
    [employee.birth_date]
  )
  const subdivisionOptions = useMemo(() => {
    const map = new Map<string, string>()
    subdivisions.forEach(name => map.set(normalizeSubdivisionName(name), name))
    if (form.subdivision.trim() && !map.has(normalizeSubdivisionName(form.subdivision))) {
      map.set(normalizeSubdivisionName(form.subdivision), form.subdivision)
    }
    return Array.from(map.values()).sort((left, right) => left.localeCompare(right, 'ru-RU'))
  }, [form.subdivision, subdivisions])

  useEffect(() => {
    loadSalaryHistory()
  }, [employee.id])

  const loadSalaryHistory = async () => {
    setLoadingHistory(true)
    try {
      const { data } = await supabase
        .from('tender_salary_history')
        .select('*')
        .eq('employee_id', employee.id)
        .order('effective_date', { ascending: false })
      const loadedHistory = data || []
      setSalaryHistory(loadedHistory)

      const effectiveTodaySalary = getEffectiveSalaryForDate(
        loadedHistory,
        employee.current_salary,
        getTodayIsoDate()
      )
      setDisplaySalary(effectiveTodaySalary)
    } finally {
      setLoadingHistory(false)
    }
  }

  const handleChange = (field: keyof EditableEmployee, value: string | number) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await onSave(form)
      setEditMode(false)
    } finally {
      setSaving(false)
    }
  }

  const handleAddSalary = async () => {
    if (!newSalary.salary || !newSalary.effective_date) return
    setSavingSalary(true)
    try {
      const { error } = await supabase
        .from('tender_salary_history')
        .insert({
          employee_id: employee.id,
          salary: newSalary.salary,
          effective_date: newSalary.effective_date,
          note: newSalary.note || null
        })
      if (error) throw error

      // Обновляем текущий оклад только если дата повышения уже наступила.
      if (newSalary.effective_date <= getTodayIsoDate()) {
        const { error: updateError } = await supabase
          .from('tender_employees')
          .update({ current_salary: newSalary.salary })
          .eq('id', employee.id)
        if (updateError) throw updateError
      }

      await loadSalaryHistory()
      onSalaryHistoryChange()
      setShowAddSalary(false)
      setNewSalary({ salary: newSalary.salary, effective_date: getTodayIsoDate(), note: 'Повышение оклада' })
    } catch (err) {
      console.error('Error adding salary:', err)
    } finally {
      setSavingSalary(false)
    }
  }

  const handleDeleteSalary = async (id: number) => {
    if (!confirm('Удалить запись?')) return
    try {
      await supabase.from('tender_salary_history').delete().eq('id', id)
      await loadSalaryHistory()
      onSalaryHistoryChange()
    } catch (err) {
      console.error('Error deleting salary:', err)
    }
  }

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
  }

  const formatDate = (date: string) => {
    if (!date) return '—'
    return new Date(date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
  }

  const handleArchive = async () => {
    const reason = archiveReason.trim()
    if (!reason) return
    setArchiving(true)
    try {
      await onArchive(employee.id, reason)
      setShowArchiveReasonModal(false)
      setArchiveReason('')
    } catch {
      // Ошибку и уведомление показывает родительский компонент.
    } finally {
      setArchiving(false)
    }
  }

  const closeArchiveReasonModal = () => {
    if (archiving) return
    setShowArchiveReasonModal(false)
    setArchiveReason('')
  }

  // Режим редактирования
  if (editMode) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content modal-lg" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h3>Редактирование</h3>
            <button className="modal-close" onClick={() => setEditMode(false)}>✕</button>
          </div>
          <form onSubmit={handleSubmit} className="modal-body">
            <div className="edit-form-grid">
              <div className="form-group">
                <label>Фамилия</label>
                <input value={form.last_name} onChange={e => handleChange('last_name', e.target.value)} />
              </div>
              <div className="form-group">
                <label>Имя</label>
                <input value={form.first_name} onChange={e => handleChange('first_name', e.target.value)} />
              </div>
              <div className="form-group">
                <label>Отчество</label>
                <input value={form.middle_name} onChange={e => handleChange('middle_name', e.target.value)} />
              </div>
              <div className="form-group form-group-full">
                <label>ФИО (полное)</label>
                <input value={form.full_name} onChange={e => handleChange('full_name', e.target.value)} />
              </div>
              <div className="form-group form-group-full">
                <label>Должность</label>
                <input value={form.position} onChange={e => handleChange('position', e.target.value)} />
              </div>
              <div className="form-group">
                <label>Отдел</label>
                <input value={form.department} onChange={e => handleChange('department', e.target.value)} />
              </div>
              <div className="form-group">
                <label>Подразделение</label>
                <select value={form.subdivision} onChange={e => handleChange('subdivision', e.target.value)}>
                  <option value="">— Без подразделения —</option>
                  {subdivisionOptions.map(subdivision => (
                    <option key={subdivision} value={subdivision}>
                      {subdivision}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Оклад</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={formatMoneyInput(form.current_salary)}
                  onChange={e => handleChange('current_salary', parseMoneyInput(e.target.value))}
                  placeholder="0"
                />
              </div>
              <div className="form-group">
                <label>Ежемес. бонус</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={formatMoneyInput(form.monthly_bonus)}
                  onChange={e => handleChange('monthly_bonus', parseMoneyInput(e.target.value))}
                  placeholder="0"
                />
              </div>
              <div className="form-group">
                <label>Компания</label>
                <input value={form.company} onChange={e => handleChange('company', e.target.value)} />
              </div>
              <div className="form-group">
                <label>Дата приёма</label>
                <input type="date" value={form.hire_date} onChange={e => handleChange('hire_date', e.target.value)} />
              </div>
              <div className="form-group">
                <label>Дата рождения</label>
                <input type="date" value={form.birth_date} onChange={e => handleChange('birth_date', e.target.value)} />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input type="email" value={form.email} onChange={e => handleChange('email', e.target.value)} />
              </div>
              <div className="form-group">
                <label>Телефон</label>
                <input value={form.phone} onChange={e => handleChange('phone', e.target.value)} />
              </div>
              <div className="form-group">
                <label>СНИЛС</label>
                <input value={form.snils} onChange={e => handleChange('snils', e.target.value)} />
              </div>
              <div className="form-group">
                <label>Страна</label>
                <input value={form.country} onChange={e => handleChange('country', e.target.value)} />
              </div>
            </div>
            <div className="form-actions">
              <button type="button" className="btn-secondary" onClick={() => setEditMode(false)}>Отмена</button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          </form>
        </div>
      </div>
    )
  }

  // Режим просмотра
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-lg" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="emp-detail-header">
            <div className="emp-avatar emp-avatar-lg">{getInitials(employee.full_name)}</div>
            <div>
              <h3 className="emp-detail-name">{employee.full_name}</h3>
              <div className="emp-detail-position">{employee.position}</div>
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {/* Основная информация */}
          <div className="emp-detail-tags">
            {employee.department && <span className="emp-tag emp-tag-dept">{employee.department}</span>}
            {employee.company && <span className="emp-tag emp-tag-date">{employee.company}</span>}
          </div>

          <div className="emp-detail-grid">
            <div className="emp-detail-card">
              <div className="emp-detail-label">Оклад</div>
              <div className="emp-detail-value" style={{ color: 'var(--primary)', fontSize: '1.1rem' }}>
                {displaySalary.toLocaleString('ru-RU')} ₽
              </div>
            </div>
            <div className="emp-detail-card">
              <div className="emp-detail-label">Ежемесячный бонус</div>
              <div className="emp-detail-value" style={{ color: 'var(--primary)' }}>
                {employee.monthly_bonus.toLocaleString('ru-RU')} ₽
              </div>
            </div>
            <div className="emp-detail-card">
              <div className="emp-detail-label">Дата приёма</div>
              <div className="emp-detail-value">{formatDate(employee.hire_date)}</div>
            </div>
            <div className="emp-detail-card">
              <div className="emp-detail-label">Без повышения</div>
              <div className="emp-detail-value" style={{ color: getNoRaiseColor(noRaiseMonths) }}>
                {formatMonthsSinceRaise(noRaiseMonths)}
              </div>
            </div>
            <div className="emp-detail-card">
              <div className="emp-detail-label">Стаж в компании</div>
              <div className="emp-detail-value" style={{ color: getDurationHighlightColor(tenureMonths) }}>
                {formatMonthsSinceRaise(tenureMonths)}
              </div>
            </div>
            {employee.birth_date && (
              <div className="emp-detail-card">
                <div className="emp-detail-label">Дата рождения</div>
                <div className="emp-detail-value">
                  {formatDate(employee.birth_date)}
                  {employeeAgeYears !== null && (
                    <span className="emp-detail-age-inline"> ({formatAgeYears(employeeAgeYears)})</span>
                  )}
                </div>
              </div>
            )}
            <div className="emp-detail-card">
              <div className="emp-detail-label">Телефон</div>
              <div className="emp-detail-value">{formatRuPhone(employee.phone, { dash: true })}</div>
            </div>
            {employee.email && (
              <div className="emp-detail-card">
                <div className="emp-detail-label">Email</div>
                <div className="emp-detail-value">{employee.email}</div>
              </div>
            )}
            {employee.snils && (
              <div className="emp-detail-card">
                <div className="emp-detail-label">СНИЛС</div>
                <div className="emp-detail-value">{employee.snils}</div>
              </div>
            )}
          </div>

          {/* История окладов */}
          <div className="salary-history-section">
            <div className="salary-history-header">
              <h4>История окладов</h4>
              <button type="button" className="btn-small btn-primary" onClick={() => setShowAddSalary(true)}>
                Повысить оклад
              </button>
            </div>

            {showAddSalary && (
              <div className="add-salary-form">
                <div className="add-salary-grid">
                  <div className="form-group">
                    <label>Новый оклад</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={formatMoneyInput(newSalary.salary)}
                      onChange={e => setNewSalary(prev => ({ ...prev, salary: parseMoneyInput(e.target.value) }))}
                      placeholder="0"
                    />
                  </div>
                  <div className="form-group">
                    <label>Дата вступления</label>
                    <input
                      type="date"
                      value={newSalary.effective_date}
                      onChange={e => setNewSalary(prev => ({ ...prev, effective_date: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Примечание</label>
                  <input
                    value={newSalary.note}
                    onChange={e => setNewSalary(prev => ({ ...prev, note: e.target.value }))}
                    placeholder="Причина изменения"
                  />
                </div>
                <div className="add-salary-actions">
                  <button type="button" className="btn-secondary btn-small" onClick={() => setShowAddSalary(false)}>
                    Отмена
                  </button>
                  <button type="button" className="btn-primary btn-small" onClick={handleAddSalary} disabled={savingSalary}>
                    {savingSalary ? 'Сохранение...' : 'Добавить'}
                  </button>
                </div>
              </div>
            )}

            {loadingHistory ? (
              <div className="salary-history-loading">Загрузка...</div>
            ) : salaryHistory.length === 0 ? (
              <div className="salary-history-empty">Нет записей об изменении оклада</div>
            ) : (
              <div className="emp-history">
                {salaryHistory.map((h, idx) => (
                  <div key={h.id} className={`emp-history-item ${idx === 0 ? 'current' : ''}`}>
                    <div className="emp-history-date">{formatDate(h.effective_date)}</div>
                    <div className="emp-history-desc">
                      <span className="history-salary">{h.salary.toLocaleString('ru-RU')} ₽</span>
                      {h.note && <span className="history-note">{h.note}</span>}
                    </div>
                    <button type="button" className="btn-delete-small" onClick={() => handleDeleteSalary(h.id)}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Действия */}
          <div className="form-actions">
            <button type="button" className="btn-danger" onClick={() => setShowArchiveReasonModal(true)}>
              В архив
            </button>
            <button type="button" className="btn-secondary" onClick={() => setEditMode(true)}>
              ✎ Редактировать
            </button>
          </div>

          {showArchiveReasonModal && (
            <div className="modal-overlay modal-overlay-inner" onClick={closeArchiveReasonModal}>
              <div className="modal-content archive-reason-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                  <h3>Причина архивации</h3>
                  <button className="modal-close" onClick={closeArchiveReasonModal}>✕</button>
                </div>
                <div className="modal-body">
                  <div className="form-group">
                    <label>Укажите причину *</label>
                    <textarea
                      className="archive-reason-input"
                      value={archiveReason}
                      onChange={e => setArchiveReason(e.target.value)}
                      placeholder="Например: Уволился или Перевод в отдел РД"
                      rows={4}
                    />
                  </div>
                  <div className="form-actions">
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={closeArchiveReasonModal}
                      disabled={archiving}
                    >
                      Отмена
                    </button>
                    <button
                      type="button"
                      className="btn-danger"
                      onClick={handleArchive}
                      disabled={archiving || archiveReason.trim().length === 0}
                    >
                      {archiving ? 'Архивируем...' : 'Подтвердить'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function AdminTenderPage() {
  const { employees, loading, loadEmployees, clearAllEmployees, selectedYear, selectedMonth } = useTenderData()
  const [activeTab, setActiveTab] = useState<AdminTab>('employees')
  const [detailSourceTab, setDetailSourceTab] = useState<AdminTab>('employees')
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeWithStats | null>(null)
  const [showImportEmployees, setShowImportEmployees] = useState(false)
  const [showImportSalaryHistory, setShowImportSalaryHistory] = useState(false)
  const [showConfirmClearSalaryHistory, setShowConfirmClearSalaryHistory] = useState(false)
  const [showConfirmClear, setShowConfirmClear] = useState(false)
  const [clearingSalaryHistory, setClearingSalaryHistory] = useState(false)
  const [showAddEmployee, setShowAddEmployee] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState<EditableEmployee | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [timesheetSummary, setTimesheetSummary] = useState<TimesheetSummary[]>([])
  const [loadingTimesheet, setLoadingTimesheet] = useState(false)
  const [timesheetYear, setTimesheetYear] = useState<number | null>(null)
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

  const refreshAdminData = async () => {
    await Promise.all([loadEmployees(), loadSubdivisions(), loadTimesheetSummary()])
    await loadArchivedEmployees()
  }

  useEffect(() => {
    refreshAdminData()
  }, [])

  useEffect(() => {
    if (activeTab === 'archive') {
      loadArchivedEmployees()
    }
  }, [activeTab])

  const getMonthStatus = (month: number) => {
    if (!timesheetYear) return undefined
    return timesheetSummary.find(s => s.year === timesheetYear && s.month === month)
  }

  const displayYear = timesheetYear ?? new Date().getFullYear()

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  const handleSyncTimesheetPeriod = async (year: number, month: number) => {
    setSyncingTimesheet(true)
    try {
      const result = await syncFotTimesheetMonth(year, month, employees)
      await Promise.all([loadEmployees(year, month), loadTimesheetSummary()])
      showToast(`FOT табель: ${result.matched} строк, ${result.failed} ошибок`)
    } catch (err) {
      console.error('Error syncing FOT timesheet:', err)
      showToast(err instanceof Error ? err.message : 'Ошибка синхронизации FOT')
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
      await loadEmployees()
      showToast('Сотрудник обновлён')
    } catch {
      showToast('Ошибка при сохранении')
    }
  }

  const handleAddEmployee = async (emp: NewEmployee) => {
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
      await loadEmployees()
      showToast('Сотрудник добавлен')
    } catch (err) {
      showToast('Ошибка при добавлении')
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

      await loadEmployees()
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

  const handleArchiveEmployee = async (id: number, reason: string) => {
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
      await Promise.all([loadEmployees(), loadArchivedEmployees(), loadTimesheetSummary()])
      showToast('Сотрудник в архиве')
    } catch (err) {
      console.error('Error archiving employee:', err)
      showToast('Ошибка при архивации')
      throw err
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

      await Promise.all([loadEmployees(), loadArchivedEmployees(), loadTimesheetSummary()])
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

  if (loading) return <div className="tender-loading"><div className="tender-spinner" /><div>Загрузка...</div></div>

  if (selectedEmployee) {
    return (
      <div className="tender-page">
        <header className="tender-header">
          <div className="tender-logo">
            <div className="tender-icon">А</div>
            <div><h1>Администрирование ТУ</h1><span>Управление данными</span></div>
          </div>
        </header>

        <div className="tender-content">
          <EmployeeDetail
            employee={selectedEmployee}
            year={selectedYear}
            month={selectedMonth}
            onBack={() => {
              setSelectedEmployee(null)
              setActiveTab(detailSourceTab)
            }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="tender-page">
      <header className="tender-header">
        <div className="tender-logo">
          <div className="tender-icon">А</div>
          <div><h1>Администрирование ТУ</h1><span>Управление данными</span></div>
        </div>
      </header>

      <div className="tender-content">
        <div className="admin-section">
          <h3>Синхронизация данных</h3>
          <div className="admin-actions">
            <div className="admin-card">
              <h4>Сотрудники</h4>
              <p>Синхронизация из FOT API</p>
              <button className="btn-primary" onClick={() => setShowImportEmployees(true)}>Синхронизировать</button>
            </div>
            <div className="admin-card">
              <h4>История ЗП</h4>
              <p>Изменения окладов</p>
              <button className="btn-primary" onClick={() => setShowImportSalaryHistory(true)}>Импорт</button>
            </div>
            <div className="admin-card admin-card-danger">
              <h4>Очистка повышений</h4>
              <p>Удалить историю окладов</p>
              <button className="btn-danger" onClick={() => setShowConfirmClearSalaryHistory(true)}>
                Очистить
              </button>
            </div>
            <div className="admin-card admin-card-danger">
              <h4>Очистка</h4>
              <p>Удалить всё</p>
              <button className="btn-danger" onClick={() => setShowConfirmClear(true)}>Очистить</button>
            </div>
          </div>
        </div>

        <div className="tender-tabs">
          <button className={`tab-btn ${activeTab === 'employees' ? 'active' : ''}`} onClick={() => setActiveTab('employees')}>Сотрудники</button>
          <button className={`tab-btn ${activeTab === 'timesheet' ? 'active' : ''}`} onClick={() => setActiveTab('timesheet')}>Табель</button>
          <button className={`tab-btn ${activeTab === 'subdivisions' ? 'active' : ''}`} onClick={() => setActiveTab('subdivisions')}>Управление подразделениями</button>
          <button className={`tab-btn ${activeTab === 'archive' ? 'active' : ''}`} onClick={() => setActiveTab('archive')}>Архив</button>
        </div>

        {activeTab === 'employees' && (
          <>
            <div className="admin-section">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ margin: 0 }}>Сотрудники ({employees.length})</h3>
                <button className="btn-primary" onClick={() => setShowAddEmployee(true)}>+ Добавить</button>
              </div>
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
                          onClick={() => {
                            setDetailSourceTab(activeTab)
                            setSelectedEmployee(emp)
                          }}
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
                          <td>
                            <button className="btn-edit" onClick={event => { event.stopPropagation(); handleEditEmployee(emp) }}>✎</button>
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

        {activeTab === 'timesheet' && (
          <div className="admin-section">
            <div className="timesheet-year-nav">
              <button className="month-btn" onClick={() => setTimesheetYear(displayYear - 1)}>←</button>
              <span className="timesheet-year-title">{displayYear}</span>
              <button className="month-btn" onClick={() => setTimesheetYear(displayYear + 1)}>→</button>
            </div>

            <div className="timesheet-sync-panel">
              <label className="timesheet-sync-control">
                <span>Период</span>
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
                onClick={() => handleSyncTimesheetPeriod(displayYear, timesheetSyncMonth)}
                disabled={syncingTimesheet || employees.length === 0}
              >
                {syncingTimesheet ? 'Синхронизация...' : 'Синхронизировать за выбранный период'}
              </button>
              <span className="timesheet-sync-note">Источник: FOT API</span>
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
        )}

        {activeTab === 'subdivisions' && (
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

        {activeTab === 'archive' && (
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
      </div>

      {showImportEmployees && <ImportEmployeesModal onClose={() => setShowImportEmployees(false)} onSuccess={() => {
        loadEmployees()
        loadSubdivisions()
        loadArchivedEmployees()
        loadTimesheetSummary()
        showToast('Сотрудники синхронизированы')
      }} />}
      {showImportSalaryHistory && <ImportSalaryHistoryModal onClose={() => setShowImportSalaryHistory(false)} onSuccess={() => {
        loadEmployees()
        showToast('История окладов импортирована')
      }} />}
      {showConfirmClearSalaryHistory && (
        <div className="modal-overlay" onClick={() => !clearingSalaryHistory && setShowConfirmClearSalaryHistory(false)}>
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
        <div className="modal-overlay" onClick={() => setShowConfirmClear(false)}>
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
          onSalaryHistoryChange={() => loadEmployees()}
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
      {toast && <div className="toast"><span>✓</span>{toast}</div>}
    </div>
  )
}

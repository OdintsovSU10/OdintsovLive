import { useState, useEffect, useMemo, Fragment } from 'react'
import { supabase } from '../../lib/supabase'
import { useTenderData } from './hooks/useTenderData'
import { ImportEmployeesModal } from './components/ImportEmployeesModal'
import { ImportTimesheetModal } from './components/ImportTimesheetModal'
import { ImportSalaryHistoryModal } from './components/ImportSalaryHistoryModal'
import type { Employee, SalaryHistory } from './types'
import './TenderPage.css'
import './AdminTenderPage.css'

type AdminTab = 'employees' | 'timesheet'

interface TimesheetSummary {
  year: number
  month: number
  records_count: number
  employees_count: number
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

function getSubdivisionOrder(subdiv: string | null): number {
  if (!subdiv) return 999
  const lower = subdiv.toLowerCase()
  const idx = SUBDIVISION_ORDER.findIndex(s => lower.includes(s.toLowerCase()))
  return idx >= 0 ? idx : 999
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

function AddEmployeeModal({ onClose, onSave }: {
  onClose: () => void
  onSave: (emp: NewEmployee) => void
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
              <input value={form.subdivision} onChange={e => handleChange('subdivision', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Оклад</label>
              <input type="number" value={form.current_salary} onChange={e => handleChange('current_salary', Number(e.target.value))} />
            </div>
            <div className="form-group">
              <label>Ежемес. бонус</label>
              <input type="number" value={form.monthly_bonus || ''} onChange={e => handleChange('monthly_bonus', Number(e.target.value) || 0)} />
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

function EmployeeModal({ employee, onClose, onSave, onSalaryHistoryChange, onArchive }: {
  employee: EditableEmployee
  onClose: () => void
  onSave: (emp: EditableEmployee) => void
  onSalaryHistoryChange: () => void
  onArchive: (id: number) => void
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
    effective_date: new Date().toISOString().split('T')[0],
    note: 'Повышение оклада'
  })
  const [savingSalary, setSavingSalary] = useState(false)

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
      setSalaryHistory(data || [])
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

      // Обновляем текущий оклад сотрудника
      await supabase
        .from('tender_employees')
        .update({ current_salary: newSalary.salary })
        .eq('id', employee.id)

      await loadSalaryHistory()
      onSalaryHistoryChange()
      setDisplaySalary(newSalary.salary)
      setShowAddSalary(false)
      setNewSalary({ salary: newSalary.salary, effective_date: new Date().toISOString().split('T')[0], note: 'Повышение оклада' })
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
                <input value={form.subdivision} onChange={e => handleChange('subdivision', e.target.value)} />
              </div>
              <div className="form-group">
                <label>Оклад</label>
                <input type="number" value={form.current_salary} onChange={e => handleChange('current_salary', Number(e.target.value))} />
              </div>
              <div className="form-group">
                <label>Ежемес. бонус</label>
                <input type="number" value={form.monthly_bonus || ''} onChange={e => handleChange('monthly_bonus', Number(e.target.value) || 0)} />
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
              <div className="emp-detail-label">Ежемес. бонус</div>
              <div className="emp-detail-value" style={{ color: employee.monthly_bonus > 0 ? 'var(--primary)' : 'var(--text-secondary)' }}>
                {employee.monthly_bonus > 0 ? `${employee.monthly_bonus.toLocaleString('ru-RU')} ₽` : '—'}
              </div>
            </div>
            <div className="emp-detail-card">
              <div className="emp-detail-label">Дата приёма</div>
              <div className="emp-detail-value">{formatDate(employee.hire_date)}</div>
            </div>
            {employee.birth_date && (
              <div className="emp-detail-card">
                <div className="emp-detail-label">Дата рождения</div>
                <div className="emp-detail-value">{formatDate(employee.birth_date)}</div>
              </div>
            )}
            {employee.phone && (
              <div className="emp-detail-card">
                <div className="emp-detail-label">Телефон</div>
                <div className="emp-detail-value">{employee.phone}</div>
              </div>
            )}
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
                      type="number"
                      value={newSalary.salary}
                      onChange={e => setNewSalary(prev => ({ ...prev, salary: Number(e.target.value) }))}
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
            <button type="button" className="btn-danger" onClick={() => onArchive(employee.id)}>
              В архив
            </button>
            <button type="button" className="btn-secondary" onClick={() => setEditMode(true)}>
              ✎ Редактировать
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function AdminTenderPage() {
  const { employees, loading, loadEmployees, clearAllEmployees } = useTenderData()
  const [activeTab, setActiveTab] = useState<AdminTab>('employees')
  const [showImportEmployees, setShowImportEmployees] = useState(false)
  const [showImportTimesheet, setShowImportTimesheet] = useState(false)
  const [showImportSalaryHistory, setShowImportSalaryHistory] = useState(false)
  const [showConfirmClear, setShowConfirmClear] = useState(false)
  const [showAddEmployee, setShowAddEmployee] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState<EditableEmployee | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [timesheetSummary, setTimesheetSummary] = useState<TimesheetSummary[]>([])
  const [loadingTimesheet, setLoadingTimesheet] = useState(false)
  const [timesheetYear, setTimesheetYear] = useState<number | null>(null)

  useEffect(() => {
    loadEmployees()
    loadTimesheetSummary()
  }, [])

  const loadTimesheetSummary = async () => {
    setLoadingTimesheet(true)
    try {
      const { data } = await supabase
        .from('tender_timesheet')
        .select('employee_id, work_date')

      if (data) {
        const summary: Record<string, { year: number; month: number; records: number; employees: Set<number> }> = {}
        for (const row of data) {
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

        // Установить год на последний с данными или текущий
        if (result.length > 0) {
          const latestYear = Math.max(...result.map(r => r.year))
          setTimesheetYear(prev => prev ?? latestYear)
        } else {
          setTimesheetYear(prev => prev ?? new Date().getFullYear())
        }
      }
    } finally {
      setLoadingTimesheet(false)
    }
  }

  const getMonthStatus = (month: number) => {
    if (!timesheetYear) return undefined
    return timesheetSummary.find(s => s.year === timesheetYear && s.month === month)
  }

  const displayYear = timesheetYear ?? new Date().getFullYear()

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  const handleEditEmployee = (emp: Employee) => {
    setEditingEmployee({
      id: emp.id,
      full_name: emp.full_name,
      last_name: emp.last_name || '',
      first_name: emp.first_name || '',
      middle_name: emp.middle_name || '',
      position: emp.position,
      department: emp.department || '',
      subdivision: emp.subdivision || '',
      current_salary: emp.current_salary,
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
      loadEmployees()
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
      loadEmployees()
      showToast('Сотрудник добавлен')
    } catch (err) {
      showToast('Ошибка при добавлении')
    }
  }

  const handleArchiveEmployee = async (id: number) => {
    if (!confirm('Отправить сотрудника в архив?')) return
    try {
      const { error } = await supabase
        .from('tender_employees')
        .update({ is_archived: true, archived_at: new Date().toISOString() })
        .eq('id', id)

      if (error) throw error

      setEditingEmployee(null)
      loadEmployees()
      showToast('Сотрудник в архиве')
    } catch (err) {
      showToast('Ошибка при архивации')
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

    const groups: Record<string, Employee[]> = {}
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

  return (
    <div className="tender-page">
      <header className="tender-header">
        <div className="tender-logo">
          <div className="tender-icon">А</div>
          <div><h1>Администрирование ТУ</h1><span>Управление данными</span></div>
        </div>
      </header>

      <div className="tender-content">
        {/* Единый блок импорта */}
        <div className="admin-section">
          <h3>Импорт данных</h3>
          <div className="admin-actions">
            <div className="admin-card">
              <h4>Сотрудники</h4>
              <p>Список из Excel</p>
              <button className="btn-primary" onClick={() => setShowImportEmployees(true)}>Импорт</button>
            </div>
            <div className="admin-card">
              <h4>Табель</h4>
              <p>Учёт рабочего времени</p>
              <button className="btn-primary" onClick={() => setShowImportTimesheet(true)}>Импорт</button>
            </div>
            <div className="admin-card">
              <h4>История ЗП</h4>
              <p>Изменения окладов</p>
              <button className="btn-primary" onClick={() => setShowImportSalaryHistory(true)}>Импорт</button>
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
                  <th>Телефон</th>
                  <th>Email</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {groupedEmployees.map(group => (
                  <Fragment key={group.name}>
                    <tr className="emp-list-subdiv-row">
                      <td colSpan={7}>{group.name} <span>({group.employees.length})</span></td>
                    </tr>
                    {group.employees.map(emp => (
                      <tr key={emp.id} className="emp-list-row">
                        <td className="emp-list-name">
                          <span>{emp.full_name}</span>
                        </td>
                        <td className="emp-list-position">{emp.position}</td>
                        <td className="emp-list-dept">{emp.department || '—'}</td>
                        <td className="emp-list-salary">{emp.current_salary.toLocaleString('ru-RU')} ₽</td>
                        <td>{emp.phone || '—'}</td>
                        <td>{emp.email || '—'}</td>
                        <td>
                          <button className="btn-edit" onClick={() => handleEditEmployee(emp)}>✎</button>
                        </td>
                      </tr>
                    ))}
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
                          <button className="btn-link" onClick={() => setShowImportTimesheet(true)}>Обновить</button>
                        </div>
                      ) : (
                        <div className="timesheet-month-status">
                          <span className="timesheet-cross">✗</span>
                          <button className="btn-link" onClick={() => setShowImportTimesheet(true)}>Подгрузить</button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {showImportEmployees && <ImportEmployeesModal onClose={() => setShowImportEmployees(false)} onSuccess={() => { loadEmployees(); showToast('Сотрудники импортированы') }} />}
      {showImportTimesheet && <ImportTimesheetModal employees={employees} onClose={() => setShowImportTimesheet(false)} onSuccess={() => { loadEmployees(); loadTimesheetSummary(); showToast('Табель импортирован') }} />}
      {showImportSalaryHistory && <ImportSalaryHistoryModal onClose={() => setShowImportSalaryHistory(false)} onSuccess={() => { loadEmployees(); showToast('История окладов импортирована') }} />}
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
        />
      )}
      {showAddEmployee && (
        <AddEmployeeModal
          onClose={() => setShowAddEmployee(false)}
          onSave={handleAddEmployee}
        />
      )}
      {toast && <div className="toast"><span>✓</span>{toast}</div>}
    </div>
  )
}

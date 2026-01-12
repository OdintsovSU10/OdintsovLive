import { useEffect, useState } from 'react'
import { Users, Plus, Upload, Archive, Edit2, TrendingUp, X, ChevronRight } from 'lucide-react'
import { supabase } from '../lib/supabase'
import * as XLSX from 'xlsx'
import './TenderPage.css'

interface Employee {
  id: number
  full_name: string
  position: string
  hire_date: string
  current_salary: number
  is_archived: boolean
  archived_at: string | null
  created_at: string
}

interface SalaryHistory {
  id: number
  employee_id: number
  salary: number
  effective_date: string
  note: string | null
}

export default function TenderPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [salaryHistory, setSalaryHistory] = useState<{ [key: number]: SalaryHistory[] }>({})
  const [loading, setLoading] = useState(true)
  const [showArchived, setShowArchived] = useState(false)
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null)
  const [showAddEmployee, setShowAddEmployee] = useState(false)
  const [showAddRaise, setShowAddRaise] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null)

  // Form states
  const [formName, setFormName] = useState('')
  const [formPosition, setFormPosition] = useState('')
  const [formHireDate, setFormHireDate] = useState('')
  const [formSalary, setFormSalary] = useState('')
  const [raiseAmount, setRaiseAmount] = useState('')
  const [raiseDate, setRaiseDate] = useState(new Date().toISOString().split('T')[0])
  const [raiseNote, setRaiseNote] = useState('')

  useEffect(() => {
    loadEmployees()
  }, [showArchived])

  const loadEmployees = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('tender_employees')
      .select('*')
      .eq('is_archived', showArchived)
      .order('full_name')

    if (data) {
      setEmployees(data)
      // Load salary history for all employees
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
  }

  const calcTenure = (hireDate: string): string => {
    const hire = new Date(hireDate)
    const now = new Date()
    const years = now.getFullYear() - hire.getFullYear()
    const months = now.getMonth() - hire.getMonth()
    const totalMonths = years * 12 + months
    const y = Math.floor(totalMonths / 12)
    const m = totalMonths % 12
    if (y === 0) return `${m} мес.`
    if (m === 0) return `${y} г.`
    return `${y} г. ${m} мес.`
  }

  const getLastRaise = (employeeId: number): SalaryHistory | null => {
    const history = salaryHistory[employeeId]
    return history && history.length > 0 ? history[0] : null
  }

  const getDaysSinceRaise = (employeeId: number, hireDate: string): number => {
    const lastRaise = getLastRaise(employeeId)
    const date = lastRaise ? new Date(lastRaise.effective_date) : new Date(hireDate)
    const now = new Date()
    return Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
  }

  const addEmployee = async () => {
    if (!formName || !formPosition || !formHireDate || !formSalary) return

    const salary = parseFloat(formSalary.replace(/\s/g, '')) || 0
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
      // Add initial salary to history
      await supabase.from('tender_salary_history').insert({
        employee_id: data.id,
        salary: salary,
        effective_date: formHireDate,
        note: 'Начальный оклад'
      })
      loadEmployees()
      resetForm()
      setShowAddEmployee(false)
    }
  }

  const updateEmployee = async () => {
    if (!editingEmployee || !formName || !formPosition) return

    await supabase
      .from('tender_employees')
      .update({
        full_name: formName,
        position: formPosition,
        updated_at: new Date().toISOString()
      })
      .eq('id', editingEmployee.id)

    loadEmployees()
    resetForm()
    setEditingEmployee(null)
  }

  const archiveEmployee = async (employee: Employee) => {
    await supabase
      .from('tender_employees')
      .update({
        is_archived: true,
        archived_at: new Date().toISOString()
      })
      .eq('id', employee.id)

    loadEmployees()
    setSelectedEmployee(null)
  }

  const restoreEmployee = async (employee: Employee) => {
    await supabase
      .from('tender_employees')
      .update({
        is_archived: false,
        archived_at: null
      })
      .eq('id', employee.id)

    loadEmployees()
  }

  const addRaise = async () => {
    if (!selectedEmployee || !raiseAmount || !raiseDate) return

    const salary = parseFloat(raiseAmount.replace(/\s/g, '')) || 0

    // Add to history
    await supabase.from('tender_salary_history').insert({
      employee_id: selectedEmployee.id,
      salary: salary,
      effective_date: raiseDate,
      note: raiseNote || null
    })

    // Update current salary
    await supabase
      .from('tender_employees')
      .update({
        current_salary: salary,
        updated_at: new Date().toISOString()
      })
      .eq('id', selectedEmployee.id)

    loadEmployees()
    setRaiseAmount('')
    setRaiseDate(new Date().toISOString().split('T')[0])
    setRaiseNote('')
    setShowAddRaise(false)
  }

  const resetForm = () => {
    setFormName('')
    setFormPosition('')
    setFormHireDate('')
    setFormSalary('')
  }

  const openEditEmployee = (employee: Employee) => {
    setEditingEmployee(employee)
    setFormName(employee.full_name)
    setFormPosition(employee.position)
  }

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async (evt) => {
      const data = evt.target?.result
      const workbook = XLSX.read(data, { type: 'binary' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 })

      // Skip header if exists
      const dataRows = rows.filter((row, i) => i > 0 && row.length >= 4)

      for (const row of dataRows) {
        const [name, position, hireDateRaw, salaryRaw] = row
        if (!name) continue

        // Parse date
        let hireDate: string
        if (typeof hireDateRaw === 'number') {
          const date = XLSX.SSF.parse_date_code(hireDateRaw)
          hireDate = `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`
        } else {
          hireDate = String(hireDateRaw)
        }

        const salary = typeof salaryRaw === 'number' ? salaryRaw : parseFloat(String(salaryRaw).replace(/\s/g, '')) || 0

        const { data: emp } = await supabase
          .from('tender_employees')
          .insert({
            full_name: String(name).trim(),
            position: String(position).trim(),
            hire_date: hireDate,
            current_salary: salary
          })
          .select()
          .single()

        if (emp) {
          await supabase.from('tender_salary_history').insert({
            employee_id: emp.id,
            salary: salary,
            effective_date: hireDate,
            note: 'Начальный оклад (импорт)'
          })
        }
      }

      loadEmployees()
    }
    reader.readAsBinaryString(file)
    e.target.value = ''
  }

  const formatMoney = (amount: number) => {
    return Math.round(amount).toLocaleString('ru-RU') + ' ₽'
  }

  return (
    <div className="tender-page">
      <div className="tender-header">
        <div className="tender-title">
          <Users size={24} />
          <h1>Тендерный отдел</h1>
        </div>
      </div>
      <div className="tender-toolbar">
        <label className="archive-toggle">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          <span className="toggle-track" />
          <span>Архив</span>
        </label>
        <div className="tender-actions">
          <label className="btn-import">
            <Upload size={18} />
            <span>Импорт</span>
            <input type="file" accept=".xlsx,.xls" onChange={handleImportExcel} hidden />
          </label>
          <button className="btn-add" onClick={() => setShowAddEmployee(true)}>
            <Plus size={18} />
            <span>Сотрудник</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading">Загрузка...</div>
      ) : employees.length === 0 ? (
        <div className="empty-state">
          <Users size={48} />
          <p>{showArchived ? 'Архив пуст' : 'Нет сотрудников'}</p>
        </div>
      ) : (
        <div className="employees-table">
          <div className="table-header">
            <span className="col-name">ФИО</span>
            <span className="col-position">Должность</span>
            <span className="col-hire">Трудоустройство</span>
            <span className="col-tenure">Стаж</span>
            <span className="col-salary">Оклад</span>
            <span className="col-raise">Последнее повышение</span>
            <span className="col-days">Дней</span>
          </div>
          {employees.map(emp => {
            const days = getDaysSinceRaise(emp.id, emp.hire_date)
            const lastRaise = getLastRaise(emp.id)
            const needsAttention = days > 365

            return (
              <div
                key={emp.id}
                className={`table-row ${needsAttention ? 'attention' : ''} ${emp.is_archived ? 'archived' : ''}`}
                onClick={() => setSelectedEmployee(emp)}
              >
                <span className="col-name">{emp.full_name}</span>
                <span className="col-position">{emp.position}</span>
                <span className="col-hire">{new Date(emp.hire_date).toLocaleDateString('ru-RU')}</span>
                <span className="col-tenure">{calcTenure(emp.hire_date)}</span>
                <span className="col-salary">{formatMoney(emp.current_salary)}</span>
                <span className="col-raise">
                  {lastRaise ? new Date(lastRaise.effective_date).toLocaleDateString('ru-RU') : '—'}
                </span>
                <span className={`col-days ${needsAttention ? 'warning' : ''}`}>{days}</span>
                <ChevronRight size={16} className="row-arrow" />
              </div>
            )
          })}
        </div>
      )}

      {/* Add Employee Modal */}
      {showAddEmployee && (
        <div className="modal-overlay" onClick={() => setShowAddEmployee(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Новый сотрудник</h2>
              <button className="modal-close" onClick={() => setShowAddEmployee(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>ФИО</label>
                <input
                  type="text"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="Иванов Иван Иванович"
                />
              </div>
              <div className="form-group">
                <label>Должность</label>
                <input
                  type="text"
                  value={formPosition}
                  onChange={e => setFormPosition(e.target.value)}
                  placeholder="Специалист"
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Дата трудоустройства</label>
                  <input
                    type="date"
                    value={formHireDate}
                    onChange={e => setFormHireDate(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Оклад</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={formSalary}
                    onChange={e => setFormSalary(e.target.value)}
                    placeholder="50 000"
                  />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => { setShowAddEmployee(false); resetForm() }}>
                Отмена
              </button>
              <button className="btn-save" onClick={addEmployee}>
                Добавить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Employee Modal */}
      {editingEmployee && (
        <div className="modal-overlay" onClick={() => setEditingEmployee(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Редактирование</h2>
              <button className="modal-close" onClick={() => setEditingEmployee(null)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>ФИО</label>
                <input
                  type="text"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Должность</label>
                <input
                  type="text"
                  value={formPosition}
                  onChange={e => setFormPosition(e.target.value)}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => { setEditingEmployee(null); resetForm() }}>
                Отмена
              </button>
              <button className="btn-save" onClick={updateEmployee}>
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Employee Detail Modal */}
      {selectedEmployee && (
        <div className="modal-overlay" onClick={() => setSelectedEmployee(null)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{selectedEmployee.full_name}</h2>
              <button className="modal-close" onClick={() => setSelectedEmployee(null)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <div className="employee-info">
                <div className="info-row">
                  <span className="info-label">Должность</span>
                  <span className="info-value">{selectedEmployee.position}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Трудоустройство</span>
                  <span className="info-value">
                    {new Date(selectedEmployee.hire_date).toLocaleDateString('ru-RU')}
                  </span>
                </div>
                <div className="info-row">
                  <span className="info-label">Стаж</span>
                  <span className="info-value">{calcTenure(selectedEmployee.hire_date)}</span>
                </div>
                <div className="info-row highlight">
                  <span className="info-label">Текущий оклад</span>
                  <span className="info-value">{formatMoney(selectedEmployee.current_salary)}</span>
                </div>
              </div>

              <div className="salary-history">
                <div className="history-header">
                  <h3>История повышений</h3>
                  {!selectedEmployee.is_archived && (
                    <button className="btn-add-raise" onClick={() => setShowAddRaise(true)}>
                      <TrendingUp size={16} />
                      <span>Повышение</span>
                    </button>
                  )}
                </div>

                {showAddRaise && (
                  <div className="raise-form">
                    <div className="form-row">
                      <div className="form-group">
                        <label>Новый оклад</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={raiseAmount}
                          onChange={e => setRaiseAmount(e.target.value)}
                          placeholder="60 000"
                        />
                      </div>
                      <div className="form-group">
                        <label>Дата</label>
                        <input
                          type="date"
                          value={raiseDate}
                          onChange={e => setRaiseDate(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="form-group">
                      <label>Примечание</label>
                      <input
                        type="text"
                        value={raiseNote}
                        onChange={e => setRaiseNote(e.target.value)}
                        placeholder="Плановое повышение"
                      />
                    </div>
                    <div className="raise-actions">
                      <button className="btn-cancel" onClick={() => setShowAddRaise(false)}>Отмена</button>
                      <button className="btn-save" onClick={addRaise}>Добавить</button>
                    </div>
                  </div>
                )}

                <div className="history-timeline">
                  {(salaryHistory[selectedEmployee.id] || []).map((h, i) => (
                    <div key={h.id} className={`timeline-item ${i === 0 ? 'current' : ''}`}>
                      <div className="timeline-dot" />
                      <div className="timeline-content">
                        <span className="timeline-salary">{formatMoney(h.salary)}</span>
                        <span className="timeline-date">
                          {new Date(h.effective_date).toLocaleDateString('ru-RU')}
                        </span>
                        {h.note && <span className="timeline-note">{h.note}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              {selectedEmployee.is_archived ? (
                <button className="btn-restore" onClick={() => restoreEmployee(selectedEmployee)}>
                  Восстановить
                </button>
              ) : (
                <>
                  <button className="btn-edit" onClick={() => openEditEmployee(selectedEmployee)}>
                    <Edit2 size={16} />
                    Редактировать
                  </button>
                  <button className="btn-archive" onClick={() => archiveEmployee(selectedEmployee)}>
                    <Archive size={16} />
                    В архив
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

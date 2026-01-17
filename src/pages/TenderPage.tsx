import { useEffect, useState } from 'react'
import { Users, Plus, Upload, Archive, X, Cake, ChevronLeft, Search, Pencil, Check, ChevronRight } from 'lucide-react'
import { supabase } from '../lib/supabase'
import * as XLSX from 'xlsx'
import './TenderPage.css'

interface Employee {
  id: number
  full_name: string
  position: string
  hire_date: string
  birth_date: string | null
  group_name: string | null
  current_salary: number
  is_archived: boolean
  archived_at: string | null
  created_at: string
}

interface ImportPreview {
  full_name: string
  position: string
  hire_date: string
  birth_date: string | null
  salary: number
  group_name: string | null
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
  const [importPreview, setImportPreview] = useState<ImportPreview[]>([])
  const [showImportPreview, setShowImportPreview] = useState(false)
  const [importing, setImporting] = useState(false)
  const [activeTab, setActiveTab] = useState<'list' | 'birthdays'>('list')
  const [calendarMonth, setCalendarMonth] = useState(new Date())
  const [filterGroups, setFilterGroups] = useState<string[]>([])
  const [filterPositions, setFilterPositions] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [replaceOnImport, setReplaceOnImport] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [selectedForArchive, setSelectedForArchive] = useState<number[]>([])
  const [editedEmployees, setEditedEmployees] = useState<{ [id: number]: { full_name?: string; position?: string } }>({})

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
    if (!history || history.length < 2) return null
    const today = new Date().toISOString().split('T')[0]
    // Найти последнее историческое повышение (не импорт, дата < сегодня)
    const historicalRaises = history.filter((h, i) => i > 0 && h.effective_date < today)
    return historicalRaises.length > 0 ? historicalRaises[0] : null
  }

  const formatMonthYear = (dateStr: string): string => {
    const date = new Date(dateStr)
    const months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
    return `${months[date.getMonth()]} ${date.getFullYear()}`
  }

  const getDaysSinceRaise = (employeeId: number, hireDate: string): number => {
    const lastRaise = getLastRaise(employeeId)
    const date = lastRaise ? new Date(lastRaise.effective_date) : new Date(hireDate)
    const now = new Date()
    return Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
  }

  const formatDaysSinceRaise = (totalDays: number): string => {
    const months = Math.floor(totalDays / 30)
    const days = totalDays % 30
    if (months === 0) return `${days} дн.`
    if (days === 0) return `${months} мес.`
    return `${months} мес. ${days} дн.`
  }

  const getBirthdaysOnDay = (day: number, month: number): Employee[] => {
    return employees.filter(e => {
      if (!e.birth_date || e.is_archived) return false
      const bd = new Date(e.birth_date)
      return bd.getDate() === day && bd.getMonth() === month
    })
  }

  const getCalendarDays = () => {
    const year = calendarMonth.getFullYear()
    const month = calendarMonth.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const startPadding = (firstDay.getDay() + 6) % 7
    const days: { day: number; isCurrentMonth: boolean; birthdays: Employee[] }[] = []

    // Previous month padding
    const prevLastDay = new Date(year, month, 0).getDate()
    for (let i = startPadding - 1; i >= 0; i--) {
      days.push({ day: prevLastDay - i, isCurrentMonth: false, birthdays: [] })
    }

    // Current month
    for (let d = 1; d <= lastDay.getDate(); d++) {
      days.push({ day: d, isCurrentMonth: true, birthdays: getBirthdaysOnDay(d, month) })
    }

    // Next month padding
    const remaining = 42 - days.length
    for (let i = 1; i <= remaining; i++) {
      days.push({ day: i, isCurrentMonth: false, birthdays: [] })
    }

    return days
  }

  const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']

  const uniqueGroups = [...new Set(employees.map(e => e.group_name).filter(Boolean))] as string[]
  const uniquePositions = [...new Set(employees.map(e => e.position).filter(Boolean))]

  const toggleFilter = (value: string, current: string[], setter: (v: string[]) => void) => {
    if (current.includes(value)) {
      setter(current.filter(v => v !== value))
    } else {
      setter([...current, value])
    }
  }

  const filteredEmployees = employees.filter(emp => {
    if (filterGroups.length > 0 && !filterGroups.includes(emp.group_name || '')) return false
    if (filterPositions.length > 0 && !filterPositions.includes(emp.position)) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      if (!emp.full_name.toLowerCase().includes(q) && !emp.position.toLowerCase().includes(q)) return false
    }
    return true
  })

  const toggleSelectForArchive = (id: number) => {
    setSelectedForArchive(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const massArchive = async () => {
    if (selectedForArchive.length === 0) return
    if (!confirm(`Перевести в архив ${selectedForArchive.length} сотрудников?`)) return

    await supabase
      .from('tender_employees')
      .update({ is_archived: true, archived_at: new Date().toISOString() })
      .in('id', selectedForArchive)

    setSelectedForArchive([])
    loadEmployees()
  }

  const saveEditedEmployees = async () => {
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
    setEditedEmployees({})
    loadEmployees()
  }

  const exitEditMode = async () => {
    if (Object.keys(editedEmployees).length > 0) {
      await saveEditedEmployees()
    }
    setEditMode(false)
    setSelectedForArchive([])
  }

  const updateEditedEmployee = (id: number, field: 'full_name' | 'position', value: string) => {
    setEditedEmployees(prev => ({
      ...prev,
      [id]: { ...prev[id], [field]: value }
    }))
  }

  const deleteRaise = async (historyId: number, employeeId: number) => {
    if (!confirm('Удалить эту запись?')) return
    await supabase.from('tender_salary_history').delete().eq('id', historyId)

    // Update current salary to the latest remaining record
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

    loadEmployees()
  }

  const addEmployee = async () => {
    if (!formName || !formPosition || !formHireDate || !formSalary) return

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
      // Add initial salary to history with today's date
      await supabase.from('tender_salary_history').insert({
        employee_id: data.id,
        salary: salary,
        effective_date: today,
        note: 'Текущий оклад'
      })
      loadEmployees()
      resetForm()
      setShowAddEmployee(false)
    }
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

    const raiseSum = parseFloat(raiseAmount.replace(/\s/g, '')) || 0
    const today = new Date().toISOString().split('T')[0]
    const isHistory = raiseDate < today

    let newSalary: number
    const history = salaryHistory[selectedEmployee.id] || []

    if (isHistory) {
      // Найти запись с ближайшей датой ПОСЛЕ новой даты
      const entriesAfter = history.filter(h => h.effective_date > raiseDate)

      if (entriesAfter.length > 0) {
        const nextEntry = entriesAfter[entriesAfter.length - 1]
        newSalary = nextEntry.salary - raiseSum
      } else {
        newSalary = selectedEmployee.current_salary - raiseSum
      }

      // Обновить все записи СТАРШЕ новой даты: вычесть сумму повышения
      const olderEntries = history.filter(h => h.effective_date < raiseDate)
      for (const entry of olderEntries) {
        await supabase
          .from('tender_salary_history')
          .update({ salary: entry.salary - raiseSum })
          .eq('id', entry.id)
      }
    } else {
      // Будущее/сегодня: прибавляем к текущему
      newSalary = selectedEmployee.current_salary + raiseSum
    }

    await supabase.from('tender_salary_history').insert({
      employee_id: selectedEmployee.id,
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
        .eq('id', selectedEmployee.id)
    }

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

  const parseExcelDate = (raw: unknown): string | null => {
    if (!raw) return null
    if (typeof raw === 'number') {
      const date = XLSX.SSF.parse_date_code(raw)
      return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`
    }
    return String(raw)
  }

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (evt) => {
      const data = evt.target?.result
      const workbook = XLSX.read(data, { type: 'binary' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 })

      const dataRows = rows.filter((row, i) => i > 0 && row.length >= 4)
      const preview: ImportPreview[] = []

      for (const row of dataRows) {
        const [name, position, hireDateRaw, salaryRaw, birthDateRaw, groupRaw] = row
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

      setImportPreview(preview)
      setShowImportPreview(true)
    }
    reader.readAsBinaryString(file)
    e.target.value = ''
  }

  const confirmImport = async () => {
    setImporting(true)
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
    setImporting(false)
    setShowImportPreview(false)
    setImportPreview([])
    setReplaceOnImport(false)
    loadEmployees()
  }

  const formatMoney = (amount: number) => {
    return Math.round(amount).toLocaleString('ru-RU') + ' ₽'
  }

  const formatNumberInput = (value: string): string => {
    const digits = value.replace(/\D/g, '')
    return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  }

  const getRaiseDiff = (employeeId: number, index: number): number | null => {
    const history = salaryHistory[employeeId]
    if (!history || index >= history.length - 1) return null
    return history[index].salary - history[index + 1].salary
  }

  const getTimeBetweenRaises = (employeeId: number, index: number): { text: string; overYear: boolean } | null => {
    const history = salaryHistory[employeeId]
    if (!history || index >= history.length - 1) return null
    const current = new Date(history[index].effective_date)
    const prev = new Date(history[index + 1].effective_date)
    const diffDays = Math.floor((current.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24))
    const months = Math.floor(diffDays / 30)
    const years = Math.floor(months / 12)
    const remainingMonths = months % 12
    const overYear = diffDays >= 365
    let text = ''
    if (years > 0 && remainingMonths > 0) {
      text = `${years} г. ${remainingMonths} мес.`
    } else if (years > 0) {
      text = `${years} г.`
    } else if (months > 0) {
      text = `${months} мес.`
    } else {
      text = `${diffDays} дн.`
    }
    return { text, overYear }
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
        <div className="search-box">
          <Search size={16} />
          <input
            type="text"
            placeholder="Поиск..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
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
          {editMode ? (
            <>
              {selectedForArchive.length > 0 && (
                <button className="btn-mass-archive" onClick={massArchive}>
                  <Archive size={18} />
                  <span>В архив ({selectedForArchive.length})</span>
                </button>
              )}
              <button className="btn-edit-done" onClick={exitEditMode}>
                <Check size={18} />
                <span>Готово</span>
              </button>
            </>
          ) : (
            <>
              <button className="btn-edit-mode" onClick={() => setEditMode(true)} title="Режим редактирования">
                <Pencil size={18} />
              </button>
              <label className="btn-import">
                <Upload size={18} />
                <span>Импорт</span>
                <input type="file" accept=".xlsx,.xls" onChange={handleImportExcel} hidden />
              </label>
              <button className="btn-add" onClick={() => setShowAddEmployee(true)}>
                <Plus size={18} />
                <span>Сотрудник</span>
              </button>
            </>
          )}
        </div>
      </div>

      <div className="tender-tabs">
        <button className={`tab ${activeTab === 'list' ? 'active' : ''}`} onClick={() => setActiveTab('list')}>
          <Users size={16} />
          <span>Список</span>
        </button>
        <button className={`tab ${activeTab === 'birthdays' ? 'active' : ''}`} onClick={() => setActiveTab('birthdays')}>
          <Cake size={16} />
          <span>Дни рождения</span>
        </button>
      </div>

      {activeTab === 'list' && (uniqueGroups.length > 0 || uniquePositions.length > 0) && (
        <div className="filters-bar">
          {uniqueGroups.length > 0 && (
            <div className="filter-group">
              <span className="filter-label">Группа:</span>
              {uniqueGroups.map(g => (
                <label key={g} className={`filter-chip ${filterGroups.includes(g) ? 'active' : ''}`}>
                  <input
                    type="checkbox"
                    checked={filterGroups.includes(g)}
                    onChange={() => toggleFilter(g, filterGroups, setFilterGroups)}
                  />
                  {g}
                </label>
              ))}
            </div>
          )}
          {uniquePositions.length > 0 && (
            <div className="filter-group">
              <span className="filter-label">Должность:</span>
              {uniquePositions.map(p => (
                <label key={p} className={`filter-chip ${filterPositions.includes(p) ? 'active' : ''}`}>
                  <input
                    type="checkbox"
                    checked={filterPositions.includes(p)}
                    onChange={() => toggleFilter(p, filterPositions, setFilterPositions)}
                  />
                  {p}
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'birthdays' ? (
        <div className="birthdays-calendar">
          <div className="calendar-header">
            <button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1))}>
              <ChevronLeft size={20} />
            </button>
            <span>{monthNames[calendarMonth.getMonth()]} {calendarMonth.getFullYear()}</span>
            <button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1))}>
              <ChevronRight size={20} />
            </button>
          </div>
          <div className="calendar-weekdays">
            <span>Пн</span><span>Вт</span><span>Ср</span><span>Чт</span><span>Пт</span><span>Сб</span><span>Вс</span>
          </div>
          <div className="calendar-grid">
            {getCalendarDays().map((d, i) => (
              <div
                key={i}
                className={`calendar-day ${!d.isCurrentMonth ? 'other-month' : ''} ${d.birthdays.length > 0 ? 'has-birthday' : ''}`}
              >
                <span className="day-number">{d.day}</span>
                {d.birthdays.length > 0 && (
                  <div className="day-birthdays">
                    {d.birthdays.map(emp => (
                      <span key={emp.id} className="birthday-name" onClick={() => setSelectedEmployee(emp)}>
                        {emp.full_name.split(' ')[0]}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : loading ? (
        <div className="loading">Загрузка...</div>
      ) : filteredEmployees.length === 0 ? (
        <div className="empty-state">
          <Users size={48} />
          <p>{employees.length === 0 ? (showArchived ? 'Архив пуст' : 'Нет сотрудников') : 'Нет результатов'}</p>
        </div>
      ) : (
        <div className={`employees-table ${editMode ? 'edit-mode' : ''}`}>
          <div className="table-header">
            {editMode && <span className="col-checkbox"></span>}
            <span className="col-name">ФИО</span>
            <span className="col-position">Должность</span>
            {!editMode && (
              <>
                <span className="col-tenure">Стаж</span>
                <span className="col-salary">Оклад</span>
                <span className="col-raise">Дата повышения</span>
                <span className="col-days">Без повышения</span>
                <span className="col-actions"></span>
              </>
            )}
          </div>
          {filteredEmployees.map(emp => {
            const days = getDaysSinceRaise(emp.id, emp.hire_date)
            const lastRaise = getLastRaise(emp.id)
            const needsAttention = days > 365
            const isSenior = emp.position.toLowerCase().includes('старший') || emp.position.toLowerCase().includes('ведущий')
            const editedName = editedEmployees[emp.id]?.full_name ?? emp.full_name
            const editedPosition = editedEmployees[emp.id]?.position ?? emp.position

            return (
              <div
                key={emp.id}
                className={`table-row ${needsAttention ? 'attention' : ''} ${emp.is_archived ? 'archived' : ''} ${selectedEmployee?.id === emp.id ? 'selected' : ''}`}
                onClick={() => !editMode && setSelectedEmployee(emp)}
                data-meta={`${formatMoney(emp.current_salary)} · ${calcTenure(emp.hire_date)} · Без повыш.: ${formatDaysSinceRaise(days)}`}
              >
                {editMode && (
                  <span className="col-checkbox">
                    <input
                      type="checkbox"
                      checked={selectedForArchive.includes(emp.id)}
                      onChange={() => toggleSelectForArchive(emp.id)}
                    />
                  </span>
                )}
                {editMode ? (
                  <>
                    <input
                      className={`col-name edit-input ${isSenior ? 'senior' : ''}`}
                      value={editedName}
                      onChange={e => updateEditedEmployee(emp.id, 'full_name', e.target.value)}
                      onClick={e => e.stopPropagation()}
                    />
                    <input
                      className={`col-position edit-input ${isSenior ? 'senior' : ''}`}
                      value={editedPosition}
                      onChange={e => updateEditedEmployee(emp.id, 'position', e.target.value)}
                      onClick={e => e.stopPropagation()}
                    />
                  </>
                ) : (
                  <>
                    <span className={`col-name ${isSenior ? 'senior' : ''}`}>{emp.full_name}</span>
                    <span className={`col-position ${isSenior ? 'senior' : ''}`}>{emp.position}</span>
                    <span className="col-tenure" title={`Трудоустройство: ${new Date(emp.hire_date).toLocaleDateString('ru-RU')}`}>
                      {calcTenure(emp.hire_date)}
                    </span>
                    <span className="col-salary">{formatMoney(emp.current_salary)}</span>
                    <span className="col-raise">
                      {lastRaise ? formatMonthYear(lastRaise.effective_date) : '—'}
                    </span>
                    <span className={`col-days ${needsAttention ? 'warning' : ''}`}>{formatDaysSinceRaise(days)}</span>
                    <span className="col-actions">
                      {!emp.is_archived && (
                        <button
                          className="btn-quick-raise"
                          onClick={(e) => { e.stopPropagation(); setSelectedEmployee(emp); setShowAddRaise(true) }}
                          title="Добавить повышение"
                        >
                          <Plus size={14} />
                        </button>
                      )}
                    </span>
                  </>
                )}
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

      {/* Employee Detail Sidebar */}
      <div className={`employee-sidebar ${selectedEmployee ? 'open' : ''}`}>
        {selectedEmployee && (
          <>
            <div className="sidebar-header">
              <h2>{selectedEmployee.full_name}</h2>
              <button className="sidebar-close" onClick={() => { setSelectedEmployee(null); setShowAddRaise(false) }}>
                <X size={20} />
              </button>
            </div>
            <div className="sidebar-body">
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
                  <h3>История окладов</h3>
                  {!selectedEmployee.is_archived && (
                    <button className="btn-add-raise" onClick={() => setShowAddRaise(!showAddRaise)}>
                      <Plus size={16} />
                    </button>
                  )}
                </div>

                {showAddRaise && (
                  <div className="raise-form">
                    <div className="form-row">
                      <div className="form-group">
                        <label>Сумма повышения</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={raiseAmount}
                          onChange={e => setRaiseAmount(formatNumberInput(e.target.value))}
                          placeholder="5 000"
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
                  {(salaryHistory[selectedEmployee.id] || []).map((h, i) => {
                    const diff = getRaiseDiff(selectedEmployee.id, i)
                    const timeBetween = getTimeBetweenRaises(selectedEmployee.id, i)
                    return (
                      <div key={h.id} className={`timeline-item ${i === 0 ? 'current' : ''}`}>
                        <div className="timeline-dot" />
                        <div className="timeline-content">
                          <span className="timeline-salary">{formatMoney(h.salary)}</span>
                          {diff !== null && (
                            <span className={`timeline-diff ${diff >= 0 ? 'positive' : 'negative'}`}>
                              {diff >= 0 ? '+' : ''}{formatMoney(diff)}
                            </span>
                          )}
                          <span className="timeline-date">
                            {new Date(h.effective_date).toLocaleDateString('ru-RU')}
                          </span>
                          {timeBetween && (
                            <span className={`timeline-interval ${timeBetween.overYear ? 'over-year' : ''}`}>
                              через {timeBetween.text}
                            </span>
                          )}
                          {h.note && <span className="timeline-note">{h.note}</span>}
                        </div>
                        <button
                          className="timeline-delete"
                          onClick={() => deleteRaise(h.id, selectedEmployee.id)}
                          title="Удалить"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
            <div className="sidebar-footer">
              {selectedEmployee.is_archived ? (
                <button className="btn-restore" onClick={() => restoreEmployee(selectedEmployee)}>
                  Восстановить
                </button>
              ) : (
                <button className="btn-archive" onClick={() => archiveEmployee(selectedEmployee)}>
                  <Archive size={16} />
                  В архив
                </button>
              )}
            </div>
          </>
        )}
      </div>
      {selectedEmployee && <div className="sidebar-overlay" onClick={() => { setSelectedEmployee(null); setShowAddRaise(false) }} />}

      {/* Import Preview Modal */}
      {showImportPreview && (
        <div className="modal-overlay" onClick={() => setShowImportPreview(false)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Предпросмотр импорта ({importPreview.length} сотр.)</h2>
              <button className="modal-close" onClick={() => setShowImportPreview(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <div className="import-preview-table">
                <div className="preview-header">
                  <span>ФИО</span>
                  <span>Должность</span>
                  <span>Трудоустройство</span>
                  <span>Дата рождения</span>
                  <span>Оклад</span>
                  <span>Группа</span>
                </div>
                {importPreview.map((item, i) => (
                  <div key={i} className="preview-row">
                    <span>{item.full_name}</span>
                    <span>{item.position}</span>
                    <span>{item.hire_date ? new Date(item.hire_date).toLocaleDateString('ru-RU') : '—'}</span>
                    <span>{item.birth_date ? new Date(item.birth_date).toLocaleDateString('ru-RU') : '—'}</span>
                    <span>{formatMoney(item.salary)}</span>
                    <span>{item.group_name || '—'}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <label className="replace-toggle">
                <input
                  type="checkbox"
                  checked={replaceOnImport}
                  onChange={e => setReplaceOnImport(e.target.checked)}
                />
                <span>Заменить существующих</span>
              </label>
              <button className="btn-cancel" onClick={() => setShowImportPreview(false)}>
                Отмена
              </button>
              <button className="btn-save" onClick={confirmImport} disabled={importing}>
                {importing ? 'Импорт...' : `Импортировать (${importPreview.length})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

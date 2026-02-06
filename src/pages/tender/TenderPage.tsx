import { useState, useMemo, useEffect } from 'react'
import { useTenderData } from './hooks/useTenderData'
import { TimesheetGrid } from './components/TimesheetGrid'
import { DepartmentFOT } from './components/DepartmentFOT'
import { SalaryChart } from './components/SalaryChart'
import { getWorkDaysNorm } from '../../lib/workNorms'
import type { EmployeeWithStats, TenderTab } from './types'
import './TenderPage.css'

// const statusInfo = (status: string) => {
//   const map: Record<string, { label: string; color: string; bg: string }> = {
//     active: { label: 'На работе', color: '#2e7d32', bg: '#e8f5e9' },
//     vacation: { label: 'Отпуск', color: '#f57f17', bg: '#fff8e1' },
//     sick: { label: 'Больничный', color: '#c62828', bg: '#fce4ec' },
//     remote: { label: 'Удалённо', color: '#1565c0', bg: '#e3f2fd' }
//   }
//   return map[status] || { label: status, color: '#616161', bg: '#f5f5f5' }
// }

const monthNames = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
]

type ViewMode = 'cards' | 'list'

function EmployeeCard({ emp, workDaysNorm, onClick }: { emp: EmployeeWithStats; workDaysNorm: number; onClick: () => void }) {
  // Раб. = офис + удалёнка в будни
  const weekdayWork = emp.attendance.work_weekday + emp.attendance.remote_weekday
  // Удал. = вся удалёнка (будни + выходные)
  const remoteTotal = emp.attendance.remote
  const weekendWork = emp.attendance.weekend_work

  const normPercent = Math.min(100, (weekdayWork / workDaysNorm) * 100)
  const weekendPercent = (weekendWork / workDaysNorm) * 100

  return (
    <div className="emp-card" onClick={onClick}>
      <div className="emp-card-header">
        <div className="emp-avatar">{emp.avatar}</div>
        <div className="emp-info">
          <div className="emp-name">{emp.full_name}</div>
          <div className="emp-position">{emp.position}</div>
        </div>
      </div>
      {emp.department && (
        <div className="emp-tags">
          <span className="emp-tag emp-tag-dept">{emp.department}</span>
        </div>
      )}
      <div className="emp-stats">
        <div className="emp-stat"><span className="emp-stat-val" style={{ color: '#4caf50' }}>{weekdayWork}/{workDaysNorm}</span><span className="emp-stat-label">Раб.</span></div>
        {remoteTotal > 0 && <div className="emp-stat"><span className="emp-stat-val" style={{ color: '#42a5f5' }}>{remoteTotal}</span><span className="emp-stat-label">Удал.</span></div>}
        {weekendWork > 0 && <div className="emp-stat"><span className="emp-stat-val" style={{ color: '#ef5350' }}>{weekendWork}</span><span className="emp-stat-label">Вых.</span></div>}
      </div>
      <div className="emp-progress">
        <div className="emp-progress-bar" style={{ width: `${normPercent}%`, background: '#4caf50' }} />
        {weekendWork > 0 && <div className="emp-progress-bar emp-progress-weekend" style={{ width: `${weekendPercent}%`, background: '#ef5350' }} />}
      </div>
      <div className="emp-salary">{emp.current_salary.toLocaleString('ru-RU')} ₽</div>
    </div>
  )
}

function getMonthsSinceLastRaise(emp: EmployeeWithStats): number {
  const salaryChanges = emp.history.filter(h => h.type === 'salary_change')
  const lastChange = salaryChanges.length > 0
    ? salaryChanges[salaryChanges.length - 1]
    : emp.history.find(h => h.type === 'hire')

  if (!lastChange) return 0

  const lastDate = new Date(lastChange.date)
  const now = new Date()
  return (now.getFullYear() - lastDate.getFullYear()) * 12 + (now.getMonth() - lastDate.getMonth())
}

function formatMonthsSinceRaise(months: number): string {
  if (months < 1) return '< 1 мес'
  if (months < 12) return `${months} мес`
  const years = Math.floor(months / 12)
  const remainingMonths = months % 12
  if (remainingMonths === 0) return `${years} г`
  return `${years} г ${remainingMonths} м`
}

function EmployeeListItem({ emp, workDaysNorm, onClick }: { emp: EmployeeWithStats; workDaysNorm: number; onClick: () => void }) {
  const weekdayWork = emp.attendance.work_weekday + emp.attendance.remote_weekday
  const remoteTotal = emp.attendance.remote
  const weekendWork = emp.attendance.weekend_work
  const monthsSinceRaise = getMonthsSinceLastRaise(emp)
  const isOverdue = monthsSinceRaise >= 9

  return (
    <tr className="emp-list-row" onClick={onClick}>
      <td className="emp-list-name">
        <div className="emp-avatar emp-avatar-sm">{emp.avatar}</div>
        <span>{emp.full_name}</span>
      </td>
      <td className="emp-list-position">{emp.position}</td>
      <td className="emp-list-dept">{emp.department || '—'}</td>
      <td className="emp-list-stats">
        <span style={{ color: '#4caf50' }}>{weekdayWork}/{workDaysNorm}</span>
        {remoteTotal > 0 && <>{' / '}<span style={{ color: '#42a5f5' }}>{remoteTotal}</span></>}
        {weekendWork > 0 && <>{' / '}<span style={{ color: '#ef5350' }}>{weekendWork}</span></>}
      </td>
      <td className="emp-list-salary">{emp.current_salary.toLocaleString('ru-RU')} ₽</td>
      <td className="emp-list-raise" style={isOverdue ? { color: '#ef5350', fontWeight: 600 } : undefined}>
        {formatMonthsSinceRaise(monthsSinceRaise)}
      </td>
    </tr>
  )
}

type DetailTab = 'info' | 'salary'

function EmployeeDetail({ emp, onClose }: { emp: EmployeeWithStats; onClose: () => void }) {
  const [tab, setTab] = useState<DetailTab>('info')

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-lg" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="emp-detail-header">
            <div className="emp-avatar emp-avatar-lg">{emp.avatar}</div>
            <div>
              <h2 className="emp-detail-name">{emp.full_name}</h2>
              <div className="emp-detail-position">{emp.position}</div>
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="emp-detail-tabs">
          <button className={`emp-detail-tab ${tab === 'info' ? 'active' : ''}`} onClick={() => setTab('info')}>Основное</button>
          <button className={`emp-detail-tab ${tab === 'salary' ? 'active' : ''}`} onClick={() => setTab('salary')}>Оклад по месяцам</button>
        </div>
        <div className="modal-body">
          {tab === 'info' && (
            <>
              <div className="emp-detail-tags">
                {emp.department && <span className="emp-tag emp-tag-dept">{emp.department}</span>}
                <span className="emp-tag emp-tag-date">с {new Date(emp.hire_date).toLocaleDateString('ru-RU')}</span>
              </div>
              <div className="emp-detail-grid">
                <div className="emp-detail-card"><div className="emp-detail-label">Оклад</div><div className="emp-detail-value">{emp.current_salary.toLocaleString('ru-RU')} ₽</div></div>
                {emp.birth_date && <div className="emp-detail-card"><div className="emp-detail-label">День рождения</div><div className="emp-detail-value">{new Date(emp.birth_date).toLocaleDateString('ru-RU')}</div></div>}
                {emp.email && <div className="emp-detail-card"><div className="emp-detail-label">Email</div><div className="emp-detail-value">{emp.email}</div></div>}
                {emp.phone && <div className="emp-detail-card"><div className="emp-detail-label">Телефон</div><div className="emp-detail-value">{emp.phone}</div></div>}
              </div>
              <h4>Посещаемость за месяц</h4>
              <div className="emp-attendance-grid">
                {[
                  { label: 'Работа', val: emp.attendance.work, color: '#4caf50' },
                  { label: 'Удалённо', val: emp.attendance.remote, color: '#42a5f5' },
                  { label: 'Отпуск', val: emp.attendance.vacation, color: '#ab47bc' },
                  { label: 'Выходные', val: emp.attendance.dayoff, color: '#9e9e9e' },
                  { label: 'Часы', val: Math.round(emp.attendance.total_hours), color: 'var(--color-primary)' }
                ].map(item => (
                  <div key={item.label} className="emp-att-item"><span className="emp-att-val" style={{ color: item.color }}>{item.val}</span><span className="emp-att-label">{item.label}</span></div>
                ))}
              </div>
              {emp.history.length > 0 && (
                <>
                  <h4>История</h4>
                  <div className="emp-history">
                    {emp.history.slice().reverse().map((h, i) => (
                      <div key={i} className="emp-history-item">
                        <div className="emp-history-date">{new Date(h.date).toLocaleDateString('ru-RU')}</div>
                        <div className="emp-history-desc">{h.desc}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
          {tab === 'salary' && (
            <SalaryChart employeeId={emp.id} currentSalary={emp.current_salary} />
          )}
        </div>
      </div>
    </div>
  )
}

function MonthSelector({ year, month, onChange }: { year: number; month: number; onChange: (y: number, m: number) => void }) {
  const prev = () => {
    if (month === 1) onChange(year - 1, 12)
    else onChange(year, month - 1)
  }
  const next = () => {
    if (month === 12) onChange(year + 1, 1)
    else onChange(year, month + 1)
  }
  return (
    <div className="month-selector">
      <button className="month-btn" onClick={prev}>←</button>
      <span className="month-label">{monthNames[month - 1]} {year}</span>
      <button className="month-btn" onClick={next}>→</button>
    </div>
  )
}

export default function TenderPage() {
  const { employees, loading, error, selectedYear, selectedMonth, setMonth, loadEmployees } = useTenderData()
  const [search, setSearch] = useState('')
  const [filterDept, setFilterDept] = useState('all')
  const [filterSubdiv, setFilterSubdiv] = useState('all')
  const [selectedEmp, setSelectedEmp] = useState<EmployeeWithStats | null>(null)
  const [activeTab, setActiveTab] = useState<TenderTab>('employees')
  const [viewMode, setViewMode] = useState<ViewMode>('list')

  const departments = useMemo(() => [...new Set(employees.map(e => e.department).filter(Boolean))] as string[], [employees])
  const subdivisions = useMemo(() => [...new Set(employees.map(e => e.subdivision).filter(Boolean))] as string[], [employees])

  const filtered = useMemo(() => employees.filter(e => {
    const matchSearch = e.full_name.toLowerCase().includes(search.toLowerCase()) || e.position.toLowerCase().includes(search.toLowerCase())
    const matchDept = filterDept === 'all' || e.department === filterDept
    const matchSubdiv = filterSubdiv === 'all' || e.subdivision === filterSubdiv
    return matchSearch && matchDept && matchSubdiv
  }), [employees, search, filterDept, filterSubdiv])

  const groupedBySubdiv = useMemo(() => {
    // Руководитель тендерного управления - отдельно
    const headOfTender = filtered.find(e =>
      e.position?.toLowerCase().includes('руководитель') &&
      e.department?.toLowerCase().includes('тендерн')
    )
    const rest = filtered.filter(e => e !== headOfTender)

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

    const sorted = Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]))

    // Добавляем руководителя в начало
    if (headOfTender) {
      sorted.unshift(['Руководство', [headOfTender]])
    }
    return sorted
  }, [filtered])

  const handleMonthChange = (y: number, m: number) => {
    setMonth(y, m)
    loadEmployees(y, m)
  }

  const workDaysNorm = getWorkDaysNorm(selectedYear, selectedMonth - 1)

  useEffect(() => {
    loadEmployees(selectedYear, selectedMonth)
  }, [])

  if (loading) return <div className="tender-loading"><div className="tender-spinner" /><div>Загрузка...</div></div>
  if (error) return <div className="tender-error"><span>⚠️</span><div>{error}</div></div>

  return (
    <div className="tender-page">
      <header className="tender-header">
        <div className="tender-logo">
          <div className="tender-icon">Т</div>
          <div><h1>Тендерное управление</h1><span>Панель руководителя</span></div>
        </div>
        <MonthSelector year={selectedYear} month={selectedMonth} onChange={handleMonthChange} />
      </header>

      <div className="tender-content">
        <div className="tender-tabs">
          {(['employees', 'timesheet', 'analytics', 'fot'] as TenderTab[]).map(tab => (
            <button key={tab} className={`tab-btn ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>
              {{ employees: 'Сотрудники', timesheet: 'Табель', analytics: 'Аналитика', fot: 'ФОТ' }[tab]}
            </button>
          ))}
        </div>

        {activeTab === 'employees' && (
          <>
            <div className="tender-filters">
              <div className="search-box"><span>🔍</span><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск..." /></div>
              <select value={filterDept} onChange={e => setFilterDept(e.target.value)}>
                <option value="all">Все отделы</option>
                {departments.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <select value={filterSubdiv} onChange={e => setFilterSubdiv(e.target.value)}>
                <option value="all">Все подразделения</option>
                {subdivisions.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <div className="view-toggle">
                <button className={`view-btn ${viewMode === 'cards' ? 'active' : ''}`} onClick={() => setViewMode('cards')} title="Карточки">▦</button>
                <button className={`view-btn ${viewMode === 'list' ? 'active' : ''}`} onClick={() => setViewMode('list')} title="Список">☰</button>
              </div>
              <span className="filter-count">Найдено: <b>{filtered.length}</b></span>
            </div>
            {viewMode === 'cards' ? (
              <div className="emp-sections">
                {groupedBySubdiv.map(([subdiv, emps]) => (
                  <div key={subdiv} className="emp-section">
                    <div className="emp-section-header">
                      <span className="emp-section-title">{subdiv}</span>
                      <span className="emp-section-count">{emps.length}</span>
                    </div>
                    <div className="emp-grid">
                      {emps.map(emp => <EmployeeCard key={emp.id} emp={emp} workDaysNorm={workDaysNorm} onClick={() => setSelectedEmp(emp)} />)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="emp-list-wrapper">
                <table className="emp-list-table">
                  <thead>
                    <tr>
                      <th>Сотрудник</th>
                      <th>Должность</th>
                      <th>Отдел</th>
                      <th>Раб./Удал./Вых.</th>
                      <th>Оклад</th>
                      <th>Без повыш.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupedBySubdiv.map(([subdiv, emps]) => (
                      <>
                        <tr key={subdiv} className="emp-list-subdiv-row">
                          <td colSpan={6}>{subdiv} <span>({emps.length})</span></td>
                        </tr>
                        {emps.map(emp => <EmployeeListItem key={emp.id} emp={emp} workDaysNorm={workDaysNorm} onClick={() => setSelectedEmp(emp)} />)}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {filtered.length === 0 && <div className="empty-state"><span>🔍</span><div>Сотрудники не найдены</div></div>}
          </>
        )}

        {activeTab === 'timesheet' && (
          <TimesheetGrid employees={employees} year={selectedYear} month={selectedMonth} />
        )}

        {activeTab === 'analytics' && (
          <div className="analytics-placeholder">
            <span>📊</span>
            <div>Аналитика в разработке</div>
          </div>
        )}

        {activeTab === 'fot' && (
          <DepartmentFOT
            employees={employees}
            year={selectedYear}
            month={selectedMonth}
          />
        )}
      </div>

      {selectedEmp && <EmployeeDetail emp={selectedEmp} onClose={() => setSelectedEmp(null)} />}
    </div>
  )
}

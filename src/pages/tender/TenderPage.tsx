import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTenderData } from './hooks/useTenderData'
import { TimesheetGrid } from './components/TimesheetGrid'
import { DepartmentFOT } from './components/DepartmentFOT'
import { DashboardOverview } from './components/DashboardOverview'
import { EmployeeDetail } from './components/EmployeeDetail'
import AdminTenderPanel, { type AdminTab } from './AdminTenderPanel'
import type { EmployeeWithStats } from './types'
import './TenderPage.css'

type ShellTab = 'dashboard' | 'timesheet' | 'fot' | AdminTab

const monthNames = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
]

const BASE_TABS: Array<{ key: ShellTab; label: string }> = [
  { key: 'dashboard', label: 'Дашборд' },
  { key: 'timesheet', label: 'Табель' },
  { key: 'fot', label: 'ФОТ' }
]

const ADMIN_TABS: Array<{ key: ShellTab; label: string }> = [
  { key: 'employees', label: 'Сотрудники' },
  { key: 'subdivisions', label: 'Подразделения' },
  { key: 'archive', label: 'Архив' },
  { key: 'settings', label: 'Настройки' }
]

const ADMIN_TAB_KEYS: ReadonlyArray<ShellTab> = ADMIN_TABS.map(tab => tab.key)

const isAdminTab = (tab: ShellTab): tab is AdminTab => ADMIN_TAB_KEYS.includes(tab)

function MonthSelector({
  year,
  month,
  onChange
}: {
  year: number
  month: number
  onChange: (year: number, month: number) => void
}) {
  const goPrev = () => {
    if (month === 1) onChange(year - 1, 12)
    else onChange(year, month - 1)
  }

  const goNext = () => {
    if (month === 12) onChange(year + 1, 1)
    else onChange(year, month + 1)
  }

  return (
    <div className="tender-month-selector">
      <button type="button" className="tender-month-btn" onClick={goPrev} aria-label="Предыдущий месяц">
        ←
      </button>
      <button type="button" className="tender-month-btn" onClick={goNext} aria-label="Следующий месяц">
        →
      </button>
    </div>
  )
}

export default function TenderPage({ isAdmin = false }: { isAdmin?: boolean }) {
  const { employees, loading, error, selectedYear, selectedMonth, setMonth, loadEmployees } = useTenderData()
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeWithStats | null>(null)

  const tabsOrder = isAdmin ? [...BASE_TABS, ...ADMIN_TABS] : BASE_TABS
  const tabParam = searchParams.get('tab')
  const activeTab: ShellTab = tabsOrder.find(tab => tab.key === tabParam)?.key ?? 'dashboard'
  const adminTabActive = isAdminTab(activeTab)

  // При уходе с админской вкладки подтягиваем изменения, сделанные в админке
  const prevAdminTabActiveRef = useRef(adminTabActive)
  useEffect(() => {
    if (prevAdminTabActiveRef.current && !adminTabActive) {
      void loadEmployees(undefined, undefined, false, true)
    }
    prevAdminTabActiveRef.current = adminTabActive
  }, [adminTabActive, loadEmployees])

  // Активная вкладка не должна оставаться за краем прокручиваемой ленты на телефоне
  const tabsRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const nav = tabsRef.current
    const active = nav?.querySelector<HTMLElement>('.tender-shell-tab.active')
    if (!nav || !active) return
    const navRect = nav.getBoundingClientRect()
    const tabRect = active.getBoundingClientRect()
    nav.scrollTo({ left: nav.scrollLeft + tabRect.left - navRect.left - (navRect.width - tabRect.width) / 2 })
  }, [activeTab, loading])

  useEffect(() => {
    if (!selectedEmployee) return
    const stillExists = employees.some(employee => employee.id === selectedEmployee.id)
    if (!stillExists) {
      setSelectedEmployee(null)
    }
  }, [employees, selectedEmployee])

  // Загрузку запускает useTenderData по смене месяца — второй вызов здесь удваивал запросы
  const handleMonthChange = (year: number, month: number) => {
    setMonth(year, month)
  }

  const handleTabClick = (key: ShellTab) => {
    if (key === 'dashboard') setSearchParams({})
    else setSearchParams({ tab: key })
    setSelectedEmployee(null)
  }

  if (loading) {
    return (
      <div className="tender-state-container">
        <div className="tender-spinner" />
        <span>Загрузка данных тендерного управления…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="tender-state-container error">
        <span>⚠️</span>
        <strong>{error}</strong>
      </div>
    )
  }

  return (
    <div className="tender-shell">
      <header className="tender-shell-header">
        <div className="tender-shell-top">
          <div className="tender-brand">
            <span className="tender-brand-icon">Т</span>
            <div>
              <h1>Тендерное управление</h1>
              <p>Управление • Аналитика • Контроль</p>
            </div>
          </div>
          {!adminTabActive && (
            <div className="tender-shell-controls">
              <span className="tender-period-badge">{monthNames[selectedMonth - 1]} {selectedYear}</span>
              <MonthSelector year={selectedYear} month={selectedMonth} onChange={handleMonthChange} />
            </div>
          )}
        </div>
        <nav ref={tabsRef} className="tender-shell-tabs">
          {tabsOrder.map(tab => (
            <button
              key={tab.key}
              type="button"
              className={`tender-shell-tab ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => handleTabClick(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="tender-shell-main">
        {adminTabActive ? (
          <AdminTenderPanel tab={activeTab} />
        ) : selectedEmployee ? (
          <EmployeeDetail
            employee={selectedEmployee}
            year={selectedYear}
            month={selectedMonth}
            onBack={() => setSelectedEmployee(null)}
          />
        ) : (
          <>
            {activeTab === 'dashboard' && (
              <DashboardOverview
                employees={employees}
                year={selectedYear}
                month={selectedMonth}
                onSelectEmployee={setSelectedEmployee}
              />
            )}

            {activeTab === 'timesheet' && (
              <TimesheetGrid
                employees={employees}
                year={selectedYear}
                month={selectedMonth}
              />
            )}

            {activeTab === 'fot' && (
              <DepartmentFOT
                employees={employees}
                year={selectedYear}
                month={selectedMonth}
                onSelectEmployee={setSelectedEmployee}
              />
            )}
          </>
        )}
      </main>
    </div>
  )
}

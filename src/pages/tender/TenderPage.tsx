import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Archive, Building2, Plus, Settings } from 'lucide-react'
import { useTenderData } from './hooks/useTenderData'
import { useMediaQuery } from './hooks/useMediaQuery'
import { TimesheetGrid } from './components/TimesheetGrid'
import { DepartmentFOT } from './components/DepartmentFOT'
import { DashboardOverview } from './components/DashboardOverview'
import { EmployeeDetail } from './components/EmployeeDetail'
import { ArchiveSheet } from './components/ArchiveSheet'
import { SettingsSheet } from './components/SettingsSheet'
import type { AdminPanelSheet } from './components/dashboard/dashboardTypes'
import type { EmployeeWithStats } from './types'
import './TenderPage.css'

type ShellTab = 'dashboard' | 'timesheet' | 'fot'
type SheetKind = 'archive' | 'settings'

const monthNames = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
]

const BASE_TABS: Array<{ key: ShellTab; label: string }> = [
  { key: 'dashboard', label: 'Дашборд' },
  { key: 'timesheet', label: 'Табель' },
  { key: 'fot', label: 'ФОТ' }
]

// Старые адреса ?tab=… ведут на дашборд (администрирование теперь в нём); архив и настройки открываются листами
const LEGACY_ADMIN_TABS = new Map<string, { sheet: SheetKind | null }>([
  ['admin', { sheet: null }],
  ['employees', { sheet: null }],
  ['subdivisions', { sheet: null }],
  ['archive', { sheet: 'archive' }],
  ['settings', { sheet: 'settings' }]
])

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
  const { employees, loading, error, selectedYear, selectedMonth, setMonth, loadEmployees, clearAllEmployees } = useTenderData()
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeWithStats | null>(null)
  const [sheet, setSheet] = useState<SheetKind | null>(null)
  const [panelSheet, setPanelSheet] = useState<AdminPanelSheet | null>(null)
  const [adminRefreshKey, setAdminRefreshKey] = useState(0)
  const sheetChangedRef = useRef(false)

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

  const rawTabParam = searchParams.get('tab')
  const legacyTarget = rawTabParam ? LEGACY_ADMIN_TABS.get(rawTabParam) : undefined
  const activeTab: ShellTab = BASE_TABS.find(tab => tab.key === rawTabParam)?.key ?? 'dashboard'

  useEffect(() => {
    if (!legacyTarget) return
    setSearchParams({}, { replace: true })
    if (isAdmin && legacyTarget.sheet) setSheet(legacyTarget.sheet)
  }, [isAdmin, legacyTarget, setSearchParams])

  // Лист что-то поменял — при закрытии перечитываем данные оболочки и подразделения на дашборде
  const handleSheetChanged = () => {
    sheetChangedRef.current = true
  }

  const closeSheet = () => {
    setSheet(null)
    if (!sheetChangedRef.current) return
    sheetChangedRef.current = false
    void loadEmployees(undefined, undefined, false, true)
    setAdminRefreshKey(key => key + 1)
  }

  // Дашборд правит сотрудников сам и просит перечитать список тихо, без спиннера на всю страницу
  const reloadEmployees = useCallback(
    () => loadEmployees(undefined, undefined, false, true),
    [loadEmployees]
  )

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

  // Кнопки «Подразделения» и «Добавить сотрудника» — только администратору на дашборде
  // На телефоне кнопки живут в шапке секции «Сотрудники» дашборда — в строке вкладок им нет места
  const isWide = useMediaQuery('(min-width: 768px)')
  const showDashboardActions = isAdmin && isWide && activeTab === 'dashboard' && !selectedEmployee
  const closePanelSheet = useCallback(() => setPanelSheet(null), [])

  // Листы стоят рядом с содержимым и переживают перезагрузку данных (например «Удалить всё»), не теряя состояния
  const sheets = isAdmin && (
    <>
      {sheet === 'archive' && <ArchiveSheet onChanged={handleSheetChanged} onClose={closeSheet} />}
      {sheet === 'settings' && (
        <SettingsSheet
          employees={employees}
          clearAllEmployees={clearAllEmployees}
          onChanged={handleSheetChanged}
          onClose={closeSheet}
        />
      )}
    </>
  )

  if (loading) {
    return (
      <>
        <div key="loading" className="tender-state-container">
          <div className="tender-spinner" />
          <span>Загрузка данных тендерного управления…</span>
        </div>
        {sheets}
      </>
    )
  }

  if (error) {
    return (
      <>
        <div key="error" className="tender-state-container error">
          <span>⚠️</span>
          <strong>{error}</strong>
        </div>
        {sheets}
      </>
    )
  }

  return (
    <>
      <div key="shell" className="tender-shell">
        <header className="tender-shell-header">
          <div className="tender-shell-top">
            <div className="tender-brand">
              <span className="tender-brand-icon">Т</span>
              <div>
                <h1>Тендерное управление</h1>
                <p>Управление • Аналитика • Контроль</p>
              </div>
            </div>
            <div className="tender-shell-controls">
              <span className="tender-period-badge">{monthNames[selectedMonth - 1]} {selectedYear}</span>
              <MonthSelector year={selectedYear} month={selectedMonth} onChange={handleMonthChange} />
            </div>
            {isAdmin && (
              <div className="tender-shell-shortcuts">
                <button
                  type="button"
                  className="tender-shell-icon-btn"
                  onClick={() => setSheet('archive')}
                  aria-label="Архив"
                  title="Архив"
                >
                  <Archive size={20} strokeWidth={1.5} />
                </button>
                <button
                  type="button"
                  className="tender-shell-icon-btn"
                  onClick={() => setSheet('settings')}
                  aria-label="Настройки"
                  title="Настройки"
                >
                  <Settings size={20} strokeWidth={1.5} />
                </button>
              </div>
            )}
          </div>
          <div className="tender-shell-tabs-row">
            <nav ref={tabsRef} className="tender-shell-tabs">
              {BASE_TABS.map(tab => (
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
            {showDashboardActions && (
              <div className="tender-tab-actions">
                <button
                  type="button"
                  className="tender-tab-action"
                  onClick={() => setPanelSheet('subdivisions')}
                  aria-label="Подразделения"
                  title="Подразделения"
                >
                  <Building2 size={16} strokeWidth={1.5} />
                  <span>Подразделения</span>
                </button>
                <button
                  type="button"
                  className="tender-tab-action primary"
                  onClick={() => setPanelSheet('addEmployee')}
                  aria-label="Добавить сотрудника"
                  title="Добавить сотрудника"
                >
                  <Plus size={16} strokeWidth={1.5} />
                  <span>Добавить сотрудника</span>
                </button>
              </div>
            )}
          </div>
        </header>

        <main className="tender-shell-main">
          {selectedEmployee ? (
            <EmployeeDetail
              employee={selectedEmployee}
              year={selectedYear}
              month={selectedMonth}
              peers={employees}
              onBack={closeEmployee}
            />
          ) : (
            <>
              {activeTab === 'dashboard' && (
                <DashboardOverview
                  employees={employees}
                  year={selectedYear}
                  month={selectedMonth}
                  isAdmin={isAdmin}
                  panelSheet={panelSheet}
                  onOpenSheet={setPanelSheet}
                  onSheetClose={closePanelSheet}
                  refreshKey={adminRefreshKey}
                  onEmployeesChanged={reloadEmployees}
                  onSelectEmployee={openEmployee}
                />
              )}

              {activeTab === 'timesheet' && (
                <TimesheetGrid
                  employees={employees}
                  year={selectedYear}
                  month={selectedMonth}
                  onSelectEmployee={openEmployee}
                />
              )}

              {activeTab === 'fot' && (
                <DepartmentFOT
                  employees={employees}
                  year={selectedYear}
                  month={selectedMonth}
                  onSelectEmployee={openEmployee}
                />
              )}
            </>
          )}
        </main>
      </div>
      {sheets}
    </>
  )
}

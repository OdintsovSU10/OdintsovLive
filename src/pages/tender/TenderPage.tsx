import { Fragment, useEffect, useMemo, useState } from 'react'
import { useTenderData } from './hooks/useTenderData'
import { TimesheetGrid } from './components/TimesheetGrid'
import { DepartmentFOT } from './components/DepartmentFOT'
import { DashboardOverview } from './components/DashboardOverview'
import { supabase } from '../../lib/supabase'
import { getWorkDaysNorm } from '../../lib/workNorms'
import { calculateSalary, getDailyHoursNorm, getSalaryForMonth, isWeekendOrHoliday } from './utils/salaryCalculator'
import {
  formatMonthsSinceRaise,
  getNoRaiseColor,
  getPositionPriority,
  getWorkSummaryForMonth,
  mapEmployeesToTenderVM
} from './utils/tenderPresentation'
import type { EmployeeWithStats, TenderTab, TimesheetEntry } from './types'
import './TenderPage.css'

const monthNames = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
]

const tabsOrder: Array<{ key: TenderTab; label: string }> = [
  { key: 'dashboard', label: 'Дашборд' },
  { key: 'timesheet', label: 'Табель' },
  { key: 'employees', label: 'Сотрудники' },
  { key: 'fot', label: 'ФОТ' }
]

const TRANSPORT_KEY = 'fot_base_transport'
const DEFAULT_TRANSPORT = 2730
const EXTRA_BONUS_PREFIX = 'fot_extra_bonuses'

type ViewMode = 'cards' | 'list'

interface MonthSlot {
  year: number
  month: number
  key: string
  label: string
}

interface EmployeeHistoryPoint {
  year: number
  month: number
  key: string
  label: string
  hasTimesheet: boolean
  salary: number
  hours: number
  overtime: number
  weekendDays: number
  earned: number
}

function toIsoDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

function buildMonthSlots(anchorYear: number, anchorMonth: number, count: number): MonthSlot[] {
  const slots: MonthSlot[] = []

  for (let offset = count - 1; offset >= 0; offset--) {
    const date = new Date(anchorYear, anchorMonth - 1 - offset, 1)
    const year = date.getFullYear()
    const month = date.getMonth() + 1
    slots.push({
      year,
      month,
      key: monthKey(year, month),
      label: `${monthNames[month - 1]} ${year}`
    })
  }

  return slots
}

function getExtraBonusKey(year: number, month: number): string {
  return `${EXTRA_BONUS_PREFIX}_${year}_${month}`
}

function parseExtraBonuses(raw: string | null): Record<number, number> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    return Object.entries(parsed).reduce<Record<number, number>>((acc, [id, value]) => {
      const numericId = Number(id)
      const numericValue = Number(value)
      if (Number.isFinite(numericId) && Number.isFinite(numericValue)) {
        acc[numericId] = numericValue
      }
      return acc
    }, {})
  } catch {
    return {}
  }
}

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

function EmployeeCardTile({
  employee,
  workDaysNorm,
  onSelect
}: {
  employee: EmployeeWithStats
  workDaysNorm: number
  onSelect: () => void
}) {
  const vm = mapEmployeesToTenderVM([employee])[0]
  const summary = getWorkSummaryForMonth(employee, workDaysNorm)
  const completionPct = workDaysNorm > 0
    ? Math.min(100, (summary.totalWorkedDays / workDaysNorm) * 100)
    : 0

  return (
    <button type="button" className="tender-employee-card" onClick={onSelect}>
      <div className="tender-employee-card-top">
        <span className="tender-employee-avatar">{vm.initials}</span>
        <div className="tender-employee-main">
          <span className="tender-employee-name">{vm.fullName}</span>
          <span className="tender-employee-role">{vm.role}</span>
        </div>
      </div>
      <div className="tender-employee-tags">
        <span className="tender-chip">{vm.department}</span>
        <span className="tender-chip muted">{vm.group}</span>
      </div>
      <div className="tender-employee-stats">
        <span>
          <b>{summary.officeDays}</b> раб.
        </span>
        <span>
          <b>{summary.remoteDays}</b> удал.
        </span>
        <span>
          <b>{summary.weekendDays}</b> вых.
        </span>
      </div>
      <div className="tender-employee-progress">
        <div style={{ width: `${completionPct}%` }} />
      </div>
      <div className="tender-employee-salary">
        <span>{vm.salary.toLocaleString('ru-RU')} ₽</span>
        <small style={{ color: getNoRaiseColor(vm.noRaiseMonths) }}>
          без повышения: {formatMonthsSinceRaise(vm.noRaiseMonths)}
        </small>
      </div>
    </button>
  )
}

function EmployeeListRow({
  employee,
  workDaysNorm,
  onSelect
}: {
  employee: EmployeeWithStats
  workDaysNorm: number
  onSelect: () => void
}) {
  const vm = mapEmployeesToTenderVM([employee])[0]
  const summary = getWorkSummaryForMonth(employee, workDaysNorm)

  return (
    <tr className="tender-employees-row" onClick={onSelect}>
      <td>
        <div className="tender-employees-name-cell">
          <span className="tender-employee-avatar small">{vm.initials}</span>
          <span>{vm.fullName}</span>
        </div>
      </td>
      <td>{vm.role}</td>
      <td>{vm.group}</td>
      <td className="mono">
        <span style={{ color: '#6ee7b7' }}>{summary.officeDays}</span>
        <span className="sep">/</span>
        <span style={{ color: '#38bdf8' }}>{summary.remoteDays}</span>
        <span className="sep">/</span>
        <span style={{ color: '#94a3b8' }}>{summary.offDays}</span>
      </td>
      <td className="mono salary">{vm.salary.toLocaleString('ru-RU')} ₽</td>
      <td className="mono" style={{ color: getNoRaiseColor(vm.noRaiseMonths) }}>
        {formatMonthsSinceRaise(vm.noRaiseMonths)}
      </td>
    </tr>
  )
}

function Sparkline({
  values,
  color,
  width = 160,
  height = 40
}: {
  values: number[]
  color: string
  width?: number
  height?: number
}) {
  if (values.length < 2) return <div className="tender-sparkline-empty">—</div>
  const max = Math.max(...values)
  const min = Math.min(...values)
  const range = max - min || 1
  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * width
    const y = height - ((value - min) / range) * (height - 4) - 2
    return `${x},${y}`
  }).join(' ')
  const [lastX, lastY] = points.split(' ').pop()!.split(',')

  return (
    <svg width={width} height={height}>
      <polyline fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={points} />
      <circle cx={lastX} cy={lastY} r="3" fill={color} />
    </svg>
  )
}

function EmployeeDetail({
  employee,
  year,
  month,
  onBack
}: {
  employee: EmployeeWithStats
  year: number
  month: number
  onBack: () => void
}) {
  const [history, setHistory] = useState<EmployeeHistoryPoint[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)

  const workDaysNorm = getWorkDaysNorm(year, month - 1)

  useEffect(() => {
    let cancelled = false

    const loadHistory = async () => {
      setLoadingHistory(true)
      setHistoryError(null)

      try {
        const slots = buildMonthSlots(year, month, 6)
        const rangeStart = new Date(slots[0].year, slots[0].month - 1, 1)
        const rangeEnd = new Date(slots[slots.length - 1].year, slots[slots.length - 1].month, 0)

        const { data, error } = await supabase
          .from('tender_timesheet')
          .select('id,employee_id,work_date,status,hours_worked,is_correction')
          .eq('employee_id', employee.id)
          .gte('work_date', toIsoDate(rangeStart))
          .lte('work_date', toIsoDate(rangeEnd))

        if (error) throw error

        const byMonth = new Map<string, TimesheetEntry[]>()
        for (const entry of (data || []) as TimesheetEntry[]) {
          const date = new Date(`${entry.work_date}T12:00:00`)
          const key = monthKey(date.getFullYear(), date.getMonth() + 1)
          const list = byMonth.get(key) || []
          list.push(entry)
          byMonth.set(key, list)
        }

        const transport = Number(localStorage.getItem(TRANSPORT_KEY)) || DEFAULT_TRANSPORT

        const points: EmployeeHistoryPoint[] = slots.map(slot => {
          const monthTimesheet = byMonth.get(slot.key) || []
          if (monthTimesheet.length === 0) {
            return {
              year: slot.year,
              month: slot.month,
              key: slot.key,
              label: slot.label,
              hasTimesheet: false,
              salary: 0,
              hours: 0,
              overtime: 0,
              weekendDays: 0,
              earned: 0
            }
          }

          const salary = getSalaryForMonth(employee.salaryHistory || [], employee.current_salary, slot.year, slot.month)
          const extraBonuses = parseExtraBonuses(localStorage.getItem(getExtraBonusKey(slot.year, slot.month)))
          const monthBonus = (employee.monthly_bonus || 0) + (extraBonuses[employee.id] || 0)
          const salaryCalc = calculateSalary({
            employee_id: employee.id,
            base_salary: salary,
            year: slot.year,
            month: slot.month,
            timesheet: monthTimesheet,
            transport,
            bonus: monthBonus
          })

          let hours = 0
          let overtime = 0
          let weekendDays = 0

          for (const entry of monthTimesheet) {
            if (entry.status !== 'work' && entry.status !== 'remote') continue
            const date = new Date(`${entry.work_date}T12:00:00`)
            const normHours = getDailyHoursNorm(date)
            const workedHours = entry.hours_worked ?? normHours
            hours += workedHours
            overtime += Math.max(0, workedHours - normHours)
            if (isWeekendOrHoliday(date) && workedHours >= 3) {
              weekendDays += 1
            }
          }

          return {
            year: slot.year,
            month: slot.month,
            key: slot.key,
            label: slot.label,
            hasTimesheet: true,
            salary,
            hours: Math.round(hours),
            overtime: Math.round(overtime * 10) / 10,
            weekendDays,
            earned: salaryCalc.final_salary
          }
        })

        if (!cancelled) {
          setHistory(points)
        }
      } catch (err) {
        console.error('Error loading employee detail history:', err)
        if (!cancelled) {
          setHistory([])
          setHistoryError(err instanceof Error ? err.message : 'Ошибка загрузки истории')
        }
      } finally {
        if (!cancelled) {
          setLoadingHistory(false)
        }
      }
    }

    loadHistory()
    return () => {
      cancelled = true
    }
  }, [employee, month, year])

  const currentMonthTimesheet = useMemo(() => {
    const map = new Map<number, TimesheetEntry>()
    for (const entry of employee.timesheet || []) {
      const date = new Date(`${entry.work_date}T12:00:00`)
      if (date.getFullYear() === year && date.getMonth() + 1 === month) {
        map.set(date.getDate(), entry)
      }
    }
    return map
  }, [employee.timesheet, month, year])

  const calculatedHistory = history.filter(point => point.hasTimesheet)
  const totalEarned = calculatedHistory.reduce((sum, point) => sum + point.earned, 0)
  const totalHours = calculatedHistory.reduce((sum, point) => sum + point.hours, 0)
  const totalOvertime = calculatedHistory.reduce((sum, point) => sum + point.overtime, 0)
  const avgOvertime = calculatedHistory.length > 0
    ? Math.round((totalOvertime / calculatedHistory.length) * 10) / 10
    : 0

  const weightedSalary = useMemo(() => {
    if (calculatedHistory.length === 0) return employee.current_salary
    const weightedSource = calculatedHistory.filter(point => point.overtime > 0)
    if (weightedSource.length === 0) {
      return calculatedHistory[calculatedHistory.length - 1].earned
    }
    const totalWeight = weightedSource.reduce((sum, point) => sum + point.overtime, 0)
    const weightedSum = weightedSource.reduce((sum, point) => sum + point.earned * point.overtime, 0)
    return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : employee.current_salary
  }, [calculatedHistory, employee.current_salary])

  const weightedDelta = weightedSalary - employee.current_salary
  const salaryGrowth = calculatedHistory.length > 1 && calculatedHistory[0].salary > 0
    ? ((calculatedHistory[calculatedHistory.length - 1].salary - calculatedHistory[0].salary) / calculatedHistory[0].salary) * 100
    : 0

  const currentSummary = getWorkSummaryForMonth(employee, workDaysNorm)
  const currentOvertime = useMemo(() => {
    let overtime = 0
    for (const entry of currentMonthTimesheet.values()) {
      if (entry.status !== 'work' && entry.status !== 'remote') continue
      const date = new Date(`${entry.work_date}T12:00:00`)
      const worked = entry.hours_worked ?? getDailyHoursNorm(date)
      overtime += Math.max(0, worked - getDailyHoursNorm(date))
    }
    return Math.round(overtime * 10) / 10
  }, [currentMonthTimesheet])

  const dailyHours = useMemo(() => {
    const daysInMonth = new Date(year, month, 0).getDate()
    return Array.from({ length: daysInMonth }, (_, index) => {
      const day = index + 1
      const entry = currentMonthTimesheet.get(day)
      if (!entry) return 0
      if (entry.status !== 'work' && entry.status !== 'remote') return 0
      const date = new Date(year, month - 1, day)
      return entry.hours_worked ?? getDailyHoursNorm(date)
    })
  }, [currentMonthTimesheet, month, year])

  const efficiencyTrend = history.map(point => {
    if (!point.hasTimesheet || point.salary <= 0) return 0
    return (point.earned / point.salary) * 100
  })

  return (
    <section className="tender-employee-detail">
      <button type="button" className="tender-back-btn" onClick={onBack}>
        ← Назад к списку
      </button>

      <article className="tender-detail-header">
        <span className="tender-employee-avatar xl">{mapEmployeesToTenderVM([employee])[0].initials}</span>
        <div className="tender-detail-head-main">
          <h2>{employee.full_name}</h2>
          <p>{employee.position}</p>
          <div className="tender-detail-tags">
            <span className="tender-chip">{employee.department || 'Без отдела'}</span>
            <span className="tender-chip muted">{employee.subdivision || 'Без подразделения'}</span>
          </div>
        </div>
        <div className="tender-detail-current-salary">
          <small>Текущий оклад</small>
          <strong>{employee.current_salary.toLocaleString('ru-RU')} ₽</strong>
          {salaryGrowth > 0 && <span>+{salaryGrowth.toFixed(1)}% за период</span>}
        </div>
      </article>

      <article className="tender-detail-weighted">
        <div>
          <span>Средневзвешенный оклад по переработкам</span>
          <strong>{weightedSalary.toLocaleString('ru-RU')} ₽</strong>
          <p style={{ color: weightedDelta >= 0 ? '#fbbf24' : '#6ee7b7' }}>
            {weightedDelta >= 0 ? 'Желаемый уровень выше текущего на ' : 'Желаемый уровень ниже текущего на '}
            {Math.abs(weightedDelta).toLocaleString('ru-RU')} ₽
          </p>
        </div>
        <div className="formula">
          <span>Σ(начисление × OT)</span>
          <span>───────────────</span>
          <span>Σ(часы OT)</span>
        </div>
      </article>

      <div className="tender-detail-kpis">
        {[
          { label: 'Рабочие дни', value: currentSummary.totalWorkedDays, suffix: ' д', color: '#e2e8f0' },
          { label: 'Часы (история)', value: totalHours, suffix: ' ч', color: '#6ee7b7' },
          { label: 'Переработка', value: avgOvertime || currentOvertime, suffix: ' ч', color: '#fbbf24' },
          { label: 'Удалёнка', value: currentSummary.remoteDays, suffix: ' д', color: '#38bdf8' },
          { label: 'Всего заработано', value: totalEarned, suffix: ' ₽', color: '#a5b4fc' }
        ].map(item => (
          <article key={item.label} className="tender-detail-kpi-card">
            <small>{item.label}</small>
            <strong style={{ color: item.color }}>{Math.round(item.value).toLocaleString('ru-RU')}{item.suffix}</strong>
          </article>
        ))}
      </div>

      <article className="tender-detail-daily">
        <h3>Часы по дням — {monthNames[month - 1]} {year}</h3>
        <div className="tender-daily-bars">
          {dailyHours.map((hours, index) => {
            const day = index + 1
            const barHeight = Math.max(2, (hours / 16) * 100)
            const weekend = isWeekendOrHoliday(new Date(year, month - 1, day))
            return (
              <div key={day} className="tender-daily-bar-col">
                <span className="value">{hours > 0 ? hours : ''}</span>
                <div
                  className={`bar ${hours > 0 ? 'active' : ''} ${weekend ? 'weekend' : ''}`}
                  style={{ height: `${barHeight}%` }}
                />
                <span className={`day ${weekend ? 'weekend' : ''}`}>{day}</span>
              </div>
            )
          })}
        </div>
      </article>

      <article className="tender-detail-history">
        <div className="tender-detail-history-head">
          <h3>История по месяцам</h3>
          {loadingHistory && <span className="state">Загрузка…</span>}
          {historyError && <span className="state error">{historyError}</span>}
        </div>
        <table>
          <thead>
            <tr>
              <th>Месяц</th>
              <th>Оклад</th>
              <th>Часы</th>
              <th>Переработка</th>
              <th>Начислено</th>
              <th>Коэфф.</th>
            </tr>
          </thead>
          <tbody>
            {history.map(point => {
              if (!point.hasTimesheet) {
                return (
                  <tr key={point.key}>
                    <td>{point.label}</td>
                    <td>—</td>
                    <td>—</td>
                    <td>—</td>
                    <td>—</td>
                    <td><span className="badge low">нет расчёта</span></td>
                  </tr>
                )
              }
              const coefficient = point.salary > 0 ? point.earned / point.salary : 0
              const coeffClass = coefficient >= 1.15 ? 'high' : coefficient >= 1 ? 'mid' : 'low'
              return (
                <tr key={point.key}>
                  <td>{point.label}</td>
                  <td>{point.salary.toLocaleString('ru-RU')} ₽</td>
                  <td>{point.hours.toLocaleString('ru-RU')}</td>
                  <td>{point.overtime.toLocaleString('ru-RU')} ч</td>
                  <td>{Math.round(point.earned).toLocaleString('ru-RU')} ₽</td>
                  <td><span className={`badge ${coeffClass}`}>×{coefficient.toFixed(2)}</span></td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div className="tender-detail-trends">
          <div>
            <span>Переработки</span>
            <Sparkline values={history.map(item => item.overtime)} color="#fbbf24" />
          </div>
          <div>
            <span>Начисления</span>
            <Sparkline values={history.map(item => item.earned)} color="#6ee7b7" />
          </div>
          <div>
            <span>Эффективность</span>
            <Sparkline values={efficiencyTrend} color="#a78bfa" />
          </div>
        </div>
      </article>
    </section>
  )
}

export default function TenderPage() {
  const { employees, loading, error, selectedYear, selectedMonth, setMonth, loadEmployees } = useTenderData()
  const [search, setSearch] = useState('')
  const [filterDept, setFilterDept] = useState('all')
  const [filterSubdiv, setFilterSubdiv] = useState('all')
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeWithStats | null>(null)
  const [activeTab, setActiveTab] = useState<TenderTab>('dashboard')
  const [viewMode, setViewMode] = useState<ViewMode>('list')

  const departments = useMemo(
    () => [...new Set(employees.map(employee => employee.department).filter(Boolean))] as string[],
    [employees]
  )
  const subdivisions = useMemo(
    () => [...new Set(employees.map(employee => employee.subdivision).filter(Boolean))] as string[],
    [employees]
  )

  const filteredEmployees = useMemo(() => employees.filter(employee => {
    const query = search.trim().toLowerCase()
    const matchesQuery = query.length === 0
      || employee.full_name.toLowerCase().includes(query)
      || employee.position.toLowerCase().includes(query)
    const matchesDept = filterDept === 'all' || employee.department === filterDept
    const matchesSubdiv = filterSubdiv === 'all' || employee.subdivision === filterSubdiv
    return matchesQuery && matchesDept && matchesSubdiv
  }), [employees, search, filterDept, filterSubdiv])

  const groupedEmployees = useMemo(() => {
    const managers = filteredEmployees
      .filter(employee => getPositionPriority(employee.position) === 0)
      .sort((a, b) => a.full_name.localeCompare(b.full_name))

    const groups = new Map<string, EmployeeWithStats[]>()
    filteredEmployees
      .filter(employee => getPositionPriority(employee.position) !== 0)
      .forEach(employee => {
        const key = employee.subdivision || employee.department || 'Без подразделения'
        if (!groups.has(key)) {
          groups.set(key, [])
        }
        groups.get(key)!.push(employee)
      })

    groups.forEach(group => {
      group.sort((left, right) => {
        const priorityDiff = getPositionPriority(left.position) - getPositionPriority(right.position)
        if (priorityDiff !== 0) return priorityDiff
        return left.full_name.localeCompare(right.full_name)
      })
    })

    const result: Array<[string, EmployeeWithStats[]]> = []
    if (managers.length > 0) {
      result.push(['Руководство', managers])
    }
    result.push(...[...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])))
    return result
  }, [filteredEmployees])

  const workDaysNorm = getWorkDaysNorm(selectedYear, selectedMonth - 1)

  useEffect(() => {
    if (!selectedEmployee) return
    const stillExists = employees.some(employee => employee.id === selectedEmployee.id)
    if (!stillExists) {
      setSelectedEmployee(null)
    }
  }, [employees, selectedEmployee])

  const handleMonthChange = (year: number, month: number) => {
    setMonth(year, month)
    loadEmployees(year, month)
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
          <div className="tender-shell-controls">
            <span className="tender-period-badge">{monthNames[selectedMonth - 1]} {selectedYear}</span>
            <MonthSelector year={selectedYear} month={selectedMonth} onChange={handleMonthChange} />
          </div>
        </div>
        <nav className="tender-shell-tabs">
          {tabsOrder.map(tab => (
            <button
              key={tab.key}
              type="button"
              className={`tender-shell-tab ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => {
                setActiveTab(tab.key)
                setSelectedEmployee(null)
              }}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="tender-shell-main">
        {selectedEmployee ? (
          <EmployeeDetail
            employee={selectedEmployee}
            year={selectedYear}
            month={selectedMonth}
            onBack={() => setSelectedEmployee(null)}
          />
        ) : (
          <>
            {activeTab === 'dashboard' && (
              <DashboardOverview employees={employees} year={selectedYear} month={selectedMonth} />
            )}

            {activeTab === 'timesheet' && (
              <TimesheetGrid
                employees={employees}
                year={selectedYear}
                month={selectedMonth}
              />
            )}

            {activeTab === 'employees' && (
              <section className="tender-employees-view">
                <div className="tender-filters">
                  <label className="tender-search">
                    <span>🔍</span>
                    <input
                      value={search}
                      onChange={event => setSearch(event.target.value)}
                      placeholder="Поиск по сотрудникам и должностям"
                    />
                  </label>
                  <select value={filterDept} onChange={event => setFilterDept(event.target.value)} className="tender-filter-select">
                    <option value="all">Все отделы</option>
                    {departments.map(department => (
                      <option key={department} value={department}>{department}</option>
                    ))}
                  </select>
                  <select value={filterSubdiv} onChange={event => setFilterSubdiv(event.target.value)} className="tender-filter-select">
                    <option value="all">Все подразделения</option>
                    {subdivisions.map(subdivision => (
                      <option key={subdivision} value={subdivision}>{subdivision}</option>
                    ))}
                  </select>
                  <div className="tender-view-toggle">
                    <button
                      type="button"
                      className={viewMode === 'cards' ? 'active' : ''}
                      onClick={() => setViewMode('cards')}
                      title="Карточки"
                    >
                      ▦
                    </button>
                    <button
                      type="button"
                      className={viewMode === 'list' ? 'active' : ''}
                      onClick={() => setViewMode('list')}
                      title="Таблица"
                    >
                      ☰
                    </button>
                  </div>
                  <span className="tender-found-count">
                    Найдено: <b>{filteredEmployees.length}</b>
                  </span>
                </div>

                {filteredEmployees.length === 0 && (
                  <div className="tender-empty">
                    <span>🔍</span>
                    <p>Сотрудники не найдены по заданным фильтрам</p>
                  </div>
                )}

                {filteredEmployees.length > 0 && viewMode === 'cards' && (
                  <div className="tender-groups-stack">
                    {groupedEmployees.map(([groupName, groupEmployees]) => (
                      <section key={groupName} className="tender-group-section">
                        <div className="tender-group-head">
                          <h3>{groupName}</h3>
                          <span>{groupEmployees.length}</span>
                        </div>
                        <div className="tender-employee-grid">
                          {groupEmployees.map(employee => (
                            <EmployeeCardTile
                              key={employee.id}
                              employee={employee}
                              workDaysNorm={workDaysNorm}
                              onSelect={() => setSelectedEmployee(employee)}
                            />
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                )}

                {filteredEmployees.length > 0 && viewMode === 'list' && (
                  <div className="tender-employees-table-wrap">
                    <table className="tender-employees-table">
                      <thead>
                        <tr>
                          <th>Сотрудник</th>
                          <th>Должность</th>
                          <th>Подразделение</th>
                          <th>Раб./Удал./Вых.</th>
                          <th>Оклад</th>
                          <th>Без повыш.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {groupedEmployees.map(([groupName, groupEmployees]) => (
                          <Fragment key={groupName}>
                            <tr className="tender-group-row">
                              <td colSpan={6}>
                                {groupName}
                                <span>({groupEmployees.length})</span>
                              </td>
                            </tr>
                            {groupEmployees.map(employee => (
                              <EmployeeListRow
                                key={employee.id}
                                employee={employee}
                                workDaysNorm={workDaysNorm}
                                onSelect={() => setSelectedEmployee(employee)}
                              />
                            ))}
                          </Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
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

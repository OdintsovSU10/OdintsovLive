import { Fragment, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useTenderData } from './hooks/useTenderData'
import { useLivePayroll } from './hooks/useLivePayroll'
import { TimesheetGrid } from './components/TimesheetGrid'
import { DepartmentFOT } from './components/DepartmentFOT'
import { DashboardOverview } from './components/DashboardOverview'
import { ManagementAgent } from './components/ManagementAgent'
import { EmployeeSkudEvents } from './components/EmployeeSkudEvents'
import { supabase } from '../../lib/supabase'
import { formatRuPhone } from '../../lib/formatUtils'
import { getWorkDaysNorm } from '../../lib/workNorms'
import { calculateSalary, getDailyHoursNorm, getRemoteFullDayHours, getSalaryForMonth, isWeekendOrHoliday, roundTimesheetHours } from './utils/salaryCalculator'
import {
  calculateEmployeeMonthlyPayrollPlan,
  formatLiveMoney,
  formatLiveNumber,
  getLivePayrollAccrualColor,
  getLivePayrollPauseLabel
} from './utils/livePayroll'
import {
  createEmptyTimesheetStatusCounts,
  isWorkedTimesheetStatus,
  TIMESHEET_STATUS_META,
  TIMESHEET_STATUS_ORDER,
  type TimesheetStatusCounts
} from './utils/timesheetStatus'
import {
  getAgeFromBirthDate,
  formatAgeYears,
  getDurationHighlightColor,
  formatMonthsSinceRaise,
  getEmployeeTenureMonths,
  getMonthsSinceLastRaise,
  getNoRaiseColor,
  getPositionPriority,
  getWorkSummaryForMonth,
  mapEmployeesToTenderVM
} from './utils/tenderPresentation'
import type { EmployeeWithStats, TenderEmployeeEvent, TenderTab, TimesheetEntry } from './types'
import './TenderPage.css'

const monthNames = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
]

const tabsOrder: Array<{ key: TenderTab; label: string }> = [
  { key: 'agent', label: 'Агент' },
  { key: 'dashboard', label: 'Дашборд' },
  { key: 'timesheet', label: 'Табель' },
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
  workdaysSalary: number
  hours: number
  normHours: number
  overtime: number
  workedDays: number
  normDays: number
  weekendDays: number
  remoteDays: number
  weekendBonus: number
  transportPayment: number
  earned: number
  statusCounts: TimesheetStatusCounts
}

interface SalaryRaiseTimelineItem {
  kind: 'raise'
  key: string
  date: string
  timestamp: number
  fromSalary: number
  toSalary: number
  delta: number
  deltaPercent: number
  monthsBetween: number
  note: string | null
}

interface EmployeeEventTimelineItem {
  kind: 'event'
  key: string
  date: string
  timestamp: number
  eventType: 'archive' | 'unarchive'
  note: string | null
}

function isMissingEmployeeEventsError(
  error: { code?: string; message?: string | null; details?: string | null; hint?: string | null } | null,
  status?: number | null
): boolean {
  if (status === 404) return true
  if (!error) return false
  if (error.code === '42P01' || error.code === 'PGRST205') return true
  const combined = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`.toLowerCase()
  return combined.includes('tender_employee_events')
    && (combined.includes('does not exist') || combined.includes('could not find the table') || combined.includes('not found'))
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

function resolveTimesheetWorkedHours(entry: TimesheetEntry, date: Date): number {
  const expectedHours = getDailyHoursNorm(date)

  if (entry.status === 'sick_worked') {
    return roundTimesheetHours(entry.hours_worked) || expectedHours
  }

  if (entry.status === 'remote') {
    return getRemoteFullDayHours(entry.hours_worked, date)
  }

  return roundTimesheetHours(entry.hours_worked, expectedHours)
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
  year,
  month,
  onSelect
}: {
  employee: EmployeeWithStats
  workDaysNorm: number
  year: number
  month: number
  onSelect: () => void
}) {
  const vm = mapEmployeesToTenderVM([employee])[0]
  const monthSalary = getSalaryForMonth(employee.salaryHistory || [], employee.current_salary, year, month)
  const ageYears = getAgeFromBirthDate(employee.birth_date)
  const tenureMonths = getEmployeeTenureMonths(employee)
  const summary = getWorkSummaryForMonth(employee, workDaysNorm)
  const completionPct = workDaysNorm > 0
    ? Math.min(100, (summary.totalWorkedDays / workDaysNorm) * 100)
    : 0
  const workNormRatio = `${summary.totalWorkedDays}/${workDaysNorm}`

  return (
    <button type="button" className="tender-employee-card" onClick={onSelect}>
      <div className="tender-employee-card-top">
        <span className="tender-employee-avatar">{vm.initials}</span>
        <div className="tender-employee-main">
          <span className="tender-employee-name">{vm.fullName}</span>
          <span className="tender-employee-role">{vm.role}</span>
          {ageYears !== null && <span className="tender-employee-age-left">Возраст: {formatAgeYears(ageYears)}</span>}
          <span className="tender-employee-meta-left" style={{ color: getNoRaiseColor(vm.noRaiseMonths) }}>
            Без повышения: {formatMonthsSinceRaise(vm.noRaiseMonths)}
          </span>
          <span className="tender-employee-meta-left" style={{ color: getDurationHighlightColor(tenureMonths) }}>
            Стаж в компании: {formatMonthsSinceRaise(tenureMonths)}
          </span>
        </div>
      </div>
      <div className="tender-employee-tags">
        <span className="tender-chip">{vm.department}</span>
        <span className="tender-chip muted">{vm.group}</span>
      </div>
      <div className="tender-employee-stats">
        <span className="tender-employee-stat-block">
          <small>Норма</small>
          <b>{workNormRatio}</b>
        </span>
        <span className="tender-employee-stat-block weekend">
          <small>Выходные</small>
          <b>{summary.weekendDays}</b>
        </span>
        <span className="tender-employee-stat-block remote">
          <small>Удалёнка</small>
          <b>{summary.remoteDays}</b>
        </span>
      </div>
      <div className="tender-employee-progress">
        <div style={{ width: `${completionPct}%` }} />
      </div>
      <div className="tender-employee-salary">
        <span>{monthSalary.toLocaleString('ru-RU')} ₽</span>
      </div>
    </button>
  )
}

function EmployeeListRow({
  employee,
  workDaysNorm,
  year,
  month,
  onSelect
}: {
  employee: EmployeeWithStats
  workDaysNorm: number
  year: number
  month: number
  onSelect: () => void
}) {
  const vm = mapEmployeesToTenderVM([employee])[0]
  const monthSalary = getSalaryForMonth(employee.salaryHistory || [], employee.current_salary, year, month)
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
      <td className="mono salary">{monthSalary.toLocaleString('ru-RU')} ₽</td>
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

export function EmployeeDetail({
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
  const [isMobileDaily, setIsMobileDaily] = useState(() => (
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 640px)').matches : false
  ))
  const [chartYear, setChartYear] = useState(year)
  const [chartMonth, setChartMonth] = useState(month)
  const [selectedSkudDate, setSelectedSkudDate] = useState<string | null>(null)
  const [chartTimesheetCache, setChartTimesheetCache] = useState<Record<string, TimesheetEntry[]>>({})
  const [chartLoading, setChartLoading] = useState(false)
  const [chartError, setChartError] = useState<string | null>(null)
  const [isRaiseHistoryOpen, setIsRaiseHistoryOpen] = useState(false)
  const [employeeEvents, setEmployeeEvents] = useState<TenderEmployeeEvent[]>([])
  const [loadingEmployeeEvents, setLoadingEmployeeEvents] = useState(false)
  const [historyYear, setHistoryYear] = useState(year)

  useEffect(() => {
    setHistoryYear(year)
  }, [employee.id, year])

  useEffect(() => {
    setSelectedSkudDate(null)
  }, [chartMonth, chartYear, employee.id])

  useEffect(() => {
    let cancelled = false

    const loadHistory = async () => {
      setLoadingHistory(true)
      setHistoryError(null)

      try {
        const slots: MonthSlot[] = Array.from({ length: 12 }, (_, index) => {
          const monthValue = index + 1
          return {
            year: historyYear,
            month: monthValue,
            key: monthKey(historyYear, monthValue),
            label: `${monthNames[monthValue - 1]} ${historyYear}`
          }
        })
        const rangeStart = new Date(historyYear, 0, 1)
        const rangeEnd = new Date(historyYear, 11, 31)

        const { data, error } = await supabase
          .from('tender_timesheet')
          .select('id,employee_id,work_date,status,hours_worked,is_correction')
          .eq('employee_id', employee.id)
          .gte('work_date', toIsoDate(rangeStart))
          .lte('work_date', toIsoDate(rangeEnd))

        if (error) throw error

        const byMonth = new Map<string, TimesheetEntry[]>()
        for (const rawEntry of (data || []) as TimesheetEntry[]) {
          const entry = {
            ...rawEntry,
            hours_worked: rawEntry.hours_worked == null ? null : roundTimesheetHours(rawEntry.hours_worked)
          }
          const date = new Date(`${entry.work_date}T12:00:00`)
          const key = monthKey(date.getFullYear(), date.getMonth() + 1)
          const list = byMonth.get(key) || []
          list.push(entry)
          byMonth.set(key, list)
        }

        const transport = Number(localStorage.getItem(TRANSPORT_KEY)) || DEFAULT_TRANSPORT

        const points: EmployeeHistoryPoint[] = slots.map(slot => {
          const monthTimesheet = byMonth.get(slot.key) || []
          const normDays = getWorkDaysNorm(slot.year, slot.month - 1)
          if (monthTimesheet.length === 0) {
            return {
              year: slot.year,
              month: slot.month,
              key: slot.key,
              label: slot.label,
              hasTimesheet: false,
              salary: 0,
              workdaysSalary: 0,
              hours: 0,
              normHours: 0,
              overtime: 0,
              workedDays: 0,
              normDays,
              weekendDays: 0,
              remoteDays: 0,
              weekendBonus: 0,
              transportPayment: 0,
              earned: 0,
              statusCounts: createEmptyTimesheetStatusCounts()
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
          let workedDays = 0
          let weekendDays = 0
          let remoteDays = 0
          const statusCounts = createEmptyTimesheetStatusCounts()
          const daysInMonth = new Date(slot.year, slot.month, 0).getDate()
          let normHours = 0

          for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(slot.year, slot.month - 1, day)
            if (!isWeekendOrHoliday(date)) {
              normHours += getDailyHoursNorm(date)
            }
          }

          for (const entry of monthTimesheet) {
            statusCounts[entry.status] += 1
            if (!isWorkedTimesheetStatus(entry.status)) continue
            const date = new Date(`${entry.work_date}T12:00:00`)
            const dailyNormHours = getDailyHoursNorm(date)
            const workedHours = resolveTimesheetWorkedHours(entry, date)
            hours += workedHours
            overtime += Math.max(0, workedHours - dailyNormHours)

            if (entry.status === 'remote') {
              remoteDays += 1
              if (isWeekendOrHoliday(date)) {
                weekendDays += 1
              } else {
                workedDays += 1
              }
              continue
            }

            if (entry.status === 'sick_worked') {
              if (isWeekendOrHoliday(date)) {
                weekendDays += 1
              } else {
                workedDays += 1
              }
              continue
            }

            if (workedHours >= 3) {
              if (isWeekendOrHoliday(date)) {
                weekendDays += 1
              } else {
                workedDays += 1
              }
            }
          }

          return {
            year: slot.year,
            month: slot.month,
            key: slot.key,
            label: slot.label,
            hasTimesheet: true,
            salary,
            workdaysSalary: Math.round((salaryCalc.calculated_salary - salaryCalc.weekend_payment) * 100) / 100,
            hours: Math.round(hours),
            normHours: Math.round(normHours),
            overtime: Math.round(overtime * 10) / 10,
            workedDays,
            normDays,
            weekendDays,
            remoteDays,
            weekendBonus: salaryCalc.weekend_payment,
            transportPayment: salaryCalc.transport_payment,
            earned: salaryCalc.final_salary,
            statusCounts
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
  }, [employee, historyYear])

  useEffect(() => {
    let cancelled = false

    const loadEmployeeEvents = async () => {
      setLoadingEmployeeEvents(true)
      try {
        const { data, error, status } = await supabase
          .from('tender_employee_events')
          .select('*')
          .eq('employee_id', employee.id)
          .in('event_type', ['archive', 'unarchive'])
          .order('event_date', { ascending: false })
          .order('created_at', { ascending: false })

        if (error) {
          if (isMissingEmployeeEventsError(error, status)) {
            if (!cancelled) {
              setEmployeeEvents([])
            }
            return
          }
          throw error
        }
        if (!cancelled) {
          setEmployeeEvents((data || []) as TenderEmployeeEvent[])
        }
      } catch (err) {
        console.error('Error loading employee events:', err)
        if (!cancelled) {
          setEmployeeEvents([])
        }
      } finally {
        if (!cancelled) {
          setLoadingEmployeeEvents(false)
        }
      }
    }

    loadEmployeeEvents()
    return () => {
      cancelled = true
    }
  }, [employee.id])

  useEffect(() => {
    const initialEntries = (employee.timesheet || []).filter(entry => {
      const date = new Date(`${entry.work_date}T12:00:00`)
      return date.getFullYear() === year && date.getMonth() + 1 === month
    })
    const initialKey = monthKey(year, month)
    setChartYear(year)
    setChartMonth(month)
    setChartLoading(false)
    setChartError(null)
    setChartTimesheetCache({ [initialKey]: initialEntries })
  }, [employee.id, employee.timesheet, month, year])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const media = window.matchMedia('(max-width: 640px)')
    const handleChange = (event: MediaQueryListEvent) => {
      setIsMobileDaily(event.matches)
    }

    setIsMobileDaily(media.matches)

    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', handleChange)
      return () => media.removeEventListener('change', handleChange)
    }

    media.addListener(handleChange)
    return () => media.removeListener(handleChange)
  }, [])

  const chartMonthKey = monthKey(chartYear, chartMonth)

  useEffect(() => {
    if (Object.prototype.hasOwnProperty.call(chartTimesheetCache, chartMonthKey)) {
      setChartLoading(false)
      return
    }

    let cancelled = false
    const loadChartMonth = async () => {
      setChartLoading(true)
      setChartError(null)
      try {
        const startDate = `${chartYear}-${String(chartMonth).padStart(2, '0')}-01`
        const daysInTargetMonth = new Date(chartYear, chartMonth, 0).getDate()
        const endDate = `${chartYear}-${String(chartMonth).padStart(2, '0')}-${String(daysInTargetMonth).padStart(2, '0')}`

        const { data, error } = await supabase
          .from('tender_timesheet')
          .select('id,employee_id,work_date,status,hours_worked,is_correction')
          .eq('employee_id', employee.id)
          .gte('work_date', startDate)
          .lte('work_date', endDate)

        if (error) throw error

        if (!cancelled) {
          const roundedEntries = ((data || []) as TimesheetEntry[]).map(entry => ({
            ...entry,
            hours_worked: entry.hours_worked == null ? null : roundTimesheetHours(entry.hours_worked)
          }))
          setChartTimesheetCache(previous => ({ ...previous, [chartMonthKey]: roundedEntries }))
        }
      } catch (err) {
        console.error('Error loading daily chart month:', err)
        if (!cancelled) {
          setChartError('Не удалось загрузить табель за выбранный месяц')
        }
      } finally {
        if (!cancelled) {
          setChartLoading(false)
        }
      }
    }

    loadChartMonth()
    return () => {
      cancelled = true
    }
  }, [chartMonth, chartMonthKey, chartTimesheetCache, chartYear, employee.id])

  const calculatedHistory = history.filter(point => point.hasTimesheet)
  let configuredTransport = DEFAULT_TRANSPORT
  try {
    const rawTransport = Number(localStorage.getItem(TRANSPORT_KEY))
    if (Number.isFinite(rawTransport) && rawTransport > 0) {
      configuredTransport = rawTransport
    }
  } catch {
    configuredTransport = DEFAULT_TRANSPORT
  }
  const selectedBaseSalary = useMemo(
    () => getSalaryForMonth(employee.salaryHistory || [], employee.current_salary, year, month),
    [employee.current_salary, employee.salaryHistory, month, year]
  )
  const realSalary = selectedBaseSalary + (employee.monthly_bonus || 0) + configuredTransport
  const yearlyHistoryPoints = useMemo(
    () => calculatedHistory.filter(point => point.year === historyYear),
    [calculatedHistory, historyYear]
  )
  const averageMonthlyIncome = useMemo(() => {
    if (yearlyHistoryPoints.length === 0) return realSalary
    const totalIncome = yearlyHistoryPoints.reduce((sum, point) => sum + point.earned, 0)
    return Math.round(totalIncome / yearlyHistoryPoints.length)
  }, [realSalary, yearlyHistoryPoints])
  const averageWeekendIncomeByYear = useMemo(() => {
    if (yearlyHistoryPoints.length === 0) return 0
    const totalWeekendIncome = yearlyHistoryPoints.reduce((sum, point) => sum + point.weekendBonus, 0)
    return totalWeekendIncome / yearlyHistoryPoints.length
  }, [yearlyHistoryPoints])
  const salaryGrowth = calculatedHistory.length > 1 && calculatedHistory[0].salary > 0
    ? ((calculatedHistory[calculatedHistory.length - 1].salary - calculatedHistory[0].salary) / calculatedHistory[0].salary) * 100
    : 0

  const chartMonthEntries = useMemo(
    () => chartTimesheetCache[chartMonthKey] || [],
    [chartMonthKey, chartTimesheetCache]
  )

  const chartMonthTimesheet = useMemo(() => {
    const map = new Map<number, TimesheetEntry>()
    for (const entry of chartMonthEntries) {
      const date = new Date(`${entry.work_date}T12:00:00`)
      if (date.getFullYear() === chartYear && date.getMonth() + 1 === chartMonth) {
        map.set(date.getDate(), entry)
      }
    }
    return map
  }, [chartMonth, chartMonthEntries, chartYear])

  const selectedMonthStats = useMemo(() => {
    const zeroStats = {
      workedWeekdays: 0,
      normDays: 0,
      weekendDays: 0,
      hours: 0,
      normHours: 0,
      overtime: 0,
      earned: 0,
      timesheetEarned: 0,
      statusCounts: createEmptyTimesheetStatusCounts()
    }

    if (chartMonthEntries.length === 0) {
      return zeroStats
    }

    const normDays = getWorkDaysNorm(chartYear, chartMonth - 1)
    const daysInTargetMonth = new Date(chartYear, chartMonth, 0).getDate()
    let normHours = 0
    for (let day = 1; day <= daysInTargetMonth; day++) {
      const date = new Date(chartYear, chartMonth - 1, day)
      if (!isWeekendOrHoliday(date)) {
        normHours += getDailyHoursNorm(date)
      }
    }

    let workedWeekdays = 0
    let weekendDays = 0
    let hours = 0
    let overtime = 0
    const statusCounts = createEmptyTimesheetStatusCounts()

    for (const entry of chartMonthTimesheet.values()) {
      statusCounts[entry.status] += 1
      if (!isWorkedTimesheetStatus(entry.status)) continue
      const date = new Date(`${entry.work_date}T12:00:00`)
      const expectedHours = getDailyHoursNorm(date)
      const workedHours = resolveTimesheetWorkedHours(entry, date)

      hours += workedHours
      overtime += Math.max(0, workedHours - expectedHours)

      if (entry.status === 'remote') {
        if (isWeekendOrHoliday(date)) {
          weekendDays += 1
        } else {
          workedWeekdays += 1
        }
        continue
      }

      if (entry.status === 'sick_worked') {
        if (isWeekendOrHoliday(date)) {
          weekendDays += 1
        } else {
          workedWeekdays += 1
        }
        continue
      }

      if (workedHours >= 3) {
        if (isWeekendOrHoliday(date)) {
          weekendDays += 1
        } else {
          workedWeekdays += 1
        }
      }
    }

    let transport = DEFAULT_TRANSPORT
    try {
      const raw = localStorage.getItem(TRANSPORT_KEY)
      const parsed = Number(raw)
      if (Number.isFinite(parsed) && parsed > 0) {
        transport = parsed
      }
    } catch {
      transport = DEFAULT_TRANSPORT
    }

    let extraBonuses: Record<number, number> = {}
    try {
      extraBonuses = parseExtraBonuses(localStorage.getItem(getExtraBonusKey(chartYear, chartMonth)))
    } catch {
      extraBonuses = {}
    }
    const monthBonus = (employee.monthly_bonus || 0) + (extraBonuses[employee.id] || 0)
    const monthSalary = getSalaryForMonth(
      employee.salaryHistory || [],
      employee.current_salary,
      chartYear,
      chartMonth
    )
    const salaryCalc = calculateSalary({
      employee_id: employee.id,
      base_salary: monthSalary,
      year: chartYear,
      month: chartMonth,
      timesheet: [...chartMonthTimesheet.values()],
      transport,
      bonus: monthBonus
    })

    return {
      workedWeekdays,
      normDays,
      weekendDays,
      hours: Math.round(hours),
      normHours: Math.round(normHours),
      overtime: Math.round(overtime),
      earned: salaryCalc.final_salary,
      timesheetEarned: salaryCalc.calculated_salary,
      statusCounts
    }
  }, [
    chartMonth,
    chartMonthEntries,
    chartMonthTimesheet,
    chartYear,
    employee.current_salary,
    employee.id,
    employee.monthly_bonus,
    employee.salaryHistory
  ])

  const workNormRatio = `${selectedMonthStats.workedWeekdays}/${selectedMonthStats.normDays}`
  const selectedMonthHoursRatio = `${selectedMonthStats.hours.toLocaleString('ru-RU')}/${selectedMonthStats.normHours.toLocaleString('ru-RU')}`

  const employeeMonthlyPlan = useMemo(() => {
    let extraBonuses: Record<number, number> = {}
    try {
      extraBonuses = parseExtraBonuses(localStorage.getItem(getExtraBonusKey(chartYear, chartMonth)))
    } catch {
      extraBonuses = {}
    }

    return calculateEmployeeMonthlyPayrollPlan(
      employee,
      chartYear,
      chartMonth,
      configuredTransport,
      extraBonuses
    )
  }, [chartMonth, chartYear, configuredTransport, employee])
  const employeeLivePayroll = useLivePayroll(employeeMonthlyPlan, chartYear, chartMonth)
  const employeeLivePayrollColor = getLivePayrollAccrualColor(employeeLivePayroll.workdayProgress)
  const employeeAccrued = employeeLivePayroll.isLive
    ? employeeLivePayroll.accrued
    : selectedMonthStats.earned
  const employeePayrollProgress = employeeMonthlyPlan > 0
    ? Math.min(100, Math.max(0, (employeeAccrued / employeeMonthlyPlan) * 100))
    : 0

  const dailySeries = useMemo(() => {
    const daysInTargetMonth = new Date(chartYear, chartMonth, 0).getDate()
    return Array.from({ length: daysInTargetMonth }, (_, index) => {
      const day = index + 1
      const entry = chartMonthTimesheet.get(day)
      const date = new Date(chartYear, chartMonth - 1, day)
      const weekend = isWeekendOrHoliday(date)
      if (!entry) {
        return { day, hours: 0, weekend, status: null, statusMeta: null }
      }
      const worked = isWorkedTimesheetStatus(entry.status)
      const hours = worked ? resolveTimesheetWorkedHours(entry, date) : 0
      return {
        day,
        hours,
        weekend,
        status: entry.status,
        statusMeta: TIMESHEET_STATUS_META[entry.status]
      }
    })
  }, [chartMonth, chartMonthTimesheet, chartYear])

  const shiftChartMonth = (offset: -1 | 1) => {
    const nextDate = new Date(chartYear, chartMonth - 1 + offset, 1)
    setChartYear(nextDate.getFullYear())
    setChartMonth(nextDate.getMonth() + 1)
    setChartError(null)
  }

  const openSkudDay = (day: number) => {
    const date = `${chartYear}-${String(chartMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    setSelectedSkudDate(date)
    window.requestAnimationFrame(() => {
      document.getElementById('employee-skud-events')?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest'
      })
    })
  }

  const salaryRaiseHistory = useMemo(() => {
    const salaryHistory = [...(employee.salaryHistory || [])]
      .sort((left, right) => new Date(`${left.effective_date}T12:00:00`).getTime() - new Date(`${right.effective_date}T12:00:00`).getTime())

    const raises: SalaryRaiseTimelineItem[] = []

    for (let i = 1; i < salaryHistory.length; i++) {
      const prev = salaryHistory[i - 1]
      const current = salaryHistory[i]
      const delta = current.salary - prev.salary
      if (delta <= 0) continue
      const prevDate = new Date(`${prev.effective_date}T12:00:00`)
      const currentDate = new Date(`${current.effective_date}T12:00:00`)
      const monthsBetween = Math.max(
        0,
        (currentDate.getFullYear() - prevDate.getFullYear()) * 12
        + (currentDate.getMonth() - prevDate.getMonth())
      )

      raises.push({
        kind: 'raise',
        key: `${current.id}-${current.effective_date}`,
        date: current.effective_date,
        timestamp: new Date(`${current.effective_date}T12:00:00`).getTime(),
        fromSalary: prev.salary,
        toSalary: current.salary,
        delta,
        deltaPercent: prev.salary > 0 ? (delta / prev.salary) * 100 : 0,
        monthsBetween,
        note: current.note
      })
    }

    return raises.reverse()
  }, [employee.salaryHistory])
  const combinedRaiseHistory = useMemo(() => {
    const eventItems: EmployeeEventTimelineItem[] = employeeEvents
      .filter(item => item.event_type === 'archive' || item.event_type === 'unarchive')
      .map(item => ({
        kind: 'event' as const,
        key: `event-${item.id}`,
        date: item.event_date,
        timestamp: new Date(item.created_at || `${item.event_date}T12:00:00`).getTime(),
        eventType: item.event_type,
        note: item.note
      }))

    const merged = [...salaryRaiseHistory, ...eventItems]
    merged.sort((left, right) => right.timestamp - left.timestamp)
    return merged
  }, [employeeEvents, salaryRaiseHistory])
  const noRaiseMonths = useMemo(() => getMonthsSinceLastRaise(employee), [employee])
  const tenureMonths = useMemo(() => getEmployeeTenureMonths(employee), [employee])
  const employeeAgeYears = getAgeFromBirthDate(employee.birth_date)
  const formattedPhone = formatRuPhone(employee.phone, { dash: true })
  const noRaiseColor = getNoRaiseColor(noRaiseMonths)
  const tenureColor = getDurationHighlightColor(tenureMonths)
  const latestRaise = salaryRaiseHistory[0]
  const latestRaiseSummary = latestRaise
    ? `Последнее повышение: ${new Date(`${latestRaise.date}T12:00:00`).toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    })} • текущий оклад ${selectedBaseSalary.toLocaleString('ru-RU')} ₽`
    : `Повышений не было • текущий оклад ${selectedBaseSalary.toLocaleString('ru-RU')} ₽`

  useEffect(() => {
    setIsRaiseHistoryOpen(false)
  }, [employee.id])

  return (
    <section className="tender-employee-detail">
      <button type="button" className="tender-back-btn" onClick={onBack}>
        ← Назад к списку
      </button>

      <article className="tender-detail-header">
        <div className="tender-detail-left">
          <span className="tender-employee-avatar xl">{mapEmployeesToTenderVM([employee])[0].initials}</span>
          <div className="tender-detail-head-main">
            <h2>{employee.full_name}</h2>
            <p>{employee.position}</p>
            {employeeAgeYears !== null && <p className="tender-detail-age-left">Возраст: {formatAgeYears(employeeAgeYears)}</p>}
            <span className="tender-detail-meta-left" style={{ color: noRaiseColor }}>
              Без повышения: {formatMonthsSinceRaise(noRaiseMonths)}
            </span>
            <span className="tender-detail-meta-left" style={{ color: tenureColor }}>
              Стаж в компании: {formatMonthsSinceRaise(tenureMonths)}
            </span>
            <div className="tender-detail-tags">
              <span className="tender-chip">{employee.department || 'Без отдела'}</span>
              <span className="tender-chip muted">{employee.subdivision || 'Без подразделения'}</span>
            </div>
          </div>
        </div>
        <div className="tender-detail-phone">
          <span className="tender-detail-phone-label">Телефон</span>
          <strong className="tender-detail-phone-value">{formattedPhone}</strong>
        </div>
        <div className="tender-detail-current-salary">
          <small>Реальный оклад / Базовый оклад</small>
          <strong className="tender-detail-salary-pair">
            {realSalary.toLocaleString('ru-RU')} / {selectedBaseSalary.toLocaleString('ru-RU')} ₽
          </strong>
          {salaryGrowth > 0 && <span className="tender-detail-growth">+{salaryGrowth.toFixed(1)}% за период</span>}
          <span className="tender-detail-meta">
            Ежемесячный бонус: <span className="tender-detail-bonus-value">{employee.monthly_bonus.toLocaleString('ru-RU')} ₽</span>
          </span>
        </div>
      </article>

      <article className="tender-detail-live-payroll">
        <div className="tender-detail-live-head">
          <div>
            <span className={`tender-detail-live-status ${employeeLivePayroll.isLive ? 'live' : 'static'}`}>
              <i />
              {employeeLivePayroll.isLive ? 'Живое начисление' : 'Расчёт периода'}
            </span>
            <h3>{monthNames[chartMonth - 1]} {chartYear}</h3>
          </div>
          <span className="tender-detail-live-caption">
            Переработка не увеличивает начисление
          </span>
        </div>
        <div className="tender-detail-live-grid">
          <div className="tender-detail-live-primary">
            <small>{employeeLivePayroll.isLive ? 'Начислено сейчас' : 'Начислено'}</small>
            <strong style={employeeLivePayroll.isLive ? { color: employeeLivePayrollColor } : undefined}>
              {formatLiveNumber(employeeAccrued)} ₽
            </strong>
            <span
              className={employeeLivePayroll.isAccruing ? 'accruing' : ''}
              style={employeeLivePayroll.isAccruing ? { color: employeeLivePayrollColor } : undefined}
            >
              {employeeLivePayroll.isLive
                ? (employeeLivePayroll.isAccruing
                    ? `+${formatLiveMoney(employeeLivePayroll.ratePerSecond)} / сек`
                    : getLivePayrollPauseLabel(employeeLivePayroll.accrualState))
                : 'Период завершён'}
            </span>
          </div>
          <div className="tender-detail-live-metric">
            <small>План месяца</small>
            <strong>{employeeMonthlyPlan.toLocaleString('ru-RU')} ₽</strong>
          </div>
          <div className="tender-detail-live-metric">
            <small>Выполнение</small>
            <strong>{employeePayrollProgress.toFixed(1)}%</strong>
          </div>
          <div className="tender-detail-live-metric">
            <small>По табелю</small>
            <strong>{Math.round(selectedMonthStats.timesheetEarned).toLocaleString('ru-RU')} ₽</strong>
          </div>
        </div>
        <div
          className="tender-detail-live-progress"
          role="progressbar"
          aria-label="Выполнение плана начисления"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(employeePayrollProgress)}
        >
          <div style={{ width: `${employeePayrollProgress}%` }} />
        </div>
      </article>

      <article className="tender-detail-weighted">
        <div>
          <span>Средний заработок за {historyYear} год (с учётом бонусов и проезда)</span>
          <strong>{averageMonthlyIncome.toLocaleString('ru-RU')} ₽</strong>
          <p style={{ color: yearlyHistoryPoints.length > 0 ? '#94a3b8' : '#64748b' }}>
            {yearlyHistoryPoints.length > 0
              ? `Средний заработок по выходным дням: ${Math.round(averageWeekendIncomeByYear).toLocaleString('ru-RU')} ₽/мес`
              : 'Нет данных табеля за выбранный год'}
          </p>
        </div>
        <div className="formula">
          <span>Σ(начислено за месяцы года)</span>
          <span>───────────────</span>
          <span>Количество месяцев с табелем</span>
        </div>
      </article>

      <div className="tender-detail-kpis">
        <article className="tender-detail-kpi-card">
          <small>Рабочие дни (отработано / норма)</small>
          <strong style={{ color: '#e2e8f0' }}>{workNormRatio}</strong>
        </article>
        <article className="tender-detail-kpi-card weekend">
          <small>Выходные</small>
          <strong style={{ color: '#fbbf24' }}>{selectedMonthStats.weekendDays.toLocaleString('ru-RU')} д</strong>
        </article>
        <article className="tender-detail-kpi-card">
          <small>Часы (отработано / норма)</small>
          <strong style={{ color: '#6ee7b7' }}>{selectedMonthHoursRatio} ч</strong>
        </article>
        <article className="tender-detail-kpi-card">
          <small>Сверх нормы (без начисления)</small>
          <strong style={{ color: '#fbbf24' }}>{selectedMonthStats.overtime.toLocaleString('ru-RU')} ч</strong>
        </article>
        <article className="tender-detail-kpi-card">
          <small>По табелю</small>
          <strong style={{ color: '#a5b4fc' }}>{Math.round(selectedMonthStats.timesheetEarned).toLocaleString('ru-RU')} ₽</strong>
        </article>
      </div>

      <article className="tender-detail-daily">
        <div className="tender-detail-daily-head">
          <div className="tender-detail-daily-copy">
            <h3>Табель по дням</h3>
            <p>Нажмите на день, чтобы открыть события СКУД</p>
          </div>
          <div className="tender-detail-daily-nav">
            <button
              type="button"
              className="tender-detail-daily-nav-btn"
              onClick={() => shiftChartMonth(-1)}
              aria-label="Предыдущий месяц"
            >
              ←
            </button>
            <span className="tender-detail-daily-period">{monthNames[chartMonth - 1]} {chartYear}</span>
            <button
              type="button"
              className="tender-detail-daily-nav-btn"
              onClick={() => shiftChartMonth(1)}
              aria-label="Следующий месяц"
            >
              →
            </button>
          </div>
        </div>
        <div className="tender-detail-daily-legend" aria-label="Обозначения статусов табеля">
          {TIMESHEET_STATUS_ORDER.map(status => {
            const meta = TIMESHEET_STATUS_META[status]
            return (
              <span
                key={status}
                className="tender-detail-daily-legend-item"
                style={{ '--daily-status-color': meta.color } as CSSProperties}
              >
                <b>{status === 'work' ? 'ч' : meta.short}</b>
                {meta.label}
              </span>
            )
          })}
        </div>
        {chartLoading && <span className="tender-detail-daily-state">Загрузка месяца…</span>}
        {chartError && <span className="tender-detail-daily-state error">{chartError}</span>}
        <div className="tender-daily-scroll">
          <div className="tender-daily-bars">
            {dailySeries.map(item => {
              const itemDate = `${chartYear}-${String(chartMonth).padStart(2, '0')}-${String(item.day).padStart(2, '0')}`
              const worked = item.status ? isWorkedTimesheetStatus(item.status) : false
              const barHeight = item.status
                ? (worked ? Math.max(8, Math.min(100, (item.hours / 10) * 100)) : 42)
                : 2
              const value = item.status === 'work'
                ? (item.hours > 0 ? (isMobileDaily ? Math.round(item.hours) : item.hours) : '')
                : (item.statusMeta?.short || '')
              const statusStyle = item.statusMeta
                ? { '--daily-status-color': item.statusMeta.color } as CSSProperties
                : undefined
              return (
                <button
                  key={item.day}
                  type="button"
                  className={`tender-daily-bar-col ${selectedSkudDate === itemDate ? 'selected' : ''}`}
                  onClick={() => openSkudDay(item.day)}
                  aria-pressed={selectedSkudDate === itemDate}
                  aria-controls="employee-skud-events"
                  title={item.statusMeta
                    ? `${item.day} ${monthNames[chartMonth - 1]}: ${item.statusMeta.label}${worked ? `, ${item.hours} ч` : ''}. Открыть события СКУД`
                    : `${item.day} ${monthNames[chartMonth - 1]}: нет данных. Открыть события СКУД`}
                  style={statusStyle}
                >
                  <span className={`value ${item.status ? 'status' : ''}`}>{value}</span>
                  <div
                    className={`bar ${item.status ? 'active status' : ''} ${item.weekend ? 'weekend' : ''}`}
                    style={{ height: `${barHeight}%` }}
                  />
                  <span className={`day ${item.weekend ? 'weekend' : ''}`}>{item.day}</span>
                </button>
              )
            })}
          </div>
        </div>
      </article>

      <EmployeeSkudEvents
        fotEmployeeId={employee.fot_employee_id}
        year={chartYear}
        month={chartMonth}
        selectedDate={selectedSkudDate}
      />

      <article className="tender-detail-history">
        <div className="tender-detail-history-head">
          <h3>История по месяцам</h3>
          <div className="tender-detail-history-controls">
            <div className="tender-detail-history-year-nav">
              <button type="button" className="year-btn" onClick={() => setHistoryYear(prev => prev - 1)}>← год</button>
              <span>{historyYear}</span>
              <button type="button" className="year-btn" onClick={() => setHistoryYear(prev => prev + 1)}>год →</button>
            </div>
            {loadingHistory && <span className="state">Загрузка…</span>}
            {historyError && <span className="state error">{historyError}</span>}
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Месяц</th>
              <th>Дни / статусы</th>
              <th>Часы</th>
              <th>Сверх нормы</th>
              <th>Оклад</th>
              <th>Выходные</th>
              <th>Проезд</th>
              <th>Начислено</th>
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
                    <td>—</td>
                    <td>—</td>
                    <td><span className="badge low">нет расчёта</span></td>
                  </tr>
                )
              }
              const baseWithMonthlyBonus = point.salary + Math.max(0, employee.monthly_bonus || 0)
              const earnedDeltaPercent = baseWithMonthlyBonus > 0
                ? ((point.earned - baseWithMonthlyBonus) / baseWithMonthlyBonus) * 100
                : null
              return (
                <tr key={point.key}>
                  <td>{point.label}</td>
                  <td className="tender-history-work-summary">
                    <strong>{point.workedDays.toLocaleString('ru-RU')}/{point.normDays.toLocaleString('ru-RU')}</strong>
                    <span className="tender-history-statuses">
                      {TIMESHEET_STATUS_ORDER
                        .filter(status => status !== 'work' && point.statusCounts[status] > 0)
                        .map(status => {
                          const meta = TIMESHEET_STATUS_META[status]
                          return (
                            <span
                              key={status}
                              className="tender-history-status"
                              title={meta.label}
                              style={{ '--daily-status-color': meta.color } as CSSProperties}
                            >
                              {meta.short} {point.statusCounts[status]}
                            </span>
                          )
                        })}
                    </span>
                  </td>
                  <td>{point.hours.toLocaleString('ru-RU')}</td>
                  <td>{point.overtime.toLocaleString('ru-RU')} ч</td>
                  <td>{point.workdaysSalary.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽</td>
                  <td>{point.weekendBonus.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽</td>
                  <td>{point.transportPayment.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽</td>
                  <td className="tender-history-earned">
                    {Math.round(point.earned).toLocaleString('ru-RU')} ₽
                    {earnedDeltaPercent !== null && (
                      <small> ({earnedDeltaPercent >= 0 ? '+' : ''}{earnedDeltaPercent.toFixed(1)}%)</small>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div className="tender-detail-trends">
          <div>
            <span>Отработанные часы</span>
            <Sparkline values={history.map(item => item.hours)} color="#38bdf8" />
          </div>
          <div>
            <span>Начисления</span>
            <Sparkline values={history.map(item => item.earned)} color="#6ee7b7" />
          </div>
          <div>
            <span>Рабочие дни</span>
            <Sparkline values={history.map(item => item.workedDays)} color="#a78bfa" />
          </div>
        </div>
      </article>

      <article className="tender-detail-raises">
        <h3>История повышений и событий</h3>
        <button
          type="button"
          className="tender-raises-toggle"
          onClick={() => setIsRaiseHistoryOpen(previous => !previous)}
          aria-expanded={isRaiseHistoryOpen}
        >
          <span className="tender-raises-toggle-line">{latestRaiseSummary}</span>
          <span className={`tender-raises-toggle-icon ${isRaiseHistoryOpen ? 'open' : ''}`}>▼</span>
        </button>

        {loadingEmployeeEvents && <div className="tender-raises-empty">Загрузка событий…</div>}
        {isRaiseHistoryOpen && (
          combinedRaiseHistory.length === 0 ? (
            <div className="tender-raises-empty">История сотрудника пуста</div>
          ) : (
            <div className="tender-raises-list">
              {combinedRaiseHistory.map(item => (
                item.kind === 'raise' ? (
                  <div key={item.key} className="tender-raise-item">
                    <div className="tender-raise-main">
                      <span className="tender-raise-date">
                        {new Date(`${item.date}T12:00:00`).toLocaleDateString('ru-RU', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric'
                        })}
                      </span>
                      <span className="tender-raise-salary">
                        {item.fromSalary.toLocaleString('ru-RU')} ₽ → {item.toSalary.toLocaleString('ru-RU')} ₽
                      </span>
                      <span className="tender-raise-gap">
                        Интервал от прошлого: {item.monthsBetween > 0 ? `${item.monthsBetween} мес.` : '< 1 мес'}
                        {item.monthsBetween >= 12 && <small> ({formatMonthsSinceRaise(item.monthsBetween)})</small>}
                      </span>
                    </div>
                    <span className="tender-raise-delta">
                      +{item.delta.toLocaleString('ru-RU')} ₽
                      {item.deltaPercent > 0 && <small> (+{item.deltaPercent.toFixed(1)}%)</small>}
                    </span>
                    {item.note && <span className="tender-raise-note">{item.note}</span>}
                  </div>
                ) : (
                  <div key={item.key} className={`tender-raise-item tender-raise-item-event ${item.eventType}`}>
                    <div className="tender-raise-main">
                      <span className="tender-raise-date">
                        {new Date(`${item.date}T12:00:00`).toLocaleDateString('ru-RU', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric'
                        })}
                      </span>
                      <span className="tender-raise-salary">
                        {item.eventType === 'archive' ? 'Перемещён в архив' : 'Возвращён из архива'}
                      </span>
                      {item.note && <span className="tender-raise-note">{item.note}</span>}
                    </div>
                    <span className={`tender-raise-event-chip ${item.eventType}`}>
                      {item.eventType === 'archive' ? 'Архив' : 'Возврат'}
                    </span>
                  </div>
                )
              ))}
            </div>
          )
        )}
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
  const [activeTab, setActiveTab] = useState<TenderTab>('agent')
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
          <div id="tender-tab-status" className="tender-shell-status" />
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
            {activeTab === 'agent' && (
              <ManagementAgent
                employees={employees}
                year={selectedYear}
                month={selectedMonth}
                onSelectEmployee={setSelectedEmployee}
              />
            )}

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
                              year={selectedYear}
                              month={selectedMonth}
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
                                year={selectedYear}
                                month={selectedMonth}
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

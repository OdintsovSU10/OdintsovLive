import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../../../lib/supabase'
import type { EmployeeWithStats, TimesheetEntry } from '../types'
import { calculateSalary, getDailyHoursNorm, getRemoteFullDayHours, getSalaryForMonth, isWeekendOrHoliday, roundTimesheetHours } from '../utils/salaryCalculator'
import { useLivePayroll } from '../hooks/useLivePayroll'
import {
  calculateEmployeeMonthlyPayrollPlan,
  formatLiveMoney,
  formatLiveNumber,
  getLivePayrollAccrualColor,
  getLivePayrollPauseLabel,
  getExtraBonusKey,
  getSavedTransport,
  parseExtraBonuses
} from '../utils/livePayroll'
import './DashboardOverview.css'

interface Props {
  employees: EmployeeWithStats[]
  year: number
  month: number
  onSelectEmployee: (employee: EmployeeWithStats) => void
}

type SortBy = 'hours' | 'earned'
type DepartmentMetric = 'earned' | 'hours'

interface MonthSlot {
  year: number
  month: number
  key: string
  label: string
}

interface EmployeeTrendPoint {
  monthLabel: string
  monthShort: string
  hasTimesheet: boolean
  salary: number
  hours: number
  normHoursWeekdays: number
  normWorkdaysWeekdays: number
  workedWeekdays: number
  overtime: number
  weekendDays: number
  earnedPlan: number
  earned: number
  timesheetEarned: number
}

interface EmployeeTrend {
  employee: EmployeeWithStats
  points: EmployeeTrendPoint[]
  latest: EmployeeTrendPoint
  totalOvertime: number
  totalEarned: number
  totalHours: number
  totalWeekendDays: number
  avgOvertime: number
  weightedSalary: number
}

interface DepartmentTrend {
  name: string
  employeesCount: number
  employeesWithTimesheet: number
  monthlyPlan: number
  latestEarned: number
  latestHours: number
  latestOvertime: number
  totalEarned: number
  totalHours: number
  totalOvertime: number
}

interface DonutSegment {
  label: string
  value: number
  color: string
}

interface SparklinePoint {
  label: string
  value: number | null
}

const MONTHS_WINDOW = 5

const SORT_OPTIONS: Array<{ key: SortBy; label: string; color: string }> = [
  { key: 'hours', label: 'Часы', color: '#818cf8' },
  { key: 'earned', label: 'По табелю', color: '#34d399' }
]
const DEPARTMENT_METRIC_OPTIONS: Array<{ key: DepartmentMetric; label: string; color: string }> = [
  { key: 'earned', label: 'Начисления', color: '#34d399' },
  { key: 'hours', label: 'Часы', color: '#818cf8' }
]

const DEPT_PALETTE = ['#60a5fa', '#22d3ee', '#818cf8', '#38bdf8', '#a78bfa', '#4f46e5', '#14b8a6', '#06b6d4']

const formatNumber = (value: number): string => Math.round(value).toLocaleString('ru-RU')
const formatDecimal = (value: number): string => (
  Number.isInteger(value)
    ? value.toLocaleString('ru-RU')
    : value.toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
)
const formatPercent = (value: number): string => `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`

function toIsoDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

function monthLabel(year: number, month: number): { full: string; short: string } {
  const date = new Date(year, month - 1, 1)
  const short = date.toLocaleDateString('ru-RU', { month: 'short' }).replace('.', '')
  const capShort = short.charAt(0).toUpperCase() + short.slice(1)
  return { full: `${capShort} ${year}`, short: capShort }
}

function getWeekdayNormHours(date: Date): number {
  if (isWeekendOrHoliday(date)) return 0

  const day = date.getDay()
  if (day >= 1 && day <= 4) return 9
  if (day === 5) return 8
  return 0
}

function getMonthWeekdayNormHours(year: number, month: number): number {
  const daysInMonth = new Date(year, month, 0).getDate()
  let total = 0

  for (let day = 1; day <= daysInMonth; day++) {
    total += getWeekdayNormHours(new Date(year, month - 1, day))
  }

  return total
}

function getMonthWeekdayNormDays(year: number, month: number): number {
  const daysInMonth = new Date(year, month, 0).getDate()
  let total = 0

  for (let day = 1; day <= daysInMonth; day++) {
    if (!isWeekendOrHoliday(new Date(year, month - 1, day))) {
      total += 1
    }
  }

  return total
}

function buildMonthSlots(anchorYear: number, anchorMonth: number, count: number): MonthSlot[] {
  const result: MonthSlot[] = []

  for (let offset = count - 1; offset >= 0; offset--) {
    const date = new Date(anchorYear, anchorMonth - 1 - offset, 1)
    const year = date.getFullYear()
    const month = date.getMonth() + 1
    const labels = monthLabel(year, month)
    result.push({
      year,
      month,
      key: monthKey(year, month),
      label: labels.full
    })
  }

  return result
}

function calculateWeightedSalary(points: EmployeeTrendPoint[]): number {
  const calculatedPoints = points.filter(point => point.hasTimesheet)
  if (calculatedPoints.length === 0) {
    return 0
  }

  const overtimeWeight = calculatedPoints.reduce((sum, point) => sum + point.overtime, 0)
  if (overtimeWeight <= 0) {
    return calculatedPoints[calculatedPoints.length - 1]?.earned ?? 0
  }

  const weightedSum = calculatedPoints.reduce((sum, point) => sum + point.earned * point.overtime, 0)
  return Math.round(weightedSum / overtimeWeight)
}

function AnimatedNumber({
  value,
  suffix = '',
  formatter = formatNumber
}: {
  value: number
  suffix?: string
  formatter?: (value: number) => string
}) {
  const [display, setDisplay] = useState(value)
  const frameRef = useRef<number | null>(null)
  const previousRef = useRef(value)

  useEffect(() => {
    const start = previousRef.current
    const end = value
    const duration = 850
    const startAt = performance.now()

    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current)
    }

    const tick = (time: number) => {
      const progress = Math.min((time - startAt) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      const next = start + (end - start) * eased
      setDisplay(next)

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick)
      }
    }

    frameRef.current = requestAnimationFrame(tick)
    previousRef.current = end

    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current)
      }
    }
  }, [value])

  return <>{formatter(display)}{suffix}</>
}

function Sparkline({
  data,
  color,
  unit,
  width = 126,
  height = 34
}: {
  data: SparklinePoint[]
  color: string
  unit: '₽' | 'ч'
  width?: number
  height?: number
}) {
  const [hoveredPoint, setHoveredPoint] = useState<{
    label: string
    value: number
    x: number
    y: number
  } | null>(null)
  const availableValues = data.flatMap(point => point.value == null ? [] : [point.value])

  if (data.length === 0 || availableValues.length === 0) {
    return <span className="dash-sparkline-empty">—</span>
  }

  const max = Math.max(...availableValues)
  const min = Math.min(...availableValues)
  const range = max - min
  const formatValue = (value: number) => (
    unit === '₽' ? `${formatNumber(value)} ₽` : `${formatDecimal(value)} ч`
  )
  const accessibleSummary = data
    .map(point => `${point.label}: ${point.value == null ? 'нет данных' : formatValue(point.value)}`)
    .join('; ')

  const positionedPoints = data.map((point, index) => {
    const x = data.length === 1
      ? width / 2
      : (index / (data.length - 1)) * (width - 16) + 8
    const value = point.value
    if (value == null) return null

    const y = range === 0
      ? height / 2
      : height - ((value - min) / range) * (height - 16) - 8

    return { label: point.label, value, index, x, y }
  })

  const segments: Array<Array<NonNullable<(typeof positionedPoints)[number]>>> = []
  let currentSegment: Array<NonNullable<(typeof positionedPoints)[number]>> = []

  positionedPoints.forEach(point => {
    if (point) {
      currentSegment.push(point)
      return
    }

    if (currentSegment.length > 0) {
      segments.push(currentSegment)
      currentSegment = []
    }
  })

  if (currentSegment.length > 0) {
    segments.push(currentSegment)
  }

  return (
    <span
      className={`dash-sparkline-wrap ${hoveredPoint ? 'has-tooltip' : ''}`}
      style={{ width, height }}
      onMouseLeave={() => setHoveredPoint(null)}
      onClick={event => event.stopPropagation()}
    >
      <svg
        width={width}
        height={height}
        className="dash-sparkline"
        role="img"
        aria-label={`Динамика за ${MONTHS_WINDOW} месяцев. ${accessibleSummary}`}
        focusable="false"
      >
        {segments.map((segment, segmentIndex) => (
          segment.length > 1 && (
            <polyline
              key={`${segment[0].index}-${segmentIndex}`}
              fill="none"
              stroke={color}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={segment.map(point => `${point.x},${point.y}`).join(' ')}
            />
          )
        ))}
        {positionedPoints.map(point => point && (
          <g key={point.index}>
            <circle
              className="dash-spark-point-hit"
              cx={point.x}
              cy={point.y}
              r="8"
              fill="transparent"
              onMouseEnter={() => setHoveredPoint(point)}
            >
              <title>{point.label}: {formatValue(point.value)}</title>
            </circle>
            <circle
              className="dash-spark-point"
              cx={point.x}
              cy={point.y}
              r={point.index === data.length - 1 ? 2.8 : 2.1}
              fill={color}
            />
          </g>
        ))}
      </svg>
      {hoveredPoint && (
        <span
          className="dash-spark-tooltip"
          role="tooltip"
          style={{ left: Math.min(width - 48, Math.max(48, hoveredPoint.x)) }}
        >
          <strong>{hoveredPoint.label}</strong>
          <span>{formatValue(hoveredPoint.value)}</span>
        </span>
      )}
    </span>
  )
}

function DepartmentDonut({
  segments,
  centerValue,
  centerLabel
}: {
  segments: DonutSegment[]
  centerValue: ReactNode
  centerLabel: string
}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0)

  let offset = 0
  const gradientParts = segments.map(segment => {
    const start = offset
    const share = total > 0 ? (segment.value / total) * 100 : 0
    offset += share
    return `${segment.color} ${start.toFixed(3)}% ${offset.toFixed(3)}%`
  })

  const background = gradientParts.length > 0
    ? `conic-gradient(${gradientParts.join(', ')})`
    : 'conic-gradient(#2A2A2A 0% 100%)'

  return (
    <div className="dash-donut" style={{ background }}>
      <div className="dash-donut-center">
        <div className="dash-donut-total">{centerValue}</div>
        <div className="dash-donut-sub">{centerLabel}</div>
      </div>
    </div>
  )
}

function getRankLabel(index: number): string {
  if (index === 0) return '🥇'
  if (index === 1) return '🥈'
  if (index === 2) return '🥉'
  return `#${index + 1}`
}

export function DashboardOverview({ employees, year, month, onSelectEmployee }: Props) {
  const [sortBy, setSortBy] = useState<SortBy>('earned')
  const [departmentMetric, setDepartmentMetric] = useState<DepartmentMetric>('earned')
  const [historyEntries, setHistoryEntries] = useState<TimesheetEntry[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)

  const payrollPlanning = useMemo(() => {
    const transport = getSavedTransport()
    const extraBonuses = parseExtraBonuses(localStorage.getItem(getExtraBonusKey(year, month)))
    const byEmployee = new Map<number, number>()

    for (const employee of employees) {
      byEmployee.set(
        employee.id,
        calculateEmployeeMonthlyPayrollPlan(employee, year, month, transport, extraBonuses)
      )
    }

    return {
      transport,
      byEmployee,
      total: Array.from(byEmployee.values()).reduce((sum, value) => sum + value, 0)
    }
  }, [employees, month, year])
  const livePayroll = useLivePayroll(payrollPlanning.total, year, month)
  const livePayrollColor = getLivePayrollAccrualColor(livePayroll.workdayProgress)

  const monthSlots = useMemo(() => buildMonthSlots(year, month, MONTHS_WINDOW), [year, month])

  useEffect(() => {
    let cancelled = false

    const loadHistory = async () => {
      if (employees.length === 0) {
        setHistoryEntries([])
        return
      }

      setHistoryLoading(true)
      setHistoryError(null)

      try {
        const employeeIds = employees.map(employee => employee.id)
        const rangeStart = new Date(year, month - MONTHS_WINDOW, 1)
        const rangeEnd = new Date(year, month, 0)

        const { data, error } = await supabase
          .from('tender_timesheet')
          .select('*')
          .in('employee_id', employeeIds)
          .gte('work_date', toIsoDate(rangeStart))
          .lte('work_date', toIsoDate(rangeEnd))

        if (error) throw error

        if (!cancelled) {
          setHistoryEntries(((data || []) as TimesheetEntry[]).map(entry => ({
            ...entry,
            hours_worked: entry.hours_worked == null ? null : roundTimesheetHours(entry.hours_worked)
          })))
        }
      } catch (err) {
        console.error('Error loading dashboard history:', err)
        if (!cancelled) {
          setHistoryEntries([])
          setHistoryError(err instanceof Error ? err.message : 'Не удалось загрузить историю табеля')
        }
      } finally {
        if (!cancelled) {
          setHistoryLoading(false)
        }
      }
    }

    loadHistory()
    return () => {
      cancelled = true
    }
  }, [employees, year, month])

  const analytics = useMemo(() => {
    const baseTransport = payrollPlanning.transport

    const entriesByEmployeeMonth = new Map<string, TimesheetEntry[]>()
    for (const entry of historyEntries) {
      const entryDate = new Date(`${entry.work_date}T12:00:00`)
      const key = `${entry.employee_id}:${monthKey(entryDate.getFullYear(), entryDate.getMonth() + 1)}`
      const list = entriesByEmployeeMonth.get(key) || []
      list.push(entry)
      entriesByEmployeeMonth.set(key, list)
    }

    const employeeTrends: EmployeeTrend[] = employees.map(employee => {
      const points: EmployeeTrendPoint[] = monthSlots.map(slot => {
        const timesheet = entriesByEmployeeMonth.get(`${employee.id}:${slot.key}`) || []
        const hasTimesheet = timesheet.length > 0
        const normHoursWeekdays = getMonthWeekdayNormHours(slot.year, slot.month)
        const normWorkdaysWeekdays = getMonthWeekdayNormDays(slot.year, slot.month)

        let hours = 0
        let workedWeekdays = 0
        let overtime = 0
        let weekendDays = 0

        for (const entry of timesheet) {
          if (entry.status !== 'work' && entry.status !== 'remote') continue

          const entryDate = new Date(`${entry.work_date}T12:00:00`)
          const weekendOrHoliday = isWeekendOrHoliday(entryDate)
          const expectedHours = getDailyHoursNorm(entryDate)
          const workedHours = entry.status === 'remote'
            ? getRemoteFullDayHours(entry.hours_worked, entryDate)
            : roundTimesheetHours(entry.hours_worked, expectedHours)

          hours += workedHours
          overtime += Math.max(0, workedHours - expectedHours)

          if (weekendOrHoliday && workedHours >= 3) {
            weekendDays += 1
          } else if (!weekendOrHoliday) {
            workedWeekdays += 1
          }
        }

        const labels = monthLabel(slot.year, slot.month)
        if (!hasTimesheet) {
          return {
            monthLabel: labels.full,
            monthShort: labels.short,
            hasTimesheet: false,
            salary: 0,
            hours: 0,
            normHoursWeekdays,
            normWorkdaysWeekdays,
            workedWeekdays: 0,
            overtime: 0,
            weekendDays: 0,
            earnedPlan: 0,
            earned: 0,
            timesheetEarned: 0
          }
        }

        const salary = getSalaryForMonth(employee.salaryHistory || [], employee.current_salary, slot.year, slot.month)
        const slotExtraBonuses = parseExtraBonuses(localStorage.getItem(getExtraBonusKey(slot.year, slot.month)))
        const salaryCalc = calculateSalary({
          employee_id: employee.id,
          base_salary: salary,
          year: slot.year,
          month: slot.month,
          timesheet,
          transport: baseTransport,
          bonus: (employee.monthly_bonus || 0) + (slotExtraBonuses[employee.id] || 0)
        })

        // База = рабочие дни + ежемесячный бонус + проезд (без доплаты за выходные).
        const baseEarnedPlan = Math.round((salaryCalc.final_salary - salaryCalc.weekend_payment) * 100) / 100

        return {
          monthLabel: labels.full,
          monthShort: labels.short,
          hasTimesheet: true,
          salary,
          hours,
          normHoursWeekdays,
          normWorkdaysWeekdays,
          workedWeekdays,
          overtime,
          weekendDays,
          earnedPlan: baseEarnedPlan,
          earned: salaryCalc.final_salary,
          timesheetEarned: salaryCalc.calculated_salary
        }
      })

      const latest = points[points.length - 1] || {
        monthLabel: monthLabel(year, month).full,
        monthShort: monthLabel(year, month).short,
        hasTimesheet: false,
        salary: 0,
        hours: 0,
        normHoursWeekdays: getMonthWeekdayNormHours(year, month),
        normWorkdaysWeekdays: getMonthWeekdayNormDays(year, month),
        workedWeekdays: 0,
        overtime: 0,
        weekendDays: 0,
        earnedPlan: 0,
        earned: 0,
        timesheetEarned: 0
      }

      const calculatedPoints = points.filter(point => point.hasTimesheet)
      const totalOvertime = points.reduce((sum, point) => sum + point.overtime, 0)
      const totalEarned = points.reduce((sum, point) => sum + point.earned, 0)
      const totalHours = points.reduce((sum, point) => sum + point.hours, 0)
      const totalWeekendDays = points.reduce((sum, point) => sum + point.weekendDays, 0)

      return {
        employee,
        points,
        latest,
        totalOvertime,
        totalEarned,
        totalHours,
        totalWeekendDays,
        avgOvertime: calculatedPoints.length > 0 ? totalOvertime / calculatedPoints.length : 0,
        weightedSalary: calculateWeightedSalary(points)
      }
    })

    const dashboardEmployeeTrends = employeeTrends.filter(trend => trend.latest.hasTimesheet)

    const sortedEmployees = [...employeeTrends].sort((left, right) => {
      const hasTimesheetDiff = Number(right.latest.hasTimesheet) - Number(left.latest.hasTimesheet)
      if (hasTimesheetDiff !== 0) return hasTimesheetDiff

      if (sortBy === 'earned') {
        return right.latest.timesheetEarned - left.latest.timesheetEarned
      }
      return right.latest.hours - left.latest.hours
    })

    const latestOvertime = dashboardEmployeeTrends.reduce((sum, trend) => sum + trend.latest.overtime, 0)
    const latestEarned = dashboardEmployeeTrends.reduce((sum, trend) => sum + trend.latest.earned, 0)
    const latestTimesheetEarned = dashboardEmployeeTrends.reduce((sum, trend) => sum + trend.latest.timesheetEarned, 0)
    const latestHours = dashboardEmployeeTrends.reduce((sum, trend) => sum + trend.latest.hours, 0)
    const latestWeekendDays = dashboardEmployeeTrends.reduce((sum, trend) => sum + trend.latest.weekendDays, 0)
    const latestBaseFOT = dashboardEmployeeTrends.reduce((sum, trend) => sum + trend.latest.earnedPlan, 0)
    const latestFOTGrowthPct = latestBaseFOT > 0
      ? ((latestEarned - latestBaseFOT) / latestBaseFOT) * 100
      : 0
    const latestFOTDelta = latestEarned - latestBaseFOT

    const departmentMap = new Map<string, Omit<DepartmentTrend, 'name'>>()

    for (const trend of employeeTrends) {
      const department = trend.employee.subdivision || trend.employee.department || 'Без подразделения'
      const existing = departmentMap.get(department)
      const hasTimesheet = trend.latest.hasTimesheet
      const monthlyPlan = payrollPlanning.byEmployee.get(trend.employee.id) || 0

      if (!existing) {
        departmentMap.set(department, {
          employeesCount: 1,
          employeesWithTimesheet: hasTimesheet ? 1 : 0,
          monthlyPlan,
          latestEarned: hasTimesheet ? trend.latest.earned : 0,
          latestHours: hasTimesheet ? trend.latest.hours : 0,
          latestOvertime: hasTimesheet ? trend.latest.overtime : 0,
          totalEarned: trend.totalEarned,
          totalHours: trend.totalHours,
          totalOvertime: trend.totalOvertime
        })
        continue
      }

      existing.employeesCount += 1
      existing.employeesWithTimesheet += hasTimesheet ? 1 : 0
      existing.monthlyPlan += monthlyPlan
      existing.latestEarned += hasTimesheet ? trend.latest.earned : 0
      existing.latestHours += hasTimesheet ? trend.latest.hours : 0
      existing.latestOvertime += hasTimesheet ? trend.latest.overtime : 0
      existing.totalEarned += trend.totalEarned
      existing.totalHours += trend.totalHours
      existing.totalOvertime += trend.totalOvertime
    }

    const departmentTrends: DepartmentTrend[] = Array.from(departmentMap.entries())
      .map(([name, department]) => ({
        name,
        ...department
      }))
      .sort((left, right) => right.latestEarned - left.latestEarned)

    const departmentColors = new Map<string, string>()
    departmentTrends.forEach((department, index) => {
      departmentColors.set(department.name, DEPT_PALETTE[index % DEPT_PALETTE.length])
    })

    const departmentOvertimeLeaders = [...departmentTrends]
      .filter(department => department.employeesWithTimesheet > 0)
      .sort((left, right) => right.latestOvertime - left.latestOvertime)
    const maxDepartmentOvertime = Math.max(...departmentOvertimeLeaders.map(department => department.latestOvertime), 1)

    return {
      employeeTrends,
      dashboardEmployeeTrends,
      sortedEmployees,
      departmentTrends,
      departmentOvertimeLeaders,
      departmentColors,
      maxDepartmentOvertime,
      latestOvertime,
      latestEarned,
      latestTimesheetEarned,
      latestBaseFOT,
      latestFOTGrowthPct,
      latestFOTDelta,
      latestHours,
      latestWeekendDays,
      totalEmployees: employeeTrends.length
    }
  }, [employees, historyEntries, monthSlots, month, payrollPlanning, sortBy, year])

  if (employees.length === 0) {
    return (
      <div className="dashboard-overview">
        <div className="dashboard-surface">
          <div className="dash-empty">Нет сотрудников для построения дашборда</div>
        </div>
      </div>
    )
  }

  const latestPeriodLabel = monthSlots[monthSlots.length - 1]?.label || ''
  const departmentMetricUnit = departmentMetric === 'earned' ? '₽' : 'ч'
  const usesLiveDepartmentAccrual = departmentMetric === 'earned' && livePayroll.isLive
  const getDepartmentMetricValue = (department: DepartmentTrend) => (
    departmentMetric === 'earned'
      ? usesLiveDepartmentAccrual
        ? department.monthlyPlan * livePayroll.progress
        : department.latestEarned
      : department.latestHours
  )
  const departmentMetricTrends = [...analytics.departmentTrends]
    .filter(department => usesLiveDepartmentAccrual || department.employeesWithTimesheet > 0)
    .sort((left, right) => getDepartmentMetricValue(right) - getDepartmentMetricValue(left))
  const departmentMetricSegments: DonutSegment[] = departmentMetricTrends.map(department => ({
    label: department.name,
    value: getDepartmentMetricValue(department),
    color: analytics.departmentColors.get(department.name) || '#6ee7b7'
  }))
  const departmentMetricTotal = usesLiveDepartmentAccrual
    ? livePayroll.accrued
    : departmentMetricSegments.reduce((sum, segment) => sum + segment.value, 0)
  const formatDepartmentMetricValue = (value: number) => {
    if (usesLiveDepartmentAccrual) return formatLiveNumber(value)
    if (departmentMetric === 'hours') return formatDecimal(value)
    return formatNumber(value)
  }
  const tabStatusTarget = typeof document === 'undefined'
    ? null
    : document.getElementById('tender-tab-status')
  const refreshIndicator = (
    <span
      className="dash-refresh-indicator"
      role="status"
      aria-label={`Обновляем аналитику за последние ${MONTHS_WINDOW} месяцев`}
      title={`Обновляем аналитику за последние ${MONTHS_WINDOW} месяцев`}
    >
      <span className="dash-refresh-spinner" aria-hidden="true" />
    </span>
  )

  return (
    <div className="dashboard-overview">
      {historyLoading && (
        tabStatusTarget
          ? createPortal(refreshIndicator, tabStatusTarget)
          : <span className="dash-refresh-fallback">{refreshIndicator}</span>
      )}
      <div className="dashboard-surface">
        {historyError && (
          <div className="dash-error">Часть данных недоступна: {historyError}</div>
        )}

        <>
          <div className="dash-kpis">
            {[
              {
                label: 'Сотрудников',
                icon: '👥',
                value: analytics.dashboardEmployeeTrends.length,
                suffix: '',
                color: '#818cf8',
                sub: `С расчётом табеля: ${analytics.dashboardEmployeeTrends.length} из ${analytics.totalEmployees}`,
                formatter: formatNumber
              },
              {
                label: 'Сверх дневной нормы',
                icon: '⏱',
                value: analytics.latestOvertime,
                suffix: ' ч',
                color: '#60a5fa',
                sub: `За ${latestPeriodLabel}`,
                formatter: formatNumber
              },
              {
                label: livePayroll.isLive ? 'Условно по времени' : 'Фонд выплат',
                icon: '💰',
                value: livePayroll.isLive ? livePayroll.accrued : analytics.latestEarned,
                suffix: ' ₽',
                color: livePayroll.isLive
                  ? livePayrollColor
                  : analytics.latestFOTDelta > 0
                    ? '#ef4444'
                    : analytics.latestFOTDelta < 0
                      ? '#22c55e'
                      : '#34d399',
                sub: livePayroll.isLive ? (
                  <span className="dash-kpi-sub-lines">
                    <span>План месяца: {formatNumber(livePayroll.planned)} ₽</span>
                    <span className={`dash-kpi-sub-accent live${livePayroll.isAccruing ? '' : ' paused'}`}>
                      {livePayroll.isAccruing
                        ? `+${formatLiveMoney(livePayroll.ratePerSecond)} / сек`
                        : getLivePayrollPauseLabel(livePayroll.accrualState)}
                    </span>
                    <span>По табелю: {formatNumber(analytics.latestTimesheetEarned)} ₽</span>
                  </span>
                ) : (
                  <span className="dash-kpi-sub-lines">
                    <span>Базовый ФОТ: {formatNumber(analytics.latestBaseFOT)} ₽</span>
                    <span className={`dash-kpi-sub-accent ${
                      analytics.latestFOTDelta > 0
                        ? 'over'
                        : analytics.latestFOTDelta < 0
                          ? 'under'
                          : 'equal'
                    }`}>
                      {analytics.latestFOTDelta > 0 && (
                        `Превышение: +${formatNumber(analytics.latestFOTDelta)} ₽ (${formatPercent(analytics.latestFOTGrowthPct)})`
                      )}
                      {analytics.latestFOTDelta < 0 && (
                        `Ниже базового: -${formatNumber(Math.abs(analytics.latestFOTDelta))} ₽ (${formatPercent(analytics.latestFOTGrowthPct)})`
                      )}
                      {analytics.latestFOTDelta === 0 && 'Отклонение: 0 ₽ (0%)'}
                    </span>
                  </span>
                ),
                formatter: livePayroll.isLive ? formatLiveNumber : formatNumber
              },
              {
                label: 'Отработано',
                icon: '📈',
                value: analytics.latestHours,
                suffix: ' ч',
                color: '#38bdf8',
                sub: `Выходных смен за ${latestPeriodLabel}: ${analytics.latestWeekendDays}`,
                formatter: formatNumber
              }
            ].map(kpi => (
              <article
                key={kpi.label}
                className="dash-kpi-card"
                style={{ '--kpi-color': kpi.color } as CSSProperties}
              >
                <div className="dash-kpi-top">
                  <span className="dash-kpi-label">{kpi.label}</span>
                  <span className="dash-kpi-icon">{kpi.icon}</span>
                </div>
                <div className="dash-kpi-value" style={{ color: kpi.color }}>
                  <AnimatedNumber value={kpi.value} suffix={kpi.suffix} formatter={kpi.formatter} />
                </div>
                <div className="dash-kpi-sub">{kpi.sub}</div>
              </article>
            ))}
          </div>

          <div className="dash-main-grid">
            <div className="dash-stack">
              <section className="dash-card">
                <div className="dash-card-title-row">
                  <h3 className="dash-card-title">Сотрудники по начислениям и часам</h3>
                  <div className="dash-sort">
                    {SORT_OPTIONS.map(option => (
                      <button
                        key={option.key}
                        type="button"
                        className={`dash-sort-btn ${sortBy === option.key ? 'active' : ''}`}
                        style={sortBy === option.key ? { color: option.color, borderColor: `${option.color}55`, background: `${option.color}1c` } : undefined}
                        onClick={() => setSortBy(option.key)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="dash-ranking-help">
                  Сортировка — по данным табеля за {latestPeriodLabel}. Линия справа — {MONTHS_WINDOW} месяцев в собственной шкале; наведите на точку.
                </div>

                <div className="dash-ranking-list">
                  {analytics.dashboardEmployeeTrends.length === 0 && (
                    <div className="dash-no-data">
                      За {latestPeriodLabel} нет табелей; сотрудники показаны без ранжирования.
                    </div>
                  )}

                  {analytics.sortedEmployees.map((trend, index) => {
                    const selectedMetricColor = SORT_OPTIONS.find(option => option.key === sortBy)?.color || '#818cf8'
                    const baseColor = selectedMetricColor
                    const hoursExceeded = trend.latest.hours > trend.latest.normHoursWeekdays
                    const employeePlan = payrollPlanning.byEmployee.get(trend.employee.id) || 0
                    const employeeTimedAccrual = employeePlan * livePayroll.progress
                    const employeeTimesheetProgress = trend.latest.salary > 0 && trend.latest.hasTimesheet
                      ? Math.max(0, (trend.latest.timesheetEarned / trend.latest.salary) * 100)
                      : 0
                    const employeeHoursProgress = trend.latest.normHoursWeekdays > 0
                      ? Math.max(0, (trend.latest.hours / trend.latest.normHoursWeekdays) * 100)
                      : 0
                    const employeeRatePerSecond = livePayroll.planned > 0 && livePayroll.isAccruing
                      ? livePayroll.ratePerSecond * (employeePlan / livePayroll.planned)
                      : 0
                    const earnedExceeded = trend.latest.hasTimesheet && trend.latest.timesheetEarned > trend.latest.salary
                    const isMetricExceeded = sortBy === 'earned' ? earnedExceeded : hoursExceeded

                    const sparkData = trend.points.map(point => {
                      const value = point.hasTimesheet
                        ? (sortBy === 'earned' ? point.timesheetEarned : point.hours)
                        : null
                      return { label: point.monthLabel, value }
                    })

                    const departmentName = trend.employee.subdivision || trend.employee.department || 'Без подразделения'

                    return (
                      <button
                        key={trend.employee.id}
                        type="button"
                        className="dash-ranking-row"
                        onClick={() => onSelectEmployee(trend.employee)}
                      >
                        <span className={`dash-rank ${trend.latest.hasTimesheet && index < 3 ? 'top' : ''}`}>
                          {trend.latest.hasTimesheet ? getRankLabel(index) : '—'}
                        </span>
                        <span className="dash-avatar">{trend.employee.avatar}</span>
                        <span className="dash-employee">
                          <span className="dash-employee-name">{trend.employee.full_name}</span>
                          <span className="dash-employee-meta">{trend.employee.position} • {departmentName}</span>
                        </span>
                        <span className="dash-ranking-metric">
                          {sortBy === 'earned' ? (
                            <>
                              <span className="dash-ranking-main dash-ranking-payroll" style={{ color: baseColor }}>
                                <span className="dash-ranking-label">По табелю</span>
                                <span className={`dash-ranking-value ${isMetricExceeded ? 'alert' : ''}`}>
                                  {trend.latest.hasTimesheet
                                    ? `${formatNumber(trend.latest.timesheetEarned)} ₽`
                                    : 'Нет данных'}
                                </span>
                              </span>
                              <span className="dash-ranking-sub dash-ranking-payroll-plan">
                                Оклад месяца: {formatNumber(trend.latest.salary)} ₽
                                {trend.latest.hasTimesheet && ` · исполнено ${employeeTimesheetProgress.toFixed(1)}%`}
                              </span>
                              {livePayroll.isLive && (
                                <>
                                  <span
                                    className="dash-ranking-sub dash-ranking-live-accrual"
                                    title="Плановая оценка: план месяца × доля прошедшего нормативного рабочего времени"
                                  >
                                    Условно по времени: {' '}
                                    <strong style={{ color: livePayrollColor }}>{formatLiveNumber(employeeTimedAccrual)} ₽</strong>
                                    {' · '}{(livePayroll.progress * 100).toFixed(1)}%
                                  </span>
                                  <span className="dash-ranking-sub dash-ranking-live-state">
                                    {livePayroll.isAccruing
                                      ? `+${formatLiveMoney(employeeRatePerSecond)} / сек`
                                      : getLivePayrollPauseLabel(livePayroll.accrualState)}
                                  </span>
                                </>
                              )}
                            </>
                          ) : (
                            <>
                              <span className="dash-ranking-main" style={{ color: baseColor }}>
                                <span className="dash-ranking-label">Отработано</span>
                                <span className={`dash-ranking-value dash-fact-value ${isMetricExceeded ? 'alert' : ''}`}>
                                  {trend.latest.hasTimesheet
                                    ? `${formatNumber(trend.latest.hours)} ч`
                                    : 'Нет данных'}
                                </span>
                              </span>
                              <span className="dash-ranking-sub dash-ranking-hours-plan">
                                Норма месяца: {formatNumber(trend.latest.normHoursWeekdays)} ч
                                {trend.latest.hasTimesheet && ` · ${employeeHoursProgress.toFixed(1)}%`}
                              </span>
                              {trend.latest.hasTimesheet && (
                                <span className={`dash-ranking-sub dash-ranking-hours-extra ${isMetricExceeded ? 'alert' : ''}`}>
                                  Сверх дневной нормы: +{formatDecimal(trend.latest.overtime)} ч
                                </span>
                              )}
                            </>
                          )}
                        </span>
                        <span
                          className="dash-ranking-trend"
                          aria-label={`Динамика за ${MONTHS_WINDOW} месяцев`}
                        >
                          <Sparkline data={sparkData} color={baseColor} unit={sortBy === 'earned' ? '₽' : 'ч'} />
                        </span>
                      </button>
                    )
                  })}
                </div>
              </section>

            </div>

            <div className="dash-stack">
              <section className="dash-card">
                <div className="dash-card-title-row">
                  <h3 className="dash-card-title">Подразделения</h3>
                  <div className="dash-sort">
                    {DEPARTMENT_METRIC_OPTIONS.map(option => (
                      <button
                        key={option.key}
                        type="button"
                        className={`dash-sort-btn ${departmentMetric === option.key ? 'active' : ''}`}
                        style={departmentMetric === option.key ? { color: option.color, borderColor: `${option.color}55`, background: `${option.color}1c` } : undefined}
                        onClick={() => setDepartmentMetric(option.key)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="dash-ranking-help">
                  {usesLiveDepartmentAccrual
                    ? 'Условные начисления по доле прошедшего рабочего времени; сумма совпадает с показателем «Условно по времени».'
                    : `Доля начислений или часов по данным табеля за ${latestPeriodLabel}; сотрудники без табеля не включены.`}
                </div>
                <div className="dash-donut-wrap">
                  <DepartmentDonut
                    segments={departmentMetricSegments}
                    centerValue={(
                      <AnimatedNumber
                        value={departmentMetricTotal}
                        formatter={formatDepartmentMetricValue}
                      />
                    )}
                    centerLabel={departmentMetricUnit}
                  />
                </div>
                <div className="dash-legend">
                  {departmentMetricTrends.map(department => {
                    const color = analytics.departmentColors.get(department.name) || '#6ee7b7'
                    const value = getDepartmentMetricValue(department)
                    const share = departmentMetricTotal > 0 ? (value / departmentMetricTotal) * 100 : 0
                    return (
                      <div key={department.name} className="dash-legend-row">
                        <span className="dash-legend-color" style={{ background: color }} />
                        <span className="dash-legend-name">{department.name}</span>
                        <span className="dash-legend-value">
                          {formatDepartmentMetricValue(value)} {departmentMetricUnit}
                        </span>
                        <span className="dash-legend-share">
                          {share.toFixed(1)}%
                        </span>
                      </div>
                    )
                  })}
                </div>
              </section>

              <section className="dash-card">
                <h3 className="dash-card-title">Часы сверх дневной нормы по подразделениям</h3>
                <div className="dash-card-subtitle">
                  За {latestPeriodLabel}; полная полоса означает максимум среди подразделений.
                </div>
                <div className="dash-overtime-list">
                  {analytics.departmentOvertimeLeaders.length === 0 && (
                    <div className="dash-no-data">Нет данных о часах сверх нормы за {latestPeriodLabel}</div>
                  )}
                  {analytics.departmentOvertimeLeaders.map((department, index) => {
                    const pct = analytics.maxDepartmentOvertime > 0
                      ? (department.latestOvertime / analytics.maxDepartmentOvertime) * 100
                      : 0
                    const overtimeLabel = department.latestOvertime > 0
                      ? `+${formatDecimal(department.latestOvertime)} ч`
                      : '0 ч'
                    const color = analytics.departmentColors.get(department.name) || '#6ee7b7'

                    return (
                      <div key={department.name} className="dash-overtime-row">
                        <div className="dash-overtime-head">
                          <span className="dash-overtime-rank">#{index + 1}</span>
                          <span className="dash-overtime-name">{department.name}</span>
                          <span className="dash-overtime-value">{overtimeLabel}</span>
                        </div>
                        <div className="dash-overtime-track">
                          <div className="dash-overtime-fill" style={{ width: `${pct}%`, background: color }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            </div>
          </div>
        </>
      </div>
    </div>
  )
}

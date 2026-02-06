import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { supabase } from '../../../lib/supabase'
import type { EmployeeWithStats, TimesheetEntry } from '../types'
import { calculateSalary, getDailyHoursNorm, getSalaryForMonth, isWeekendOrHoliday } from '../utils/salaryCalculator'
import './DashboardOverview.css'

interface Props {
  employees: EmployeeWithStats[]
  year: number
  month: number
}

type SortBy = 'overtime' | 'earned' | 'hours'

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
  overtime: number
  weekendDays: number
  earned: number
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
  totalEarned: number
  totalOvertime: number
  totalHours: number
  monthlyOvertime: number[]
  payrollShare: number
}

interface DonutSegment {
  label: string
  value: number
  color: string
}

const MONTHS_WINDOW = 5
const TRANSPORT_KEY = 'fot_base_transport'
const DEFAULT_TRANSPORT = 2730
const EXTRA_BONUS_KEY_PREFIX = 'fot_extra_bonuses'

const SORT_OPTIONS: Array<{ key: SortBy; label: string; color: string }> = [
  { key: 'overtime', label: 'Переработки', color: '#60a5fa' },
  { key: 'earned', label: 'Заработок', color: '#22d3ee' },
  { key: 'hours', label: 'Часы', color: '#818cf8' }
]

const DEPT_PALETTE = ['#60a5fa', '#22d3ee', '#818cf8', '#38bdf8', '#a78bfa', '#4f46e5', '#14b8a6', '#06b6d4']

const formatNumber = (value: number): string => Math.round(value).toLocaleString('ru-RU')
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

function getExtraBonusKey(year: number, month: number): string {
  return `${EXTRA_BONUS_KEY_PREFIX}_${year}_${month}`
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
  width = 126,
  height = 34
}: {
  data: number[]
  color: string
  width?: number
  height?: number
}) {
  if (data.length < 2) {
    return <div className="dash-sparkline-empty">—</div>
  }

  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1

  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * (width - 4) + 2
    const y = height - ((value - min) / range) * (height - 6) - 3
    return `${x},${y}`
  })

  const lastPoint = points[points.length - 1].split(',')
  const lastX = Number(lastPoint[0])
  const lastY = Number(lastPoint[1])

  return (
    <svg width={width} height={height} className="dash-sparkline">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points.join(' ')}
      />
      <circle cx={lastX} cy={lastY} r="2.8" fill={color} />
    </svg>
  )
}

function MiniBarChart({
  data,
  color,
  width = 220,
  height = 24
}: {
  data: number[]
  color: string
  width?: number
  height?: number
}) {
  if (data.length === 0) return null

  const max = Math.max(...data, 1)
  const gap = 3
  const barWidth = Math.max(3, (width - gap * (data.length - 1)) / data.length)

  return (
    <svg width={width} height={height} className="dash-mini-bar">
      {data.map((value, index) => {
        const normalized = value / max
        const barHeight = Math.max(2, normalized * (height - 2))
        const x = index * (barWidth + gap)
        const y = height - barHeight
        const opacity = 0.45 + (index / Math.max(data.length - 1, 1)) * 0.55

        return (
          <rect
            key={`${index}-${value}`}
            x={x}
            y={y}
            width={barWidth}
            height={barHeight}
            rx="2"
            fill={color}
            opacity={opacity}
          />
        )
      })}
    </svg>
  )
}

function DepartmentDonut({ segments }: { segments: DonutSegment[] }) {
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
        <div className="dash-donut-total">{total}</div>
        <div className="dash-donut-sub">чел.</div>
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

export function DashboardOverview({ employees, year, month }: Props) {
  const [sortBy, setSortBy] = useState<SortBy>('overtime')
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null)
  const [historyEntries, setHistoryEntries] = useState<TimesheetEntry[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)

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
          setHistoryEntries((data || []) as TimesheetEntry[])
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

  useEffect(() => {
    if (selectedEmployeeId === null) return
    if (!employees.some(employee => employee.id === selectedEmployeeId)) {
      setSelectedEmployeeId(null)
    }
  }, [employees, selectedEmployeeId])

  const analytics = useMemo(() => {
    const baseTransport = Number(localStorage.getItem(TRANSPORT_KEY)) || DEFAULT_TRANSPORT
    const latestSlot = monthSlots[monthSlots.length - 1]
    let extraBonusesByEmployee: Record<number, number> = {}

    if (latestSlot) {
      try {
        const raw = localStorage.getItem(getExtraBonusKey(latestSlot.year, latestSlot.month))
        const parsed = raw ? JSON.parse(raw) : {}
        extraBonusesByEmployee = parsed && typeof parsed === 'object'
          ? Object.entries(parsed).reduce<Record<number, number>>((acc, [id, value]) => {
            const numericId = Number(id)
            const numericValue = Number(value)
            if (Number.isFinite(numericId) && Number.isFinite(numericValue)) {
              acc[numericId] = numericValue
            }
            return acc
          }, {})
          : {}
      } catch {
        extraBonusesByEmployee = {}
      }
    }

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

        let hours = 0
        let overtime = 0
        let weekendDays = 0

        for (const entry of timesheet) {
          if (entry.status !== 'work' && entry.status !== 'remote') continue

          const entryDate = new Date(`${entry.work_date}T12:00:00`)
          const expectedHours = getDailyHoursNorm(entryDate)
          const workedHours = entry.hours_worked ?? expectedHours

          hours += workedHours
          overtime += Math.max(0, workedHours - expectedHours)

          if (isWeekendOrHoliday(entryDate) && workedHours >= 3) {
            weekendDays += 1
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
            overtime: 0,
            weekendDays: 0,
            earned: 0
          }
        }

        const salary = getSalaryForMonth(employee.salaryHistory || [], employee.current_salary, slot.year, slot.month)
        const salaryCalc = calculateSalary({
          employee_id: employee.id,
          base_salary: salary,
          year: slot.year,
          month: slot.month,
          timesheet,
          transport: baseTransport,
          bonus: employee.monthly_bonus || 0
        })

        return {
          monthLabel: labels.full,
          monthShort: labels.short,
          hasTimesheet: true,
          salary,
          hours,
          overtime,
          weekendDays,
          earned: salaryCalc.final_salary
        }
      })

      const latest = points[points.length - 1] || {
        monthLabel: monthLabel(year, month).full,
        monthShort: monthLabel(year, month).short,
        hasTimesheet: false,
        salary: 0,
        hours: 0,
        overtime: 0,
        weekendDays: 0,
        earned: 0
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

    const sortedEmployees = [...dashboardEmployeeTrends].sort((left, right) => {
      if (sortBy === 'earned') {
        return right.latest.earned - left.latest.earned
      }
      if (sortBy === 'hours') {
        return right.totalHours - left.totalHours
      }
      return right.totalOvertime - left.totalOvertime
    })

    const latestOvertime = dashboardEmployeeTrends.reduce((sum, trend) => sum + trend.latest.overtime, 0)
    const latestEarned = dashboardEmployeeTrends.reduce((sum, trend) => sum + trend.latest.earned, 0)
    const latestHours = dashboardEmployeeTrends.reduce((sum, trend) => sum + trend.latest.hours, 0)
    const latestWeekendDays = dashboardEmployeeTrends.reduce((sum, trend) => sum + trend.latest.weekendDays, 0)
    const latestBaseFOT = dashboardEmployeeTrends.reduce((sum, trend) => (
      sum
      + trend.latest.salary
      + (trend.employee.monthly_bonus || 0)
      + (extraBonusesByEmployee[trend.employee.id] || 0)
    ), 0)
    const latestFOTGrowthPct = latestBaseFOT > 0
      ? ((latestEarned - latestBaseFOT) / latestBaseFOT) * 100
      : 0

    const attendanceTotals = {
      vacation: dashboardEmployeeTrends.reduce((sum, trend) => sum + trend.employee.attendance.vacation, 0),
      dayoff: dashboardEmployeeTrends.reduce((sum, trend) => sum + trend.employee.attendance.dayoff, 0),
      absent: dashboardEmployeeTrends.reduce((sum, trend) => sum + trend.employee.attendance.absent, 0),
      remote: dashboardEmployeeTrends.reduce((sum, trend) => sum + trend.employee.attendance.remote, 0)
    }

    const departmentMap = new Map<string, Omit<DepartmentTrend, 'name' | 'payrollShare'>>()

    for (const trend of dashboardEmployeeTrends) {
      const department = trend.employee.subdivision || trend.employee.department || 'Без подразделения'
      const existing = departmentMap.get(department)

      if (!existing) {
        departmentMap.set(department, {
          employeesCount: 1,
          totalEarned: trend.totalEarned,
          totalOvertime: trend.totalOvertime,
          totalHours: trend.totalHours,
          monthlyOvertime: trend.points.map(point => point.overtime)
        })
        continue
      }

      existing.employeesCount += 1
      existing.totalEarned += trend.totalEarned
      existing.totalOvertime += trend.totalOvertime
      existing.totalHours += trend.totalHours
      trend.points.forEach((point, index) => {
        existing.monthlyOvertime[index] += point.overtime
      })
    }

    const totalDepartmentEarned = Array.from(departmentMap.values()).reduce((sum, department) => sum + department.totalEarned, 0)

    const departmentTrends: DepartmentTrend[] = Array.from(departmentMap.entries())
      .map(([name, department]) => ({
        name,
        ...department,
        payrollShare: totalDepartmentEarned > 0 ? (department.totalEarned / totalDepartmentEarned) * 100 : 0
      }))
      .sort((left, right) => right.totalEarned - left.totalEarned)

    const departmentColors = new Map<string, string>()
    departmentTrends.forEach((department, index) => {
      departmentColors.set(department.name, DEPT_PALETTE[index % DEPT_PALETTE.length])
    })

    const donutSegments: DonutSegment[] = departmentTrends.map(department => ({
      label: department.name,
      value: department.employeesCount,
      color: departmentColors.get(department.name) || '#6ee7b7'
    }))

    const maxDepartmentEarned = Math.max(...departmentTrends.map(department => department.totalEarned), 1)
    const selectedTrend = dashboardEmployeeTrends.find(trend => trend.employee.id === selectedEmployeeId) || null

    return {
      employeeTrends,
      dashboardEmployeeTrends,
      sortedEmployees,
      departmentTrends,
      departmentColors,
      donutSegments,
      maxDepartmentEarned,
      selectedTrend,
      latestOvertime,
      latestEarned,
      latestBaseFOT,
      latestFOTGrowthPct,
      latestHours,
      latestWeekendDays,
      attendanceTotals,
      totalEmployees: employeeTrends.length
    }
  }, [employees, historyEntries, monthSlots, month, selectedEmployeeId, sortBy, year])

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
  const selectedTrend = analytics.selectedTrend

  return (
    <div className="dashboard-overview">
      <div className="dashboard-surface">
        {historyLoading && (
          <div className="dash-loading">Обновляем аналитику за последние {MONTHS_WINDOW} месяцев…</div>
        )}
        {historyError && (
          <div className="dash-error">Часть данных недоступна: {historyError}</div>
        )}

        {selectedTrend ? (
          <DashboardEmployeeCard trend={selectedTrend} onBack={() => setSelectedEmployeeId(null)} />
        ) : (
          <>
            <div className="dash-kpis">
              {[
                {
                  label: 'Сотрудников',
                  icon: '👥',
                  value: analytics.dashboardEmployeeTrends.length,
                  suffix: '',
                  color: '#818cf8',
                  sub: `С расчётом табеля: ${analytics.dashboardEmployeeTrends.length} из ${analytics.totalEmployees}`
                },
                {
                  label: 'Переработки',
                  icon: '⏱',
                  value: analytics.latestOvertime,
                  suffix: ' ч',
                  color: '#60a5fa',
                  sub: `За ${latestPeriodLabel}`
                },
                {
                  label: 'Фонд выплат',
                  icon: '💰',
                  value: analytics.latestEarned,
                  suffix: ' ₽',
                  color: '#22d3ee',
                  sub: `Базовый ФОТ: ${formatNumber(analytics.latestBaseFOT)} ₽ • ${formatPercent(analytics.latestFOTGrowthPct)}`
                },
                {
                  label: 'Отработано',
                  icon: '📈',
                  value: analytics.latestHours,
                  suffix: ' ч',
                  color: '#38bdf8',
                  sub: `Выходных смен за ${latestPeriodLabel}: ${analytics.latestWeekendDays}`
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
                    <AnimatedNumber value={kpi.value} suffix={kpi.suffix} />
                  </div>
                  <div className="dash-kpi-sub">{kpi.sub}</div>
                </article>
              ))}
            </div>

            <div className="dash-main-grid">
              <div className="dash-stack">
                <section className="dash-card">
                  <div className="dash-card-title-row">
                    <h3 className="dash-card-title">Рейтинг сотрудников</h3>
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

                  <div className="dash-ranking-list">
                    {analytics.sortedEmployees.length === 0 && (
                      <div className="dash-no-data">
                        Нет рассчитанных табелей за {latestPeriodLabel}
                      </div>
                    )}

                    {analytics.sortedEmployees.map((trend, index) => {
                      const color = SORT_OPTIONS.find(option => option.key === sortBy)?.color || '#818cf8'
                      const monthlyEarned = trend.latest.earned
                      const metricValue = sortBy === 'earned'
                        ? `${formatNumber(monthlyEarned)} ₽`
                        : `${formatNumber(sortBy === 'hours' ? trend.totalHours : trend.totalOvertime)} ${sortBy === 'hours' ? 'ч' : 'ч'}`

                      const sparkData = trend.points.map(point => {
                        if (sortBy === 'earned') return point.earned
                        if (sortBy === 'hours') return point.hours
                        return point.overtime
                      })

                      const departmentName = trend.employee.subdivision || trend.employee.department || 'Без подразделения'

                      return (
                        <button
                          key={trend.employee.id}
                          type="button"
                          className="dash-ranking-row"
                          onClick={() => setSelectedEmployeeId(trend.employee.id)}
                        >
                          <span className={`dash-rank ${index < 3 ? 'top' : ''}`}>{getRankLabel(index)}</span>
                          <span className="dash-avatar">{trend.employee.avatar}</span>
                          <span className="dash-employee">
                            <span className="dash-employee-name">{trend.employee.full_name}</span>
                            <span className="dash-employee-meta">{trend.employee.position} • {departmentName}</span>
                          </span>
                          <span className="dash-ranking-metric">
                            <span className="dash-ranking-main" style={{ color }}>{metricValue}</span>
                            <span className="dash-ranking-sub">
                              {sortBy === 'earned'
                                ? `за ${latestPeriodLabel}`
                                : `ср. перераб.: ${trend.avgOvertime.toFixed(1)} ч/мес`}
                            </span>
                          </span>
                          <Sparkline data={sparkData} color={color} />
                        </button>
                      )
                    })}
                  </div>
                </section>

                <section className="dash-card">
                  <h3 className="dash-card-title">Аналитика рабочего времени (табель)</h3>
                  <div className="dash-time-grid">
                    {[
                      { label: 'Удалённые дни', value: formatNumber(analytics.attendanceTotals.remote), color: '#38bdf8' },
                      { label: 'Выходные смены', value: formatNumber(analytics.latestWeekendDays), color: '#60a5fa' },
                      { label: 'Отпуск', value: formatNumber(analytics.attendanceTotals.vacation), color: '#a78bfa' },
                      { label: 'Выходные (табель)', value: formatNumber(analytics.attendanceTotals.dayoff), color: '#94a3b8' },
                      { label: 'Отсутствия', value: formatNumber(analytics.attendanceTotals.absent), color: '#93c5fd' },
                      { label: 'Переработка (мес.)', value: `+${formatNumber(analytics.latestOvertime)} ч`, color: '#818cf8' }
                    ].map(card => (
                      <div key={card.label} className="dash-time-card" style={{ '--time-color': card.color } as CSSProperties}>
                        <span className="dash-time-label">{card.label}</span>
                        <b className="dash-time-value" style={{ color: card.color }}>{card.value}</b>
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              <div className="dash-stack">
                <section className="dash-card">
                  <h3 className="dash-card-title">Подразделения</h3>
                  <div className="dash-donut-wrap">
                    <DepartmentDonut segments={analytics.donutSegments} />
                  </div>
                  <div className="dash-legend">
                    {analytics.departmentTrends.map(department => {
                      const color = analytics.departmentColors.get(department.name) || '#6ee7b7'
                      return (
                        <div key={department.name} className="dash-legend-row">
                          <span className="dash-legend-color" style={{ background: color }} />
                          <span className="dash-legend-name">{department.name}</span>
                          <span className="dash-legend-value">{department.employeesCount}</span>
                        </div>
                      )
                    })}
                  </div>
                </section>

                <section className="dash-card">
                  <h3 className="dash-card-title">Доля ФОТ подразделений</h3>
                  {analytics.departmentTrends.map(department => {
                    const color = analytics.departmentColors.get(department.name) || '#6ee7b7'
                    const pct = analytics.maxDepartmentEarned > 0
                      ? (department.totalEarned / analytics.maxDepartmentEarned) * 100
                      : 0

                    return (
                      <div key={department.name} className="dash-bar-row">
                        <div className="dash-bar-head">
                          <span>{department.name}</span>
                          <span style={{ color }}>{department.payrollShare.toFixed(1)}%</span>
                        </div>
                        <div className="dash-bar-track">
                          <div className="dash-bar-fill" style={{ width: `${pct}%`, background: color }} />
                        </div>
                      </div>
                    )
                  })}
                </section>

                <section className="dash-card">
                  <h3 className="dash-card-title">Переработки по подразделениям</h3>
                  <div className="dash-mini-months">
                    {monthSlots.map(slot => <span key={slot.key}>{slot.label.split(' ')[0]}</span>)}
                  </div>
                  {analytics.departmentTrends.map(department => {
                    const color = analytics.departmentColors.get(department.name) || '#6ee7b7'

                    return (
                      <div key={`${department.name}-mini`} className="dash-mini-row">
                        <div className="dash-mini-label">{department.name}</div>
                        <MiniBarChart data={department.monthlyOvertime} color={color} />
                      </div>
                    )
                  })}
                </section>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function DashboardEmployeeCard({
  trend,
  onBack
}: {
  trend: EmployeeTrend
  onBack: () => void
}) {
  const salaryGrowth = trend.points.length > 1 && trend.points[0].salary > 0
    ? ((trend.latest.salary - trend.points[0].salary) / trend.points[0].salary) * 100
    : 0

  const weightedDelta = trend.weightedSalary - trend.latest.salary
  const efficiencyByMonth = trend.points.map(point => (
    point.salary > 0 ? (point.earned / point.salary) * 100 : 0
  ))

  const departmentName = trend.employee.subdivision || trend.employee.department || 'Без подразделения'

  return (
    <div className="dash-employee-view">
      <button type="button" className="dash-back-btn" onClick={onBack}>
        ← Назад к дашборду
      </button>

      <section className="dash-emp-header">
        <div className="dash-emp-avatar">{trend.employee.avatar}</div>
        <div className="dash-emp-meta">
          <h3 className="dash-emp-name">{trend.employee.full_name}</h3>
          <div className="dash-emp-role">{trend.employee.position}</div>
          <div className="dash-emp-dept-tag">{departmentName}</div>
        </div>
        <div className="dash-emp-current">
          <div className="dash-emp-current-label">Текущий оклад</div>
          <div className="dash-emp-current-value">{formatNumber(trend.latest.salary)} ₽</div>
          {salaryGrowth > 0 && (
            <div className="dash-emp-growth">+{salaryGrowth.toFixed(1)}% за период</div>
          )}
        </div>
      </section>

      <section className="dash-weight-card">
        <div>
          <div className="dash-weight-title">Средневзвешенный оклад по переработкам</div>
          <div className="dash-weight-value">{formatNumber(trend.weightedSalary)} ₽</div>
          <div className={`dash-weight-delta ${weightedDelta >= 0 ? 'positive' : 'negative'}`}>
            {weightedDelta >= 0 ? 'Желаемый доход выше текущего на ' : 'Желаемый доход ниже текущего на '}
            {formatNumber(Math.abs(weightedDelta))} ₽
          </div>
        </div>
        <div className="dash-weight-formula">
          Σ(начислено × часы переработки)<br />
          ───────────────────────<br />
          Σ(часы переработки)
        </div>
      </section>

      <div className="dash-emp-stats">
        <article className="dash-stat-card">
          <div className="dash-stat-label">Ср. переработка / мес</div>
          <div className="dash-stat-value">{trend.avgOvertime.toFixed(1)} ч</div>
        </article>
        <article className="dash-stat-card">
          <div className="dash-stat-label">Всего часов</div>
          <div className="dash-stat-value">{formatNumber(trend.totalHours)} ч</div>
        </article>
        <article className="dash-stat-card">
          <div className="dash-stat-label">Всего заработано</div>
          <div className="dash-stat-value">{formatNumber(trend.totalEarned)} ₽</div>
        </article>
        <article className="dash-stat-card">
          <div className="dash-stat-label">Выходные смены</div>
          <div className="dash-stat-value">{formatNumber(trend.totalWeekendDays)}</div>
        </article>
      </div>

      <section className="dash-table-card">
        <h3 className="dash-card-title">Помесячная аналитика (табель)</h3>
        <table className="dash-table">
          <thead>
            <tr>
              <th>Месяц</th>
              <th>Оклад</th>
              <th>Часы</th>
              <th>Переработка</th>
              <th>Начислено</th>
              <th>Эффективность</th>
            </tr>
          </thead>
          <tbody>
            {trend.points.map(point => {
              if (!point.hasTimesheet) {
                return (
                  <tr key={`${trend.employee.id}-${point.monthLabel}`}>
                    <td>{point.monthLabel}</td>
                    <td>—</td>
                    <td>—</td>
                    <td>—</td>
                    <td>—</td>
                    <td>
                      <span className="dash-eff-badge low">нет расчёта</span>
                    </td>
                  </tr>
                )
              }

              const efficiency = point.salary > 0 ? (point.earned / point.salary) * 100 : 0
              const badgeClass = efficiency > 120 ? 'good' : efficiency > 100 ? 'ok' : 'low'

              return (
                <tr key={`${trend.employee.id}-${point.monthLabel}`}>
                  <td>{point.monthLabel}</td>
                  <td>{formatNumber(point.salary)} ₽</td>
                  <td>{formatNumber(point.hours)}</td>
                  <td>+{formatNumber(point.overtime)} ч</td>
                  <td>{formatNumber(point.earned)} ₽</td>
                  <td>
                    <span className={`dash-eff-badge ${badgeClass}`}>{efficiency.toFixed(0)}%</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        <div className="dash-trends">
          <div>
            <div className="dash-trend-title">Тренд переработок</div>
            <Sparkline data={trend.points.map(point => point.overtime)} color="#60a5fa" width={170} height={42} />
          </div>
          <div>
            <div className="dash-trend-title">Тренд начислений</div>
            <Sparkline data={trend.points.map(point => point.earned)} color="#22d3ee" width={170} height={42} />
          </div>
          <div>
            <div className="dash-trend-title">Тренд эффективности</div>
            <Sparkline data={efficiencyByMonth} color="#818cf8" width={170} height={42} />
          </div>
        </div>
      </section>
    </div>
  )
}

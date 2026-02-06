import { Fragment, useEffect, useMemo, useState } from 'react'
import type { EmployeeWithStats, SalaryCalculation } from '../types'
import { calculateSalary, formatMoney, getSalaryForMonth } from '../utils/salaryCalculator'
import { getWorkDaysNorm } from '../../../lib/workNorms'
import { getEmployeeInitials, getEmployeeShortName, getPositionPriority } from '../utils/tenderPresentation'
import './DepartmentFOT.css'

interface Props {
  employees: EmployeeWithStats[]
  year: number
  month: number
  onSelectEmployee?: (employee: EmployeeWithStats) => void
}

interface EmployeePayrollRow {
  employee: EmployeeWithStats
  shortName: string
  initials: string
  department: string
  salaryForMonth: number
  monthlyBonus: number
  extraBonus: number
  bonusTotal: number
  calculation: SalaryCalculation
  dailyRate: number
  officeDays: number
  shareOfDept: number
  shareOfTotal: number
}

interface DepartmentPayrollGroup {
  name: string
  color: string
  employees: EmployeePayrollRow[]
  count: number
  totals: {
    salary: number
    calculatedWorkPay: number
    weekendPay: number
    transportPay: number
    bonus: number
    final: number
    weekendWorked: number
    officeDays: number
  }
}

const TRANSPORT_KEY = 'fot_base_transport'
const DEFAULT_TRANSPORT = 2730
const EXTRA_BONUS_PREFIX = 'fot_extra_bonuses'

const DEPT_COLORS = ['#a78bfa', '#38bdf8', '#6ee7b7', '#fbbf24', '#f472b6', '#fb923c', '#818cf8', '#34d399']

function getExtraBonusKey(year: number, month: number): string {
  return `${EXTRA_BONUS_PREFIX}_${year}_${month}`
}

function parseExtraBonuses(raw: string | null): Record<number, number> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    return Object.entries(parsed).reduce<Record<number, number>>((acc, [id, value]) => {
      const employeeId = Number(id)
      const bonus = Number(value)
      if (Number.isFinite(employeeId) && Number.isFinite(bonus)) {
        acc[employeeId] = bonus
      }
      return acc
    }, {})
  } catch {
    return {}
  }
}

function pct(part: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((part / total) * 100)
}

function MiniRing({
  segments,
  total
}: {
  segments: Array<{ label: string; value: number; color: string }>
  total: number
}) {
  const radius = 40
  const circumference = 2 * Math.PI * radius
  let offset = 0

  return (
    <svg width="96" height="96" viewBox="0 0 100 100">
      {segments.map(segment => {
        const dash = total > 0 ? (segment.value / total) * circumference : 0
        const circle = (
          <circle
            key={segment.label}
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke={segment.color}
            strokeWidth="9"
            strokeDasharray={`${dash} ${circumference - dash}`}
            strokeDashoffset={-offset}
          />
        )
        offset += dash
        return circle
      })}
      <text x="50" y="47" textAnchor="middle" fill="#64748b" fontSize="8" fontWeight="500">ФОТ</text>
      <text x="50" y="59" textAnchor="middle" fill="#e2e8f0" fontSize="10" fontWeight="700" fontFamily="'JetBrains Mono', monospace">
        {(total / 1e6).toFixed(2)}М
      </text>
    </svg>
  )
}

function ShareBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="fot-share-wrap">
      <div className="fot-share-track">
        <div className="fot-share-fill" style={{ width: `${value}%`, background: color }} />
      </div>
      <span>{value}%</span>
    </div>
  )
}

export function DepartmentFOT({ employees, year, month, onSelectEmployee }: Props) {
  const workDaysNorm = getWorkDaysNorm(year, month - 1)
  const weekendsNorm = new Date(year, month, 0).getDate() - workDaysNorm

  const [baseTransport, setBaseTransport] = useState(() => {
    const saved = Number(localStorage.getItem(TRANSPORT_KEY))
    return Number.isFinite(saved) && saved > 0 ? saved : DEFAULT_TRANSPORT
  })

  const [extraBonuses, setExtraBonuses] = useState<Record<number, number>>(() => (
    parseExtraBonuses(localStorage.getItem(getExtraBonusKey(year, month)))
  ))
  const [expandedDepartments, setExpandedDepartments] = useState<Record<string, boolean>>({})

  useEffect(() => {
    setExtraBonuses(parseExtraBonuses(localStorage.getItem(getExtraBonusKey(year, month))))
  }, [year, month])

  const payrollData = useMemo(() => {
    const managers: EmployeePayrollRow[] = []
    const byDepartment = new Map<string, EmployeePayrollRow[]>()

    for (const employee of employees) {
      const salaryForMonth = getSalaryForMonth(employee.salaryHistory || [], employee.current_salary, year, month)
      const monthlyBonus = employee.monthly_bonus || 0
      const extraBonus = extraBonuses[employee.id] || 0
      const bonusTotal = monthlyBonus + extraBonus

      const calculation = calculateSalary({
        employee_id: employee.id,
        base_salary: salaryForMonth,
        year,
        month,
        timesheet: employee.timesheet || [],
        transport: baseTransport,
        bonus: bonusTotal
      })

      const dailyRate = calculation.work_days_norm > 0
        ? Math.round(salaryForMonth / calculation.work_days_norm)
        : 0
      const officeDays = Math.max(0, calculation.work_days_actual - calculation.remote_days)

      const row: EmployeePayrollRow = {
        employee,
        shortName: getEmployeeShortName(employee),
        initials: getEmployeeInitials(employee),
        department: employee.subdivision || employee.department || 'Без подразделения',
        salaryForMonth,
        monthlyBonus,
        extraBonus,
        bonusTotal,
        calculation,
        dailyRate,
        officeDays,
        shareOfDept: 0,
        shareOfTotal: 0
      }

      if (getPositionPriority(employee.position) === 0) {
        managers.push(row)
      } else {
        const key = row.department
        if (!byDepartment.has(key)) {
          byDepartment.set(key, [])
        }
        byDepartment.get(key)!.push(row)
      }
    }

    managers.sort((a, b) => a.employee.full_name.localeCompare(b.employee.full_name))

    byDepartment.forEach(rows => {
      rows.sort((left, right) => {
        const priorityDiff = getPositionPriority(left.employee.position) - getPositionPriority(right.employee.position)
        if (priorityDiff !== 0) return priorityDiff
        return left.employee.full_name.localeCompare(right.employee.full_name)
      })
    })

    const orderedGroups: Array<{ name: string; rows: EmployeePayrollRow[] }> = []
    if (managers.length > 0) {
      orderedGroups.push({ name: 'Руководство', rows: managers })
    }
    orderedGroups.push(
      ...[...byDepartment.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([name, rows]) => ({ name, rows }))
    )

    const groups: DepartmentPayrollGroup[] = orderedGroups.map((group, index) => {
      const color = DEPT_COLORS[index % DEPT_COLORS.length]
      const totals = group.rows.reduce((acc, row) => {
        acc.salary += row.salaryForMonth
        acc.calculatedWorkPay += row.calculation.calculated_salary - row.calculation.weekend_payment
        acc.weekendPay += row.calculation.weekend_payment
        acc.transportPay += row.calculation.transport_payment
        acc.bonus += row.bonusTotal
        acc.final += row.calculation.final_salary
        acc.weekendWorked += row.calculation.weekend_work_days
        acc.officeDays += row.officeDays
        return acc
      }, {
        salary: 0,
        calculatedWorkPay: 0,
        weekendPay: 0,
        transportPay: 0,
        bonus: 0,
        final: 0,
        weekendWorked: 0,
        officeDays: 0
      })

      return {
        name: group.name,
        color,
        employees: group.rows,
        count: group.rows.length,
        totals
      }
    })

    const totals = groups.reduce((acc, group) => {
      acc.employees += group.count
      acc.salary += group.totals.salary
      acc.calculatedWorkPay += group.totals.calculatedWorkPay
      acc.weekendPay += group.totals.weekendPay
      acc.transportPay += group.totals.transportPay
      acc.bonus += group.totals.bonus
      acc.final += group.totals.final
      acc.weekendWorked += group.totals.weekendWorked
      acc.officeDays += group.totals.officeDays
      return acc
    }, {
      employees: 0,
      salary: 0,
      calculatedWorkPay: 0,
      weekendPay: 0,
      transportPay: 0,
      bonus: 0,
      final: 0,
      weekendWorked: 0,
      officeDays: 0
    })

    const baseFot = totals.salary + totals.bonus
    const growthAbsolute = totals.final - baseFot
    const growthPercent = baseFot > 0 ? (growthAbsolute / baseFot) * 100 : 0

    const maxDeptTotal = Math.max(...groups.map(group => group.totals.final), 1)

    groups.forEach(group => {
      group.employees.forEach(row => {
        row.shareOfDept = pct(row.calculation.final_salary, group.totals.final)
        row.shareOfTotal = pct(row.calculation.final_salary, totals.final)
      })
    })

    const ringSegments = [
      { label: 'Рабочие дни', value: totals.calculatedWorkPay, color: '#818cf8' },
      { label: 'Выходные', value: totals.weekendPay, color: '#f472b6' },
      { label: 'Проезд', value: totals.transportPay, color: '#38bdf8' },
      { label: 'Бонусы', value: totals.bonus, color: '#fbbf24' }
    ].filter(segment => segment.value > 0)

    return {
      groups,
      totals,
      baseFot,
      growthAbsolute,
      growthPercent,
      maxDeptTotal,
      ringSegments
    }
  }, [baseTransport, employees, extraBonuses, month, year])

  useEffect(() => {
    setExpandedDepartments(previous => {
      const next = { ...previous }
      let changed = false

      for (const group of payrollData.groups) {
        if (next[group.name] === undefined) {
          next[group.name] = true
          changed = true
        }
      }

      return changed ? next : previous
    })
  }, [payrollData.groups])

  const handleTransportChange = (value: number) => {
    const safeValue = Number.isFinite(value) ? Math.max(0, value) : 0
    setBaseTransport(safeValue)
    localStorage.setItem(TRANSPORT_KEY, String(safeValue))
  }

  const handleExtraBonusChange = (employeeId: number, value: number) => {
    const safeValue = Number.isFinite(value) ? Math.max(0, value) : 0
    setExtraBonuses(previous => {
      const updated = { ...previous, [employeeId]: safeValue }
      localStorage.setItem(getExtraBonusKey(year, month), JSON.stringify(updated))
      return updated
    })
  }

  const topEmployees = [...payrollData.groups.flatMap(group => group.employees)]
    .sort((a, b) => b.calculation.final_salary - a.calculation.final_salary)
    .slice(0, 8)

  return (
    <div className="fot-view">
      <section className="fot-summary-strip">
        <div className="fot-summary-left">
          <MiniRing segments={payrollData.ringSegments} total={payrollData.totals.final} />
          <div className="fot-ring-legend">
            {payrollData.ringSegments.map(segment => (
              <div key={segment.label} className="fot-ring-item">
                <span className="dot" style={{ background: segment.color }} />
                <span className="label">{segment.label}</span>
                <span className="value" style={{ color: segment.color }}>{formatMoney(segment.value)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="fot-summary-center">
          <div className="fot-center-kpi">
            <strong>{payrollData.totals.employees}</strong>
            <small>Сотрудников</small>
          </div>
          <div className="fot-center-kpi">
            <strong>{workDaysNorm}</strong>
            <small>Рабочих дней</small>
          </div>
          <div className="fot-center-kpi">
            <strong>{weekendsNorm}</strong>
            <small>Выходных</small>
          </div>
          <label className="fot-transport-control">
            <span>Проезд / день</span>
            <div>
              <input
                type="number"
                value={baseTransport}
                onChange={event => handleTransportChange(Number(event.target.value))}
              />
              <b>₽</b>
            </div>
          </label>
        </div>

        <div className="fot-summary-right">
          <span>Итого ФОТ</span>
          <strong>{formatMoney(payrollData.totals.final)}</strong>
          <small>Базовый ФОТ: {formatMoney(payrollData.baseFot)}</small>
          <div className={`fot-growth ${payrollData.growthAbsolute >= 0 ? 'positive' : 'negative'}`}>
            {payrollData.growthAbsolute >= 0 ? '▲' : '▼'} {Math.abs(payrollData.growthPercent).toFixed(1)}%
            <span>{formatMoney(payrollData.growthAbsolute)}</span>
          </div>
        </div>
      </section>

      <div className="fot-grid">
        <section className="fot-card">
          <h3>Структура ФОТ по подразделениям</h3>
          <div className="fot-dept-bars">
            {payrollData.groups.map(group => {
              const width = Math.max(8, (group.totals.final / payrollData.maxDeptTotal) * 100)
              const workShare = pct(group.totals.calculatedWorkPay, group.totals.final)
              const weekendShare = pct(group.totals.weekendPay, group.totals.final)
              const transportShare = pct(group.totals.transportPay, group.totals.final)
              const bonusShare = Math.max(0, 100 - workShare - weekendShare - transportShare)

              return (
                <div key={group.name} className="fot-dept-bar-row">
                  <div className="fot-dept-bar-head">
                    <div>
                      <span className="marker" style={{ background: group.color }} />
                      <span>{group.name}</span>
                      <small>({group.count})</small>
                    </div>
                    <b style={{ color: group.color }}>{formatMoney(group.totals.final)}</b>
                  </div>
                  <div className="fot-dept-bar-track" style={{ width: `${width}%` }}>
                    <span style={{ width: `${workShare}%`, background: group.color, opacity: 0.78 }} />
                    <span style={{ width: `${weekendShare}%`, background: '#f472b6', opacity: 0.65 }} />
                    <span style={{ width: `${transportShare}%`, background: '#38bdf8', opacity: 0.65 }} />
                    <span style={{ width: `${bonusShare}%`, background: '#fbbf24', opacity: 0.6 }} />
                  </div>
                </div>
              )
            })}
          </div>
          <div className="fot-dept-legend">
            <span><i style={{ background: '#94a3b8' }} /> рабочие дни</span>
            <span><i style={{ background: '#f472b6' }} /> выходные</span>
            <span><i style={{ background: '#38bdf8' }} /> проезд</span>
            <span><i style={{ background: '#fbbf24' }} /> бонусы</span>
          </div>
        </section>

        <section className="fot-card">
          <h3>Топ по стоимости сотрудника</h3>
          <div className="fot-top-list">
            {topEmployees.map((row, index) => {
              const group = payrollData.groups.find(item => item.name === row.department)
              const color = group?.color || '#94a3b8'
              return (
                <button
                  key={row.employee.id}
                  type="button"
                  className="fot-top-row"
                  onClick={() => onSelectEmployee?.(row.employee)}
                >
                  <span className="rank">{index + 1}</span>
                  <span className="name">{row.shortName}</span>
                  <span className="track">
                    <span style={{ width: `${Math.min(100, row.shareOfTotal * 4)}%`, background: color }} />
                  </span>
                  <span className="amount">{formatMoney(row.calculation.final_salary)}</span>
                </button>
              )
            })}
          </div>
        </section>
      </div>

      <section className="fot-table-card">
        <table className="fot-table">
          <thead>
            <tr>
              <th>ФИО</th>
              <th>Ставка/день</th>
              <th>Раб. дни</th>
              <th>Вых.</th>
              <th>Оклад</th>
              <th>За вых.</th>
              <th>Проезд</th>
              <th>Бонус</th>
              <th>Доля</th>
              <th>Итого</th>
            </tr>
          </thead>
          <tbody>
            <tr className="fot-grand-total-row">
              <td>Итого</td>
              <td />
              <td className="mono">
                {payrollData.totals.officeDays}
                <span>/</span>
                {workDaysNorm * payrollData.totals.employees}
              </td>
              <td className="mono">
                {payrollData.totals.weekendWorked}
                <span>/</span>
                {weekendsNorm * payrollData.totals.employees}
              </td>
              <td>{formatMoney(payrollData.totals.salary)}</td>
              <td>{formatMoney(payrollData.totals.weekendPay)}</td>
              <td>{formatMoney(payrollData.totals.transportPay)}</td>
              <td>{formatMoney(payrollData.totals.bonus)}</td>
              <td />
              <td className="final">{formatMoney(payrollData.totals.final)}</td>
            </tr>

            {payrollData.groups.map(group => {
              const isExpanded = expandedDepartments[group.name] !== false
              const deptShare = pct(group.totals.final, payrollData.totals.final)

              return (
                <Fragment key={`group-${group.name}`}>
                  <tr
                    key={`dept-${group.name}`}
                    className="fot-department-row"
                    onClick={() => setExpandedDepartments(previous => ({ ...previous, [group.name]: !isExpanded }))}
                  >
                    <td>
                      <div className="fot-department-cell">
                        <span className={`toggle ${isExpanded ? 'open' : ''}`}>▼</span>
                        <span className="line" style={{ background: group.color }} />
                        <strong>{group.name}</strong>
                        <small>({group.count})</small>
                      </div>
                    </td>
                    <td />
                    <td className="mono">{group.totals.officeDays}</td>
                    <td className="mono">{group.totals.weekendWorked}<span>/</span>{weekendsNorm * group.count}</td>
                    <td>{formatMoney(group.totals.salary)}</td>
                    <td>{formatMoney(group.totals.weekendPay)}</td>
                    <td>{formatMoney(group.totals.transportPay)}</td>
                    <td>{formatMoney(group.totals.bonus)}</td>
                    <td className="mono">{deptShare}%</td>
                    <td className="final" style={{ color: group.color }}>{formatMoney(group.totals.final)}</td>
                  </tr>

                  {isExpanded && group.employees.map(row => (
                    <tr key={row.employee.id} className="fot-employee-row">
                      <td>
                        <div className="fot-employee-cell">
                          <span className="avatar" style={{ color: group.color }}>{row.initials}</span>
                          <button
                            type="button"
                            className="name-btn"
                            onClick={() => onSelectEmployee?.(row.employee)}
                          >
                            {row.shortName}
                          </button>
                          <span className="raise">
                            {row.employee.position}
                          </span>
                        </div>
                      </td>
                      <td className="mono">{formatMoney(row.dailyRate)}</td>
                      <td className="mono">{row.officeDays}<span>/</span>{workDaysNorm}</td>
                      <td className="mono">{row.calculation.weekend_work_days}<span>/</span>{weekendsNorm}</td>
                      <td className="mono">
                        {formatMoney(row.salaryForMonth)}
                        {row.monthlyBonus > 0 && <small>+{formatMoney(row.monthlyBonus)}</small>}
                      </td>
                      <td className="mono">{row.calculation.weekend_payment > 0 ? formatMoney(row.calculation.weekend_payment) : '—'}</td>
                      <td className="mono">{formatMoney(row.calculation.transport_payment)}</td>
                      <td>
                        <div className="fot-bonus-editor">
                          <input
                            type="number"
                            value={row.extraBonus || ''}
                            onChange={event => handleExtraBonusChange(row.employee.id, Number(event.target.value))}
                            placeholder="0"
                          />
                          <small>Σ {formatMoney(row.bonusTotal)}</small>
                        </div>
                      </td>
                      <td>
                        <ShareBar value={row.shareOfDept} color={group.color} />
                      </td>
                      <td className="final">{formatMoney(row.calculation.final_salary)}</td>
                    </tr>
                  ))}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </section>
    </div>
  )
}

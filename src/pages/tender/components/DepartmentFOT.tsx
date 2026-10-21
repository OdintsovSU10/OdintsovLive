import { Fragment, useEffect, useMemo, useState } from 'react'
import type { EmployeeWithStats, SalaryCalculation } from '../types'
import { calculateSalary, formatMoney, getSalaryForMonth } from '../utils/salaryCalculator'
import { getWorkDaysNorm } from '../../../lib/workNorms'
import { getEmployeeInitials, getEmployeeShortName, getPositionPriority } from '../utils/tenderPresentation'
import { useLivePayroll } from '../hooks/useLivePayroll'
import { FotSummaryBar, type FotGrowthTone } from './FotSummaryBar'
import {
  calculateMonthlyPayrollPlan,
  getLivePayrollAccrualColor,
  getExtraBonusKey,
  getSavedTransport,
  loadTransportSetting,
  parseExtraBonuses,
  saveTransportSetting
} from '../utils/livePayroll'
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
  workedDays: number
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
    workedDays: number
  }
}

// Палитра рядов — только через токены темы
const DEPT_COLORS = [
  'var(--primary)',
  'var(--chart-2)',
  'var(--tone-ok)',
  'var(--tone-warn)',
  'var(--tone-bad)',
  'var(--primary-hover)',
  'color-mix(in srgb, var(--primary) 55%, var(--tone-ok))',
  'color-mix(in srgb, var(--chart-2) 55%, var(--tone-warn))'
]
const WORK_PAY_COLOR = 'var(--primary)'
const WEEKEND_PAY_COLOR = 'var(--tone-warn)'
const TRANSPORT_PAY_COLOR = 'var(--chart-2)'

function pct(part: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((part / total) * 100)
}

export function DepartmentFOT({ employees, year, month, onSelectEmployee }: Props) {
  const workDaysNorm = getWorkDaysNorm(year, month - 1)
  const weekendsNorm = new Date(year, month, 0).getDate() - workDaysNorm

  const [baseTransport, setBaseTransport] = useState(getSavedTransport)

  const [extraBonuses, setExtraBonuses] = useState<Record<number, number>>(() => (
    parseExtraBonuses(localStorage.getItem(getExtraBonusKey(year, month)))
  ))
  const [expandedDepartments, setExpandedDepartments] = useState<Record<string, boolean>>({})

  // Подтягиваем единую ставку проезда из БД
  useEffect(() => {
    let cancelled = false
    loadTransportSetting().then(value => {
      if (!cancelled) setBaseTransport(value)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    setExtraBonuses(parseExtraBonuses(localStorage.getItem(getExtraBonusKey(year, month))))
  }, [year, month])

  const plannedMonthlyFOT = useMemo(
    () => calculateMonthlyPayrollPlan(employees, year, month, baseTransport, extraBonuses),
    [baseTransport, employees, extraBonuses, month, year]
  )
  const livePayroll = useLivePayroll(plannedMonthlyFOT, year, month)
  const livePayrollColor = getLivePayrollAccrualColor(livePayroll.workdayProgress)

  const payrollData = useMemo(() => {
    const managers: EmployeePayrollRow[] = []
    const byDepartment = new Map<string, EmployeePayrollRow[]>()

    for (const employee of employees) {
      const baseSalaryForMonth = getSalaryForMonth(employee.salaryHistory || [], employee.current_salary, year, month)
      const monthlyBonus = employee.monthly_bonus || 0
      const extraBonus = extraBonuses[employee.id] || 0
      const salaryForMonth = baseSalaryForMonth + monthlyBonus
      const bonusTotal = extraBonus

      const calculation = calculateSalary({
        employee_id: employee.id,
        base_salary: baseSalaryForMonth,
        year,
        month,
        timesheet: employee.timesheet || [],
        transport: baseTransport,
        bonus: monthlyBonus + extraBonus
      })

      const dailyRate = calculation.work_days_norm > 0
        ? Math.round(baseSalaryForMonth / calculation.work_days_norm)
        : 0
      // Для счётчика "Раб. дни" учитываем и офис, и удалёнку по будням.
      const workedDays = calculation.work_days_actual

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
        workedDays,
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
        acc.calculatedWorkPay += (row.calculation.calculated_salary - row.calculation.weekend_payment) + row.monthlyBonus
        acc.weekendPay += row.calculation.weekend_payment
        acc.transportPay += row.calculation.transport_payment
        acc.bonus += row.bonusTotal
        acc.final += row.calculation.final_salary
        acc.weekendWorked += row.calculation.weekend_work_days
        acc.workedDays += row.workedDays
        return acc
      }, {
        salary: 0,
        calculatedWorkPay: 0,
        weekendPay: 0,
        transportPay: 0,
        bonus: 0,
        final: 0,
        weekendWorked: 0,
        workedDays: 0
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
      acc.workedDays += group.totals.workedDays
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
      workedDays: 0
    })

    const baseFot = totals.salary + totals.bonus
    const growthAbsolute = totals.final - baseFot
    const growthPercent = baseFot > 0 ? (growthAbsolute / baseFot) * 100 : 0

    const maxDeptTotal = Math.max(...groups.map(group => group.totals.final), 1)

    groups.forEach(group => {
      group.employees.forEach(row => {
        row.shareOfTotal = pct(row.calculation.final_salary, totals.final)
      })
    })

    return {
      groups,
      totals,
      baseFot,
      growthAbsolute,
      growthPercent,
      maxDeptTotal
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
    void saveTransportSetting(safeValue)
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
  const growthTone: FotGrowthTone = payrollData.growthAbsolute > 0
    ? 'over'
    : payrollData.growthAbsolute < 0
      ? 'under'
      : 'equal'

  return (
    <div className="fot-view">
      <FotSummaryBar
        totalFinal={payrollData.totals.final}
        baseFot={payrollData.baseFot}
        growthAbsolute={payrollData.growthAbsolute}
        growthPercent={payrollData.growthPercent}
        growthTone={growthTone}
        livePayroll={livePayroll}
        livePayrollColor={livePayrollColor}
        employeesCount={payrollData.totals.employees}
        workDaysNorm={workDaysNorm}
        weekendsNorm={weekendsNorm}
        baseTransport={baseTransport}
        onTransportChange={handleTransportChange}
      />

      <div className="fot-grid">
        <section className="fot-card">
          <h3 className="fot-card-title-strong">ФОТ по подразделениям</h3>
          <div className="fot-dept-bars">
            {payrollData.groups.map(group => {
              const width = Math.max(8, (group.totals.final / payrollData.maxDeptTotal) * 100)
              const workShare = pct(group.totals.calculatedWorkPay + group.totals.bonus, group.totals.final)
              const weekendShare = pct(group.totals.weekendPay, group.totals.final)
              const transportShare = Math.max(0, 100 - workShare - weekendShare)

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
                    <span style={{ width: `${workShare}%`, background: WORK_PAY_COLOR, opacity: 0.85 }} />
                    <span style={{ width: `${weekendShare}%`, background: WEEKEND_PAY_COLOR, opacity: 0.78 }} />
                    <span style={{ width: `${transportShare}%`, background: TRANSPORT_PAY_COLOR, opacity: 0.78 }} />
                  </div>
                </div>
              )
            })}
          </div>
          <div className="fot-dept-legend">
            <span><i style={{ background: WORK_PAY_COLOR }} /> рабочие дни</span>
            <span><i style={{ background: WEEKEND_PAY_COLOR }} /> выходные</span>
            <span><i style={{ background: TRANSPORT_PAY_COLOR }} /> проезд</span>
          </div>
        </section>

        <section className="fot-card">
          <h3 className="fot-card-title-strong">Топ по стоимости сотрудников</h3>
          <div className="fot-top-list">
            {topEmployees.map((row, index) => {
              const group = payrollData.groups.find(item => item.name === row.department)
              const color = group?.color || 'var(--text-secondary)'
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
              <th>Доля от ФОТ</th>
              <th>Итого</th>
            </tr>
          </thead>
          <tbody>
            <tr className="fot-grand-total-row">
              <td>Итого</td>
              <td />
              <td className="mono">—</td>
              <td className="mono">—</td>
              <td>{formatMoney(payrollData.totals.salary)}</td>
              <td>{formatMoney(payrollData.totals.weekendPay)}</td>
              <td>{formatMoney(payrollData.totals.transportPay)}</td>
              <td>{formatMoney(payrollData.totals.bonus)}</td>
              <td />
              <td className="final">{formatMoney(payrollData.totals.final)}</td>
            </tr>

            {payrollData.groups.map(group => {
              const isExpanded = expandedDepartments[group.name] !== false

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
                    <td className="mono">—</td>
                    <td className="mono">—</td>
                    <td>{formatMoney(group.totals.salary)}</td>
                    <td>{formatMoney(group.totals.weekendPay)}</td>
                    <td>{formatMoney(group.totals.transportPay)}</td>
                    <td>{formatMoney(group.totals.bonus)}</td>
                    <td />
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
                      <td className="mono">{row.workedDays}<span>/</span>{workDaysNorm}</td>
                      <td className="mono">{row.calculation.weekend_work_days}<span>/</span>{weekendsNorm}</td>
                      <td className="mono">
                        {formatMoney(row.salaryForMonth)}
                        {row.monthlyBonus > 0 && <small>вкл. ежемес. {formatMoney(row.monthlyBonus)}</small>}
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
                        </div>
                      </td>
                      <td>
                        <span className="fot-share-percent">{row.shareOfTotal}%</span>
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

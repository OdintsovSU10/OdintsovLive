import { useMemo, useState } from 'react'
import type { EmployeeWithStats, SalaryCalculation } from '../types'
import { calculateSalary, formatMoney, getSalaryForMonth } from '../utils/salaryCalculator'
import { getWorkDaysNorm } from '../../../lib/workNorms'
import './DepartmentFOT.css'

function formatEmployeeName(employee: EmployeeWithStats): string {
  const lastName = employee.last_name || ''
  const firstInitial = employee.first_name ? employee.first_name.charAt(0) + '.' : ''
  const middleInitial = employee.middle_name ? employee.middle_name.charAt(0) + '.' : ''

  if (lastName && (firstInitial || middleInitial)) {
    return `${lastName} ${firstInitial}${middleInitial}`.trim()
  }
  return employee.full_name
}

interface Props {
  employees: EmployeeWithStats[]
  year: number
  month: number
}

const TRANSPORT_KEY = 'fot_base_transport'
const DEFAULT_TRANSPORT = 2730

function getExtraBonusKey(year: number, month: number) {
  return `fot_extra_bonuses_${year}_${month}`
}

export function DepartmentFOT({ employees, year, month }: Props) {
  const workDaysNorm = getWorkDaysNorm(year, month - 1)
  const [baseTransport, setBaseTransport] = useState(() => {
    const saved = localStorage.getItem(TRANSPORT_KEY)
    return saved ? Number(saved) : DEFAULT_TRANSPORT
  })
  // Дополнительные бонусы за месяц (поверх ежемесячного)
  const [extraBonuses, setExtraBonuses] = useState<Record<number, number>>(() => {
    const saved = localStorage.getItem(getExtraBonusKey(year, month))
    return saved ? JSON.parse(saved) : {}
  })

  const handleTransportChange = (value: number) => {
    setBaseTransport(value)
    localStorage.setItem(TRANSPORT_KEY, String(value))
  }

  const handleExtraBonusChange = (empId: number, value: number) => {
    setExtraBonuses(prev => {
      const updated = { ...prev, [empId]: value }
      localStorage.setItem(getExtraBonusKey(year, month), JSON.stringify(updated))
      return updated
    })
  }

  // Норма выходных дней в месяце
  const daysInMonth = new Date(year, month, 0).getDate()
  const weekendNorm = daysInMonth - workDaysNorm

  const { subdivisionData, totals, maxWeekendDays } = useMemo(() => {
    const calcs: { employee: EmployeeWithStats; calculation: SalaryCalculation }[] = []

    for (const emp of employees) {
      const effectiveSalary = getSalaryForMonth(
        emp.salaryHistory || [],
        emp.current_salary,
        year,
        month
      )
      const totalBonus = (emp.monthly_bonus || 0) + (extraBonuses[emp.id] || 0)
      const calc = calculateSalary({
        employee_id: emp.id,
        base_salary: effectiveSalary,
        year,
        month,
        timesheet: emp.timesheet || [],
        transport: baseTransport,
        bonus: totalBonus
      })
      calcs.push({ employee: emp, calculation: calc })
    }

    // Все руководители наверх
    const isHead = (pos: string | undefined) => {
      const p = pos?.toLowerCase() || ''
      return p.includes('руководитель')
    }
    const heads = calcs.filter(c => isHead(c.employee.position))
    const rest = calcs.filter(c => !isHead(c.employee.position))

    // Группировка по подразделениям
    const groups: Record<string, { employee: EmployeeWithStats; calculation: SalaryCalculation }[]> = {}
    for (const calc of rest) {
      const key = calc.employee.subdivision || 'Без подразделения'
      if (!groups[key]) groups[key] = []
      groups[key].push(calc)
    }

    // Сортировка внутри групп: старший группы первым
    const getPriority = (pos: string | undefined) => {
      const p = pos?.toLowerCase() || ''
      if (p.includes('старший группы')) return 0
      return 1
    }
    for (const key of Object.keys(groups)) {
      groups[key].sort((a, b) => getPriority(a.employee.position) - getPriority(b.employee.position))
    }

    const sorted = Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]))

    // Добавляем руководителей в начало
    if (heads.length > 0) {
      sorted.unshift(['Руководство', heads])
    }

    // Считаем итоги по подразделениям
    const subdivData = sorted.map(([name, emps]) => ({
      name,
      employees: emps,
      count: emps.length,
      total_base: emps.reduce((s, e) => s + e.calculation.base_salary + (e.employee.monthly_bonus || 0), 0),
      total_final: emps.reduce((s, e) => s + e.calculation.final_salary, 0),
      total_transport: emps.reduce((s, e) => s + e.calculation.transport_payment, 0),
      total_weekend: emps.reduce((s, e) => s + e.calculation.weekend_payment, 0),
      total_weekend_days: emps.reduce((s, e) => s + e.calculation.weekend_work_days, 0),
      total_bonus: emps.reduce((s, e) => s + e.calculation.bonus, 0)
    }))

    const totals = {
      employees_count: calcs.length,
      total_base_salary: calcs.reduce((s, c) => s + c.calculation.base_salary + (c.employee.monthly_bonus || 0), 0),
      total_final_salary: calcs.reduce((s, c) => s + c.calculation.final_salary, 0),
      total_transport_payment: calcs.reduce((s, c) => s + c.calculation.transport_payment, 0),
      total_weekend_payment: calcs.reduce((s, c) => s + c.calculation.weekend_payment, 0),
      total_bonus: calcs.reduce((s, c) => s + c.calculation.bonus, 0)
    }

    // Максимальное количество выходных для градации цвета
    const maxWeekendDays = Math.max(...calcs.map(c => c.calculation.weekend_work_days), 1)

    return { subdivisionData: subdivData, totals, maxWeekendDays }
  }, [employees, year, month, baseTransport, extraBonuses])

  return (
    <div className="fot-page">
      <div className="fot-top">
        <div className="fot-stats-row">
          <div className="fot-stat-item">
            <span className="fot-stat-num">{totals.employees_count}</span>
            <span className="fot-stat-lbl">сотр.</span>
          </div>
          <div className="fot-stat-divider" />
          <div className="fot-stat-item">
            <span className="fot-stat-num">{workDaysNorm}</span>
            <span className="fot-stat-lbl">норма</span>
          </div>
          <div className="fot-stat-divider" />
          <div className="fot-transport-input">
            <span className="fot-stat-lbl">проезд</span>
            <input
              type="number"
              value={baseTransport}
              onChange={e => handleTransportChange(Number(e.target.value) || 0)}
            />
            <span>₽</span>
          </div>
          <div className="fot-stat-divider" />
          <div className="fot-stat-item">
            <span className="fot-stat-num fot-stat-accent">{formatMoney(totals.total_final_salary)}</span>
            <span className="fot-stat-lbl">ФОТ</span>
          </div>
          <div className="fot-stat-divider" />
          <div className="fot-stat-item">
            {(() => {
              const deviation = totals.total_final_salary - totals.total_base_salary
              const percent = totals.total_base_salary > 0
                ? ((deviation / totals.total_base_salary) * 100).toFixed(1)
                : '0'
              const isNegative = deviation < 0
              return (
                <>
                  <span className={`fot-stat-num ${isNegative ? 'fot-stat-negative' : 'fot-stat-positive'}`}>
                    {isNegative ? '' : '+'}{percent}%
                  </span>
                  <span className="fot-stat-lbl">{formatMoney(deviation)}</span>
                </>
              )
            })()}
          </div>
        </div>
      </div>

      {/* Таблица */}
      <div className="fot-table-card">
        <table className="fot-table">
          <thead>
            <tr>
              <th>ФИО</th>
              <th>Ставка</th>
              <th>Раб. дни</th>
              <th>Вых.</th>
              <th>Оклад</th>
              <th>За вых.</th>
              <th>Проезд</th>
              <th>Бонус</th>
              <th>Итого</th>
            </tr>
          </thead>
          <tbody>
            <tr className="fot-total-row">
              <td>Итого</td>
              <td></td>
              <td></td>
              <td></td>
              <td>{formatMoney(totals.total_base_salary)}</td>
              <td>{formatMoney(totals.total_weekend_payment)}</td>
              <td>{formatMoney(totals.total_transport_payment)}</td>
              <td>{formatMoney(totals.total_bonus)}</td>
              <td>{formatMoney(totals.total_final_salary)}</td>
            </tr>
            {subdivisionData.map(subdiv => (
              <SubdivisionRow key={subdiv.name} subdiv={subdiv} maxWeekendDays={maxWeekendDays} weekendNorm={weekendNorm} extraBonuses={extraBonuses} onExtraBonusChange={handleExtraBonusChange} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

interface SubdivisionData {
  name: string
  employees: { employee: EmployeeWithStats; calculation: SalaryCalculation }[]
  count: number
  total_base: number
  total_final: number
  total_transport: number
  total_weekend: number
  total_weekend_days: number
  total_bonus: number
}

// Цвет по градации: красный (много) -> жёлтый -> зелёный (мало/0)
function getWeekendColor(days: number, maxDays: number): string {
  if (days === 0) return '#4caf50' // зелёный
  const ratio = days / maxDays
  if (ratio > 0.7) return '#ef5350' // красный
  if (ratio > 0.4) return '#ff9800' // оранжевый
  if (ratio > 0.2) return '#ffc107' // жёлтый
  return '#8bc34a' // светло-зелёный
}

function SubdivisionRow({ subdiv, maxWeekendDays, weekendNorm, extraBonuses, onExtraBonusChange }: {
  subdiv: SubdivisionData
  maxWeekendDays: number
  weekendNorm: number
  extraBonuses: Record<number, number>
  onExtraBonusChange: (empId: number, value: number) => void
}) {
  const subdivDiff = subdiv.total_base > 0
    ? ((subdiv.total_final - subdiv.total_base) / subdiv.total_base) * 100
    : 0
  const subdivSign = subdivDiff >= 0 ? '+' : ''

  return (
    <>
      <tr className="fot-dept-row">
        <td className="fot-dept-name">{subdiv.name} <span className="fot-dept-count">({subdiv.count})</span></td>
        <td></td>
        <td></td>
        <td style={{ color: getWeekendColor(subdiv.total_weekend_days, maxWeekendDays), fontWeight: 600 }}>
          {subdiv.total_weekend_days}<span className="fot-days-sep">/</span>{weekendNorm * subdiv.count}
        </td>
        <td>{formatMoney(subdiv.total_base)}</td>
        <td>{formatMoney(subdiv.total_weekend)}</td>
        <td>{formatMoney(subdiv.total_transport)}</td>
        <td>{subdiv.total_bonus > 0 ? formatMoney(subdiv.total_bonus) : ''}</td>
        <td className="fot-dept-total">
          {formatMoney(subdiv.total_final)}
          <span className={`fot-diff ${subdivDiff >= 0 ? 'fot-diff-positive' : 'fot-diff-negative'}`}>
            {subdivSign}{subdivDiff.toFixed(0)}%
          </span>
        </td>
      </tr>
      {subdiv.employees.map(({ employee, calculation }) => {
        const dailyRate = calculation.work_days_norm > 0
          ? Math.round(calculation.base_salary / calculation.work_days_norm)
          : 0
        const weekendColor = getWeekendColor(calculation.weekend_work_days, maxWeekendDays)
        const plannedSalary = calculation.base_salary + (employee.monthly_bonus || 0)
        const salaryDiff = plannedSalary > 0
          ? ((calculation.final_salary - plannedSalary) / plannedSalary) * 100
          : 0
        const diffSign = salaryDiff >= 0 ? '+' : ''
        return (
          <tr key={employee.id} className="fot-emp-row">
            <td className="fot-emp-name">{formatEmployeeName(employee)}</td>
            <td className="fot-emp-rate">{formatMoney(dailyRate)}</td>
            <td className="fot-emp-days">
              {calculation.work_days_actual}<span className="fot-days-sep">/</span>{calculation.work_days_norm}
            </td>
            <td className="fot-emp-weekend" style={{ color: weekendColor }}>
              {calculation.weekend_work_days}<span className="fot-days-sep">/</span>{weekendNorm}
            </td>
            <td className="fot-emp-salary">
              {formatMoney(calculation.base_salary)}
              {employee.monthly_bonus > 0 && <span className="fot-monthly-bonus">+{formatMoney(employee.monthly_bonus)}</span>}
            </td>
            <td className="fot-emp-weekend-pay">{calculation.weekend_payment > 0 ? formatMoney(calculation.weekend_payment) : ''}</td>
            <td className="fot-emp-transport">{formatMoney(calculation.transport_payment)}</td>
            <td className="fot-emp-bonus">
              <input
                type="number"
                className="fot-bonus-input"
                value={extraBonuses[employee.id] || ''}
                onChange={e => onExtraBonusChange(employee.id, Number(e.target.value) || 0)}
                placeholder="+разовый"
              />
            </td>
            <td className="fot-emp-final">
              {formatMoney(calculation.final_salary)}
              <span className={`fot-diff ${salaryDiff >= 0 ? 'fot-diff-positive' : 'fot-diff-negative'}`}>
                {diffSign}{salaryDiff.toFixed(0)}%
              </span>
            </td>
          </tr>
        )
      })}
    </>
  )
}

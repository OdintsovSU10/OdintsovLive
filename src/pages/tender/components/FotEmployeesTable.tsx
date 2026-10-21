import { Fragment, useMemo } from 'react'
import type { EmployeeWithStats, SalaryCalculation } from '../types'
import { formatMoney } from '../utils/salaryCalculator'

export interface EmployeePayrollRow {
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

export interface DepartmentPayrollGroup {
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

interface IFotTotals {
  salary: number
  weekendPay: number
  transportPay: number
  bonus: number
  final: number
}

interface IFotEmployeesTableProps {
  groups: DepartmentPayrollGroup[]
  totals: IFotTotals
  groupByDept: boolean
  expandedDepartments: Record<string, boolean>
  workDaysNorm: number
  weekendsNorm: number
  onToggleDepartment: (name: string, nextExpanded: boolean) => void
  onSelectEmployee?: (employee: EmployeeWithStats) => void
  onExtraBonusChange: (employeeId: number, value: number) => void
}

interface IEmployeeRowProps {
  row: EmployeePayrollRow
  color: string
  showDepartment: boolean
  workDaysNorm: number
  weekendsNorm: number
  onSelectEmployee?: (employee: EmployeeWithStats) => void
  onExtraBonusChange: (employeeId: number, value: number) => void
}

const EmployeeRow = ({
  row,
  color,
  showDepartment,
  workDaysNorm,
  weekendsNorm,
  onSelectEmployee,
  onExtraBonusChange
}: IEmployeeRowProps) => (
  <tr className="fot-employee-row">
    <td>
      <div className="fot-employee-cell">
        <span className="avatar" style={{ color }}>{row.initials}</span>
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
        {showDepartment && <span className="raise fot-employee-dept">· {row.department}</span>}
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
          onChange={event => onExtraBonusChange(row.employee.id, Number(event.target.value))}
          placeholder="0"
        />
      </div>
    </td>
    <td>
      <span className="fot-share-percent">{row.shareOfTotal}%</span>
    </td>
    <td className="final">{formatMoney(row.calculation.final_salary)}</td>
  </tr>
)

export const FotEmployeesTable = ({
  groups,
  totals,
  groupByDept,
  expandedDepartments,
  workDaysNorm,
  weekendsNorm,
  onToggleDepartment,
  onSelectEmployee,
  onExtraBonusChange
}: IFotEmployeesTableProps) => {
  // Плоский список без групп: все сотрудники по ФИО, цвет — от своего подразделения
  const flatRows = useMemo(() => (
    groups
      .flatMap(group => group.employees.map(row => ({ row, color: group.color })))
      .sort((a, b) => a.row.employee.full_name.localeCompare(b.row.employee.full_name, 'ru'))
  ), [groups])

  return (
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
          <td>{formatMoney(totals.salary)}</td>
          <td>{formatMoney(totals.weekendPay)}</td>
          <td>{formatMoney(totals.transportPay)}</td>
          <td>{formatMoney(totals.bonus)}</td>
          <td />
          <td className="final">{formatMoney(totals.final)}</td>
        </tr>

        {!groupByDept && flatRows.map(({ row, color }) => (
          <EmployeeRow
            key={row.employee.id}
            row={row}
            color={color}
            showDepartment
            workDaysNorm={workDaysNorm}
            weekendsNorm={weekendsNorm}
            onSelectEmployee={onSelectEmployee}
            onExtraBonusChange={onExtraBonusChange}
          />
        ))}

        {groupByDept && groups.map(group => {
          const isExpanded = expandedDepartments[group.name] !== false

          return (
            <Fragment key={`group-${group.name}`}>
              <tr
                className="fot-department-row"
                onClick={() => onToggleDepartment(group.name, !isExpanded)}
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
                <EmployeeRow
                  key={row.employee.id}
                  row={row}
                  color={group.color}
                  showDepartment={false}
                  workDaysNorm={workDaysNorm}
                  weekendsNorm={weekendsNorm}
                  onSelectEmployee={onSelectEmployee}
                  onExtraBonusChange={onExtraBonusChange}
                />
              ))}
            </Fragment>
          )
        })}
      </tbody>
    </table>
  )
}

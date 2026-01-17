import { Users, Plus } from 'lucide-react'
import { Employee, SalaryHistory, EditedEmployee } from '../types'
import { calcTenure } from '../../../lib/dateUtils'
import {
  formatMoney,
  formatMonthYear,
  formatDaysSinceRaise,
  getLastRaise,
  getDaysSinceRaise,
  isSeniorPosition
} from '../utils'

interface Props {
  employees: Employee[]
  salaryHistory: { [key: number]: SalaryHistory[] }
  loading: boolean
  showArchived: boolean
  editMode: boolean
  selectedEmployee: Employee | null
  selectedForArchive: number[]
  editedEmployees: { [id: number]: EditedEmployee }
  onSelectEmployee: (emp: Employee) => void
  onToggleSelectForArchive: (id: number) => void
  onUpdateEditedEmployee: (id: number, field: 'full_name' | 'position', value: string) => void
  onQuickRaise: (emp: Employee) => void
}

export default function EmployeeTable({
  employees,
  salaryHistory,
  loading,
  showArchived,
  editMode,
  selectedEmployee,
  selectedForArchive,
  editedEmployees,
  onSelectEmployee,
  onToggleSelectForArchive,
  onUpdateEditedEmployee,
  onQuickRaise
}: Props) {
  if (loading) {
    return <div className="loading">Загрузка...</div>
  }

  if (employees.length === 0) {
    return (
      <div className="empty-state">
        <Users size={48} />
        <p>{showArchived ? 'Архив пуст' : 'Нет сотрудников'}</p>
      </div>
    )
  }

  return (
    <div className={`employees-table ${editMode ? 'edit-mode' : ''}`}>
      <div className="table-header">
        {editMode && <span className="col-checkbox"></span>}
        <span className="col-name">ФИО</span>
        <span className="col-position">Должность</span>
        {!editMode && (
          <>
            <span className="col-tenure">Стаж</span>
            <span className="col-salary">Оклад</span>
            <span className="col-raise">Дата повышения</span>
            <span className="col-days">Без повышения</span>
            <span className="col-actions"></span>
          </>
        )}
      </div>
      {employees.map(emp => {
        const days = getDaysSinceRaise(emp.id, emp.hire_date, salaryHistory)
        const lastRaise = getLastRaise(emp.id, salaryHistory)
        const needsAttention = days > 365
        const isSenior = isSeniorPosition(emp.position)
        const editedName = editedEmployees[emp.id]?.full_name ?? emp.full_name
        const editedPosition = editedEmployees[emp.id]?.position ?? emp.position

        return (
          <div
            key={emp.id}
            className={`table-row ${needsAttention ? 'attention' : ''} ${emp.is_archived ? 'archived' : ''} ${selectedEmployee?.id === emp.id ? 'selected' : ''}`}
            onClick={() => !editMode && onSelectEmployee(emp)}
            data-meta={`${formatMoney(emp.current_salary)} · ${calcTenure(emp.hire_date)} · Без повыш.: ${formatDaysSinceRaise(days)}`}
          >
            {editMode && (
              <span className="col-checkbox">
                <input
                  type="checkbox"
                  checked={selectedForArchive.includes(emp.id)}
                  onChange={() => onToggleSelectForArchive(emp.id)}
                />
              </span>
            )}
            {editMode ? (
              <>
                <input
                  className={`col-name edit-input ${isSenior ? 'senior' : ''}`}
                  value={editedName}
                  onChange={e => onUpdateEditedEmployee(emp.id, 'full_name', e.target.value)}
                  onClick={e => e.stopPropagation()}
                />
                <input
                  className={`col-position edit-input ${isSenior ? 'senior' : ''}`}
                  value={editedPosition}
                  onChange={e => onUpdateEditedEmployee(emp.id, 'position', e.target.value)}
                  onClick={e => e.stopPropagation()}
                />
              </>
            ) : (
              <>
                <span className={`col-name ${isSenior ? 'senior' : ''}`}>{emp.full_name}</span>
                <span className={`col-position ${isSenior ? 'senior' : ''}`}>{emp.position}</span>
                <span className="col-tenure" title={`Трудоустройство: ${new Date(emp.hire_date).toLocaleDateString('ru-RU')}`}>
                  {calcTenure(emp.hire_date)}
                </span>
                <span className="col-salary">{formatMoney(emp.current_salary)}</span>
                <span className="col-raise">
                  {lastRaise ? formatMonthYear(lastRaise.effective_date) : '—'}
                </span>
                <span className={`col-days ${needsAttention ? 'warning' : ''}`}>{formatDaysSinceRaise(days)}</span>
                <span className="col-actions">
                  {!emp.is_archived && (
                    <button
                      className="btn-quick-raise"
                      onClick={(e) => { e.stopPropagation(); onQuickRaise(emp) }}
                      title="Добавить повышение"
                    >
                      <Plus size={14} />
                    </button>
                  )}
                </span>
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}

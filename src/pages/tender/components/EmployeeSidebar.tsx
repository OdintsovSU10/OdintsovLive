import { X, Plus, Archive } from 'lucide-react'
import { Employee, SalaryHistory } from '../types'
import { calcTenure } from '../../../lib/dateUtils'
import { formatMoney, formatNumberInput, getRaiseDiff, getTimeBetweenRaises } from '../utils'

interface Props {
  employee: Employee | null
  salaryHistory: { [key: number]: SalaryHistory[] }
  showAddRaise: boolean
  raiseAmount: string
  raiseDate: string
  raiseNote: string
  setShowAddRaise: (v: boolean) => void
  setRaiseAmount: (v: string) => void
  setRaiseDate: (v: string) => void
  setRaiseNote: (v: string) => void
  onClose: () => void
  onAddRaise: () => void
  onArchive: () => void
  onRestore: () => void
  onDeleteRaise: (historyId: number, employeeId: number) => void
}

export default function EmployeeSidebar({
  employee,
  salaryHistory,
  showAddRaise,
  raiseAmount,
  raiseDate,
  raiseNote,
  setShowAddRaise,
  setRaiseAmount,
  setRaiseDate,
  setRaiseNote,
  onClose,
  onAddRaise,
  onArchive,
  onRestore,
  onDeleteRaise
}: Props) {
  if (!employee) return null

  const history = salaryHistory[employee.id] || []

  return (
    <>
      <div className={`employee-sidebar ${employee ? 'open' : ''}`}>
        <div className="sidebar-header">
          <h2>{employee.full_name}</h2>
          <button className="sidebar-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className="sidebar-body">
          <div className="employee-info">
            <div className="info-row">
              <span className="info-label">Должность</span>
              <span className="info-value">{employee.position}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Трудоустройство</span>
              <span className="info-value">
                {new Date(employee.hire_date).toLocaleDateString('ru-RU')}
              </span>
            </div>
            <div className="info-row">
              <span className="info-label">Стаж</span>
              <span className="info-value">{calcTenure(employee.hire_date)}</span>
            </div>
            <div className="info-row highlight">
              <span className="info-label">Текущий оклад</span>
              <span className="info-value">{formatMoney(employee.current_salary)}</span>
            </div>
          </div>

          <div className="salary-history">
            <div className="history-header">
              <h3>История окладов</h3>
              {!employee.is_archived && (
                <button className="btn-add-raise" onClick={() => setShowAddRaise(!showAddRaise)}>
                  <Plus size={16} />
                </button>
              )}
            </div>

            {showAddRaise && (
              <div className="raise-form">
                <div className="form-row">
                  <div className="form-group">
                    <label>Сумма повышения</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={raiseAmount}
                      onChange={e => setRaiseAmount(formatNumberInput(e.target.value))}
                      placeholder="5 000"
                    />
                  </div>
                  <div className="form-group">
                    <label>Дата</label>
                    <input
                      type="date"
                      value={raiseDate}
                      onChange={e => setRaiseDate(e.target.value)}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Примечание</label>
                  <input
                    type="text"
                    value={raiseNote}
                    onChange={e => setRaiseNote(e.target.value)}
                    placeholder="Плановое повышение"
                  />
                </div>
                <div className="raise-actions">
                  <button className="btn-cancel" onClick={() => setShowAddRaise(false)}>Отмена</button>
                  <button className="btn-save" onClick={onAddRaise}>Добавить</button>
                </div>
              </div>
            )}

            <div className="history-timeline">
              {history.map((h, i) => {
                const diff = getRaiseDiff(employee.id, i, salaryHistory)
                const timeBetween = getTimeBetweenRaises(employee.id, i, salaryHistory)
                return (
                  <div key={h.id} className={`timeline-item ${i === 0 ? 'current' : ''}`}>
                    <div className="timeline-dot" />
                    <div className="timeline-content">
                      <span className="timeline-salary">{formatMoney(h.salary)}</span>
                      {diff !== null && (
                        <span className={`timeline-diff ${diff >= 0 ? 'positive' : 'negative'}`}>
                          {diff >= 0 ? '+' : ''}{formatMoney(diff)}
                        </span>
                      )}
                      <span className="timeline-date">
                        {new Date(h.effective_date).toLocaleDateString('ru-RU')}
                      </span>
                      {timeBetween && (
                        <span className={`timeline-interval ${timeBetween.overYear ? 'over-year' : ''}`}>
                          через {timeBetween.text}
                        </span>
                      )}
                      {h.note && <span className="timeline-note">{h.note}</span>}
                    </div>
                    <button
                      className="timeline-delete"
                      onClick={() => onDeleteRaise(h.id, employee.id)}
                      title="Удалить"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
        <div className="sidebar-footer">
          {employee.is_archived ? (
            <button className="btn-restore" onClick={onRestore}>
              Восстановить
            </button>
          ) : (
            <button className="btn-archive" onClick={onArchive}>
              <Archive size={16} />
              В архив
            </button>
          )}
        </div>
      </div>
      <div className="sidebar-overlay" onClick={onClose} />
    </>
  )
}

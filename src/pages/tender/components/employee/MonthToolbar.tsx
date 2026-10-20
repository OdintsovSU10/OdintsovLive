import { ChevronLeft, ChevronRight } from 'lucide-react'
import { MONTH_NAMES } from '../../utils/employeeFormat'

interface Props {
  year: number
  month: number
  canPrev: boolean
  canNext: boolean
  isCurrent: boolean
  onPrev: () => void
  onNext: () => void
  onToday: () => void
}

// Единственный переключатель месяца на странице сотрудника: группа по центру, «Сегодня» справа поверх
export function MonthToolbar({ year, month, canPrev, canNext, isCurrent, onPrev, onNext, onToday }: Props) {
  return (
    <div className="emp-toolbar" role="group" aria-label="Месяц">
      <div className="emp-toolbar-group">
        <button type="button" className="emp-icon-btn" onClick={onPrev} disabled={!canPrev} aria-label="Предыдущий месяц">
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
        <span className="emp-toolbar-label" aria-live="polite">{MONTH_NAMES[month - 1]} {year}</span>
        <button type="button" className="emp-icon-btn" onClick={onNext} disabled={!canNext} aria-label="Следующий месяц">
          <ChevronRight size={20} aria-hidden="true" />
        </button>
      </div>
      {!isCurrent && (
        <button type="button" className="emp-today-btn" onClick={onToday}>Сегодня</button>
      )}
    </div>
  )
}

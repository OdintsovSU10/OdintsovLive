import type { FC } from 'react'
import { CalendarX } from 'lucide-react'
import { BottomSheet } from '../../../../components/ui/BottomSheet'
import type { EmployeeWithStats } from '../../types'

interface IAbsentDaysSheetProps {
  employee: EmployeeWithStats
  // Даты прогулов (ISO), по возрастанию
  dates: string[]
  onClose: () => void
  onOpenEmployee: (employee: EmployeeWithStats) => void
}

const DATE_FORMATTER = new Intl.DateTimeFormat('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' })
const DAY_MS = 24 * 60 * 60 * 1000

const formatDate = (iso: string): string => DATE_FORMATTER.format(new Date(`${iso}T12:00:00`))

// «сегодня», «вчера», «5 дн. назад» — от полудня, чтобы не сбиваться на смене суток
const formatAgo = (iso: string): string => {
  const today = new Date()
  today.setHours(12, 0, 0, 0)
  const days = Math.round((today.getTime() - new Date(`${iso}T12:00:00`).getTime()) / DAY_MS)
  if (days <= 0) return 'сегодня'
  if (days === 1) return 'вчера'
  return `${days} дн. назад`
}

// Мини-окно: в какие дни месяца стоит прогул, и переход в карточку сотрудника
export const AbsentDaysSheet: FC<IAbsentDaysSheetProps> = ({ employee, dates, onClose, onOpenEmployee }) => (
  <BottomSheet
    variant="modal"
    size="small"
    title={employee.full_name}
    onClose={onClose}
    footer={(
      <button type="button" className="dash-absent-open" onClick={() => onOpenEmployee(employee)}>
        Карточка сотрудника
      </button>
    )}
  >
    <p className="dash-absent-lead">Прогулы по табелю</p>
    <ul className="dash-absent-list">
      {dates.map(iso => (
        <li key={iso} className="dash-absent-item">
          <CalendarX size={16} strokeWidth={1.75} aria-hidden="true" />
          <span className="dash-absent-date">{formatDate(iso)}</span>
          <span className="dash-absent-ago">{formatAgo(iso)}</span>
        </li>
      ))}
    </ul>
  </BottomSheet>
)

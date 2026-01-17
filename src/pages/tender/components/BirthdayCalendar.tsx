import { ChevronLeft, ChevronRight } from 'lucide-react'
import { MONTHS } from '../../../lib/constants'
import { Employee } from '../types'
import { getCalendarDays } from '../utils'

interface Props {
  calendarMonth: Date
  setCalendarMonth: (date: Date) => void
  employees: Employee[]
  onSelectEmployee: (emp: Employee) => void
}

export default function BirthdayCalendar({ calendarMonth, setCalendarMonth, employees, onSelectEmployee }: Props) {
  const days = getCalendarDays(calendarMonth, employees)

  return (
    <div className="birthdays-calendar">
      <div className="calendar-header">
        <button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1))}>
          <ChevronLeft size={20} />
        </button>
        <span>{MONTHS[calendarMonth.getMonth()]} {calendarMonth.getFullYear()}</span>
        <button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1))}>
          <ChevronRight size={20} />
        </button>
      </div>
      <div className="calendar-weekdays">
        <span>Пн</span><span>Вт</span><span>Ср</span><span>Чт</span><span>Пт</span><span>Сб</span><span>Вс</span>
      </div>
      <div className="calendar-grid">
        {days.map((d, i) => (
          <div
            key={i}
            className={`calendar-day ${!d.isCurrentMonth ? 'other-month' : ''} ${d.birthdays.length > 0 ? 'has-birthday' : ''}`}
          >
            <span className="day-number">{d.day}</span>
            {d.birthdays.length > 0 && (
              <div className="day-birthdays">
                {d.birthdays.map(emp => (
                  <span key={emp.id} className="birthday-name" onClick={() => onSelectEmployee(emp)}>
                    {emp.full_name.split(' ')[0]}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

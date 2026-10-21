import { useMemo, useState } from 'react'
import type { FC } from 'react'
import { BottomSheet } from '../../../components/ui/BottomSheet'
import { useEmployeeSkudMonth } from '../hooks/useEmployeeSkudMonth'
import { buildMonthDays, getSkudHoursByDate } from '../utils/attendanceDay'
import { MONTH_GENITIVE, MONTH_SHORT_GENITIVE, toIsoDate, WEEKDAYS_LONG } from '../utils/employeeFormat'
import { getEmployeeShortName } from '../utils/tenderPresentation'
import type { EmployeeWithStats, TimesheetEntry } from '../types'
import { DayPassesPanel } from './employee/DayPassesPanel'
import './employee/EmployeeDetail.css'
import './employee/EmployeeAttendance.css'

interface ITimesheetDaySheetProps {
  employee: EmployeeWithStats
  year: number
  month: number
  // Выбранный день, ISO (YYYY-MM-DD)
  date: string
  entriesByDay: Map<number, TimesheetEntry>
  onClose: () => void
  onChangeDate: (iso: string) => void
  onOpenEmployee?: (employee: EmployeeWithStats) => void
}

// Проходы и часы одного дня сотрудника. Монтируется только при выбранном дне:
// события СКУД месяца запрашиваются лишь пока шторка открыта.
export const TimesheetDaySheet: FC<ITimesheetDaySheetProps> = ({
  employee,
  year,
  month,
  date,
  entriesByDay,
  onClose,
  onChangeDate,
  onOpenEmployee
}) => {
  const [today] = useState(() => new Date())
  const skud = useEmployeeSkudMonth(employee.fot_employee_id, year, month)

  const skudHoursByDate = useMemo(
    () => getSkudHoursByDate(skud.eventsByDate, today),
    [skud.eventsByDate, today]
  )
  const days = useMemo(
    () => buildMonthDays(year, month, entriesByDay, skudHoursByDate, today),
    [entriesByDay, month, skudHoursByDate, today, year]
  )

  const day = Number(date.slice(8, 10))
  const info = days[day - 1] ?? null
  const weekday = WEEKDAYS_LONG[new Date(year, month - 1, day).getDay()]
  const prevDay = day > 1 ? day - 1 : null
  const nextDay = day < days.length && !days[day].disabled ? day + 1 : null
  const monthShort = MONTH_SHORT_GENITIVE[month - 1]

  const selectDay = (target: number) => onChangeDate(toIsoDate(year, month, target))

  return (
    <BottomSheet
      variant="modal"
      title={`${getEmployeeShortName(employee)} · ${day} ${MONTH_GENITIVE[month - 1]}, ${weekday}`}
      onClose={onClose}
      footer={(
        <div className="ts-sheet-footer">
          <div className="emp-sheet-nav">
            <button
              type="button"
              className="emp-text-btn"
              disabled={prevDay === null}
              onClick={() => prevDay && selectDay(prevDay)}
            >
              {prevDay ? `‹ ${prevDay} ${monthShort}` : '‹'}
            </button>
            <button
              type="button"
              className="emp-text-btn"
              disabled={nextDay === null}
              onClick={() => nextDay && selectDay(nextDay)}
            >
              {nextDay ? `${nextDay} ${monthShort} ›` : '›'}
            </button>
          </div>
          {onOpenEmployee && (
            <button type="button" className="emp-text-btn" onClick={() => onOpenEmployee(employee)}>
              Карточка сотрудника
            </button>
          )}
        </div>
      )}
    >
      <DayPassesPanel
        fotEmployeeId={employee.fot_employee_id}
        date={date}
        info={info}
        skud={skud}
      />
    </BottomSheet>
  )
}

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { Home, Info, Pencil } from 'lucide-react'
import { countLegend, getDayAriaLabel, type DayClass } from '../../utils/attendanceDay'
import { TIMESHEET_STATUS_META } from '../../utils/timesheetStatus'

const WEEKDAY_HEADERS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const SKELETON_CELLS = 35
const SWIPE_MIN_PX = 50
const LEAVE_STATUSES = ['vacation', 'sick', 'unpaid', 'educational_leave'] as const

export interface AttendanceSummary {
  workedDays: number
  normDays: number
  hours: number
  normHours: number
  weekendDays: number
}

interface Props {
  year: number
  month: number
  days: DayClass[]
  summary: AttendanceSummary | null
  loading: boolean
  error: string | null
  selectedDay: number | null
  onSelect: (day: number) => void
  onRetry: () => void
  // Свайп по календарю (только телефон и закрытая шторка); null — в эту сторону нельзя
  onSwipePrev: (() => void) | null
  onSwipeNext: (() => void) | null
}

export function AttendanceCalendar({
  year,
  month,
  days,
  summary,
  loading,
  error,
  selectedDay,
  onSelect,
  onRetry,
  onSwipePrev,
  onSwipeNext
}: Props) {
  const [legendOpen, setLegendOpen] = useState(false)
  const [focusedDay, setFocusedDay] = useState<number | null>(null)
  const cellRefs = useRef(new Map<number, HTMLButtonElement>())
  const swipeStart = useRef<{ x: number; y: number } | null>(null)

  const leadingBlanks = (new Date(year, month - 1, 1).getDay() + 6) % 7
  const legend = useMemo(() => countLegend(days), [days])
  const showCells = !loading && !error

  useEffect(() => {
    setFocusedDay(null)
  }, [month, year])

  // Roving tabindex: в Tab-порядке только один день
  const tabDay = useMemo(() => {
    const isEnabled = (day: number | null) => day !== null && day >= 1 && day <= days.length && !days[day - 1].disabled
    if (isEnabled(focusedDay)) return focusedDay
    if (isEnabled(selectedDay)) return selectedDay
    const todayIndex = days.findIndex(item => item.isToday)
    if (todayIndex >= 0 && isEnabled(todayIndex + 1)) return todayIndex + 1
    const firstEnabled = days.findIndex(item => !item.disabled)
    return firstEnabled >= 0 ? firstEnabled + 1 : null
  }, [days, focusedDay, selectedDay])

  const moveFocus = (target: number) => {
    setFocusedDay(target)
    cellRefs.current.get(target)?.focus()
  }

  // Ближайший доступный день от start в сторону step, пропуская disabled
  const findEnabled = (start: number, step: number): number | null => {
    for (let day = start; day >= 1 && day <= days.length; day += step) {
      if (!days[day - 1].disabled) return day
    }
    return null
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, day: number) => {
    let target: number | null = null
    const weekday = (leadingBlanks + day - 1) % 7

    switch (event.key) {
      case 'ArrowLeft':
        target = findEnabled(day - 1, -1)
        break
      case 'ArrowRight':
        target = findEnabled(day + 1, 1)
        break
      case 'ArrowUp':
        target = day - 7 >= 1 && !days[day - 8].disabled ? day - 7 : null
        break
      case 'ArrowDown':
        target = day + 7 <= days.length && !days[day + 6].disabled ? day + 7 : null
        break
      case 'Home': {
        const weekStart = Math.max(1, day - weekday)
        target = findEnabled(weekStart, 1)
        if (target !== null && target > day) target = null
        break
      }
      case 'End': {
        const weekEnd = Math.min(days.length, day + (6 - weekday))
        target = findEnabled(weekEnd, -1)
        if (target !== null && target < day) target = null
        break
      }
      default:
        return
    }

    event.preventDefault()
    if (target !== null) moveFocus(target)
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'touch' || (!onSwipePrev && !onSwipeNext)) return
    swipeStart.current = { x: event.clientX, y: event.clientY }
  }

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const start = swipeStart.current
    swipeStart.current = null
    if (!start) return
    const dx = event.clientX - start.x
    const dy = event.clientY - start.y
    if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) <= Math.abs(dy)) return
    if (dx < 0) onSwipeNext?.()
    else onSwipePrev?.()
  }

  return (
    <section className="emp-card emp-attendance" aria-label="Посещение">
      <div className="emp-card-head">
        <h3>Посещение</h3>
        <span className="emp-attendance-summary">
          {summary && !loading
            ? `${summary.workedDays}/${summary.normDays} дн · ${summary.hours.toLocaleString('ru-RU')}/${summary.normHours.toLocaleString('ru-RU')} ч${summary.weekendDays > 0 ? ` · вых. ${summary.weekendDays}` : ''}`
            : '— дн · — ч'}
        </span>
      </div>

      <div
        className="emp-cal"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => { swipeStart.current = null }}
      >
        <div className="emp-cal-weekdays" aria-hidden="true">
          {WEEKDAY_HEADERS.map(name => <span key={name}>{name}</span>)}
        </div>

        {error ? (
          <div className="emp-state error">
            <span>{error}</span>
            <button type="button" className="emp-text-btn" onClick={onRetry}>Повторить</button>
          </div>
        ) : (
          <div className="emp-cal-grid" aria-busy={loading}>
            {!showCells && Array.from({ length: SKELETON_CELLS }, (_, index) => (
              <span key={index} className="emp-day emp-day-skeleton" aria-hidden="true" />
            ))}
            {showCells && Array.from({ length: leadingBlanks }, (_, index) => (
              <span key={`blank-${index}`} aria-hidden="true" />
            ))}
            {showCells && days.map((info, index) => {
              const day = index + 1
              const date = new Date(year, month - 1, day)
              const selected = selectedDay === day
              const classes = [
                'emp-day',
                `tone-${info.tone}`,
                selected ? 'selected' : '',
                info.dashed ? 'dashed' : '',
                info.fromSkud ? 'from-skud' : ''
              ].filter(Boolean).join(' ')
              return (
                <button
                  key={day}
                  ref={node => {
                    if (node) cellRefs.current.set(day, node)
                    else cellRefs.current.delete(day)
                  }}
                  type="button"
                  className={classes}
                  disabled={info.disabled}
                  tabIndex={tabDay === day ? 0 : -1}
                  aria-pressed={selected}
                  aria-label={getDayAriaLabel(date, info)}
                  onClick={() => onSelect(day)}
                  onFocus={() => setFocusedDay(day)}
                  onKeyDown={event => handleKeyDown(event, day)}
                >
                  {info.remote && <Home className="emp-day-mark home" size={10} aria-hidden="true" />}
                  {info.corrected && <Pencil className="emp-day-mark pencil" size={9} aria-hidden="true" />}
                  {info.mismatch && <i className="emp-day-dot" aria-hidden="true" />}
                  <span className={`emp-day-num ${info.isToday ? 'today' : ''}`}>{day}</span>
                  <span className="emp-day-value">{info.value}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="emp-legend">
        <ul>
          <li><i className="emp-swatch tone-green" aria-hidden="true" />Полный {legend.full}</li>
          <li><i className="emp-swatch tone-yellow" aria-hidden="true" />Неполный {legend.partial}</li>
          <li><i className="emp-swatch tone-red" aria-hidden="true" />Неявка {legend.absent}</li>
          <li><i className="emp-swatch tone-leave" aria-hidden="true" />Отпуск/больн. {legend.leave}</li>
        </ul>
        <button
          type="button"
          className="emp-icon-btn"
          onClick={() => setLegendOpen(value => !value)}
          aria-expanded={legendOpen}
          aria-controls="emp-legend-info"
          aria-label="Пояснения к календарю"
        >
          <Info size={18} aria-hidden="true" />
        </button>
      </div>

      {legendOpen && (
        <div id="emp-legend-info" className="emp-legend-info">
          <p>
            <b>Полный</b> — отработана норма дня без обеда (обычно 8 ч, пт 7 ч, по графику FOT).
            {' '}<b>Неполный</b> — меньше нормы; на оплату не влияет.
          </p>
          <p>
            В выходной любые часы — присутствие. <b>—</b> — данные не загружены.
          </p>
          <p>
            <i className="emp-day-dot static" aria-hidden="true" />
            Часы табеля и СКУД различаются на 2 ч и больше.
          </p>
          <p>
            <Pencil size={11} aria-hidden="true" /> Запись исправлена вручную.
            Пунктир под значением — день посчитан по проходам СКУД, записи в табеле нет.
            <Home size={11} aria-hidden="true" /> — удалённая работа.
          </p>
          <p>
            Статусы: {LEAVE_STATUSES.map(status => `${TIMESHEET_STATUS_META[status].short} — ${TIMESHEET_STATUS_META[status].label.toLowerCase()}`).join(', ')},
            {' '}Н — неявка, РБ — работа на больничном, УУ — удалёнка, В — выходной.
          </p>
        </div>
      )}
    </section>
  )
}

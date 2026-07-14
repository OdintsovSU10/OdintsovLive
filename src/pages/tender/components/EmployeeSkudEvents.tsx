import { useEffect, useMemo, useState } from 'react'
import { fetchFotEmployeeEvents, type FotEmployeeEvent } from '../utils/fotEmployeeEvents'
import './EmployeeSkudEvents.css'

const monthNames = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
]

interface EventDayGroup {
  date: string
  events: FotEmployeeEvent[]
  firstEntry: FotEmployeeEvent | null
  lastExit: FotEmployeeEvent | null
}

const weekdayNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

function getMonthRange(year: number, month: number): { from: string; to: string } {
  const monthText = String(month).padStart(2, '0')
  const lastDay = new Date(year, month, 0).getDate()
  return {
    from: `${year}-${monthText}-01`,
    to: `${year}-${monthText}-${String(lastDay).padStart(2, '0')}`
  }
}

function formatEventTime(value: string): string {
  return value.slice(0, 5)
}

function formatEventDate(value: string): string {
  return new Date(`${value}T12:00:00`).toLocaleDateString('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  })
}

function getDirectionLabel(direction: FotEmployeeEvent['direction']): string {
  if (direction === 'entry') return 'Вход'
  if (direction === 'exit') return 'Выход'
  return 'Событие'
}

export function EmployeeSkudEvents({
  fotEmployeeId,
  initialYear,
  initialMonth
}: {
  fotEmployeeId: string | null
  initialYear: number
  initialMonth: number
}) {
  const [year, setYear] = useState(initialYear)
  const [month, setMonth] = useState(initialMonth)
  const [events, setEvents] = useState<FotEmployeeEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  useEffect(() => {
    setYear(initialYear)
    setMonth(initialMonth)
    setSelectedDate(null)
  }, [fotEmployeeId, initialMonth, initialYear])

  useEffect(() => {
    if (!fotEmployeeId) {
      setEvents([])
      setError(null)
      setLoading(false)
      return
    }

    const controller = new AbortController()
    const { from, to } = getMonthRange(year, month)

    setLoading(true)
    setError(null)
    setEvents([])
    fetchFotEmployeeEvents(fotEmployeeId, from, to, controller.signal)
      .then(setEvents)
      .catch(err => {
        if (controller.signal.aborted) return
        if (err instanceof DOMException && err.name === 'AbortError') return
        setEvents([])
        setError(err instanceof Error ? err.message : 'Не удалось загрузить события FOT')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [fotEmployeeId, month, year])

  const groupedEvents = useMemo<EventDayGroup[]>(() => {
    const byDate = new Map<string, FotEmployeeEvent[]>()
    for (const event of events) {
      const dayEvents = byDate.get(event.event_date) || []
      dayEvents.push(event)
      byDate.set(event.event_date, dayEvents)
    }

    return Array.from(byDate.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, dayEvents]) => {
        const sortedEvents = dayEvents.sort((left, right) => left.event_time.localeCompare(right.event_time))
        return {
          date,
          events: sortedEvents,
          firstEntry: sortedEvents.find(event => event.direction === 'entry') || null,
          lastExit: [...sortedEvents].reverse().find(event => event.direction === 'exit') || null
        }
      })
  }, [events])

  const eventsByDate = useMemo(
    () => new Map(groupedEvents.map(group => [group.date, group])),
    [groupedEvents]
  )

  const calendarDays = useMemo(() => {
    const daysInMonth = new Date(year, month, 0).getDate()
    return Array.from({ length: daysInMonth }, (_, index) => {
      const day = index + 1
      const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const dayOfWeek = new Date(year, month - 1, day, 12, 0, 0).getDay()
      return {
        day,
        date,
        isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
        group: eventsByDate.get(date) || null
      }
    })
  }, [eventsByDate, month, year])

  const calendarStartOffset = useMemo(() => {
    const firstWeekday = new Date(year, month - 1, 1, 12, 0, 0).getDay()
    return (firstWeekday + 6) % 7
  }, [month, year])

  const selectedGroup = selectedDate ? eventsByDate.get(selectedDate) || null : null

  useEffect(() => {
    if (loading || error || groupedEvents.length === 0) return

    setSelectedDate(current => {
      if (current && eventsByDate.has(current)) return current

      const now = new Date()
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      if (eventsByDate.has(today)) return today

      return groupedEvents[groupedEvents.length - 1].date
    })
  }, [error, eventsByDate, groupedEvents, loading])

  const summary = useMemo(() => {
    const entries = events.filter(event => event.direction === 'entry').length
    const exits = events.filter(event => event.direction === 'exit').length
    return { entries, exits, activeDays: groupedEvents.length }
  }, [events, groupedEvents.length])

  const shiftMonth = (offset: -1 | 1) => {
    const next = new Date(year, month - 1 + offset, 1)
    setYear(next.getFullYear())
    setMonth(next.getMonth() + 1)
    setSelectedDate(null)
  }

  return (
    <article className="tender-skud-events">
      <div className="tender-skud-events-head">
        <div>
          <div className="tender-skud-events-title-line">
            <h3>События СКУД</h3>
            <span className="tender-skud-source">FOT</span>
          </div>
          <p>Фактические входы и выходы сотрудника</p>
        </div>
        <div className="tender-skud-period-nav">
          <button type="button" onClick={() => shiftMonth(-1)} aria-label="Предыдущий месяц событий">←</button>
          <span>{monthNames[month - 1]} {year}</span>
          <button type="button" onClick={() => shiftMonth(1)} aria-label="Следующий месяц событий">→</button>
        </div>
      </div>

      {!fotEmployeeId ? (
        <div className="tender-skud-state muted">
          У сотрудника нет FOT ID. Обновите его через синхронизацию сотрудников.
        </div>
      ) : (
        <>
          <div className="tender-skud-summary">
            <span><strong>{summary.activeDays}</strong> дней с событиями</span>
            <span><strong>{events.length}</strong> всего</span>
            <span className="entry"><strong>{summary.entries}</strong> входов</span>
            <span className="exit"><strong>{summary.exits}</strong> выходов</span>
          </div>

          {loading && <div className="tender-skud-state">Загрузка событий из FOT…</div>}
          {!loading && error && <div className="tender-skud-state error">{error}</div>}
          {!loading && !error && groupedEvents.length === 0 && (
            <div className="tender-skud-state muted">За выбранный месяц событий нет</div>
          )}
          {!loading && !error && groupedEvents.length > 0 && (
            <>
              <div className="tender-skud-calendar" aria-label={`События СКУД за ${monthNames[month - 1]} ${year}`}>
                {weekdayNames.map((weekday, index) => (
                  <span key={weekday} className={`tender-skud-weekday ${index > 4 ? 'weekend' : ''}`}>
                    {weekday}
                  </span>
                ))}
                {Array.from({ length: calendarStartOffset }, (_, index) => (
                  <span key={`blank-${index}`} className="tender-skud-calendar-blank" aria-hidden="true" />
                ))}
                {calendarDays.map(day => {
                  const eventCount = day.group?.events.length || 0
                  return (
                    <button
                      key={day.date}
                      type="button"
                      className={`tender-skud-calendar-day ${day.group ? 'has-events' : ''} ${day.isWeekend ? 'weekend' : ''} ${selectedDate === day.date ? 'selected' : ''}`}
                      onClick={() => setSelectedDate(day.date)}
                      aria-pressed={selectedDate === day.date}
                      aria-label={`${day.day} ${monthNames[month - 1]}: ${eventCount > 0 ? `${eventCount} событий` : 'событий нет'}`}
                    >
                      <span className="tender-skud-calendar-day-head">
                        <strong>{day.day}</strong>
                        {eventCount > 0 && <b>{eventCount}</b>}
                      </span>
                      {day.group ? (
                        <span className="tender-skud-day-times">
                          <small className="entry"><i>Вход</i>{day.group.firstEntry ? formatEventTime(day.group.firstEntry.event_time) : '—'}</small>
                          <small className="exit"><i>Выход</i>{day.group.lastExit ? formatEventTime(day.group.lastExit.event_time) : '—'}</small>
                        </span>
                      ) : (
                        <span className="tender-skud-no-events">—</span>
                      )}
                    </button>
                  )
                })}
              </div>

              {selectedDate && (
                <section className="tender-skud-selected-day">
                  <div className="tender-skud-selected-head">
                    <div>
                      <span>Выбранный день</span>
                      <strong>{formatEventDate(selectedDate)}</strong>
                    </div>
                    {selectedGroup && (
                      <div className="tender-skud-selected-summary">
                        <span className="entry">Вход <strong>{selectedGroup.firstEntry ? formatEventTime(selectedGroup.firstEntry.event_time) : '—'}</strong></span>
                        <span className="exit">Выход <strong>{selectedGroup.lastExit ? formatEventTime(selectedGroup.lastExit.event_time) : '—'}</strong></span>
                        <span><strong>{selectedGroup.events.length}</strong> событий</span>
                      </div>
                    )}
                  </div>

                  {selectedGroup ? (
                    <div className="tender-skud-day-events">
                      {selectedGroup.events.map(event => (
                        <div key={event.id} className="tender-skud-event">
                          <time>{formatEventTime(event.event_time)}</time>
                          <span className={`tender-skud-direction ${event.direction || 'unknown'}`}>
                            {event.direction === 'entry' ? '→' : event.direction === 'exit' ? '←' : '•'}
                            {' '}{getDirectionLabel(event.direction)}
                          </span>
                          <span className="tender-skud-point">{event.access_point || 'Точка не указана'}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="tender-skud-selected-empty">В этот день событий СКУД нет</div>
                  )}
                </section>
              )}
            </>
          )}
        </>
      )}
    </article>
  )
}

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
}

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
    weekday: 'short',
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

  useEffect(() => {
    setYear(initialYear)
    setMonth(initialMonth)
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
      .sort(([left], [right]) => right.localeCompare(left))
      .map(([date, dayEvents]) => ({
        date,
        events: dayEvents.sort((left, right) => right.event_time.localeCompare(left.event_time))
      }))
  }, [events])

  const summary = useMemo(() => {
    const entries = events.filter(event => event.direction === 'entry').length
    const exits = events.filter(event => event.direction === 'exit').length
    const accessPoints = new Set(events.map(event => event.access_point).filter(Boolean)).size
    return { entries, exits, accessPoints }
  }, [events])

  const shiftMonth = (offset: -1 | 1) => {
    const next = new Date(year, month - 1 + offset, 1)
    setYear(next.getFullYear())
    setMonth(next.getMonth() + 1)
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
            <span><strong>{events.length}</strong> событий</span>
            <span className="entry"><strong>{summary.entries}</strong> входов</span>
            <span className="exit"><strong>{summary.exits}</strong> выходов</span>
            <span><strong>{summary.accessPoints}</strong> точек доступа</span>
          </div>

          {loading && <div className="tender-skud-state">Загрузка событий из FOT…</div>}
          {!loading && error && <div className="tender-skud-state error">{error}</div>}
          {!loading && !error && groupedEvents.length === 0 && (
            <div className="tender-skud-state muted">За выбранный месяц событий нет</div>
          )}
          {!loading && !error && groupedEvents.length > 0 && (
            <div className="tender-skud-days">
              {groupedEvents.map(group => (
                <section key={group.date} className="tender-skud-day">
                  <div className="tender-skud-day-head">
                    <strong>{formatEventDate(group.date)}</strong>
                    <span>{group.events.length}</span>
                  </div>
                  <div className="tender-skud-day-events">
                    {group.events.map(event => (
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
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </article>
  )
}

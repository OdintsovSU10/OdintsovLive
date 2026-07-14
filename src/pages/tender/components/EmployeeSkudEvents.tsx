import { useEffect, useMemo, useState } from 'react'
import { fetchFotEmployeeEvents, type FotEmployeeEvent } from '../utils/fotEmployeeEvents'
import {
  calculateFotSkudDay,
  FOT_DEFAULT_LUNCH_SECONDS,
  formatSkudDuration,
  type SkudDayCalculation
} from '../utils/skudTimeCalculation'
import './EmployeeSkudEvents.css'

const monthNames = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
]

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

function toLocalIsoDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getDirectionLabel(direction: FotEmployeeEvent['direction']): string {
  if (direction === 'entry') return 'Вход'
  if (direction === 'exit') return 'Выход'
  return 'Событие'
}

function DayWorkTimeline({ calculation }: { calculation: SkudDayCalculation }) {
  const rangeStart = calculation.rangeStartSeconds
  const rangeEnd = calculation.rangeEndSeconds
  if (rangeStart === null || rangeEnd === null || rangeEnd <= rangeStart) return null

  const rangeSeconds = rangeEnd - rangeStart
  return (
    <div className="tender-skud-work-visual">
      <div className="tender-skud-work-visual-head">
        <span>Присутствие по закрытым парам</span>
        <strong>{formatSkudDuration(calculation.rawWorkSeconds)}</strong>
      </div>
      <div className="tender-skud-work-track" aria-label="Интервалы присутствия сотрудника">
        {calculation.pairs.map(pair => {
          const left = ((pair.startSeconds - rangeStart) / rangeSeconds) * 100
          const width = Math.max(1.2, (pair.durationSeconds / rangeSeconds) * 100)
          return (
            <span
              key={`${pair.entry.id}-${pair.exit?.id || 'now'}`}
              className={`tender-skud-work-segment ${pair.isOpen ? 'open' : ''}`}
              style={{ left: `${left}%`, width: `${Math.min(width, 100 - left)}%` }}
              title={`${formatEventTime(pair.entry.event_time)}–${pair.exit ? formatEventTime(pair.exit.event_time) : 'сейчас'} · ${formatSkudDuration(pair.durationSeconds)}`}
            />
          )
        })}
      </div>
      <div className="tender-skud-work-scale">
        <span>{formatEventTime(calculation.pairs[0].entry.event_time)}</span>
        <span>{calculation.hasOpenPair ? 'сейчас' : formatEventTime(calculation.pairs[calculation.pairs.length - 1].exit!.event_time)}</span>
      </div>
    </div>
  )
}

export function EmployeeSkudEvents({
  fotEmployeeId,
  year,
  month,
  selectedDate
}: {
  fotEmployeeId: string | null
  year: number
  month: number
  selectedDate: string | null
}) {
  const [events, setEvents] = useState<FotEmployeeEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

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

  const eventsByDate = useMemo(() => {
    const grouped = new Map<string, FotEmployeeEvent[]>()
    for (const event of events) {
      const dayEvents = grouped.get(event.event_date) || []
      dayEvents.push(event)
      grouped.set(event.event_date, dayEvents)
    }
    for (const dayEvents of grouped.values()) {
      dayEvents.sort((left, right) => left.event_time.localeCompare(right.event_time))
    }
    return grouped
  }, [events])

  useEffect(() => {
    if (selectedDate !== toLocalIsoDate(new Date())) return
    const update = () => setNow(Date.now())
    update()
    const interval = window.setInterval(update, 1000)
    return () => window.clearInterval(interval)
  }, [selectedDate])

  const selectedEvents = useMemo(
    () => selectedDate ? eventsByDate.get(selectedDate) || [] : [],
    [eventsByDate, selectedDate]
  )
  const calculation = useMemo(
    () => selectedDate ? calculateFotSkudDay(selectedEvents, selectedDate, new Date(now)) : null,
    [now, selectedDate, selectedEvents]
  )
  const pairByExitId = useMemo(() => new Map(
    calculation?.pairs
      .filter(pair => pair.exit)
      .map(pair => [pair.exit!.id, pair]) || []
  ), [calculation])
  const breakByEntryId = useMemo(() => new Map(
    calculation?.breaks.map(item => [item.beforeEntry.id, item]) || []
  ), [calculation])

  return (
    <article id="employee-skud-events" className="tender-skud-events">
      <div className="tender-skud-events-head">
        <div>
          <div className="tender-skud-events-title-line">
            <h3>События СКУД</h3>
            <span className="tender-skud-source">FOT</span>
          </div>
          <p>Выберите день в строке табеля выше</p>
        </div>
        <span className="tender-skud-period-label">{monthNames[month - 1]} {year}</span>
      </div>

      {!fotEmployeeId ? (
        <div className="tender-skud-state muted">
          У сотрудника нет FOT ID. Обновите его через синхронизацию сотрудников.
        </div>
      ) : loading ? (
        <div className="tender-skud-state">Загрузка событий из FOT…</div>
      ) : error ? (
        <div className="tender-skud-state error">{error}</div>
      ) : !selectedDate ? (
        <div className="tender-skud-state muted">Нажмите на день в табеле, чтобы открыть события</div>
      ) : (
        <section className="tender-skud-selected-day">
          <div className="tender-skud-selected-head">
            <div>
              <span>Выбранный день</span>
              <strong>{formatEventDate(selectedDate)}</strong>
            </div>
            <span className="tender-skud-selected-count">
              {selectedEvents.length} событий
            </span>
          </div>

          {!calculation || selectedEvents.length === 0 ? (
            <div className="tender-skud-selected-empty">В этот день событий СКУД нет</div>
          ) : (
            <>
              <div className="tender-skud-day-overview">
                <div className="tender-skud-paid-time">
                  <span>Учтено по FOT</span>
                  <strong>{formatSkudDuration(calculation.paidSeconds)}</strong>
                  <small>
                    {formatSkudDuration(calculation.rawWorkSeconds)} в парах
                    {' − '}{formatSkudDuration(calculation.lunchDeductionSeconds)} довычтено на обед
                  </small>
                </div>
                <div className="tender-skud-day-metric entry">
                  <span>Первый вход</span>
                  <strong>{calculation.firstEntry ? formatEventTime(calculation.firstEntry.event_time) : '—'}</strong>
                </div>
                <div className="tender-skud-day-metric exit">
                  <span>Последний выход</span>
                  <strong>{calculation.hasOpenPair ? 'На объекте' : calculation.lastExit ? formatEventTime(calculation.lastExit.event_time) : '—'}</strong>
                </div>
                <div className="tender-skud-day-metric break">
                  <span>Вне объекта</span>
                  <strong>{formatSkudDuration(calculation.outsideSeconds)}</strong>
                </div>
              </div>

              <DayWorkTimeline calculation={calculation} />

              <div className="tender-skud-rule-note">
                <span>Расчёт FOT</span>
                Только закрытые пары вход–выход. Перерывы покрывают часовую обеденную квоту;
                непарные проходы в рабочее время не входят.
              </div>

              <div className="tender-skud-event-list">
                {calculation.events.map(event => {
                  const breakBefore = breakByEntryId.get(event.id)
                  const pair = pairByExitId.get(event.id)
                  return (
                    <div key={event.id} className="tender-skud-event-block">
                      {breakBefore && (
                        <div className="tender-skud-break-row">
                          <span />
                          <b>Перерыв вне объекта</b>
                          <strong>{formatSkudDuration(breakBefore.durationSeconds)}</strong>
                        </div>
                      )}
                      <div className={`tender-skud-event ${event.direction || 'unknown'}`}>
                        <span className="tender-skud-event-mark">
                          {event.direction === 'entry' ? '→' : event.direction === 'exit' ? '←' : '•'}
                        </span>
                        <time>{formatEventTime(event.event_time)}</time>
                        <span className="tender-skud-direction">{getDirectionLabel(event.direction)}</span>
                        <span className="tender-skud-point">{event.access_point || 'Точка не указана'}</span>
                        {pair && <strong className="tender-skud-pair-duration">{formatSkudDuration(pair.durationSeconds)}</strong>}
                      </div>
                    </div>
                  )
                })}
              </div>

              {(calculation.ignoredEvents > 0 || calculation.hasOpenPair) && (
                <div className="tender-skud-calculation-flags">
                  {calculation.hasOpenPair && <span className="live">Открытая пара считается до текущего времени</span>}
                  {calculation.ignoredEvents > 0 && (
                    <span>{calculation.ignoredEvents} непарных событий не вошли в расчёт</span>
                  )}
                </div>
              )}
              <span className="tender-skud-lunch-source">
                Обеденная квота: {formatSkudDuration(FOT_DEFAULT_LUNCH_SECONDS)}
              </span>
            </>
          )}
        </section>
      )}
    </article>
  )
}

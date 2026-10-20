import { useEffect, useMemo, useState } from 'react'
import type { DayClass } from '../../utils/attendanceDay'
import type { FotEmployeeEvent } from '../../utils/fotEmployeeEvents'
import {
  calculateFotSkudDay,
  FOT_DEFAULT_LUNCH_SECONDS,
  formatSkudDuration,
  type SkudDayCalculation
} from '../../utils/skudTimeCalculation'
import type { EmployeeSkudMonth } from '../../hooks/useEmployeeSkudMonth'
import { formatHoursValue, toIsoDate } from '../../utils/employeeFormat'

function formatEventTime(value: string): string {
  return value.slice(0, 5)
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
    <div className="emp-timeline">
      <div className="emp-timeline-head">
        <span>Интервалы присутствия</span>
        <strong>{formatSkudDuration(calculation.rawWorkSeconds)}</strong>
      </div>
      <div className="emp-timeline-track" aria-label="Интервалы присутствия сотрудника">
        {calculation.pairs.map(pair => {
          const left = ((pair.startSeconds - rangeStart) / rangeSeconds) * 100
          const width = Math.max(1.2, (pair.durationSeconds / rangeSeconds) * 100)
          return (
            <span
              key={`${pair.entry.id}-${pair.exit?.id || 'now'}`}
              className={`emp-timeline-segment ${pair.isOpen ? 'open' : ''}`}
              style={{ left: `${left}%`, width: `${Math.min(width, 100 - left)}%` }}
              title={`${formatEventTime(pair.entry.event_time)}–${pair.exit ? formatEventTime(pair.exit.event_time) : 'сейчас'} · ${formatSkudDuration(pair.durationSeconds)}`}
            />
          )
        })}
      </div>
      <div className="emp-timeline-scale">
        <span>{formatEventTime(calculation.pairs[0].entry.event_time)}</span>
        <span>{calculation.hasOpenPair ? 'сейчас' : formatEventTime(calculation.pairs[calculation.pairs.length - 1].exit!.event_time)}</span>
      </div>
    </div>
  )
}

interface Props {
  fotEmployeeId: string | null
  // ISO-дата выбранного дня
  date: string | null
  info: DayClass | null
  skud: EmployeeSkudMonth
}

export function DayPassesPanel({ fotEmployeeId, date, info, skud }: Props) {
  const { eventsByDate, loading, error, reload } = skud
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const today = new Date()
    if (date !== toIsoDate(today.getFullYear(), today.getMonth() + 1, today.getDate())) return undefined
    const update = () => setNow(Date.now())
    update()
    const interval = window.setInterval(update, 1000)
    return () => window.clearInterval(interval)
  }, [date])

  const dayEvents = useMemo(
    () => (date && fotEmployeeId ? eventsByDate.get(date) || [] : []),
    [date, eventsByDate, fotEmployeeId]
  )
  const calculation = useMemo(
    () => (date && dayEvents.length > 0 ? calculateFotSkudDay(dayEvents, date, new Date(now)) : null),
    [date, dayEvents, now]
  )
  const pairByExitId = useMemo(() => new Map(
    calculation?.pairs.filter(pair => pair.exit).map(pair => [pair.exit!.id, pair]) || []
  ), [calculation])
  const breakByEntryId = useMemo(() => new Map(
    calculation?.breaks.map(item => [item.beforeEntry.id, item]) || []
  ), [calculation])

  if (!date) {
    return <div className="emp-state muted">Выберите день</div>
  }

  const timesheetText = info?.worked && !info.fromSkud ? `${formatHoursValue(info.hours)} ч` : '—'
  const skudText = calculation ? `${formatHoursValue(Math.round(calculation.paidSeconds / 360) / 10)} ч` : '—'
  // «6 из 8 ч, неполный день»
  const hoursLine = info?.worked
    ? [
      info.off ? `${formatHoursValue(info.hours)} ч` : `${formatHoursValue(info.hours)} из ${info.norm} ч`,
      info.verdict
    ].filter(Boolean).join(', ')
    : null

  return (
    <div className="emp-day-panel-body">
      <div className="emp-day-status">
        {info && info.statusLabel && <span className={`emp-day-chip tone-${info.tone}`}>{info.statusLabel}</span>}
        {hoursLine && <span className="emp-day-hours">{hoursLine}</span>}
      </div>

      {fotEmployeeId && (info?.worked || calculation) && (
        <p className="emp-day-compare">
          Табель: {timesheetText} · СКУД: {skudText}
          {info?.mismatch && <span className="emp-day-flag warn"><i className="emp-day-dot static" aria-hidden="true" />расхождение от 2 ч</span>}
          {info?.corrected && <span className="emp-day-flag">✎ исправлено вручную</span>}
        </p>
      )}

      {!fotEmployeeId ? (
        <div className="emp-state muted">Нет FOT ID — проходы недоступны</div>
      ) : loading ? (
        <div className="emp-state">Загрузка проходов…</div>
      ) : error ? (
        <div className="emp-state error">
          <span>{error}</span>
          <button type="button" className="emp-text-btn" onClick={reload}>Повторить</button>
        </div>
      ) : !calculation ? (
        <div className="emp-state muted">Проходов нет</div>
      ) : (
        <>
          <div className="emp-metrics">
            <div>
              <span>Первый вход</span>
              <strong>{calculation.firstEntry ? formatEventTime(calculation.firstEntry.event_time) : '—'}</strong>
            </div>
            <div>
              <span>{calculation.hasOpenPair ? 'Выход' : 'Последний выход'}</span>
              <strong>{calculation.hasOpenPair ? 'На объекте' : calculation.lastExit ? formatEventTime(calculation.lastExit.event_time) : '—'}</strong>
            </div>
            <div>
              <span>Оплачиваемо</span>
              <strong>{formatSkudDuration(calculation.paidSeconds)}</strong>
            </div>
            <div>
              <span>Вне объекта</span>
              <strong>{formatSkudDuration(calculation.outsideSeconds)}</strong>
            </div>
          </div>

          <DayWorkTimeline calculation={calculation} />

          <ul className="emp-passes">
            {calculation.events.map(event => {
              const breakBefore = breakByEntryId.get(event.id)
              const pair = pairByExitId.get(event.id)
              return (
                <li key={event.id}>
                  {breakBefore && (
                    <div className="emp-pass-break">
                      <span>Перерыв вне объекта</span>
                      <strong>{formatSkudDuration(breakBefore.durationSeconds)}</strong>
                    </div>
                  )}
                  <div className={`emp-pass ${event.direction || 'unknown'}`}>
                    <span className="emp-pass-mark" aria-hidden="true">
                      {event.direction === 'entry' ? '→' : event.direction === 'exit' ? '←' : '•'}
                    </span>
                    <time>{formatEventTime(event.event_time)}</time>
                    <span className="emp-pass-dir">{getDirectionLabel(event.direction)}</span>
                    <span className="emp-pass-point">{event.access_point || 'Точка не указана'}</span>
                    {pair && <strong className="emp-pass-duration">{formatSkudDuration(pair.durationSeconds)}</strong>}
                  </div>
                </li>
              )
            })}
          </ul>

          {(calculation.ignoredEvents > 0 || calculation.hasOpenPair) && (
            <p className="emp-flags">
              {calculation.hasOpenPair && <span>Открытая пара считается до текущего времени</span>}
              {calculation.ignoredEvents > 0 && <span>{calculation.ignoredEvents} непарных событий не вошли в расчёт</span>}
            </p>
          )}

          <details className="emp-how">
            <summary>Как считается</summary>
            <p>
              Закрытые пары вход–выход; сегодняшняя открытая пара считается до текущего времени.
              Перерывы покрывают часовую обеденную квоту; непарные проходы не входят в расчёт.
            </p>
            <p>
              {formatSkudDuration(calculation.rawWorkSeconds)} в парах
              {' − '}{formatSkudDuration(calculation.lunchDeductionSeconds)} довычтено на обед.
              Обеденная квота: {formatSkudDuration(FOT_DEFAULT_LUNCH_SECONDS)}.
            </p>
            <p>Источник: СКУД, данные FOT.</p>
          </details>
        </>
      )}
    </div>
  )
}

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

// «8 ч 10 м», «50 м», «8 ч»
function formatHm(seconds: number): string {
  const totalMinutes = Math.round(Math.max(0, seconds) / 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes} м`
  return minutes === 0 ? `${hours} ч` : `${hours} ч ${minutes} м`
}

function formatPlural(count: number, one: string, few: string, many: string): string {
  const mod100 = count % 100
  const mod10 = count % 10
  if (mod100 >= 11 && mod100 <= 14) return many
  if (mod10 === 1) return one
  if (mod10 >= 2 && mod10 <= 4) return few
  return many
}

// Перерыв дольше этого считаем заметным
const LONG_BREAK_SECONDS = 30 * 60

const SHOW_INTERNAL_KEY = 'tender.passes.showInternal'

// По умолчанию внутренние проходы показываются
function readShowInternal(): boolean {
  try {
    return window.localStorage.getItem(SHOW_INTERNAL_KEY) !== '0'
  } catch {
    return true
  }
}

function saveShowInternal(value: boolean): void {
  try {
    window.localStorage.setItem(SHOW_INTERNAL_KEY, value ? '1' : '0')
  } catch {
    // хранилище недоступно — настройка живёт до перезагрузки
  }
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
  const [showInternal, setShowInternal] = useState(readShowInternal)

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

  // Внешние и внутренние события вместе, по времени; внутренние можно скрыть
  const listedEvents = useMemo(() => {
    if (!calculation) return []
    if (!showInternal || calculation.internalEvents.length === 0) return calculation.events
    return [...calculation.events, ...calculation.internalEvents].sort((left, right) => (
      left.event_time.localeCompare(right.event_time) || left.id.localeCompare(right.id)
    ))
  }, [calculation, showInternal])

  const handleShowInternal = (value: boolean) => {
    setShowInternal(value)
    saveShowInternal(value)
  }

  if (!date) {
    return <div className="emp-day-body"><div className="emp-state muted">Выберите день</div></div>
  }

  const timesheetText = info?.worked && !info.fromSkud ? `${formatHoursValue(info.hours)} ч` : '—'
  const skudText = calculation ? `${formatHoursValue(Math.round(calculation.paidSeconds / 360) / 10)} ч` : '—'
  // Оплачиваемое время: по табелю (как в календаре), без записи — по проходам СКУД
  const heroSeconds = info?.worked ? Math.round(info.hours * 3600) : calculation ? calculation.paidSeconds : null
  const normSeconds = info && !info.off ? Math.round(info.norm * 3600) : 0
  const shortSeconds = info?.kind === 'partial' && heroSeconds !== null && normSeconds > heroSeconds
    ? normSeconds - heroSeconds
    : 0
  const statusText = info ? [info.statusLabel, info.verdict].filter(Boolean).join(' · ') : ''
  const rangeText = calculation
    ? `${calculation.firstEntry ? formatEventTime(calculation.firstEntry.event_time) : '—'} → ${
      calculation.hasOpenPair ? 'на объекте' : calculation.lastExit ? formatEventTime(calculation.lastExit.event_time) : '—'
    }`
    : null

  return (
    <div className="emp-day-body">
      {heroSeconds !== null ? (
        <div className="emp-day-hero">
          <div className="emp-day-hero-main">
            <strong>{formatHm(heroSeconds)}</strong>
            <span>оплачиваемо</span>
          </div>
          <div className="emp-day-hero-side">
            {normSeconds > 0 && <span className="emp-day-norm">из {formatHm(normSeconds)} нормы</span>}
            {info && statusText && <span className={`emp-day-chip tone-${info.tone}`}>{statusText}</span>}
            {shortSeconds > 0 && <span className="emp-day-short">−{formatHm(shortSeconds)}</span>}
          </div>
        </div>
      ) : (
        info && statusText && (
          <div className="emp-day-hero-side">
            <span className={`emp-day-chip tone-${info.tone}`}>{statusText}</span>
          </div>
        )
      )}

      {calculation && (
        <div className="emp-metrics">
          <div>
            <span>На объекте</span>
            <strong>{formatHm(calculation.rawWorkSeconds)}</strong>
          </div>
          <div>
            <span>Вне офиса</span>
            <strong>{formatHm(calculation.outsideSeconds)}</strong>
            <em>{calculation.breaks.length} {formatPlural(calculation.breaks.length, 'выход', 'выхода', 'выходов')}</em>
          </div>
          {calculation.lunchDeductionSeconds > 0 && (
            <div>
              <span>Обед засчитан</span>
              <strong>{formatHm(calculation.lunchDeductionSeconds)}</strong>
            </div>
          )}
        </div>
      )}

      {fotEmployeeId && (info?.worked || calculation) && (
        <div className="emp-day-meta">
          {rangeText && <p className="emp-day-range">{rangeText}</p>}
          <p className={`emp-day-compare ${info?.mismatch ? 'warn' : ''}`}>
            Табель: {timesheetText} · СКУД: {skudText}
            {info?.mismatch && <span className="emp-day-flag warn"><i className="emp-day-dot static" aria-hidden="true" />расхождение от 2 ч</span>}
            {info?.corrected && <span className="emp-day-flag">✎ исправлено вручную</span>}
          </p>
        </div>
      )}

      {!fotEmployeeId ? (
        <div className="emp-state muted fill">Нет FOT ID — проходы недоступны</div>
      ) : loading ? (
        <div className="emp-state fill">Загрузка проходов…</div>
      ) : error ? (
        <div className="emp-state error fill">
          <span>{error}</span>
          <button type="button" className="emp-text-btn" onClick={reload}>Повторить</button>
        </div>
      ) : !calculation ? (
        <div className="emp-state muted fill">Проходов нет</div>
      ) : (
        <>
          <DayWorkTimeline calculation={calculation} />

          {calculation.internalEvents.length > 0 && (
            <label className="emp-passes-toggle">
              <input
                type="checkbox"
                checked={showInternal}
                onChange={event => handleShowInternal(event.target.checked)}
              />
              <span>Показывать внутренние проходы</span>
            </label>
          )}

          <ul className="emp-passes">
            {listedEvents.map(event => {
              if (event.is_internal) {
                return (
                  <li
                    key={event.id}
                    className="emp-pass internal"
                    title={`${getDirectionLabel(event.direction)} · внутренняя точка, не учитывается`}
                  >
                    <span className="emp-pass-mark" aria-hidden="true">•</span>
                    <time>{formatEventTime(event.event_time)}</time>
                    <span className="emp-pass-dir">внутр.</span>
                    <span className="emp-pass-point">{event.access_point || 'Точка не указана'}</span>
                    <span />
                  </li>
                )
              }
              const breakBefore = breakByEntryId.get(event.id)
              const pair = pairByExitId.get(event.id)
              return (
                <li key={event.id} className={`emp-pass ${event.direction || 'unknown'}`}>
                  <span className="emp-pass-mark" aria-hidden="true">
                    {event.direction === 'entry' ? '→' : event.direction === 'exit' ? '←' : '•'}
                  </span>
                  <time>{formatEventTime(event.event_time)}</time>
                  <span className="emp-pass-dir">{getDirectionLabel(event.direction)}</span>
                  <span className="emp-pass-point">{event.access_point || 'Точка не указана'}</span>
                  {breakBefore ? (
                    <strong className={`emp-pass-duration ${breakBefore.durationSeconds > LONG_BREAK_SECONDS ? 'warn' : 'muted'}`}>
                      вне {formatHm(breakBefore.durationSeconds)}
                    </strong>
                  ) : pair ? (
                    <strong className="emp-pass-duration">{formatSkudDuration(pair.durationSeconds)}</strong>
                  ) : (
                    <span />
                  )}
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
            <p>Внутренние точки (коридоры, двери внутри офиса) не учитываются — как в FOT.</p>
            <p>Источник: СКУД, данные FOT.</p>
          </details>
        </>
      )}
    </div>
  )
}

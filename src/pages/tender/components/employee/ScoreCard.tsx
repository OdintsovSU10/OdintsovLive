import { useState } from 'react'
import { Info } from 'lucide-react'
import {
  getScoreSignals,
  SCORE_MAX,
  SCORE_MIN_PLANNED_DAYS,
  SCORE_SIGNAL_LABELS,
  SCORE_WINDOW_DAYS,
  type EmployeeScoreView,
  type WindowScore
} from '../../utils/employeeScore'
import { formatShortDate } from '../../utils/employeeFormat'

const RING_RADIUS = 42
const RING_LENGTH = 2 * Math.PI * RING_RADIUS

interface Props {
  view: EmployeeScoreView | null
  loading: boolean
  error: string | null
  noRaiseMonths: number
  onRetry: () => void
}

interface ComponentRow {
  key: string
  label: string
  points: number
  max: number
}

// Порядок и подписи компонентов; ключ, которого нет в данных оценки, пропускается
const COMPONENT_LABELS: ReadonlyArray<readonly [string, string]> = [
  ['attendance', 'Явка'],
  ['hours', 'Часы'],
  ['breaks', 'Перерывы'],
  ['overtime', 'Сверх нормы'],
  ['peer', 'Отдача к отделу']
]

function getRows(score: WindowScore): ComponentRow[] {
  const maxByKey: Record<string, number | undefined> = SCORE_MAX
  const pointsByKey = score as unknown as Record<string, unknown>
  const rows: ComponentRow[] = []
  for (const [key, label] of COMPONENT_LABELS) {
    const max = maxByKey[key]
    const points = pointsByKey[key]
    if (max === undefined || typeof points !== 'number') continue
    rows.push({ key, label, points, max })
  }
  return rows
}

function formatDelta(delta: number): { text: string; tone: 'up' | 'down' | 'flat' } {
  if (delta > 0) return { text: `▲ +${delta} за месяц`, tone: 'up' }
  if (delta < 0) return { text: `▼ −${Math.abs(delta)} за месяц`, tone: 'down' }
  return { text: '= без изменений за месяц', tone: 'flat' }
}

function ScoreRing({ total, tone }: { total: number | null; tone: string }) {
  const filled = total === null ? 0 : (Math.min(100, total) / 100) * RING_LENGTH
  return (
    <div className="emp-score-ring" aria-hidden="true">
      <svg viewBox="0 0 100 100">
        <circle className="track" cx="50" cy="50" r={RING_RADIUS} />
        <circle
          className={`value ${tone}`}
          cx="50"
          cy="50"
          r={RING_RADIUS}
          strokeDasharray={`${filled} ${RING_LENGTH}`}
          transform="rotate(-90 50 50)"
        />
      </svg>
      <strong className={total === null ? 'muted' : ''}>{total ?? '—'}</strong>
    </div>
  )
}

export function ScoreCard({ view, loading, error, noRaiseMonths, onRetry }: Props) {
  const [infoOpen, setInfoOpen] = useState(false)
  const score = view?.current ?? null

  const infoButton = (
    <button
      type="button"
      className="emp-score-info-btn"
      onClick={() => setInfoOpen(value => !value)}
      aria-expanded={infoOpen}
      aria-controls="emp-score-info"
      aria-label="Как считается оценка"
    >
      <Info size={16} aria-hidden="true" />
    </button>
  )

  if (error) {
    return (
      <section className="emp-card emp-score" aria-label="Оценка сотрудника">
        <div className="emp-score-top">
          <h3 className="emp-score-title">Оценка сотрудника</h3>
          {infoButton}
        </div>
        <div className="emp-state error">
          <span>{error}</span>
          <button type="button" className="emp-text-btn" onClick={onRetry}>Повторить</button>
        </div>
      </section>
    )
  }

  if (loading || !score) {
    return (
      <section className="emp-card emp-score" aria-label="Оценка сотрудника" aria-busy="true">
        <div className="emp-score-top">
          <span className="emp-score-skeleton ring" />
          <div className="emp-score-side">
            <span className="emp-score-skeleton line short" />
            <span className="emp-score-skeleton line" />
          </div>
          {infoButton}
        </div>
        <div className="emp-score-rows">
          {COMPONENT_LABELS.slice(0, 4).map(([key]) => <span key={key} className="emp-score-skeleton row" />)}
        </div>
      </section>
    )
  }

  const insufficient = score.state === 'insufficient'
  const tone = score.grade ? `score-${score.grade.key}` : 'score-none'
  const signals = getScoreSignals(score, noRaiseMonths)
  const delta = view && view.delta !== null ? formatDelta(view.delta) : null
  const rows = insufficient ? [] : getRows(score)

  return (
    <section className={`emp-card emp-score ${tone}`} aria-label="Оценка сотрудника">
      <div className="emp-score-top">
        <ScoreRing total={score.total} tone={tone} />
        <div className="emp-score-side">
          <h3 className="emp-visually-hidden">Оценка сотрудника</h3>
          <div className="emp-score-line">
            {insufficient ? (
              <>
                <span className="emp-score-grade muted">Мало данных</span>
                <span className="emp-score-meta">
                  Плановых дней в табеле {score.planned} из {SCORE_MIN_PLANNED_DAYS} нужных
                </span>
              </>
            ) : (
              <>
                <span className="emp-score-grade">{score.grade?.label}</span>
                {score.rank !== null && score.rankTotal > 1 && (
                  <span className="emp-score-meta">{score.rank}-е из {score.rankTotal} в отделе</span>
                )}
                {delta && <span className={`emp-score-delta ${delta.tone}`}>{delta.text}</span>}
              </>
            )}
            {signals.length > 0 && (
              <ul className="emp-score-signals">
                {signals.map(signal => (
                  <li key={signal} className={`signal-${signal}`}>{SCORE_SIGNAL_LABELS[signal]}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
        {infoButton}
      </div>

      {rows.length > 0 && (
        <ul className="emp-score-rows">
          {rows.map(item => (
            <li key={item.key}>
              <span className="label">{item.label}</span>
              <span className="value">{Math.round(item.points)}/{item.max}</span>
              <span className="bar" aria-hidden="true">
                <i style={{ width: `${(item.points / item.max) * 100}%` }} />
              </span>
            </li>
          ))}
        </ul>
      )}
      {!insufficient && score.lowPeers && <p className="emp-score-note">Мало данных по отделу</p>}

      {infoOpen && (
        <div id="emp-score-info" className="emp-hint emp-score-info">
          <p>
            Окно: {SCORE_WINDOW_DAYS} дней по вчера ({formatShortDate(score.window.from, false)} – {formatShortDate(score.window.to)}).
            Сегодняшний день, отпуска, больничные, выходные и дни без записи в табеле не учитываются.
          </p>
          <p>
            <b>Явка ({SCORE_MAX.attendance})</b> — доля полных дней; неполный день считается за 60%, за каждую неявку минус 5 баллов.
          </p>
          <p>
            <b>Часы ({SCORE_MAX.hours})</b> — отработанные часы по сравнению с нормой этих дней.
          </p>
          <p>
            <b>Перерывы ({SCORE_MAX.breaks})</b> — по дням с явкой (кроме удалёнки) с данными СКУД: время вне офиса сверх 60 минут
            и выходы сверх 2 в день снижают баллы (60% веса — время, 40% — выходы). Меньше 10 дней со СКУД — нейтральные 5 баллов.
          </p>
          <p>
            <b>Сверх нормы ({SCORE_MAX.overtime})</b> — работа в выходные и часы сверх нормы дня; максимум даёт примерно 4 таких вклада на 60 рабочих дней.
          </p>
          <p>
            <b>Отдача к отделу ({SCORE_MAX.peer})</b> — выработка в сравнении с коллегами отдела и их окладами:
            выше, когда отдача больше, чем у коллег, а оклад не выше. Если коллег меньше трёх — 10 баллов.
          </p>
          <p>
            Для оценки нужно не меньше {SCORE_MIN_PLANNED_DAYS} плановых дней в окне.
          </p>
        </div>
      )}
    </section>
  )
}

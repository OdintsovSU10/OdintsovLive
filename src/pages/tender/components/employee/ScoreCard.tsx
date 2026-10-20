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

function getRows(score: WindowScore): ComponentRow[] {
  return [
    { key: 'attendance', label: 'Явка', points: score.attendance, max: SCORE_MAX.attendance },
    { key: 'hours', label: 'Часы', points: score.hours, max: SCORE_MAX.hours },
    { key: 'overtime', label: 'Сверх нормы', points: score.overtime, max: SCORE_MAX.overtime },
    { key: 'peer', label: 'Отдача к отделу', points: score.peer, max: SCORE_MAX.peer }
  ]
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

  const header = (
    <div className="emp-card-head">
      <h3>Оценка сотрудника</h3>
      <button
        type="button"
        className="emp-icon-btn"
        onClick={() => setInfoOpen(value => !value)}
        aria-expanded={infoOpen}
        aria-controls="emp-score-info"
        aria-label="Как считается оценка"
      >
        <Info size={18} aria-hidden="true" />
      </button>
    </div>
  )

  if (error) {
    return (
      <section className="emp-card emp-score" aria-label="Оценка сотрудника">
        {header}
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
        {header}
        <div className="emp-score-main">
          <span className="emp-score-skeleton ring" />
          <div className="emp-score-side">
            <span className="emp-score-skeleton line" />
            <span className="emp-score-skeleton line short" />
          </div>
        </div>
        <div className="emp-score-rows">
          {[0, 1, 2, 3].map(index => <span key={index} className="emp-score-skeleton row" />)}
        </div>
      </section>
    )
  }

  const insufficient = score.state === 'insufficient'
  const tone = score.grade ? `score-${score.grade.key}` : 'score-none'
  const signals = getScoreSignals(score, noRaiseMonths)
  const delta = view && view.delta !== null ? formatDelta(view.delta) : null

  return (
    <section className={`emp-card emp-score ${tone}`} aria-label="Оценка сотрудника">
      {header}

      <div className="emp-score-main">
        <ScoreRing total={score.total} tone={tone} />
        <div className="emp-score-side">
          {insufficient ? (
            <>
              <p className="emp-score-grade muted">Мало данных</p>
              <p className="emp-score-meta">
                Плановых дней в табеле {score.planned} из {SCORE_MIN_PLANNED_DAYS} нужных
              </p>
            </>
          ) : (
            <>
              <p className="emp-score-grade">{score.grade?.label}</p>
              {score.rank !== null && score.rankTotal > 1 && (
                <p className="emp-score-meta">{score.rank}-е из {score.rankTotal} в отделе</p>
              )}
              {delta && <p className={`emp-score-delta ${delta.tone}`}>{delta.text}</p>}
            </>
          )}
        </div>
      </div>

      {signals.length > 0 && (
        <ul className="emp-score-signals">
          {signals.map(signal => (
            <li key={signal} className={`signal-${signal}`}>{SCORE_SIGNAL_LABELS[signal]}</li>
          ))}
        </ul>
      )}

      {!insufficient && (
        <ul className="emp-score-rows">
          {getRows(score).map(item => (
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
            <b>Явка (45)</b> — доля полных дней; неполный день считается за 60%, за каждую неявку минус 5 баллов.
          </p>
          <p>
            <b>Часы (25)</b> — отработанные часы по сравнению с нормой этих дней.
          </p>
          <p>
            <b>Сверх нормы (10)</b> — работа в выходные и часы сверх нормы дня; максимум даёт примерно 4 таких вклада на 60 рабочих дней.
          </p>
          <p>
            <b>Отдача к отделу (20)</b> — выработка в сравнении с коллегами отдела и их окладами:
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

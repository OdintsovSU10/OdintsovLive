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
import { ScoreRing } from './ScoreRing'
import { SIGNAL_ICONS } from './scoreSignalIcons'

interface Props {
  view: EmployeeScoreView | null
  error: string | null
  noRaiseMonths: number
  onRetry: () => void
  // Перейти к «Динамике за год» в режиме «Оценка»
  onShowMonthly: () => void
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

// «1 выход», «2 выхода», «5 выходов»; дробное число — «выхода»
function formatExits(value: number): string {
  const rounded = Math.round(value * 10) / 10
  const text = rounded.toLocaleString('ru-RU')
  if (!Number.isInteger(rounded)) return `${text} выхода`
  const lastTwo = rounded % 100
  const last = rounded % 10
  if (lastTwo >= 11 && lastTwo <= 14) return `${text} выходов`
  if (last === 1) return `${text} выход`
  if (last >= 2 && last <= 4) return `${text} выхода`
  return `${text} выходов`
}

function getRowNote(key: string, score: WindowScore): string | null {
  if (key === 'breaks') {
    if (score.noSkud) return 'нет данных СКУД'
    return `≈ ${Math.round(score.avgOutsideMinutes)} мин вне офиса · ${formatExits(score.avgExits)} в день`
  }
  if (key === 'peer' && score.lowPeers) return 'мало данных по отделу'
  return null
}

// Тело подсказки «Как складывается оценка»: итог, компоненты, пояснение формулы
export function ScoreBreakdown({ view, error, noRaiseMonths, onRetry, onShowMonthly }: Props) {
  const score = view?.current ?? null

  if (error) {
    return (
      <div className="emp-score-breakdown">
        <div className="emp-state error">
          <span>{error}</span>
          <button type="button" className="emp-text-btn" onClick={onRetry}>Повторить</button>
        </div>
      </div>
    )
  }

  if (!score) {
    return (
      <div className="emp-score-breakdown">
        <div className="emp-state muted">Оценка загружается</div>
      </div>
    )
  }

  const insufficient = score.state === 'insufficient'
  const tone = score.grade ? `score-${score.grade.key}` : 'score-none'
  const signals = getScoreSignals(score, noRaiseMonths)
  const delta = view && view.delta !== null ? formatDelta(view.delta) : null
  const rows = insufficient ? [] : getRows(score)

  return (
    <div className={`emp-score-breakdown ${tone}`}>
      <div className="emp-score-top">
        <ScoreRing total={score.total} className={tone} />
        <div className="emp-score-side">
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
        </div>
      </div>

      {signals.length > 0 && (
        <ul className="emp-score-signals">
          {signals.map(signal => {
            const Icon = SIGNAL_ICONS[signal]
            return (
              <li key={signal} className={`signal-${signal}`}>
                <Icon size={12} aria-hidden="true" />
                {SCORE_SIGNAL_LABELS[signal]}
              </li>
            )
          })}
        </ul>
      )}

      {rows.length > 0 && (
        <ul className="emp-score-rows">
          {rows.map(item => {
            const note = getRowNote(item.key, score)
            return (
              <li key={item.key}>
                <span className="label">{item.label}</span>
                <span className="value">{Math.round(item.points)}/{item.max}</span>
                <span className="bar" aria-hidden="true">
                  <i style={{ width: `${(item.points / item.max) * 100}%` }} />
                </span>
                {note && <span className="note">{note}</span>}
              </li>
            )
          })}
        </ul>
      )}

      <div className="emp-score-formula">
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

      <button type="button" className="emp-score-monthly" onClick={onShowMonthly}>
        Оценка по месяцам →
      </button>
    </div>
  )
}

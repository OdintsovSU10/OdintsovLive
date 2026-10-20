import { useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, Info } from 'lucide-react'
import type { EmployeeHistoryPoint } from '../../hooks/useEmployeeDetailData'
import { TIMESHEET_STATUS_META, TIMESHEET_STATUS_ORDER } from '../../utils/timesheetStatus'
import { formatRub, monthIndex, MONTH_SHORT } from '../../utils/employeeFormat'
import type { WindowScore } from '../../utils/employeeScore'

export type DynamicsMode = 'income' | 'score'

interface Props {
  year: number
  month: number
  history: EmployeeHistoryPoint[]
  loading: boolean
  error: string | null
  averageMonthlyIncome: number
  averageWeekendIncome: number
  hasYearData: boolean
  // Границы выбора: первый месяц по дате найма (null — без ограничения) и текущий
  minIndex: number | null
  maxIndex: number
  canPrevYear: boolean
  canNextYear: boolean
  // Помесячная оценка года; null — ещё не загружена
  scoreMonthly: Array<WindowScore | null> | null
  scoreLoading: boolean
  scoreError: string | null
  // Режим графика хранится выше: подсказка оценки переключает его на «Оценка»
  mode: DynamicsMode
  onModeChange: (mode: DynamicsMode) => void
  onSelectMonth: (month: number) => void
  onShiftYear: (direction: -1 | 1) => void
  onRetry: () => void
  onRetryScore: () => void
}

export function YearDynamics({
  year,
  month,
  history,
  loading,
  error,
  averageMonthlyIncome,
  averageWeekendIncome,
  hasYearData,
  minIndex,
  maxIndex,
  canPrevYear,
  canNextYear,
  scoreMonthly,
  scoreLoading,
  scoreError,
  mode,
  onModeChange,
  onSelectMonth,
  onShiftYear,
  onRetry,
  onRetryScore
}: Props) {
  const [averageInfoOpen, setAverageInfoOpen] = useState(false)
  const [compositionOpen, setCompositionOpen] = useState(false)

  const isScore = mode === 'score'
  const chartLoading = isScore ? scoreLoading : loading
  const chartError = isScore ? scoreError : error
  const handleRetry = isScore ? onRetryScore : onRetry
  const selected = history[month - 1]
  const selectedScore = scoreMonthly?.[month - 1] ?? null
  const monthName = `${MONTH_SHORT[month - 1][0].toUpperCase()}${MONTH_SHORT[month - 1].slice(1)}`
  const maxEarned = Math.max(1, ...history.map(point => point.earned), averageMonthlyIncome)
  const averageBottom = hasYearData ? (averageMonthlyIncome / maxEarned) * 100 : null

  const other = selected?.hasTimesheet
    ? Math.max(0, Math.round(selected.earned - selected.workdaysSalary - selected.weekendBonus - selected.transportPayment))
    : 0

  return (
    <section className="emp-card emp-dynamics" aria-label="Динамика за год">
      <div className="emp-card-head">
        <h3>Динамика за год</h3>
        <div className="emp-year-nav">
          <button type="button" className="emp-icon-btn" onClick={() => onShiftYear(-1)} disabled={!canPrevYear} aria-label="Предыдущий год">
            <ChevronLeft size={20} aria-hidden="true" />
          </button>
          <span>{year}</span>
          <button type="button" className="emp-icon-btn" onClick={() => onShiftYear(1)} disabled={!canNextYear} aria-label="Следующий год">
            <ChevronRight size={20} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="emp-segment" role="group" aria-label="Что показывать на графике">
        <button type="button" aria-pressed={!isScore} onClick={() => onModeChange('income')}>Начисления</button>
        <button type="button" aria-pressed={isScore} onClick={() => onModeChange('score')}>Оценка</button>
      </div>

      {!isScore && (
        <>
          <div className="emp-average">
            <span>
              Среднее <strong>{loading ? '—' : formatRub(averageMonthlyIncome)}</strong>/мес
            </span>
            <button
              type="button"
              className="emp-icon-btn"
              onClick={() => setAverageInfoOpen(value => !value)}
              aria-expanded={averageInfoOpen}
              aria-label="Пояснение к среднему"
            >
              <Info size={18} aria-hidden="true" />
            </button>
          </div>
          {averageInfoOpen && (
            <p className="emp-hint">
              {hasYearData
                ? `По выходным в среднем ${formatRub(averageWeekendIncome)}/мес. Среднее считается по месяцам с табелем.`
                : 'Нет данных табеля за выбранный год'}
            </p>
          )}
        </>
      )}

      {chartError ? (
        <div className="emp-state error">
          <span>{chartError}</span>
          <button type="button" className="emp-text-btn" onClick={handleRetry}>Повторить</button>
        </div>
      ) : (
        <div className="emp-bars" aria-busy={chartLoading}>
          {!isScore && averageBottom !== null && !loading && (
            <div className="emp-bars-plot" aria-hidden="true">
              <span className="emp-bars-average" style={{ bottom: `${Math.min(100, averageBottom)}%` }} />
            </div>
          )}
          {Array.from({ length: 12 }, (_, index) => {
            const point = history[index]
            const monthScore = scoreMonthly?.[index] ?? null
            const barMonth = index + 1
            const idx = monthIndex(year, barMonth)
            const disabled = chartLoading || idx > maxIndex || (minIndex !== null && idx < minIndex)
            const isSelected = barMonth === month
            const hasData = isScore ? monthScore !== null : !!point?.hasTimesheet
            const value = isScore ? monthScore?.total ?? 0 : point?.earned ?? 0
            const heightPercent = hasData
              ? Math.max(4, isScore ? value : (value / maxEarned) * 100)
              : 0
            const toneClass = isScore && monthScore?.grade ? `score-${monthScore.grade.key}` : ''
            let label = `${MONTH_SHORT[index]} ${year}: табель не загружен`
            if (isScore) {
              label = monthScore
                ? `${MONTH_SHORT[index]} ${year}: оценка ${monthScore.total}, ${monthScore.grade?.label}`
                : `${MONTH_SHORT[index]} ${year}: оценка недоступна, мало данных`
            } else if (hasData) {
              label = `${MONTH_SHORT[index]} ${year}: ${formatRub(value)}`
            }
            return (
              <button
                key={barMonth}
                type="button"
                className={`emp-bar ${toneClass} ${isSelected ? 'selected' : ''} ${hasData ? '' : 'empty'} ${chartLoading ? 'skeleton' : ''}`}
                disabled={disabled}
                aria-pressed={isSelected}
                aria-label={label}
                onClick={() => onSelectMonth(barMonth)}
              >
                <span className="emp-bar-area">
                  <span className="emp-bar-fill" style={{ height: chartLoading ? '40%' : hasData ? `${heightPercent}%` : undefined }} />
                </span>
                <span className="emp-bar-label">{MONTH_SHORT[index]}</span>
              </button>
            )
          })}
        </div>
      )}

      <p className="emp-dynamics-summary">
        {isScore
          ? (scoreLoading ? ' ' : selectedScore
            ? `${monthName} · ${selectedScore.total} · ${selectedScore.grade?.label}`
            : 'Оценка за месяц недоступна: мало данных')
          : (loading || !selected ? ' ' : selected.hasTimesheet
            ? `${monthName} · ${formatRub(selected.earned)} · ${selected.workedDays}/${selected.normDays} дн · ${selected.hours.toLocaleString('ru-RU')} ч`
            : 'Табель за месяц не загружен')}
      </p>

      {!isScore && !loading && selected?.hasTimesheet && (
        <>
          <button
            type="button"
            className="emp-text-btn emp-composition-toggle"
            onClick={() => setCompositionOpen(value => !value)}
            aria-expanded={compositionOpen}
          >
            Состав начисления
            <ChevronDown size={16} className={compositionOpen ? 'open' : ''} aria-hidden="true" />
          </button>
          {compositionOpen && (
            <div className="emp-composition">
              <dl>
                <div><dt>Оклад по дням</dt><dd>{formatRub(selected.workdaysSalary)}</dd></div>
                <div><dt>Выходные</dt><dd>{formatRub(selected.weekendBonus)}</dd></div>
                <div><dt>Проезд</dt><dd>{formatRub(selected.transportPayment)}</dd></div>
                <div><dt>Бонус и прочее</dt><dd>{formatRub(other)}</dd></div>
                <div>
                  <dt>Сверх нормы <small>не оплачивается</small></dt>
                  <dd>{selected.overtime.toLocaleString('ru-RU')} ч</dd>
                </div>
              </dl>
              <ul className="emp-status-counts">
                {TIMESHEET_STATUS_ORDER
                  .filter(status => status !== 'work' && selected.statusCounts[status] > 0)
                  .map(status => (
                    <li key={status} title={TIMESHEET_STATUS_META[status].label}>
                      <b>{TIMESHEET_STATUS_META[status].short}</b> {selected.statusCounts[status]}
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  )
}

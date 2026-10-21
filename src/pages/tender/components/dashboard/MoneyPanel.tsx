import { useMemo, useState, type CSSProperties, type FC } from 'react'
import { Wallet } from 'lucide-react'
import type { LivePayrollSnapshot } from '../../utils/livePayroll'
import type { IEmployeeTrend, IMonthSlot } from './dashboardTypes'
import {
  formatCompactMoney,
  formatPercent,
  formatRub,
  formatShortMoney,
  formatSignedPercent,
  formatSignedRub,
  getPercentOf
} from './dashboardFormat'
import { getGrowthPercent, getPayrollTone, isPayrollOverrun, type IScopeSummary } from './dashboardMetrics'

interface IMoneyPanelProps {
  monthSlots: IMonthSlot[]
  trends: IEmployeeTrend[]
  summary: IScopeSummary
  live: LivePayrollSnapshot
}

interface IMonthMoney {
  slot: IMonthSlot
  plan: number
  fact: number
}

// ФОТ: начислено к плану, план/факт по месяцам окна и сравнение с прошлым месяцем
export const MoneyPanel: FC<IMoneyPanelProps> = ({ monthSlots, trends, summary, live }) => {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)

  const baseSeries = useMemo<IMonthMoney[]>(() => monthSlots.map((slot, index) => ({
    slot,
    plan: trends.reduce((sum, trend) => sum + trend.points[index].plan, 0),
    fact: trends.reduce((sum, trend) => sum + trend.points[index].earned, 0)
  })), [monthSlots, trends])

  // Выбранный месяц последний; в текущем месяце факт — начислено сейчас
  const series = live.isLive
    ? baseSeries.map((item, index) => (
      index === baseSeries.length - 1 ? { ...item, fact: summary.accrued } : item
    ))
    : baseSeries

  const max = Math.max(...series.map(item => Math.max(item.plan, item.fact)), 1)
  const shownIndex = activeIndex !== null && activeIndex < series.length ? activeIndex : series.length - 1
  const shown = series[shownIndex]

  const delta = summary.accrued - summary.baseline
  const hasBaseline = summary.baseline > 0

  const fact = live.isLive ? live.accrued : summary.accrued
  const plan = live.isLive ? live.planned : summary.plan
  const tone = getPayrollTone(fact, plan, live.isLive)

  return (
    <section className="dash-card">
      <h3 className="dash-card-title">
        <Wallet size={16} strokeWidth={1.75} aria-hidden="true" />
        ФОТ
      </h3>

      <div className={`dash-fot-head${tone ? ` is-${tone}` : ''}`}>
        <span className="dash-fot-main">{formatShortMoney(fact)} ₽</span>
        <span className="dash-fot-sub">
          {plan > 0 ? `из ${formatShortMoney(plan)} · ${formatPercent(getPercentOf(fact, plan))}` : 'плана нет'}
        </span>
      </div>
      <span className="dash-fot-bar" aria-hidden="true">
        <span
          className="dash-fot-bar-fill"
          style={{ '--progress': plan > 0 ? Math.min(1, Math.max(0, fact / plan)) : 0 } as CSSProperties}
        />
      </span>

      <div className="dash-chart" role="group" aria-label="План и факт по месяцам">
        {series.map((item, index) => (
          <button
            key={item.slot.key}
            type="button"
            className={`dash-bar-col${index === shownIndex ? ' active' : ''}`}
            aria-pressed={index === shownIndex}
            aria-label={`${item.slot.label}: план ${formatRub(item.plan)}, факт ${formatRub(item.fact)}`}
            onClick={() => setActiveIndex(index)}
            onMouseEnter={() => setActiveIndex(index)}
            onFocus={() => setActiveIndex(index)}
          >
            <span className="dash-bar-value">{formatCompactMoney(item.fact)}</span>
            <span className="dash-bar-area">
              <span className="dash-bar plan" style={{ '--h': item.plan / max } as CSSProperties} />
              <span
                className={`dash-bar fact${isPayrollOverrun(item.fact, item.plan) ? ' is-bad' : ''}`}
                style={{ '--h': item.fact / max } as CSSProperties}
              />
            </span>
            <span className="dash-bar-month">{item.slot.short}</span>
          </button>
        ))}
      </div>

      <div className="dash-chart-legend">
        <span className="dash-legend-item plan">План</span>
        <span className="dash-legend-item fact">Факт</span>
        <span className="dash-chart-detail">
          {shown.slot.label}: {formatRub(shown.fact)} из {formatRub(shown.plan)}
        </span>
      </div>

      <dl className="dash-money-rows">
        <div className="dash-money-row">
          <dt>
            К прошлому месяцу
            {live.isLive && <span className="dash-money-hint">на ту же долю месяца</span>}
          </dt>
          <dd className={hasBaseline ? (delta > 0 ? 'dash-up' : delta < 0 ? 'dash-down' : '') : ''}>
            {hasBaseline
              ? `${formatSignedRub(delta)} (${formatSignedPercent(getGrowthPercent(delta, summary.baseline))})`
              : '—'}
          </dd>
        </div>
      </dl>
    </section>
  )
}

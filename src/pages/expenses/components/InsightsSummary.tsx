import { ArrowRight, EyeOff, PiggyBank, Repeat, ShoppingBag } from 'lucide-react'
import type { ExpenseInsights } from '../types'
import { formatDate, formatRub } from '../utils/format'

interface Props {
  insights: ExpenseInsights
  onOpen: () => void
}

export function InsightsSummary({ insights, onOpen }: Props) {
  const activeSubscriptions = insights.subscriptions.filter(item => item.active).length
  const suspiciousCount = insights.findings.filter(item => item.kind !== 'failed').length

  return (
    <section className="section-card insights-summary">
      <div className="section-header">
        <h3>Разбор трат</h3>
        <span className="table-meta">
          {formatDate(insights.windowFrom)} — {formatDate(insights.windowTo)}
        </span>
      </div>

      <div className="summary-grid">
        <div className="summary-item">
          <Repeat size={18} strokeWidth={1.5} />
          <span>Подписки ({activeSubscriptions})</span>
          <strong>{formatRub(insights.subscriptionsMonthly)}/мес</strong>
        </div>
        <div className="summary-item warning">
          <EyeOff size={18} strokeWidth={1.5} />
          <span>Подозрительные ({suspiciousCount})</span>
          <strong>{formatRub(insights.suspiciousTotal)}</strong>
        </div>
        <div className="summary-item">
          <ShoppingBag size={18} strokeWidth={1.5} />
          <span>Необязательные</span>
          <strong>{formatRub(insights.discretionaryMonthly)}/мес</strong>
        </div>
        <div className="summary-item accent">
          <PiggyBank size={18} strokeWidth={1.5} />
          <span>Можно сэкономить</span>
          <strong>до {formatRub(insights.potentialMonthlySavings)}/мес</strong>
        </div>
      </div>

      <button className="link-btn" onClick={onOpen}>
        Подробнее
        <ArrowRight size={16} strokeWidth={1.5} />
      </button>
    </section>
  )
}

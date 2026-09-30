import type { ReactNode } from 'react'
import type { DashboardStats } from '../hooks/useDashboardStats'
import { BreakdownChart } from './BreakdownChart'

interface Props {
  stats: DashboardStats
  children?: ReactNode
}

export function AnalyticsView({ stats, children }: Props) {
  return (
    <>
      <section className="analytics-grid">
        <article className="section-card">
          <div className="section-header">
            <h3>Категории банка</h3>
            <span className="table-meta">расходы за период</span>
          </div>
          <BreakdownChart items={stats.expenseBreakdown} colorOffset={0} />
        </article>

        <article className="section-card">
          <div className="section-header">
            <h3>Топ-10 мест</h3>
            <span className="table-meta">где тратите больше всего</span>
          </div>
          <BreakdownChart items={stats.merchants} colorOffset={1} />
        </article>
      </section>

      {children}
    </>
  )
}

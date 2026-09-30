import type { ReactNode } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { DashboardStats } from '../hooks/useDashboardStats'
import { CHART_COLORS, formatAxisTick, formatRub } from '../utils/format'
import { BreakdownChart } from './BreakdownChart'
import { DashboardTooltip } from './DashboardTooltip'

const AXIS_TICK = { fill: 'var(--text-muted)', fontSize: 11 }

interface Props {
  stats: DashboardStats
  children?: ReactNode
}

export function AnalyticsView({ stats, children }: Props) {
  const { expenseBreakdown, incomeBreakdown, weekdayAverage, totals } = stats

  return (
    <>
      <section className="analytics-grid">
        <article className="section-card">
          <h3>Расходы по категориям</h3>
          <BreakdownChart items={expenseBreakdown} colorOffset={0} />
        </article>

        <article className="section-card">
          <h3>Доходы по категориям</h3>
          <BreakdownChart items={incomeBreakdown} colorOffset={4} />
        </article>
      </section>

      <section className="section-card">
        <h3>Доля расходов</h3>
        <div className="share-grid">
          {expenseBreakdown.length === 0 ? (
            <div className="empty-state">Нет данных для расчёта</div>
          ) : expenseBreakdown.map((category, index) => {
            const percent = totals.expense > 0 ? (category.value / totals.expense) * 100 : 0
            const color = CHART_COLORS[index % CHART_COLORS.length]
            return (
              <article key={category.name} className="share-card">
                <div className="share-head">
                  <span>{category.name}</span>
                  <strong>{percent.toFixed(1)}%</strong>
                </div>
                <div className="share-track">
                  <div className="share-fill" style={{ transform: `scaleX(${percent / 100})`, background: color }} />
                </div>
                <div className="share-value">{formatRub(category.value)}</div>
              </article>
            )
          })}
        </div>
      </section>

      <section className="section-card">
        <h3>Средний чек по дням недели</h3>
        <div className="chart-box short">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weekdayAverage}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" tick={AXIS_TICK} axisLine={false} tickLine={false} />
              <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={formatAxisTick} width={44} />
              <Tooltip content={<DashboardTooltip />} cursor={{ fill: 'var(--bg-tertiary)' }} />
              <Bar dataKey="avg" name="Средний чек" fill="var(--fp-cat-3)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {children}
    </>
  )
}

import { useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import type { DashboardStats } from '../hooks/useDashboardStats'
import type { ExpenseInsights, ExpenseTransaction, ExpenseUserCategory } from '../types'
import { CHART_COLORS, formatAxisTick, formatRub, getMappedCategoryName } from '../utils/format'
import { DashboardTooltip } from './DashboardTooltip'
import { InsightsSummary } from './InsightsSummary'
import { TransactionRow } from './TransactionRow'

type ChartType = 'area' | 'bar'

const LATEST_LIMIT = 8
const AXIS_TICK = { fill: 'var(--text-muted)', fontSize: 11 }

interface Props {
  stats: DashboardStats
  transactions: ExpenseTransaction[]
  categoriesById: Map<string, ExpenseUserCategory>
  insights: ExpenseInsights | null
  loading: boolean
  onOpenInsights: () => void
}

export function OverviewView({ stats, transactions, categoriesById, insights, loading, onOpenInsights }: Props) {
  const [chartType, setChartType] = useState<ChartType>('area')
  const { totals, timeSeries, topCategories } = stats
  const balance = totals.income - totals.expense

  const latest = useMemo(
    () => [...transactions].sort((a, b) => b.operation_at.localeCompare(a.operation_at)).slice(0, LATEST_LIMIT),
    [transactions]
  )

  return (
    <>
      {insights && <InsightsSummary insights={insights} onOpen={onOpenInsights} />}

      <section className="kpi-grid">
        <article className="kpi-card income">
          <div className="kpi-label">Доходы</div>
          <div className="kpi-value">{formatRub(totals.income)}</div>
        </article>
        <article className="kpi-card expense">
          <div className="kpi-label">Расходы</div>
          <div className="kpi-value">{formatRub(totals.expense)}</div>
        </article>
        <article className="kpi-card balance">
          <div className="kpi-label">Баланс</div>
          <div className="kpi-value">{balance >= 0 ? '+' : ''}{formatRub(balance)}</div>
        </article>
        <article className="kpi-card cashback">
          <div className="kpi-label">Кэшбэк</div>
          <div className="kpi-value">{formatRub(totals.cashback)}</div>
        </article>
      </section>

      <section className="overview-grid">
        <article className="section-card">
          <div className="section-header">
            <h3>Доходы и расходы</h3>
            <div className="chart-type-toggle">
              <button className={`pill-btn ${chartType === 'area' ? 'active' : ''}`} onClick={() => setChartType('area')}>Линии</button>
              <button className={`pill-btn ${chartType === 'bar' ? 'active' : ''}`} onClick={() => setChartType('bar')}>Столбцы</button>
            </div>
          </div>

          {timeSeries.length === 0 ? (
            <div className="empty-state">Нет данных для графика</div>
          ) : (
            <div className="chart-box">
              <ResponsiveContainer width="100%" height="100%">
                {chartType === 'area' ? (
                  <AreaChart data={timeSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="name" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                    <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={formatAxisTick} width={44} />
                    <Tooltip content={<DashboardTooltip />} />
                    <Legend />
                    <Area type="monotone" dataKey="income" name="Доходы" stroke="var(--fp-income)" fill="var(--fp-income)" fillOpacity={0.12} strokeWidth={2} />
                    <Area type="monotone" dataKey="expense" name="Расходы" stroke="var(--fp-expense)" fill="var(--fp-expense)" fillOpacity={0.12} strokeWidth={2} />
                  </AreaChart>
                ) : (
                  <BarChart data={timeSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="name" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                    <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={formatAxisTick} width={44} />
                    <Tooltip content={<DashboardTooltip />} />
                    <Legend />
                    <Bar dataKey="income" name="Доходы" fill="var(--fp-income)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="expense" name="Расходы" fill="var(--fp-expense)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          )}
        </article>

        <article className="section-card">
          <h3>Топ-5 расходов</h3>

          {topCategories.length === 0 ? (
            <div className="empty-state">Нет данных для графика</div>
          ) : (
            <>
              <div className="pie-wrap">
                <PieChart width={200} height={200}>
                  <Pie data={topCategories} cx={100} cy={100} innerRadius={56} outerRadius={90} paddingAngle={3} dataKey="value" stroke="none">
                    {topCategories.map((entry, index) => (
                      <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<DashboardTooltip />} />
                </PieChart>
              </div>

              <div className="top-categories-list">
                {topCategories.map((entry, index) => (
                  <div key={entry.name} className="top-category-row">
                    <div className="top-category-name">
                      <span className="dot" style={{ background: CHART_COLORS[index % CHART_COLORS.length] }} />
                      <span>{entry.name}</span>
                    </div>
                    <strong>{formatRub(entry.value)}</strong>
                  </div>
                ))}
              </div>
            </>
          )}
        </article>
      </section>

      <section className="section-card">
        <div className="section-header">
          <h3>Последние операции</h3>
          <span className="table-meta">{Math.min(LATEST_LIMIT, latest.length)} из {transactions.length}</span>
        </div>

        <div className="table-wrap">
          <table className="data-table compact">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Категория</th>
                <th>Описание</th>
                <th className="numeric">Сумма</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} className="empty-state">Загрузка...</td></tr>
              ) : latest.length === 0 ? (
                <tr><td colSpan={4} className="empty-state">Нет данных</td></tr>
              ) : latest.map(transaction => (
                <TransactionRow
                  key={transaction.id}
                  transaction={transaction}
                  categoryName={getMappedCategoryName(transaction, categoriesById)}
                  compact
                />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}

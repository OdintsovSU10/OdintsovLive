import { useMemo, useState } from 'react'
import type { DashboardStats } from '../hooks/useDashboardStats'
import type { ExpenseInsights, ExpenseTransaction, ExpenseUserCategory } from '../types'
import { formatRub, getMappedCategoryName } from '../utils/format'
import { GroupBreakdown } from './GroupBreakdown'
import { InsightsSummary } from './InsightsSummary'
import { MonthlyChart } from './MonthlyChart'
import { TransactionRow } from './TransactionRow'

const LATEST_LIMIT = 8

interface Props {
  stats: DashboardStats
  transactions: ExpenseTransaction[]
  categoriesById: Map<string, ExpenseUserCategory>
  insights: ExpenseInsights | null
  loading: boolean
  periodLabel: string
  onOpenInsights: () => void
}

function describeChange(current: number, prev: number | null): { text: string; tone: string } | null {
  if (prev === null || prev <= 0) return null
  const change = (current - prev) / prev
  const percent = Math.round(Math.abs(change) * 100)
  if (percent === 0) return { text: 'как в прошлом периоде', tone: 'flat' }
  return change > 0
    ? { text: `▲ ${percent}% к прошлому периоду`, tone: 'up' }
    : { text: `▼ ${percent}% к прошлому периоду`, tone: 'down' }
}

export function OverviewView({ stats, transactions, categoriesById, insights, loading, periodLabel, onOpenInsights }: Props) {
  const { totals, groups, monthly, monthGroups } = stats
  const change = describeChange(totals.spent, totals.prevSpent)
  const [selectedMonthKey, setSelectedMonthKey] = useState<string | null>(null)

  // Выбранный месяц мог пропасть из графика после смены фильтров
  const selectedMonth = monthly.find(month => month.key === selectedMonthKey) || null
  const selectedGroups = selectedMonth ? monthGroups[selectedMonth.key] || [] : groups
  const hasMonthComparison = selectedGroups.some(group => group.prevValue !== null)

  const latest = useMemo(
    () => [...transactions].sort((a, b) => b.operation_at.localeCompare(a.operation_at)).slice(0, LATEST_LIMIT),
    [transactions]
  )

  return (
    <>
      {insights && <InsightsSummary insights={insights} onOpen={onOpenInsights} />}

      <section className="kpi-grid">
        <article className="kpi-card expense">
          <div className="kpi-label">Потрачено</div>
          <div className="kpi-value">{formatRub(totals.spent)}</div>
          {change && <div className={`kpi-hint ${change.tone}`}>{change.text}</div>}
        </article>
        <article className="kpi-card purchases">
          <div className="kpi-label">Покупки</div>
          <div className="kpi-value">{formatRub(totals.purchases)}</div>
          <div className="kpi-hint">без переводов людям</div>
        </article>
        <article className="kpi-card per-day">
          <div className="kpi-label">В среднем в день</div>
          <div className="kpi-value">{formatRub(totals.perDay)}</div>
          <div className="kpi-hint">за {totals.days} дн.</div>
        </article>
        <article className="kpi-card cashback">
          <div className="kpi-label">Кэшбэк</div>
          <div className="kpi-value">{formatRub(totals.cashback)}</div>
        </article>
      </section>

      <section className="overview-grid">
        <MonthlyChart months={monthly} selectedKey={selectedMonth?.key ?? null} onSelect={setSelectedMonthKey} />
        {selectedMonth ? (
          <GroupBreakdown
            groups={selectedGroups}
            periodLabel={selectedMonth.partial ? `${selectedMonth.title} (не полностью)` : selectedMonth.title}
            comparisonLabel={hasMonthComparison ? 'к прошлому месяцу' : null}
            onReset={() => setSelectedMonthKey(null)}
          />
        ) : (
          <GroupBreakdown
            groups={groups}
            periodLabel={periodLabel}
            comparisonLabel={totals.prevSpent !== null ? 'к прошлому периоду' : null}
          />
        )}
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

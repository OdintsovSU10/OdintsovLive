import { useMemo } from 'react'
import type { ExpenseTransaction, ExpenseUserCategory } from '../types'
import { calculateBudget, type BudgetLimit } from '../utils/budget'
import { formatRub } from '../utils/format'

interface Props {
  // Все операции без фильтра периода страницы, с категориями после правил мерчантов
  transactions: ExpenseTransaction[]
  limits: BudgetLimit[]
  categoriesById: Map<string, ExpenseUserCategory>
  // Пока операции или лимиты грузятся, дневной лимит был бы неверным
  loading: boolean
}

// Лимиты задаются кнопкой «Бюджеты» в шапке страницы; без лимитов карточки нет
export function BudgetCard({ transactions, limits, categoriesById, loading }: Props) {
  const summary = useMemo(() => calculateBudget(transactions, limits), [transactions, limits])

  if (loading || summary.rows.length === 0) return null

  return (
    <section className="section-card budget-card">
      <div className="budget-head">
        <div>
          <div className="budget-allowance">Можно тратить {formatRub(summary.allowancePerDay)} в день</div>
          <div className="budget-until">до конца месяца · осталось {summary.daysLeft} дн.</div>
        </div>
      </div>

      <ul className="budget-list">
        {summary.rows.map(row => (
          <li key={row.categoryId} className={`budget-row ${row.status}`}>
            <div className="budget-row-top">
              <span className="budget-row-name">{categoriesById.get(row.categoryId)?.name || 'Удалённая категория'}</span>
              <span className="budget-row-sum">{formatRub(row.spent)} из {formatRub(row.limit)}</span>
            </div>
            <div className="budget-bar" aria-hidden="true">
              <div className="budget-bar-fill" style={{ width: `${Math.min(100, row.share * 100)}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

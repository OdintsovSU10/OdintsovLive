import { useMemo, useState } from 'react'
import { Settings2 } from 'lucide-react'
import { Toast } from '../../../components/ui/Toast'
import { useToast } from '../../../hooks/useToast'
import { useBudgets, type BudgetDraft } from '../hooks/useBudgets'
import type { ExpenseTransaction, ExpenseUserCategory } from '../types'
import { calculateBudget, formatBudgetDate } from '../utils/budget'
import { formatRub } from '../utils/format'
import { BudgetEditor } from './BudgetEditor'

interface Props {
  // Все операции без фильтра периода страницы, с категориями после правил мерчантов
  transactions: ExpenseTransaction[]
  categories: ExpenseUserCategory[]
  categoriesById: Map<string, ExpenseUserCategory>
  // Пока операции грузятся, дневной лимит был бы неверным
  transactionsLoading: boolean
}

export function BudgetCard({ transactions, categories, categoriesById, transactionsLoading }: Props) {
  const { limits, payday, loading, save } = useBudgets()
  const { toast, showToast, hideToast } = useToast()
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  const summary = useMemo(() => calculateBudget(transactions, limits, payday), [transactions, limits, payday])

  const handleSave = async (draft: BudgetDraft) => {
    setSaving(true)
    const ok = await save(draft)
    setSaving(false)
    if (ok) {
      setEditing(false)
      showToast({ message: 'Бюджеты сохранены' })
    } else {
      showToast({ message: 'Не удалось сохранить бюджеты', tone: 'error' })
    }
  }

  if (loading || transactionsLoading) return null

  return (
    <section className="section-card budget-card">
      {summary.rows.length === 0 ? (
        <div className="budget-empty">
          <p>Задайте лимиты по категориям — покажу, сколько можно тратить в день до зарплаты.</p>
          <button type="button" className="budget-btn primary" onClick={() => setEditing(true)}>Задать бюджеты</button>
        </div>
      ) : (
        <>
          <div className="budget-head">
            <div>
              <div className="budget-allowance">Можно тратить {formatRub(summary.allowancePerDay)} в день</div>
              <div className="budget-until">до {formatBudgetDate(summary.next)} · осталось {summary.daysLeft} дн.</div>
            </div>
            <button type="button" className="budget-btn" onClick={() => setEditing(true)}>
              <Settings2 size={16} strokeWidth={1.5} />
              Настроить
            </button>
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
        </>
      )}

      {editing && (
        <BudgetEditor
          categories={categories}
          limits={limits}
          payday={payday}
          saving={saving}
          onSave={handleSave}
          onClose={() => setEditing(false)}
        />
      )}
      <Toast toast={toast} onClose={hideToast} />
    </section>
  )
}

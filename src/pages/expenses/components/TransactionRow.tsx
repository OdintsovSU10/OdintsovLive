import type { ExpenseTransaction, ExpenseUserCategory } from '../types'
import { isFailed, isInternalTransfer } from '../utils/analysis'
import { formatAmount, formatDateTime } from '../utils/format'

interface Props {
  transaction: ExpenseTransaction
  categoryName: string
  compact?: boolean
  categories?: ExpenseUserCategory[]
  onSetCategory?: (transaction: ExpenseTransaction, categoryId: string | null) => void
}

export function TransactionRow({ transaction, categoryName, compact = false, categories = [], onSetCategory }: Props) {
  const failed = isFailed(transaction)
  const internal = !failed && isInternalTransfer(transaction)
  const sign = transaction.flow_direction === 'in' ? '+' : transaction.flow_direction === 'out' ? '−' : ''
  const tone = failed || internal ? 'muted' : transaction.flow_direction === 'in' ? 'positive' : 'negative'
  const bonus = transaction.cashback_amount || transaction.bonuses_amount || 0

  return (
    <tr className={failed || internal ? 'row-muted' : ''}>
      <td className="nowrap">{formatDateTime(transaction.operation_at)}</td>
      <td>
        {onSetCategory && categories.length > 0 ? (
          <select
            className="category-select"
            value={transaction.mapped_category_id || ''}
            aria-label="Категория"
            onChange={event => onSetCategory(transaction, event.target.value || null)}
          >
            <option value="">{transaction.bank_category || 'Без категории'}</option>
            {categories.map(category => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
        ) : categoryName}
      </td>
      <td>
        <span className="description-cell">
          {transaction.merchant_name || transaction.description || '—'}
          {transaction.source === 'telegram' && <span className="type-badge bot">Бот</span>}
          {failed && <span className="type-badge failed">Ошибка</span>}
          {internal && <span className="type-badge internal">Свои счета</span>}
        </span>
        {transaction.merchant_name && transaction.description && transaction.merchant_name !== transaction.description && (
          <span className="note-cell">{transaction.description}</span>
        )}
        {transaction.note && transaction.note !== transaction.description && (
          <span className="note-cell">{transaction.note}</span>
        )}
      </td>
      {!compact && <td>{transaction.mcc || '—'}</td>}
      {!compact && <td>{transaction.card_mask || '—'}</td>}
      <td className={`numeric amount-cell ${tone}`}>
        {sign}{formatAmount(Math.abs(transaction.payment_amount), 2)} ₽
      </td>
      {!compact && <td className="numeric">{bonus ? formatAmount(bonus, 2) : '—'}</td>}
    </tr>
  )
}

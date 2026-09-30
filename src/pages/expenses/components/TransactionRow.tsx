import type { ExpenseTransaction } from '../types'
import { isFailed, isInternalTransfer } from '../utils/analysis'
import { formatAmount, formatDateTime } from '../utils/format'

interface Props {
  transaction: ExpenseTransaction
  categoryName: string
  compact?: boolean
}

export function TransactionRow({ transaction, categoryName, compact = false }: Props) {
  const failed = isFailed(transaction)
  const internal = !failed && isInternalTransfer(transaction)
  const sign = transaction.flow_direction === 'in' ? '+' : transaction.flow_direction === 'out' ? '−' : ''
  const tone = failed || internal ? 'muted' : transaction.flow_direction === 'in' ? 'positive' : 'negative'
  const bonus = transaction.cashback_amount || transaction.bonuses_amount || 0

  return (
    <tr className={failed || internal ? 'row-muted' : ''}>
      <td className="nowrap">{formatDateTime(transaction.operation_at)}</td>
      <td>{categoryName}</td>
      <td>
        <span className="description-cell">
          {transaction.description || '—'}
          {failed && <span className="type-badge failed">Ошибка</span>}
          {internal && <span className="type-badge internal">Свои счета</span>}
        </span>
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

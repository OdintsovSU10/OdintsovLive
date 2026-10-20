import { useState } from 'react'
import type { ExpenseReceiptItem, ExpenseTransaction, ExpenseUserCategory } from '../types'
import { isFailed, isInternalTransfer } from '../utils/analysis'
import { formatAmount, formatDateTime } from '../utils/format'

interface Props {
  transaction: ExpenseTransaction
  categoryName: string
  compact?: boolean
  categories?: ExpenseUserCategory[]
  receiptItems?: ExpenseReceiptItem[]
  onSetCategory?: (transaction: ExpenseTransaction, categoryId: string | null) => void
}

function formatQuantityPrice(item: ExpenseReceiptItem): string | null {
  if (item.quantity === null && item.price === null) return null
  const quantity = item.quantity === null ? '' : formatAmount(item.quantity, Number.isInteger(item.quantity) ? 0 : 3)
  if (item.price === null) return quantity
  return `${quantity || '1'} × ${formatAmount(item.price, 2)}`
}

export function TransactionRow({ transaction, categoryName, compact = false, categories = [], receiptItems = [], onSetCategory }: Props) {
  const [expanded, setExpanded] = useState(false)
  const hasItems = receiptItems.length > 0
  const failed = isFailed(transaction)
  const internal = !failed && isInternalTransfer(transaction)
  const sign = transaction.flow_direction === 'in' ? '+' : transaction.flow_direction === 'out' ? '−' : ''
  const tone = failed || internal ? 'muted' : transaction.flow_direction === 'in' ? 'positive' : 'negative'
  const bonus = transaction.cashback_amount || transaction.bonuses_amount || 0

  const toggle = () => setExpanded(prev => !prev)

  return (
    <>
    <tr
      className={`${failed || internal ? 'row-muted' : ''} ${hasItems ? 'row-expandable' : ''}`}
      onClick={hasItems ? toggle : undefined}
    >
      <td className="nowrap">{formatDateTime(transaction.operation_at)}</td>
      <td>
        {onSetCategory && categories.length > 0 ? (
          <select
            className="category-select"
            value={transaction.mapped_category_id || ''}
            aria-label="Категория"
            onClick={event => event.stopPropagation()}
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
          {hasItems && (
            <button
              type="button"
              className={`receipt-toggle ${expanded ? 'open' : ''}`}
              aria-expanded={expanded}
              aria-label={`Позиции чека: ${receiptItems.length}`}
              onClick={event => {
                event.stopPropagation()
                toggle()
              }}
            >
              <span aria-hidden="true">🧾</span> {receiptItems.length}
            </button>
          )}
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
    {hasItems && expanded && (
      <tr className="receipt-row">
        <td colSpan={compact ? 4 : 7}>
          <ul className="receipt-items">
            {receiptItems.map(item => {
              const detail = formatQuantityPrice(item)
              return (
                <li key={item.id} className="receipt-item">
                  <span className="receipt-item-name">{item.name}</span>
                  {detail && <span className="receipt-item-detail">{detail}</span>}
                  <span className="receipt-item-amount">{formatAmount(item.amount, 2)} ₽</span>
                </li>
              )
            })}
          </ul>
        </td>
      </tr>
    )}
    </>
  )
}

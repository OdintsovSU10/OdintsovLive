import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import type { ExpenseFilters, ExpenseTransaction, ExpenseUserCategory } from '../types'
import { getMappedCategoryName } from '../utils/format'
import { TransactionRow } from './TransactionRow'

type SortField = 'operation_at' | 'payment_amount' | 'category' | 'description'
type SortDirection = 'asc' | 'desc'

const PAGE_SIZE = 20
const COLUMNS = 7

interface Props {
  transactions: ExpenseTransaction[]
  categories: ExpenseUserCategory[]
  categoriesById: Map<string, ExpenseUserCategory>
  bankCategories: string[]
  filters: ExpenseFilters
  loading: boolean
  onFiltersChange: (patch: Partial<ExpenseFilters>) => void
}

export function TransactionsView({
  transactions,
  categories,
  categoriesById,
  bankCategories,
  filters,
  loading,
  onFiltersChange
}: Props) {
  const [sortField, setSortField] = useState<SortField>('operation_at')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [page, setPage] = useState(0)

  const sorted = useMemo(() => {
    return [...transactions].sort((left, right) => {
      let compare = 0

      if (sortField === 'operation_at') {
        compare = left.operation_at.localeCompare(right.operation_at)
      } else if (sortField === 'payment_amount') {
        compare = left.payment_amount - right.payment_amount
      } else if (sortField === 'category') {
        compare = getMappedCategoryName(left, categoriesById).localeCompare(getMappedCategoryName(right, categoriesById), 'ru')
      } else {
        compare = (left.description || '').localeCompare(right.description || '', 'ru')
      }

      return sortDirection === 'desc' ? -compare : compare
    })
  }, [categoriesById, sortDirection, sortField, transactions])

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages - 1)
  const paged = sorted.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)

  useEffect(() => {
    setPage(0)
  }, [sorted.length])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => (prev === 'desc' ? 'asc' : 'desc'))
      return
    }
    setSortField(field)
    setSortDirection('desc')
  }

  const sortMark = (field: SortField) => (sortField === field ? (sortDirection === 'desc' ? ' ↓' : ' ↑') : '')

  return (
    <>
      <section className="transactions-filters">
        <label>
          С даты
          <input type="date" value={filters.dateFrom} onChange={event => onFiltersChange({ dateFrom: event.target.value })} />
        </label>

        <label>
          По дату
          <input type="date" value={filters.dateTo} onChange={event => onFiltersChange({ dateTo: event.target.value })} />
        </label>

        <label>
          Категория банка
          <select value={filters.bankCategory} onChange={event => onFiltersChange({ bankCategory: event.target.value })}>
            <option value="">Все</option>
            {bankCategories.map(category => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
        </label>

        <label>
          Моя категория
          <select value={filters.mappedCategoryId} onChange={event => onFiltersChange({ mappedCategoryId: event.target.value })}>
            <option value="">Все</option>
            {categories.map(category => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
        </label>
      </section>

      <section className="section-card">
        <div className="section-header">
          <h3>Все операции ({sorted.length})</h3>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th className="sortable" onClick={() => handleSort('operation_at')}>Дата{sortMark('operation_at')}</th>
                <th className="sortable" onClick={() => handleSort('category')}>Категория{sortMark('category')}</th>
                <th className="sortable" onClick={() => handleSort('description')}>Описание{sortMark('description')}</th>
                <th>MCC</th>
                <th>Карта</th>
                <th className="numeric sortable" onClick={() => handleSort('payment_amount')}>Сумма{sortMark('payment_amount')}</th>
                <th className="numeric">Кэшбэк</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={COLUMNS} className="empty-state">Загрузка...</td></tr>
              ) : paged.length === 0 ? (
                <tr><td colSpan={COLUMNS} className="empty-state">Нет данных</td></tr>
              ) : paged.map(transaction => (
                <TransactionRow
                  key={transaction.id}
                  transaction={transaction}
                  categoryName={getMappedCategoryName(transaction, categoriesById)}
                />
              ))}
            </tbody>
          </table>
        </div>

        <div className="pagination">
          <button onClick={() => setPage(Math.max(0, currentPage - 1))} disabled={currentPage <= 0} aria-label="Назад">
            <ArrowLeft size={16} strokeWidth={1.5} />
          </button>
          <span>{currentPage + 1} / {totalPages}</span>
          <button onClick={() => setPage(Math.min(totalPages - 1, currentPage + 1))} disabled={currentPage >= totalPages - 1} aria-label="Вперёд">
            <ArrowRight size={16} strokeWidth={1.5} />
          </button>
        </div>
      </section>
    </>
  )
}

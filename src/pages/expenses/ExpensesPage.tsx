import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Link2,
  Plus,
  RefreshCw,
  Search,
  Upload
} from 'lucide-react'
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
import { useExpensesData } from './hooks/useExpensesData'
import type { ExpenseTransaction, ExpenseUserCategory } from './types'
import './ExpensesPage.css'

const PAGE_SIZE = 15
const EXPENSE_PALETTE = ['#FF6B6B', '#EE5A24', '#F9CA24', '#F0932B', '#EB4D4B', '#E056A0', '#D63031', '#C44569', '#FDA7DF', '#B33771']
const INCOME_PALETTE = ['#00D2D3', '#1DD1A1', '#54A0FF', '#5F27CD', '#48DBFB']
const MONTHS = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек']
const WEEK_DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

type DashboardView = 'overview' | 'transactions' | 'analytics'
type ChartType = 'area' | 'bar'
type PeriodPreset = 'month' | 'quarter' | 'half' | 'year'
type SortField = 'operation_at' | 'payment_amount' | 'category' | 'description'
type SortDirection = 'asc' | 'desc'

type CategoryType = 'income' | 'expense'

interface CategoryBreakdownItem {
  [key: string]: string | number
  name: string
  type: CategoryType
  value: number
}

interface TimeSeriesPoint {
  name: string
  income: number
  expense: number
  sortKey: number
}

interface DashboardTooltipProps {
  active?: boolean
  payload?: Array<{
    name?: string | number
    dataKey?: string | number
    value?: string | number
    color?: string
  }>
  label?: string | number
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function toIsoDate(value: Date): string {
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
}

function getPeriodRange(period: PeriodPreset): { from: string; to: string } {
  const end = new Date()
  const start = new Date(end)

  if (period === 'month') {
    start.setDate(1)
  } else if (period === 'quarter') {
    start.setMonth(start.getMonth() - 3)
  } else if (period === 'half') {
    start.setMonth(start.getMonth() - 6)
  } else {
    start.setFullYear(start.getFullYear() - 1)
  }

  return {
    from: toIsoDate(start),
    to: toIsoDate(end)
  }
}

function formatAmount(value: number, digits = 0): string {
  return value.toLocaleString('ru-RU', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  })
}

function formatDate(isoDate: string | null): string {
  if (!isoDate) return '—'
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return isoDate
  return `${match[3]}.${match[2]}.${match[1]}`
}

function formatDateTime(value: string): string {
  const normalized = value.replace('T', ' ')
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})\s(\d{2}):(\d{2})(?::\d{2})?$/)
  if (!match) return value
  return `${match[3]}.${match[2]}.${match[1]} ${match[4]}:${match[5]}`
}

function parseOperationDate(value: string): Date {
  const normalized = value.includes('T') ? value : value.replace(' ', 'T')
  const parsed = new Date(normalized)
  if (!Number.isNaN(parsed.getTime())) {
    return parsed
  }

  const fallback = new Date(`${value.replace(' ', 'T')}Z`)
  return Number.isNaN(fallback.getTime()) ? new Date(Number.NaN) : fallback
}

function formatAxisTick(value: number | string | undefined): string {
  const numeric = typeof value === 'number' ? value : Number(value || 0)
  if (!Number.isFinite(numeric)) return '0'
  if (Math.abs(numeric) < 1000) return formatAmount(numeric)

  return new Intl.NumberFormat('ru-RU', {
    notation: 'compact',
    compactDisplay: 'short',
    maximumFractionDigits: 1
  }).format(numeric)
}

function getMappedCategoryName(transaction: ExpenseTransaction, categoriesById: Map<string, ExpenseUserCategory>): string {
  if (transaction.mapped_category_id) {
    return categoriesById.get(transaction.mapped_category_id)?.name || 'Удалённая категория'
  }

  return transaction.bank_category || 'Без категории'
}

function DashboardTooltip({ active, payload, label }: DashboardTooltipProps) {
  if (!active || !payload?.length) return null

  return (
    <div className="chart-tooltip">
      {label ? <div className="tooltip-label">{label}</div> : null}
      {payload.map(item => (
        <div key={`${item.name}-${item.dataKey}`} className="tooltip-row" style={{ color: item.color || '#E0E0F0' }}>
          <span>{item.name}:</span>
          <strong>{formatAmount(Number(item.value || 0))} ₽</strong>
        </div>
      ))}
    </div>
  )
}

export default function ExpensesPage() {
  const {
    loading,
    importing,
    error,
    filters,
    transactions,
    categories,
    mappings,
    bankCategories,
    lastImportSummary,
    updateFilters,
    createCategory,
    updateCategory,
    deleteCategory,
    upsertMapping,
    importStatement
  } = useExpensesData()

  const [view, setView] = useState<DashboardView>('overview')
  const [period, setPeriod] = useState<PeriodPreset>('month')
  const [chartType, setChartType] = useState<ChartType>('area')
  const [showPaymentDate, setShowPaymentDate] = useState(true)
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [sortField, setSortField] = useState<SortField>('operation_at')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [page, setPage] = useState(0)

  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryColor, setNewCategoryColor] = useState('#64748B')

  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [editingCategoryName, setEditingCategoryName] = useState('')
  const [editingCategoryColor, setEditingCategoryColor] = useState('#64748B')

  const [actionError, setActionError] = useState<string | null>(null)
  const [mappingInProgress, setMappingInProgress] = useState<string | null>(null)

  const categoriesById = useMemo(() => {
    const map = new Map<string, ExpenseUserCategory>()
    for (const category of categories) {
      map.set(category.id, category)
    }
    return map
  }, [categories])

  const mappingByBankCategory = useMemo(() => {
    const map = new Map<string, string>()
    for (const mapping of mappings) {
      map.set(mapping.bank_category, mapping.target_category_id)
    }
    return map
  }, [mappings])

  const availableCategoryOptions = useMemo(() => {
    const set = new Set<string>()
    for (const transaction of transactions) {
      set.add(getMappedCategoryName(transaction, categoriesById))
    }

    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ru'))
  }, [categoriesById, transactions])

  useEffect(() => {
    setSelectedCategories(prev => prev.filter(category => availableCategoryOptions.includes(category)))
  }, [availableCategoryOptions])

  const displayTransactions = useMemo(() => {
    if (selectedCategories.length === 0) {
      return transactions
    }

    return transactions.filter(transaction => {
      const categoryName = getMappedCategoryName(transaction, categoriesById)
      return selectedCategories.includes(categoryName)
    })
  }, [categoriesById, selectedCategories, transactions])

  const totals = useMemo(() => {
    return displayTransactions.reduce(
      (acc, transaction) => {
        if (transaction.flow_direction === 'in') {
          acc.income += transaction.payment_amount
        }

        if (transaction.flow_direction === 'out') {
          acc.expense += Math.abs(transaction.payment_amount)
        }

        acc.cashback += transaction.cashback_amount
        acc.count += 1

        return acc
      },
      { income: 0, expense: 0, cashback: 0, count: 0 }
    )
  }, [displayTransactions])

  const balance = totals.income - totals.expense

  const categoryBreakdown = useMemo(() => {
    const grouped = new Map<string, CategoryBreakdownItem>()

    for (const transaction of displayTransactions) {
      if (transaction.flow_direction !== 'in' && transaction.flow_direction !== 'out') {
        continue
      }

      const type: CategoryType = transaction.flow_direction === 'in' ? 'income' : 'expense'
      const name = getMappedCategoryName(transaction, categoriesById)
      const value = type === 'income' ? transaction.payment_amount : Math.abs(transaction.payment_amount)

      const current = grouped.get(`${type}:${name}`)
      if (current) {
        current.value += value
      } else {
        grouped.set(`${type}:${name}`, { name, type, value })
      }
    }

    return Array.from(grouped.values()).sort((a, b) => b.value - a.value)
  }, [categoriesById, displayTransactions])

  const expenseBreakdown = useMemo(
    () => categoryBreakdown.filter(item => item.type === 'expense'),
    [categoryBreakdown]
  )

  const incomeBreakdown = useMemo(
    () => categoryBreakdown.filter(item => item.type === 'income'),
    [categoryBreakdown]
  )

  const topCategories = categoryBreakdown.slice(0, 5)

  const timeSeriesData = useMemo(() => {
    const grouped = new Map<string, TimeSeriesPoint>()

    for (const transaction of displayTransactions) {
      const date = parseOperationDate(transaction.operation_at)
      if (Number.isNaN(date.getTime())) continue

      let key = ''
      let name = ''
      let sortKey = 0

      if (period === 'month') {
        key = transaction.operation_date
        name = formatDate(transaction.operation_date)
        sortKey = date.getTime()
      } else {
        key = `${date.getFullYear()}-${pad(date.getMonth() + 1)}`
        name = `${MONTHS[date.getMonth()]} ${String(date.getFullYear()).slice(2)}`
        sortKey = date.getFullYear() * 100 + date.getMonth()
      }

      const bucket = grouped.get(key) || { name, income: 0, expense: 0, sortKey }

      if (transaction.flow_direction === 'in') {
        bucket.income += transaction.payment_amount
      }

      if (transaction.flow_direction === 'out') {
        bucket.expense += Math.abs(transaction.payment_amount)
      }

      grouped.set(key, bucket)
    }

    return Array.from(grouped.values()).sort((a, b) => a.sortKey - b.sortKey)
  }, [displayTransactions, period])

  const weekdayAverageData = useMemo(() => {
    const grouped = WEEK_DAYS.map(name => ({ name, total: 0, count: 0 }))

    for (const transaction of displayTransactions) {
      if (transaction.flow_direction !== 'out') continue

      const date = parseOperationDate(transaction.operation_at)
      if (Number.isNaN(date.getTime())) continue

      const day = date.getDay()
      const normalizedDay = day === 0 ? 6 : day - 1
      grouped[normalizedDay].total += Math.abs(transaction.payment_amount)
      grouped[normalizedDay].count += 1
    }

    return grouped.map(day => ({
      name: day.name,
      avg: day.count > 0 ? Math.round(day.total / day.count) : 0
    }))
  }, [displayTransactions])

  const sortedTransactions = useMemo(() => {
    return [...displayTransactions].sort((left, right) => {
      let compare = 0

      if (sortField === 'operation_at') {
        compare = left.operation_at.localeCompare(right.operation_at)
      } else if (sortField === 'payment_amount') {
        compare = left.payment_amount - right.payment_amount
      } else if (sortField === 'category') {
        compare = getMappedCategoryName(left, categoriesById).localeCompare(getMappedCategoryName(right, categoriesById), 'ru')
      } else if (sortField === 'description') {
        compare = (left.description || '').localeCompare(right.description || '', 'ru')
      }

      return sortDirection === 'desc' ? -compare : compare
    })
  }, [categoriesById, displayTransactions, sortDirection, sortField])

  const latestTransactions = useMemo(() => {
    return [...displayTransactions]
      .sort((left, right) => right.operation_at.localeCompare(left.operation_at))
      .slice(0, 8)
  }, [displayTransactions])

  const totalPages = Math.max(1, Math.ceil(sortedTransactions.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages - 1)

  const pagedTransactions = useMemo(() => {
    const start = currentPage * PAGE_SIZE
    return sortedTransactions.slice(start, start + PAGE_SIZE)
  }, [currentPage, sortedTransactions])

  useEffect(() => {
    setPage(0)
  }, [view, sortedTransactions.length])

  const applyPeriod = (nextPeriod: PeriodPreset) => {
    const range = getPeriodRange(nextPeriod)
    setPeriod(nextPeriod)
    updateFilters({ dateFrom: range.from, dateTo: range.to })
  }

  const handleResetFilters = () => {
    const defaultRange = getPeriodRange('month')
    setPeriod('month')
    setSelectedCategories([])
    updateFilters({
      dateFrom: defaultRange.from,
      dateTo: defaultRange.to,
      flow: 'all',
      search: '',
      bankCategory: '',
      mappedCategoryId: ''
    })
  }

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => (prev === 'desc' ? 'asc' : 'desc'))
      return
    }

    setSortField(field)
    setSortDirection('desc')
  }

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setActionError(null)

    try {
      await importStatement(file)
    } catch (err) {
      if (err instanceof Error) {
        setActionError(err.message)
      } else {
        setActionError('Не удалось импортировать выписку')
      }
    } finally {
      event.target.value = ''
    }
  }

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) return

    setActionError(null)

    try {
      await createCategory(newCategoryName, newCategoryColor)
      setNewCategoryName('')
      setNewCategoryColor('#64748B')
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Не удалось добавить категорию')
    }
  }

  const startEditCategory = (category: ExpenseUserCategory) => {
    setEditingCategoryId(category.id)
    setEditingCategoryName(category.name)
    setEditingCategoryColor(category.color)
  }

  const cancelEditCategory = () => {
    setEditingCategoryId(null)
    setEditingCategoryName('')
    setEditingCategoryColor('#64748B')
  }

  const saveEditCategory = async () => {
    if (!editingCategoryId || !editingCategoryName.trim()) return

    setActionError(null)

    try {
      await updateCategory(editingCategoryId, {
        name: editingCategoryName.trim(),
        color: editingCategoryColor
      })
      cancelEditCategory()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Не удалось обновить категорию')
    }
  }

  const handleDeleteCategory = async (id: string) => {
    setActionError(null)

    try {
      await deleteCategory(id)
      if (editingCategoryId === id) {
        cancelEditCategory()
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Не удалось удалить категорию')
    }
  }

  const handleMappingChange = async (bankCategory: string, targetCategoryId: string) => {
    setActionError(null)
    setMappingInProgress(bankCategory)

    try {
      await upsertMapping(bankCategory, targetCategoryId || null)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Не удалось обновить маппинг')
    } finally {
      setMappingInProgress(null)
    }
  }

  return (
    <div className="expenses-dashboard">
      <div className="expenses-topbar">
        <div className="topbar-brand">
          <div className="brand-logo">₽ FinPulse</div>
          <p>Аналитика по операциям и сумме платежа</p>
        </div>

        <div className="topbar-controls">
          <div className="topbar-nav">
            <button className={view === 'overview' ? 'active' : ''} onClick={() => setView('overview')}>Обзор</button>
            <button className={view === 'transactions' ? 'active' : ''} onClick={() => setView('transactions')}>Транзакции</button>
            <button className={view === 'analytics' ? 'active' : ''} onClick={() => setView('analytics')}>Аналитика</button>
          </div>

          <label className={`import-btn ${importing ? 'disabled' : ''}`}>
            <Upload size={16} />
            <span>{importing ? 'Импорт...' : 'Импорт выписки'}</span>
            <input type="file" accept=".xlsx" onChange={handleImport} disabled={importing} hidden />
          </label>
        </div>
      </div>

      <div className="expenses-page">
        {(error || actionError) && (
          <div className="alert error">
            <AlertCircle size={16} />
            <span>{actionError || error}</span>
          </div>
        )}

        {lastImportSummary && (
          <div className="alert info">
            <span>
              Импорт: {lastImportSummary.fileName} • строк: {lastImportSummary.totalRows}, валидных: {lastImportSummary.parsedRows},
              добавлено: {lastImportSummary.insertedRows}, обновлено: {lastImportSummary.updatedRows}, пропущено: {lastImportSummary.skippedRows}
            </span>
          </div>
        )}

        <section className="dashboard-filters">
          <div className="filter-group">
            <button className={`pill-btn ${period === 'year' ? 'active' : ''}`} onClick={() => applyPeriod('year')}>Год</button>
            <button className={`pill-btn ${period === 'half' ? 'active' : ''}`} onClick={() => applyPeriod('half')}>Полгода</button>
            <button className={`pill-btn ${period === 'quarter' ? 'active' : ''}`} onClick={() => applyPeriod('quarter')}>Квартал</button>
            <button className={`pill-btn ${period === 'month' ? 'active' : ''}`} onClick={() => applyPeriod('month')}>Месяц</button>
          </div>

          <div className="filter-divider" />

          <div className="filter-group">
            <button className={`pill-btn ${filters.flow === 'all' ? 'active' : ''}`} onClick={() => updateFilters({ flow: 'all' })}>Все</button>
            <button className={`pill-btn ${filters.flow === 'in' ? 'active' : ''}`} onClick={() => updateFilters({ flow: 'in' })}>Доходы</button>
            <button className={`pill-btn ${filters.flow === 'out' ? 'active' : ''}`} onClick={() => updateFilters({ flow: 'out' })}>Расходы</button>
          </div>

          <div className="filter-divider" />

          <label className="search-field">
            <Search size={14} />
            <input
              type="search"
              value={filters.search}
              onChange={event => updateFilters({ search: event.target.value })}
              placeholder="Поиск по описанию, MCC, карте"
            />
          </label>

          <button className="pill-btn reset" onClick={handleResetFilters}>
            <RefreshCw size={14} />
            Сброс
          </button>
        </section>

        <section className="category-pills">
          {availableCategoryOptions.map(category => (
            <button
              key={category}
              className={`category-pill ${selectedCategories.includes(category) ? 'active' : ''}`}
              onClick={() => {
                setSelectedCategories(prev => (
                  prev.includes(category)
                    ? prev.filter(item => item !== category)
                    : [...prev, category]
                ))
              }}
            >
              {category}
            </button>
          ))}

          {selectedCategories.length > 0 && (
            <button className="category-pill reset" onClick={() => setSelectedCategories([])}>
              Сброс категорий
            </button>
          )}
        </section>

        {view === 'overview' && (
          <>
            <section className="kpi-grid">
              <article className="kpi-card income">
                <div className="kpi-accent" />
                <div className="kpi-label">Доходы</div>
                <div className="kpi-value">{formatAmount(totals.income)} ₽</div>
              </article>

              <article className="kpi-card expense">
                <div className="kpi-accent" />
                <div className="kpi-label">Расходы</div>
                <div className="kpi-value">{formatAmount(totals.expense)} ₽</div>
              </article>

              <article className="kpi-card balance">
                <div className="kpi-accent" />
                <div className="kpi-label">Баланс</div>
                <div className="kpi-value">{balance >= 0 ? '+' : ''}{formatAmount(balance)} ₽</div>
              </article>

              <article className="kpi-card cashback">
                <div className="kpi-accent" />
                <div className="kpi-label">Кэшбэк</div>
                <div className="kpi-value">{formatAmount(totals.cashback)} ₽</div>
              </article>
            </section>

            <section className="overview-grid">
              <article className="section-card">
                <div className="section-header">
                  <h3>Динамика доходов и расходов</h3>
                  <div className="chart-type-toggle">
                    <button className={`pill-btn ${chartType === 'area' ? 'active' : ''}`} onClick={() => setChartType('area')}>Area</button>
                    <button className={`pill-btn ${chartType === 'bar' ? 'active' : ''}`} onClick={() => setChartType('bar')}>Bar</button>
                  </div>
                </div>

                {timeSeriesData.length === 0 ? (
                  <div className="empty-state">Нет данных для графика</div>
                ) : (
                  <ResponsiveContainer width="100%" height={290}>
                    {chartType === 'area' ? (
                      <AreaChart data={timeSeriesData}>
                        <defs>
                          <linearGradient id="incomeGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#1DD1A1" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#1DD1A1" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="expenseGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#FF6B6B" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#FF6B6B" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.06)" />
                        <XAxis dataKey="name" tick={{ fill: '#8B8BA3', fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: '#8B8BA3', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={formatAxisTick} />
                        <Tooltip content={<DashboardTooltip />} />
                        <Legend />
                        <Area type="monotone" dataKey="income" name="Доходы" stroke="#1DD1A1" fill="url(#incomeGradient)" strokeWidth={2.5} />
                        <Area type="monotone" dataKey="expense" name="Расходы" stroke="#FF6B6B" fill="url(#expenseGradient)" strokeWidth={2.5} />
                      </AreaChart>
                    ) : (
                      <BarChart data={timeSeriesData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.06)" />
                        <XAxis dataKey="name" tick={{ fill: '#8B8BA3', fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: '#8B8BA3', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={formatAxisTick} />
                        <Tooltip content={<DashboardTooltip />} />
                        <Legend />
                        <Bar dataKey="income" name="Доходы" fill="#1DD1A1" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="expense" name="Расходы" fill="#FF6B6B" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    )}
                  </ResponsiveContainer>
                )}
              </article>

              <article className="section-card">
                <h3>Топ-5 категорий</h3>

                {topCategories.length === 0 ? (
                  <div className="empty-state">Нет данных для графика</div>
                ) : (
                  <>
                    <div className="pie-wrap">
                      <PieChart width={210} height={210}>
                        <Pie
                          data={topCategories}
                          cx={105}
                          cy={105}
                          innerRadius={58}
                          outerRadius={92}
                          paddingAngle={3}
                          dataKey="value"
                          stroke="none"
                        >
                          {topCategories.map((entry, index) => (
                            <Cell
                              key={`${entry.name}-${entry.type}`}
                              fill={entry.type === 'income' ? INCOME_PALETTE[index % INCOME_PALETTE.length] : EXPENSE_PALETTE[index % EXPENSE_PALETTE.length]}
                            />
                          ))}
                        </Pie>
                        <Tooltip content={<DashboardTooltip />} />
                      </PieChart>
                    </div>

                    <div className="top-categories-list">
                      {topCategories.map((entry, index) => (
                        <div key={`${entry.name}-${entry.type}`} className="top-category-row">
                          <div className="top-category-name">
                            <span
                              className="dot"
                              style={{ background: entry.type === 'income' ? INCOME_PALETTE[index % INCOME_PALETTE.length] : EXPENSE_PALETTE[index % EXPENSE_PALETTE.length] }}
                            />
                            <span>{entry.name}</span>
                          </div>
                          <strong className={entry.type === 'income' ? 'income' : 'expense'}>{formatAmount(entry.value)} ₽</strong>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </article>
            </section>

            <section className="section-card table-card">
              <div className="section-header">
                <h3>Последние транзакции</h3>
                <span className="table-meta">Показано: {Math.min(8, latestTransactions.length)} из {displayTransactions.length}</span>
              </div>

              <div className="table-wrap">
                <table className="data-table compact">
                  <thead>
                    <tr>
                      <th>Дата</th>
                      <th>Тип</th>
                      <th>Категория</th>
                      <th>Описание</th>
                      <th className="numeric">Сумма</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={5} className="empty-state">Загрузка...</td>
                      </tr>
                    ) : latestTransactions.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="empty-state">Нет данных</td>
                      </tr>
                    ) : latestTransactions.map(transaction => (
                      <tr key={transaction.id}>
                        <td>{formatDateTime(transaction.operation_at)}</td>
                        <td>
                          <span className={`type-badge ${transaction.flow_direction}`}>
                            {transaction.flow_direction === 'in' ? 'Доход' : transaction.flow_direction === 'out' ? 'Расход' : 'Нейтрально'}
                          </span>
                        </td>
                        <td>{getMappedCategoryName(transaction, categoriesById)}</td>
                        <td>{transaction.description || '—'}</td>
                        <td className={`numeric amount-cell ${transaction.flow_direction === 'in' ? 'positive' : transaction.flow_direction === 'out' ? 'negative' : ''}`}>
                          {transaction.flow_direction === 'in' ? '+' : transaction.flow_direction === 'out' ? '−' : ''}
                          {formatAmount(Math.abs(transaction.payment_amount), 2)} ₽
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        {view === 'transactions' && (
          <>
            <section className="transactions-filters">
              <label>
                С даты
                <input
                  type="date"
                  value={filters.dateFrom}
                  onChange={event => updateFilters({ dateFrom: event.target.value })}
                />
              </label>

              <label>
                По дату
                <input
                  type="date"
                  value={filters.dateTo}
                  onChange={event => updateFilters({ dateTo: event.target.value })}
                />
              </label>

              <label>
                Категория банка
                <select value={filters.bankCategory} onChange={event => updateFilters({ bankCategory: event.target.value })}>
                  <option value="">Все</option>
                  {bankCategories.map(category => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </label>

              <label>
                Моя категория
                <select value={filters.mappedCategoryId} onChange={event => updateFilters({ mappedCategoryId: event.target.value })}>
                  <option value="">Все</option>
                  {categories.map(category => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
                </select>
              </label>
            </section>

            <section className="section-card table-card">
              <div className="section-header">
                <h3>Все транзакции ({sortedTransactions.length})</h3>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={showPaymentDate}
                    onChange={event => setShowPaymentDate(event.target.checked)}
                  />
                  Показывать дату платежа
                </label>
              </div>

              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th className="sortable" onClick={() => handleSort('operation_at')}>
                        Дата операции {sortField === 'operation_at' ? (sortDirection === 'desc' ? '↓' : '↑') : ''}
                      </th>
                      {showPaymentDate && <th>Дата платежа</th>}
                      <th className="sortable" onClick={() => handleSort('category')}>
                        Категория {sortField === 'category' ? (sortDirection === 'desc' ? '↓' : '↑') : ''}
                      </th>
                      <th className="sortable" onClick={() => handleSort('description')}>
                        Описание {sortField === 'description' ? (sortDirection === 'desc' ? '↓' : '↑') : ''}
                      </th>
                      <th>MCC</th>
                      <th>Карта</th>
                      <th>Статус</th>
                      <th className="numeric sortable" onClick={() => handleSort('payment_amount')}>
                        Сумма {sortField === 'payment_amount' ? (sortDirection === 'desc' ? '↓' : '↑') : ''}
                      </th>
                      <th className="numeric">Кэшбэк</th>
                      <th className="numeric">Бонусы (вкл. кэшбэк)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={showPaymentDate ? 10 : 9} className="empty-state">Загрузка...</td>
                      </tr>
                    ) : pagedTransactions.length === 0 ? (
                      <tr>
                        <td colSpan={showPaymentDate ? 10 : 9} className="empty-state">Нет данных</td>
                      </tr>
                    ) : pagedTransactions.map(transaction => (
                      <tr key={transaction.id}>
                        <td>{formatDateTime(transaction.operation_at)}</td>
                        {showPaymentDate && <td>{formatDate(transaction.payment_date)}</td>}
                        <td>{getMappedCategoryName(transaction, categoriesById)}</td>
                        <td>{transaction.description || '—'}</td>
                        <td>{transaction.mcc || '—'}</td>
                        <td>{transaction.card_mask || '—'}</td>
                        <td>{transaction.status || '—'}</td>
                        <td className={`numeric amount-cell ${transaction.flow_direction === 'in' ? 'positive' : transaction.flow_direction === 'out' ? 'negative' : ''}`}>
                          {transaction.flow_direction === 'in' ? '+' : transaction.flow_direction === 'out' ? '−' : ''}
                          {formatAmount(Math.abs(transaction.payment_amount), 2)} ₽
                        </td>
                        <td className="numeric">{formatAmount(transaction.cashback_amount, 2)}</td>
                        <td className="numeric">{formatAmount(transaction.bonuses_amount, 2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="pagination">
                <button onClick={() => setPage(prev => Math.max(0, prev - 1))} disabled={currentPage <= 0}>
                  <ArrowLeft size={14} />
                </button>
                <span>{currentPage + 1} / {totalPages}</span>
                <button onClick={() => setPage(prev => Math.min(totalPages - 1, prev + 1))} disabled={currentPage >= totalPages - 1}>
                  <ArrowRight size={14} />
                </button>
              </div>
            </section>
          </>
        )}

        {view === 'analytics' && (
          <>
            <section className="analytics-grid">
              <article className="section-card">
                <h3>Расходы по категориям</h3>
                {expenseBreakdown.length === 0 ? (
                  <div className="empty-state">Нет данных для графика</div>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={expenseBreakdown} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                      <XAxis type="number" tick={{ fill: '#8B8BA3', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={formatAxisTick} />
                      <YAxis type="category" dataKey="name" tick={{ fill: '#C8C8E0', fontSize: 12 }} axisLine={false} tickLine={false} width={140} />
                      <Tooltip content={<DashboardTooltip />} />
                      <Bar dataKey="value" name="Сумма" radius={[0, 6, 6, 0]}>
                        {expenseBreakdown.map((_, index) => (
                          <Cell key={`expense-${index}`} fill={EXPENSE_PALETTE[index % EXPENSE_PALETTE.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </article>

              <article className="section-card">
                <h3>Доходы по категориям</h3>
                {incomeBreakdown.length === 0 ? (
                  <div className="empty-state">Нет данных для графика</div>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={incomeBreakdown} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                      <XAxis type="number" tick={{ fill: '#8B8BA3', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={formatAxisTick} />
                      <YAxis type="category" dataKey="name" tick={{ fill: '#C8C8E0', fontSize: 12 }} axisLine={false} tickLine={false} width={140} />
                      <Tooltip content={<DashboardTooltip />} />
                      <Bar dataKey="value" name="Сумма" radius={[0, 6, 6, 0]}>
                        {incomeBreakdown.map((_, index) => (
                          <Cell key={`income-${index}`} fill={INCOME_PALETTE[index % INCOME_PALETTE.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </article>
            </section>

            <section className="section-card">
              <h3>Доля расходов (% от общего)</h3>
              <div className="share-grid">
                {expenseBreakdown.length === 0 ? (
                  <div className="empty-state">Нет данных для расчёта</div>
                ) : expenseBreakdown.map((category, index) => {
                  const percent = totals.expense > 0 ? (category.value / totals.expense) * 100 : 0
                  return (
                    <article key={category.name} className="share-card">
                      <div className="share-head">
                        <span>{category.name}</span>
                        <strong style={{ color: EXPENSE_PALETTE[index % EXPENSE_PALETTE.length] }}>{percent.toFixed(1)}%</strong>
                      </div>
                      <div className="share-track">
                        <div
                          className="share-fill"
                          style={{
                            width: `${percent}%`,
                            background: EXPENSE_PALETTE[index % EXPENSE_PALETTE.length]
                          }}
                        />
                      </div>
                      <div className="share-value">{formatAmount(category.value)} ₽</div>
                    </article>
                  )
                })}
              </div>
            </section>

            <section className="section-card">
              <h3>Средний расход по дням недели</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={weekdayAverageData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="name" tick={{ fill: '#8B8BA3', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#8B8BA3', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={formatAxisTick} />
                  <Tooltip content={<DashboardTooltip />} />
                  <Bar dataKey="avg" name="Ср. расход" fill="#F9CA24" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </section>

            <section className="management-grid">
              <article className="section-card management-card">
                <h3>Мои категории</h3>

                <div className="category-create-row">
                  <input
                    type="text"
                    value={newCategoryName}
                    onChange={event => setNewCategoryName(event.target.value)}
                    placeholder="Новая категория"
                  />
                  <input
                    type="color"
                    value={newCategoryColor}
                    onChange={event => setNewCategoryColor(event.target.value)}
                    title="Цвет"
                  />
                  <button onClick={handleCreateCategory}>
                    <Plus size={14} />
                    Добавить
                  </button>
                </div>

                <div className="category-list">
                  {categories.length === 0 ? (
                    <div className="empty-state">Категории ещё не созданы</div>
                  ) : categories.map(category => {
                    const editing = editingCategoryId === category.id

                    return (
                      <div key={category.id} className="category-row">
                        {editing ? (
                          <>
                            <input
                              type="text"
                              value={editingCategoryName}
                              onChange={event => setEditingCategoryName(event.target.value)}
                            />
                            <input
                              type="color"
                              value={editingCategoryColor}
                              onChange={event => setEditingCategoryColor(event.target.value)}
                            />
                            <button onClick={saveEditCategory}>Сохранить</button>
                            <button className="ghost" onClick={cancelEditCategory}>Отмена</button>
                          </>
                        ) : (
                          <>
                            <span className="category-color" style={{ backgroundColor: category.color }} />
                            <span className="category-name">{category.name}</span>
                            <button onClick={() => startEditCategory(category)}>Изменить</button>
                            <button className="danger" onClick={() => handleDeleteCategory(category.id)}>Удалить</button>
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
              </article>

              <article className="section-card management-card">
                <h3>
                  <Link2 size={16} />
                  Маппинг категорий банка
                </h3>

                <div className="mapping-list">
                  {bankCategories.length === 0 ? (
                    <div className="empty-state">Сначала импортируйте выписку</div>
                  ) : bankCategories.map(bankCategory => (
                    <div key={bankCategory} className="mapping-row">
                      <span className="mapping-name">{bankCategory}</span>
                      <select
                        value={mappingByBankCategory.get(bankCategory) || ''}
                        onChange={event => handleMappingChange(bankCategory, event.target.value)}
                        disabled={mappingInProgress === bankCategory}
                      >
                        <option value="">Без маппинга</option>
                        {categories.map(category => (
                          <option key={category.id} value={category.id}>{category.name}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </article>
            </section>
          </>
        )}
      </div>
    </div>
  )
}

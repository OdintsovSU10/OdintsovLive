import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { AlertCircle, RefreshCw, Search, Upload } from 'lucide-react'
import { AnalyticsView } from './components/AnalyticsView'
import { CategoryManager } from './components/CategoryManager'
import { InsightsView } from './components/InsightsView'
import { OverviewView } from './components/OverviewView'
import { TransactionsView } from './components/TransactionsView'
import { useDashboardStats, type PeriodPreset } from './hooks/useDashboardStats'
import { useExpensesData } from './hooks/useExpensesData'
import type { ExpenseUserCategory } from './types'
import { getMappedCategoryName, toIsoDate } from './utils/format'
import './ExpensesPage.css'
import './Insights.css'

type DashboardView = 'overview' | 'insights' | 'transactions' | 'analytics'

const VIEWS: Array<{ key: DashboardView; label: string }> = [
  { key: 'overview', label: 'Обзор' },
  { key: 'insights', label: 'Разбор' },
  { key: 'transactions', label: 'Операции' },
  { key: 'analytics', label: 'Аналитика' }
]

const PERIODS: Array<{ key: PeriodPreset; label: string }> = [
  { key: 'month', label: 'Месяц' },
  { key: 'quarter', label: 'Квартал' },
  { key: 'half', label: 'Полгода' },
  { key: 'year', label: 'Год' },
  { key: 'all', label: 'Всё' }
]

const FLOWS = [
  { key: 'all', label: 'Все' },
  { key: 'in', label: 'Доходы' },
  { key: 'out', label: 'Расходы' }
] as const

function getPeriodRange(period: PeriodPreset): { from: string; to: string } {
  if (period === 'all') return { from: '', to: '' }

  const end = new Date()
  const start = new Date(end)

  if (period === 'month') start.setDate(1)
  else if (period === 'quarter') start.setMonth(start.getMonth() - 3)
  else if (period === 'half') start.setMonth(start.getMonth() - 6)
  else start.setFullYear(start.getFullYear() - 1)

  return { from: toIsoDate(start), to: toIsoDate(end) }
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
    insights,
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
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [actionError, setActionError] = useState<string | null>(null)

  const categoriesById = useMemo(
    () => new Map<string, ExpenseUserCategory>(categories.map(category => [category.id, category])),
    [categories]
  )

  const availableCategoryOptions = useMemo(() => {
    const set = new Set(transactions.map(transaction => getMappedCategoryName(transaction, categoriesById)))
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ru'))
  }, [categoriesById, transactions])

  useEffect(() => {
    setSelectedCategories(prev => prev.filter(category => availableCategoryOptions.includes(category)))
  }, [availableCategoryOptions])

  const displayTransactions = useMemo(() => {
    if (selectedCategories.length === 0) return transactions
    return transactions.filter(transaction => selectedCategories.includes(getMappedCategoryName(transaction, categoriesById)))
  }, [categoriesById, selectedCategories, transactions])

  const stats = useDashboardStats(displayTransactions, categoriesById, period)

  const applyPeriod = (nextPeriod: PeriodPreset) => {
    const range = getPeriodRange(nextPeriod)
    setPeriod(nextPeriod)
    updateFilters({ dateFrom: range.from, dateTo: range.to })
  }

  const handleResetFilters = () => {
    const range = getPeriodRange('month')
    setPeriod('month')
    setSelectedCategories([])
    updateFilters({ dateFrom: range.from, dateTo: range.to, flow: 'all', search: '', bankCategory: '', mappedCategoryId: '' })
  }

  const toggleCategory = (category: string) => {
    setSelectedCategories(prev => (
      prev.includes(category) ? prev.filter(item => item !== category) : [...prev, category]
    ))
  }

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setActionError(null)
    try {
      await importStatement(file)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Не удалось импортировать выписку')
    } finally {
      event.target.value = ''
    }
  }

  const showFilters = view !== 'insights'

  return (
    <div className="expenses-page">
      <header className="expenses-header">
        <div className="expenses-title">
          <h1>Траты</h1>
          <p>Выписки банка, подписки и лишние расходы</p>
        </div>

        <label className={`import-btn ${importing ? 'disabled' : ''}`}>
          <Upload size={18} strokeWidth={1.5} />
          <span>{importing ? 'Импорт...' : 'Импорт выписки'}</span>
          <input type="file" accept=".xlsx,.csv" onChange={handleImport} disabled={importing} hidden />
        </label>
      </header>

      <nav className="expenses-tabs" aria-label="Разделы">
        {VIEWS.map(item => (
          <button key={item.key} className={view === item.key ? 'active' : ''} onClick={() => setView(item.key)}>
            {item.label}
          </button>
        ))}
      </nav>

      {(error || actionError) && (
        <div className="alert error">
          <AlertCircle size={16} strokeWidth={1.5} />
          <span>{actionError || error}</span>
        </div>
      )}

      {lastImportSummary && (
        <div className="alert info">
          <span>
            Импорт {lastImportSummary.fileName}: строк {lastImportSummary.totalRows}, добавлено {lastImportSummary.insertedRows},
            обновлено {lastImportSummary.updatedRows}, пропущено {lastImportSummary.skippedRows}
            {lastImportSummary.mergedRows > 0 && `, склеено с записями бота ${lastImportSummary.mergedRows}`}
          </span>
        </div>
      )}

      {showFilters && (
        <>
          <section className="dashboard-filters">
            <div className="filter-group">
              {PERIODS.map(item => (
                <button key={item.key} className={`pill-btn ${period === item.key ? 'active' : ''}`} onClick={() => applyPeriod(item.key)}>
                  {item.label}
                </button>
              ))}
            </div>

            <div className="filter-group">
              {FLOWS.map(item => (
                <button key={item.key} className={`pill-btn ${filters.flow === item.key ? 'active' : ''}`} onClick={() => updateFilters({ flow: item.key })}>
                  {item.label}
                </button>
              ))}
            </div>

            <label className="search-field">
              <Search size={16} strokeWidth={1.5} />
              <input
                type="search"
                value={filters.search}
                onChange={event => updateFilters({ search: event.target.value })}
                placeholder="Описание, MCC, карта"
              />
            </label>

            <button className="pill-btn" onClick={handleResetFilters}>
              <RefreshCw size={14} strokeWidth={1.5} />
              Сброс
            </button>
          </section>

          {availableCategoryOptions.length > 0 && (
            <section className="category-pills">
              {availableCategoryOptions.map(category => (
                <button
                  key={category}
                  className={`category-pill ${selectedCategories.includes(category) ? 'active' : ''}`}
                  onClick={() => toggleCategory(category)}
                >
                  {category}
                </button>
              ))}
              {selectedCategories.length > 0 && (
                <button className="category-pill reset" onClick={() => setSelectedCategories([])}>Сбросить</button>
              )}
            </section>
          )}
        </>
      )}

      {view === 'overview' && (
        <OverviewView
          stats={stats}
          transactions={displayTransactions}
          categoriesById={categoriesById}
          insights={insights}
          loading={loading}
          onOpenInsights={() => setView('insights')}
        />
      )}

      {view === 'insights' && <InsightsView insights={insights} loading={loading} />}

      {view === 'transactions' && (
        <TransactionsView
          transactions={displayTransactions}
          categories={categories}
          categoriesById={categoriesById}
          bankCategories={bankCategories}
          filters={filters}
          loading={loading}
          onFiltersChange={updateFilters}
        />
      )}

      {view === 'analytics' && (
        <AnalyticsView stats={stats}>
          <CategoryManager
            categories={categories}
            mappings={mappings}
            bankCategories={bankCategories}
            onCreate={createCategory}
            onUpdate={updateCategory}
            onDelete={deleteCategory}
            onMap={upsertMapping}
            onError={setActionError}
          />
        </AnalyticsView>
      )}
    </div>
  )
}

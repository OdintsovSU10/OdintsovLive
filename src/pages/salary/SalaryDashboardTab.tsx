import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { getUserId } from '../../lib/auth'
import { YEARS } from '../../lib/constants'
import { isCurrentMonth, isFutureMonth } from '../../lib/dateUtils'
import { useSalaryData } from './hooks/useSalaryData'
import { getMonthStats, getSalary, getBonus, getTransport, getWorkDaysNorm, getVacationRate, calcEarned } from './utils'
import { KpiTiles } from './components/KpiTiles'
import { QuickPayment } from './components/QuickPayment'
import { MonthsTable } from './components/MonthsTable'
import type { IMonthRow } from './components/MonthsTable'
import { MonthDetails } from './components/MonthDetails'
import { PaymentsChart } from './components/PaymentsChart'
import type { Payment } from './types'
import '../SalaryPage.css'
import './SalaryDashboard.css'

const parseYearParam = (value: string | null): number => {
  const year = Number(value)
  return value !== null && YEARS.includes(year) ? year : new Date().getFullYear()
}

const parseMonthParam = (value: string | null): number | null => {
  if (value === null || value === '') return null
  const month = Number(value)
  return Number.isInteger(month) && month >= 0 && month <= 11 ? month : null
}

export default function SalaryDashboardTab() {
  const [searchParams] = useSearchParams()
  const [year, setYear] = useState(() => parseYearParam(searchParams.get('year')))
  const [expanded, setExpanded] = useState<number | null>(() => parseMonthParam(searchParams.get('month')))
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const {
    monthSalaries,
    monthBonuses,
    monthTransport,
    monthWorkDaysNorm,
    monthVacationRates,
    monthPayments,
    monthPaymentsList,
    monthStats,
    monthForecastDays,
    salarySource,
    loadSalarySettings,
    loadPaymentsForYear,
    loadStatsForYear,
    loadVacationRatesForYear,
    addPayment,
    deletePayment,
    saveMonthSettings
  } = useSalaryData()

  useEffect(() => {
    getUserId().then(uid => {
      if (uid) setUserId(uid)
      else setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    setLoading(true)

    Promise.all([
      loadSalarySettings(userId),
      loadPaymentsForYear(userId, year),
      loadStatsForYear(userId, year),
      loadVacationRatesForYear(userId, year)
    ]).then(() => {
      if (!cancelled) setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [year, userId, loadSalarySettings, loadPaymentsForYear, loadStatsForYear, loadVacationRatesForYear])

  const rows = useMemo<IMonthRow[]>(() => {
    const data = { monthStats, monthSalaries, monthBonuses, monthTransport, monthWorkDaysNorm, monthVacationRates }
    return Array.from({ length: 12 }, (_, monthIndex) => {
      const key = `${year}-${monthIndex}`
      const salary = getSalary(year, monthIndex, monthSalaries)
      const norm = getWorkDaysNorm(year, monthIndex, monthWorkDaysNorm)
      const earned = calcEarned(year, monthIndex, data)
      const paid = monthPayments[key] ?? 0
      return {
        monthIndex,
        stats: getMonthStats(year, monthIndex, monthStats),
        salary,
        norm,
        dailyRate: salary / norm,
        vacationRate: getVacationRate(year, monthIndex, monthVacationRates),
        bonus: getBonus(year, monthIndex, monthBonuses),
        transport: getTransport(year, monthIndex, monthTransport),
        earned,
        paid,
        balance: earned - paid,
        forecastDays: monthForecastDays[key] ?? 0,
        isCurrent: isCurrentMonth(year, monthIndex),
        isFuture: isFutureMonth(year, monthIndex)
      }
    })
  }, [
    year,
    monthStats,
    monthSalaries,
    monthBonuses,
    monthTransport,
    monthWorkDaysNorm,
    monthVacationRates,
    monthPayments,
    monthForecastDays
  ])

  const totals = useMemo(() => {
    const past = rows.filter(row => !row.isFuture)
    return {
      earnedToDate: past.reduce((sum, row) => sum + row.earned, 0),
      debt: past.reduce((sum, row) => sum + row.balance, 0),
      paidTotal: rows.reduce((sum, row) => sum + row.paid, 0),
      forecastYear: rows.reduce((sum, row) => sum + row.earned, 0)
    }
  }, [rows])

  const changeYear = (next: number) => {
    setYear(next)
    setExpanded(null)
  }

  const toggleMonth = useCallback((monthIndex: number) => {
    setExpanded(prev => (prev === monthIndex ? null : monthIndex))
  }, [])

  const handleAddPayment = (monthIndex: number, amount: number, note: string, date: string): Promise<boolean> =>
    userId ? addPayment(userId, year, monthIndex, amount, note, date) : Promise.resolve(false)

  const handleDeletePayment = (monthIndex: number, id: string): Promise<boolean> =>
    userId ? deletePayment(userId, year, monthIndex, id) : Promise.resolve(false)

  const handleSaveSettings = (
    monthIndex: number,
    patch: { bonus?: number; transport_base_cost?: number }
  ): Promise<boolean> =>
    userId ? saveMonthSettings(userId, year, monthIndex, patch) : Promise.resolve(false)

  const renderDetails = (row: IMonthRow) => {
    const payments: Payment[] = monthPaymentsList[`${year}-${row.monthIndex}`] ?? []
    return (
      <MonthDetails
        id={`sd-details-${row.monthIndex}`}
        row={row}
        payments={payments}
        salarySource={salarySource}
        onSaveSettings={patch => handleSaveSettings(row.monthIndex, patch)}
        onDeletePayment={id => handleDeletePayment(row.monthIndex, id)}
      />
    )
  }

  return (
    <div className="sd-page">
      <div className="salary-header">
        <button
          type="button"
          className="year-btn"
          aria-label="Предыдущий год"
          onClick={() => changeYear(Math.max(YEARS[0], year - 1))}
          disabled={year === YEARS[0]}
        >
          <ChevronLeft size={20} />
        </button>
        <select
          className="year-select"
          aria-label="Год"
          value={year}
          onChange={e => changeYear(Number(e.target.value))}
        >
          {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <button
          type="button"
          className="year-btn"
          aria-label="Следующий год"
          onClick={() => changeYear(Math.min(YEARS[YEARS.length - 1], year + 1))}
          disabled={year === YEARS[YEARS.length - 1]}
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {loading ? (
        <div className="loading">Загрузка...</div>
      ) : (
        <>
          <KpiTiles
            year={year}
            earnedToDate={totals.earnedToDate}
            paidTotal={totals.paidTotal}
            debt={totals.debt}
            forecastYear={totals.forecastYear}
            salarySource={salarySource}
          />

          <QuickPayment year={year} rows={rows} onAddPayment={handleAddPayment} />

          <div className="sd-main">
            <MonthsTable
              rows={rows}
              expanded={expanded}
              onToggle={toggleMonth}
              renderDetails={renderDetails}
            />
            <div className="sd-chart-col">
              <PaymentsChart rows={rows} />
            </div>
          </div>
        </>
      )}
    </div>
  )
}

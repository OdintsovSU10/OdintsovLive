import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getUserId } from '../../lib/auth'
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

const parseMonthParam = (value: string | null): number | null => {
  if (value === null || value === '') return null
  const month = Number(value)
  return Number.isInteger(month) && month >= 0 && month <= 11 ? month : null
}

interface ISalaryDashboardTabProps {
  year: number
}

export default function SalaryDashboardTab({ year }: ISalaryDashboardTabProps) {
  const [searchParams] = useSearchParams()
  const [expanded, setExpanded] = useState<number | null>(() => parseMonthParam(searchParams.get('month')))
  const [prevYear, setPrevYear] = useState(year)
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
      debt: past.filter(row => !row.isCurrent).reduce((sum, row) => sum + row.balance, 0),
      paidTotal: rows.reduce((sum, row) => sum + row.paid, 0),
      forecastYear: rows.reduce((sum, row) => sum + row.earned, 0)
    }
  }, [rows])

  // При смене года раскрытый месяц сбрасываем
  if (prevYear !== year) {
    setPrevYear(year)
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

import { useEffect, useMemo, useState } from 'react'
import { useSalaryData } from '../salary/hooks/useSalaryData'
import { calcEarned, getMonthStats, getVacationRate, getWorkDaysNorm } from '../salary/utils'
import type { MonthStats } from '../salary/types'

export interface SalarySummary {
  year: number
  month: number
  earned: number
  paid: number
  /** С января по текущий месяц включительно */
  ytdEarned: number
  ytdPaid: number
  stats: MonthStats
  norm: number
  /** Последняя ненулевая дневная ставка года — как на странице «Отпускные» */
  vacationRate: number
  yearVacationDays: number
}

// Зарплата, рабочие дни и отпускные на главной — одна загрузка на три карточки
export function useSalarySummary(userId: string): SalarySummary | null {
  const salary = useSalaryData()
  const { loadSalarySettings, loadPaymentsForYear, loadStatsForYear, loadVacationRatesForYear } = salary
  const [{ year, month }] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    Promise.all([
      loadSalarySettings(userId),
      loadPaymentsForYear(userId, year),
      loadStatsForYear(userId, year),
      loadVacationRatesForYear(userId, year)
    ]).then(() => setLoaded(true))
  }, [userId, year, loadSalarySettings, loadPaymentsForYear, loadStatsForYear, loadVacationRatesForYear])

  const { monthStats, monthSalaries, monthBonuses, monthTransport, monthWorkDaysNorm, monthVacationRates, monthPayments } = salary

  return useMemo(() => {
    if (!loaded) return null
    const data = { monthStats, monthSalaries, monthBonuses, monthTransport, monthWorkDaysNorm, monthVacationRates }
    const paidIn = (m: number) => monthPayments[`${year}-${m}`] ?? 0

    let ytdEarned = 0
    let ytdPaid = 0
    for (let m = 0; m <= month; m++) {
      ytdEarned += calcEarned(year, m, data)
      ytdPaid += paidIn(m)
    }

    let vacationRate = 0
    let yearVacationDays = 0
    for (let m = 11; m >= 0; m--) {
      if (!vacationRate) vacationRate = getVacationRate(year, m, monthVacationRates)
      yearVacationDays += getMonthStats(year, m, monthStats).vacation
    }

    return {
      year,
      month,
      earned: calcEarned(year, month, data),
      paid: paidIn(month),
      ytdEarned,
      ytdPaid,
      stats: getMonthStats(year, month, monthStats),
      norm: getWorkDaysNorm(year, month, monthWorkDaysNorm),
      vacationRate,
      yearVacationDays
    }
  }, [loaded, year, month, monthStats, monthSalaries, monthBonuses, monthTransport, monthWorkDaysNorm, monthVacationRates, monthPayments])
}

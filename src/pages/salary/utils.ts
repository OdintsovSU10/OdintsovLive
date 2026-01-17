import { getWorkDaysNorm as getDefaultWorkDaysNorm } from '../../lib/workNorms'
import { MonthStats } from './types'

export const getMonthStats = (
  year: number,
  monthIndex: number,
  monthStats: { [key: string]: MonthStats }
): MonthStats => {
  return monthStats[`${year}-${monthIndex}`] ?? { work: 0, worked: 0, vacation: 0 }
}

export const getSalary = (
  year: number,
  monthIndex: number,
  monthSalaries: { [key: string]: number }
): number => {
  return monthSalaries[`${year}-${monthIndex}`] ?? 100000
}

export const getBonus = (
  year: number,
  monthIndex: number,
  monthBonuses: { [key: string]: number }
): number => {
  return monthBonuses[`${year}-${monthIndex}`] ?? 0
}

export const getTransport = (
  year: number,
  monthIndex: number,
  monthTransport: { [key: string]: number }
): number => {
  return monthTransport[`${year}-${monthIndex}`] ?? 0
}

export const getWorkDaysNorm = (
  year: number,
  monthIndex: number,
  monthWorkDaysNorm: { [key: string]: number }
): number => {
  return monthWorkDaysNorm[`${year}-${monthIndex}`] ?? getDefaultWorkDaysNorm(year, monthIndex)
}

export const getVacationRate = (
  year: number,
  monthIndex: number,
  monthVacationRates: { [key: string]: number }
): number => {
  return monthVacationRates[`${year}-${monthIndex}`] ?? 0
}

export const calcEarned = (
  year: number,
  monthIndex: number,
  data: {
    monthStats: { [key: string]: MonthStats }
    monthSalaries: { [key: string]: number }
    monthBonuses: { [key: string]: number }
    monthTransport: { [key: string]: number }
    monthWorkDaysNorm: { [key: string]: number }
    monthVacationRates: { [key: string]: number }
  }
): number => {
  const stats = getMonthStats(year, monthIndex, data.monthStats)
  const salary = getSalary(year, monthIndex, data.monthSalaries)
  const bonus = getBonus(year, monthIndex, data.monthBonuses)
  const transport = getTransport(year, monthIndex, data.monthTransport)
  const vacationRate = getVacationRate(year, monthIndex, data.monthVacationRates)
  const legalDays = getWorkDaysNorm(year, monthIndex, data.monthWorkDaysNorm)
  const dailyRate = salary / legalDays
  const transportDailyRate = transport / legalDays
  const vacationPayment = stats.vacation * vacationRate
  return dailyRate * stats.work + dailyRate * stats.worked + bonus + transportDailyRate * stats.work + vacationPayment
}

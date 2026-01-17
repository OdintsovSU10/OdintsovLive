import { useState, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import { getWorkDaysNorm as getDefaultWorkDaysNorm } from '../../../lib/workNorms'
import { Payment, MonthStats } from '../types'

export function useSalaryData() {
  const [monthSalaries, setMonthSalaries] = useState<{ [key: string]: number }>({})
  const [monthBonuses, setMonthBonuses] = useState<{ [key: string]: number }>({})
  const [monthTransport, setMonthTransport] = useState<{ [key: string]: number }>({})
  const [monthWorkDaysNorm, setMonthWorkDaysNorm] = useState<{ [key: string]: number }>({})
  const [monthVacationRates, setMonthVacationRates] = useState<{ [key: string]: number }>({})
  const [salaryInputs, setSalaryInputs] = useState<{ [key: string]: string }>({})
  const [monthPayments, setMonthPayments] = useState<{ [key: string]: number }>({})
  const [monthPaymentsList, setMonthPaymentsList] = useState<{ [key: string]: Payment[] }>({})
  const [monthStats, setMonthStats] = useState<{ [key: string]: MonthStats }>({})

  const isManualMonthCheck = (y: number, m: number) => y < 2025 || (y === 2025 && m <= 2)

  const loadSalarySettings = useCallback(async (userId: string) => {
    const { data: salaryData } = await supabase
      .from('salary_settings')
      .select('year, month, base_salary, bonus, transport_base_cost, work_days_norm, manual_vacation_rate')
      .eq('user_id', userId)

    if (salaryData) {
      const loaded: { [key: string]: number } = {}
      const bonuses: { [key: string]: number } = {}
      const transport: { [key: string]: number } = {}
      const workDaysNorm: { [key: string]: number } = {}
      const vacationRates: { [key: string]: number } = {}
      const inputs: { [key: string]: string } = {}

      salaryData.forEach(row => {
        const key = `${row.year}-${row.month}`
        const val = Number(row.base_salary)
        loaded[key] = val
        bonuses[key] = Number(row.bonus) || 0
        transport[key] = Number(row.transport_base_cost) || 0
        workDaysNorm[key] = Number(row.work_days_norm) || getDefaultWorkDaysNorm(row.year, row.month)
        if (isManualMonthCheck(row.year, row.month)) {
          vacationRates[key] = Number(row.manual_vacation_rate) || 0
        }
        inputs[key] = val.toLocaleString('ru-RU')
      })

      setMonthSalaries(loaded)
      setMonthBonuses(bonuses)
      setMonthTransport(transport)
      setMonthWorkDaysNorm(workDaysNorm)
      setMonthVacationRates(prev => ({ ...prev, ...vacationRates }))
      setSalaryInputs(inputs)
    }
  }, [])

  const loadPaymentsForYear = useCallback(async (userId: string, year: number) => {
    const { data } = await supabase
      .from('salary_payments')
      .select('id, month, amount, date, note')
      .eq('user_id', userId)
      .eq('year', year)
      .order('date', { ascending: false })

    if (data) {
      const totals: { [key: string]: number } = {}
      const lists: { [key: string]: Payment[] } = {}

      data.forEach(row => {
        const key = `${year}-${row.month}`
        totals[key] = (totals[key] || 0) + Number(row.amount)
        if (!lists[key]) lists[key] = []
        lists[key].push({
          id: row.id,
          amount: Number(row.amount),
          date: row.date,
          note: row.note || ''
        })
      })

      setMonthPayments(totals)
      setMonthPaymentsList(lists)
    }
  }, [])

  const loadStatsForYear = useCallback(async (userId: string, year: number) => {
    const { data } = await supabase
      .from('salary_calculations')
      .select('month, work_days, worked_days, vacation_days')
      .eq('user_id', userId)
      .eq('year', year)

    if (data) {
      const stats: { [key: string]: MonthStats } = {}
      data.forEach(row => {
        stats[`${year}-${row.month}`] = {
          work: row.work_days || 0,
          worked: row.worked_days || 0,
          vacation: row.vacation_days || 0
        }
      })
      setMonthStats(stats)
    }
  }, [])

  const loadVacationRatesForYear = useCallback(async (userId: string, year: number) => {
    const isManualMonth = (y: number, m: number) => y < 2025 || (y === 2025 && m <= 2)

    const { data } = await supabase
      .from('vacation_rate')
      .select('month, daily_vacation_rate')
      .eq('user_id', userId)
      .eq('year', year)

    if (data) {
      const rates: { [key: string]: number } = {}
      data.forEach(row => {
        const key = `${year}-${row.month}`
        if (!isManualMonth(year, row.month)) {
          rates[key] = Number(row.daily_vacation_rate) || 0
        }
      })
      setMonthVacationRates(prev => ({ ...prev, ...rates }))
    }
  }, [])

  const saveSalary = useCallback(async (userId: string, year: number, monthIndex: number, value: number) => {
    await supabase.from('salary_settings').upsert(
      { user_id: userId, year, month: monthIndex, base_salary: value },
      { onConflict: 'user_id,year,month' }
    )
  }, [])

  const addPayment = useCallback(async (userId: string, year: number, monthIndex: number, amount: number, note: string) => {
    const { data, error } = await supabase
      .from('salary_payments')
      .insert({
        user_id: userId,
        year,
        month: monthIndex,
        amount,
        date: new Date().toISOString().split('T')[0],
        note
      })
      .select()
      .single()

    if (!error && data) {
      const key = `${year}-${monthIndex}`
      setMonthPayments(prev => ({ ...prev, [key]: (prev[key] || 0) + amount }))
      setMonthPaymentsList(prev => ({
        ...prev,
        [key]: [{
          id: data.id,
          amount: Number(data.amount),
          date: data.date,
          note: data.note || ''
        }, ...(prev[key] || [])]
      }))
      return true
    }
    return false
  }, [])

  return {
    monthSalaries,
    setMonthSalaries,
    monthBonuses,
    monthTransport,
    monthWorkDaysNorm,
    monthVacationRates,
    salaryInputs,
    setSalaryInputs,
    monthPayments,
    monthPaymentsList,
    monthStats,
    loadSalarySettings,
    loadPaymentsForYear,
    loadStatsForYear,
    loadVacationRatesForYear,
    saveSalary,
    addPayment
  }
}

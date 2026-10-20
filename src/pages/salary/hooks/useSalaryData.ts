import { useState, useCallback, useMemo, useRef } from 'react'
import { supabase } from '../../../lib/supabase'
import { getWorkDaysNorm as getDefaultWorkDaysNorm } from '../../../lib/workNorms'
import { getSalaryForMonth } from '../../tender/utils/salaryCalculator'
import type { SalaryHistory, TimesheetStatus } from '../../tender/types'
import { Payment, MonthStats } from '../types'
import { buildYearStats } from '../timesheetStats'
import type { TimesheetDay, PlanDay } from '../timesheetStats'

export type SalarySource = 'tender' | 'personal'

const DEFAULT_BASE_SALARY = 100000

// Локальная дата YYYY-MM-DD (без сдвига UTC)
const toLocalIso = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const sortPaymentsDesc = (list: Payment[]): Payment[] =>
  [...list].sort((a, b) => b.date.localeCompare(a.date))

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
  const [tenderSalaries, setTenderSalaries] = useState<{ [key: string]: number }>({})
  const [tenderNorms, setTenderNorms] = useState<{ [key: string]: number }>({})
  const [monthForecastDays, setMonthForecastDays] = useState<{ [key: string]: number }>({})
  const [salarySource, setSalarySource] = useState<SalarySource>('personal')
  // Ключи месяцев, для которых в salary_settings уже есть строка
  const settingsKeysRef = useRef<Set<string>>(new Set())

  // Итоговые значения: данные тендерного модуля приоритетнее личных настроек
  const mergedSalaries = useMemo(() => ({ ...monthSalaries, ...tenderSalaries }), [monthSalaries, tenderSalaries])
  const mergedNorms = useMemo(() => ({ ...monthWorkDaysNorm, ...tenderNorms }), [monthWorkDaysNorm, tenderNorms])
  const mergedRef = useRef({ salaries: mergedSalaries, norms: mergedNorms })
  mergedRef.current = { salaries: mergedSalaries, norms: mergedNorms }

  const isManualMonthCheck = (y: number, m: number) => y < 2025 || (y === 2025 && m <= 2)

  const loadSalarySettings = useCallback(async (userId: string) => {
    const { data: salaryData } = await supabase
      .from('salary_settings')
      .select('year, month, base_salary, bonus, transport_base_cost, work_days_norm, manual_vacation_rate')
      .eq('user_id', userId)

    if (salaryData) {
      settingsKeysRef.current = new Set(salaryData.map(row => `${row.year}-${row.month}`))
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
    const prefix = `${year}-`
    const dropYear = (prev: { [key: string]: number }) =>
      Object.fromEntries(Object.entries(prev).filter(([k]) => !k.startsWith(prefix)))

    const { data: profile } = await supabase
      .from('profiles')
      .select('tender_employee_id')
      .eq('id', userId)
      .maybeSingle()

    const employeeId: number | null = profile?.tender_employee_id ?? null

    if (employeeId === null) {
      setSalarySource('personal')
      setTenderSalaries(dropYear)
      setTenderNorms(dropYear)
      setMonthForecastDays(dropYear)

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
      return
    }

    const yearStart = `${year}-01-01`
    const yearEnd = `${year}-12-31`
    const [timesheetRes, historyRes, employeeRes, planRes] = await Promise.all([
      supabase
        .from('tender_timesheet')
        .select('work_date, status, hours_worked')
        .eq('employee_id', employeeId)
        .gte('work_date', yearStart)
        .lte('work_date', yearEnd),
      supabase
        .from('tender_salary_history')
        .select('salary, effective_date')
        .eq('employee_id', employeeId),
      supabase
        .from('tender_employees')
        .select('current_salary')
        .eq('id', employeeId)
        .maybeSingle(),
      supabase
        .from('calendar_days')
        .select('date, status')
        .eq('user_id', userId)
        .gte('date', yearStart)
        .lte('date', yearEnd)
    ])

    const timesheet: TimesheetDay[] = (timesheetRes.data || []).map(row => ({
      work_date: row.work_date as string,
      status: row.status as TimesheetStatus,
      hours_worked: row.hours_worked === null || row.hours_worked === undefined ? null : Number(row.hours_worked)
    }))
    const plan: PlanDay[] = (planRes.data || []).map(row => ({
      date: row.date as string,
      status: row.status as string
    }))
    const history: SalaryHistory[] = (historyRes.data || []).map(row => ({
      id: 0,
      employee_id: employeeId,
      salary: Number(row.salary) || 0,
      effective_date: row.effective_date as string,
      note: null
    }))
    const currentSalary = Number(employeeRes.data?.current_salary) || 0

    const { stats, forecastDays } = buildYearStats(year, timesheet, plan, toLocalIso(new Date()))

    const salaries: { [key: string]: number } = {}
    const norms: { [key: string]: number } = {}
    for (let m = 0; m < 12; m++) {
      const key = `${year}-${m}`
      salaries[key] = getSalaryForMonth(history, currentSalary, year, m + 1)
      norms[key] = getDefaultWorkDaysNorm(year, m)
    }

    setMonthStats(stats)
    setMonthForecastDays(prev => ({ ...dropYear(prev), ...forecastDays }))
    setTenderSalaries(prev => ({ ...dropYear(prev), ...salaries }))
    setTenderNorms(prev => ({ ...dropYear(prev), ...norms }))
    setSalarySource('tender')
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
    const { error } = await supabase.from('salary_settings').upsert(
      { user_id: userId, year, month: monthIndex, base_salary: value },
      { onConflict: 'user_id,year,month' }
    )
    if (!error) settingsKeysRef.current.add(`${year}-${monthIndex}`)
  }, [])

  const addPayment = useCallback(async (
    userId: string,
    year: number,
    monthIndex: number,
    amount: number,
    note: string,
    date?: string
  ): Promise<boolean> => {
    const { data, error } = await supabase
      .from('salary_payments')
      .insert({
        user_id: userId,
        year,
        month: monthIndex,
        amount,
        date: date || toLocalIso(new Date()),
        note
      })
      .select()
      .single()

    if (!error && data) {
      const key = `${year}-${monthIndex}`
      setMonthPayments(prev => ({ ...prev, [key]: (prev[key] || 0) + amount }))
      setMonthPaymentsList(prev => ({
        ...prev,
        [key]: sortPaymentsDesc([{
          id: data.id,
          amount: Number(data.amount),
          date: data.date,
          note: data.note || ''
        }, ...(prev[key] || [])])
      }))
      return true
    }
    return false
  }, [])

  const deletePayment = useCallback(async (
    userId: string,
    year: number,
    monthIndex: number,
    id: string
  ): Promise<boolean> => {
    const { data, error } = await supabase
      .from('salary_payments')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
      .select('amount')

    if (error || !data || data.length === 0) return false

    const key = `${year}-${monthIndex}`
    const removed = data.reduce((sum, row) => sum + Number(row.amount), 0)
    setMonthPayments(prev => ({ ...prev, [key]: (prev[key] || 0) - removed }))
    setMonthPaymentsList(prev => ({
      ...prev,
      [key]: (prev[key] || []).filter(p => p.id !== id)
    }))
    return true
  }, [])

  const saveMonthSettings = useCallback(async (
    userId: string,
    year: number,
    monthIndex: number,
    patch: { bonus?: number; transport_base_cost?: number }
  ): Promise<boolean> => {
    const key = `${year}-${monthIndex}`
    const row: Record<string, string | number> = { user_id: userId, year, month: monthIndex, ...patch }

    // Без строки в salary_settings подставляем актуальные значения, а не дефолты БД (100000 / 22)
    if (!settingsKeysRef.current.has(key)) {
      row.base_salary = mergedRef.current.salaries[key] ?? DEFAULT_BASE_SALARY
      row.work_days_norm = mergedRef.current.norms[key] ?? getDefaultWorkDaysNorm(year, monthIndex)
    }

    const { error } = await supabase
      .from('salary_settings')
      .upsert(row, { onConflict: 'user_id,year,month' })

    if (error) return false

    settingsKeysRef.current.add(key)
    if (patch.bonus !== undefined) {
      const bonus = patch.bonus
      setMonthBonuses(prev => ({ ...prev, [key]: bonus }))
    }
    if (patch.transport_base_cost !== undefined) {
      const transport = patch.transport_base_cost
      setMonthTransport(prev => ({ ...prev, [key]: transport }))
    }
    return true
  }, [])

  return {
    monthSalaries: mergedSalaries,
    setMonthSalaries,
    monthBonuses,
    monthTransport,
    monthWorkDaysNorm: mergedNorms,
    monthVacationRates,
    salaryInputs,
    setSalaryInputs,
    monthPayments,
    monthPaymentsList,
    monthStats,
    monthForecastDays,
    salarySource,
    loadSalarySettings,
    loadPaymentsForYear,
    loadStatsForYear,
    loadVacationRatesForYear,
    saveSalary,
    addPayment,
    deletePayment,
    saveMonthSettings
  }
}

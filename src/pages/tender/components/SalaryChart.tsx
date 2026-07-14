import { useState, useEffect } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { supabase } from '../../../lib/supabase'
import { calculateSalary, formatMoney, roundTimesheetHours } from '../utils/salaryCalculator'
import type { TimesheetEntry, SalaryHistory } from '../types'

interface Props {
  employeeId: number
  currentSalary: number
}

interface ChartData {
  month: string
  fullMonth: string
  salary: number  // оклад
  realSalary: number  // итого (оклад + выходные + проезд)
}

const TRANSPORT_KEY = 'fot_base_transport'
const DEFAULT_TRANSPORT = 2730

const monthNames = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек']

export function SalaryChart({ employeeId, currentSalary }: Props) {
  const [data, setData] = useState<ChartData[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [employeeId])

  const loadData = async () => {
    setLoading(true)

    const baseTransport = Number(localStorage.getItem(TRANSPORT_KEY)) || DEFAULT_TRANSPORT
    const now = new Date()
    const months: { year: number; month: number }[] = []

    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      months.push({ year: d.getFullYear(), month: d.getMonth() + 1 })
    }

    const firstMonth = months[0]
    const lastMonth = months[months.length - 1]
    const startDate = `${firstMonth.year}-${String(firstMonth.month).padStart(2, '0')}-01`
    const lastDay = new Date(lastMonth.year, lastMonth.month, 0).getDate()
    const endDate = `${lastMonth.year}-${String(lastMonth.month).padStart(2, '0')}-${lastDay}`

    const [timesheetRes, salaryRes] = await Promise.all([
      supabase
        .from('tender_timesheet')
        .select('*')
        .eq('employee_id', employeeId)
        .gte('work_date', startDate)
        .lte('work_date', endDate),
      supabase
        .from('tender_salary_history')
        .select('*')
        .eq('employee_id', employeeId)
        .order('effective_date', { ascending: true })
    ])

    const timesheet: TimesheetEntry[] = ((timesheetRes.data || []) as TimesheetEntry[]).map(entry => ({
      ...entry,
      hours_worked: entry.hours_worked == null ? null : roundTimesheetHours(entry.hours_worked)
    }))
    const salaryHistory: SalaryHistory[] = salaryRes.data || []

    const getSalaryForDate = (year: number, month: number): number => {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-01`
      let salary = currentSalary
      for (const h of salaryHistory) {
        if (h.effective_date <= dateStr) {
          salary = h.salary
        }
      }
      return salary
    }

    const chartData: ChartData[] = months.map(({ year, month }) => {
      const monthTimesheet = timesheet.filter(t => {
        const d = new Date(t.work_date)
        return d.getFullYear() === year && d.getMonth() + 1 === month
      })

      const baseSalary = getSalaryForDate(year, month)
      const calc = calculateSalary({
        employee_id: employeeId,
        base_salary: baseSalary,
        year,
        month,
        timesheet: monthTimesheet,
        transport: baseTransport
      })

      return {
        month: monthNames[month - 1],
        fullMonth: `${monthNames[month - 1]} ${year}`,
        salary: baseSalary,
        realSalary: calc.final_salary
      }
    })

    setData(chartData)
    setLoading(false)
  }

  if (loading) {
    return <div className="salary-chart-loading">Загрузка...</div>
  }

  if (data.length === 0) {
    return <div className="salary-chart-empty">Нет данных</div>
  }

  return (
    <div className="salary-chart">
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 11, fill: 'var(--color-text-secondary)' }}
            stroke="var(--color-border)"
            interval={0}
          />
          <YAxis
            tick={{ fontSize: 11, fill: 'var(--color-text-secondary)' }}
            stroke="var(--color-border)"
            tickFormatter={(v) => `${(v / 1000).toFixed(0)}к`}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--color-bg)',
              border: '1px solid var(--color-border)',
              borderRadius: '8px',
              fontSize: '13px'
            }}
            labelFormatter={(_, payload) => payload[0]?.payload?.fullMonth || ''}
            formatter={(value, name) => [
              formatMoney(value as number),
              name === 'salary' ? 'Оклад' : 'Итого'
            ]}
          />
          <Legend
            formatter={(value) => value === 'salary' ? 'Оклад' : 'Итого ЗП'}
            wrapperStyle={{ fontSize: '13px' }}
          />
          <Line
            type="monotone"
            dataKey="salary"
            stroke="#9e9e9e"
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={{ fill: '#9e9e9e', r: 3 }}
          />
          <Line
            type="monotone"
            dataKey="realSalary"
            stroke="#4caf50"
            strokeWidth={2}
            dot={{ fill: '#4caf50', r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

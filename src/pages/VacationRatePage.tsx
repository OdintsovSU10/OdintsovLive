import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { supabase } from '../lib/supabase'
import './VacationRatePage.css'

interface MonthData {
  month: number
  base_salary: number
  worked_days: number
  vacation_days: number
  calendar_days: number
  adjusted_days: number
  daily_vacation_rate: number
}

const MONTHS = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
]

const YEARS = [2024, 2025, 2026, 2027, 2028, 2029, 2030]

function isManualMonth(year: number, month: number): boolean {
  return year < 2025 || (year === 2025 && month <= 2)
}

export default function VacationRatePage() {
  const [year, setYear] = useState(new Date().getFullYear())
  const [userId, setUserId] = useState<string | null>(null)
  const [data, setData] = useState<MonthData[]>([])
  const [dataYear, setDataYear] = useState<number | null>(null)
  const [manualRates, setManualRates] = useState<{ [key: string]: number }>({})
  const [rateInputs, setRateInputs] = useState<{ [key: string]: string }>({})
  const [loading, setLoading] = useState(true)
  const [initialLoading, setInitialLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUserId(user.id)
        loadManualRates(user.id).then(() => setInitialLoading(false))
      }
    })
  }, [])

  useEffect(() => {
    if (userId) {
      setData([])
      setLoading(true)
      loadData()
    }
  }, [year, userId])

  const loadManualRates = async (uid: string) => {
    const { data } = await supabase
      .from('salary_settings')
      .select('year, month, manual_vacation_rate')
      .eq('user_id', uid)
      .not('manual_vacation_rate', 'is', null)

    if (data) {
      const rates: { [key: string]: number } = {}
      const inputs: { [key: string]: string } = {}
      data.forEach(row => {
        const key = `${row.year}-${row.month}`
        const val = Number(row.manual_vacation_rate)
        rates[key] = val
        inputs[key] = val.toLocaleString('ru-RU')
      })
      setManualRates(rates)
      setRateInputs(inputs)
    }
  }

  const loadData = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: rateData } = await supabase
      .from('vacation_rate')
      .select('*')
      .eq('user_id', user.id)
      .eq('year', year)
      .order('month')

    if (rateData) {
      setData(rateData)
      setDataYear(year)
    }
    setLoading(false)
  }

  const getMonthData = (monthIndex: number): MonthData | null => {
    return data.find(d => d.month === monthIndex) || null
  }

  const getManualRate = (monthIndex: number): number | null => {
    return manualRates[`${year}-${monthIndex}`] ?? null
  }

  const getRateInput = (monthIndex: number): string => {
    return rateInputs[`${year}-${monthIndex}`] ?? ''
  }

  const parseNumber = (value: string): number => {
    const cleaned = value.replace(/\s/g, '').replace(',', '.')
    return parseFloat(cleaned) || 0
  }

  const handleRateChange = (monthIndex: number, value: string) => {
    const key = `${year}-${monthIndex}`
    setRateInputs(prev => ({ ...prev, [key]: value }))
  }

  const handleRateBlur = async (monthIndex: number) => {
    if (!userId) return
    const key = `${year}-${monthIndex}`
    const value = parseNumber(rateInputs[key] || '0') || 0

    setManualRates(prev => ({ ...prev, [key]: value }))
    setRateInputs(prev => ({ ...prev, [key]: value > 0 ? Math.round(value).toLocaleString('ru-RU') : '' }))

    await supabase.from('salary_settings').upsert(
      { user_id: userId, year, month: monthIndex, manual_vacation_rate: value || null },
      { onConflict: 'user_id,year,month' }
    )
  }

  const getEffectiveRate = (monthIndex: number): number => {
    if (isManualMonth(year, monthIndex)) {
      return getManualRate(monthIndex) || 0
    }
    const month = getMonthData(monthIndex)
    return month?.daily_vacation_rate || 0
  }

  const currentRate = (() => {
    for (let i = 11; i >= 0; i--) {
      const rate = getEffectiveRate(i)
      if (rate > 0) return rate
    }
    return 0
  })()

  const totalVacationDays = data.reduce((sum, d) => sum + (d.vacation_days || 0), 0)
  const totalVacationPay = data.reduce((sum, d) => {
    const rate = getEffectiveRate(d.month)
    return sum + (d.vacation_days || 0) * rate
  }, 0)

  const chartData = MONTHS.map((name, i) => ({
    name,
    value: getEffectiveRate(i)
  }))

  const isLoading = loading || dataYear !== year

  if (initialLoading) {
    return (
      <div className="vacation-rate-page">
        <div className="loading">Загрузка...</div>
      </div>
    )
  }

  return (
    <div className="vacation-rate-page">
      <div className="vacation-header">
        <button
          className="year-btn"
          onClick={() => setYear(y => Math.max(YEARS[0], y - 1))}
          disabled={year === YEARS[0]}
        >
          <ChevronLeft size={20} />
        </button>
        <select
          className="year-select"
          value={year}
          onChange={e => setYear(Number(e.target.value))}
        >
          {YEARS.map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <button
          className="year-btn"
          onClick={() => setYear(y => Math.min(YEARS[YEARS.length - 1], y + 1))}
          disabled={year === YEARS[YEARS.length - 1]}
        >
          <ChevronRight size={20} />
        </button>
      </div>

      <div className="vacation-summary">
        <div className="summary-card">
          <span className="summary-label">Текущая ставка</span>
          <span className="summary-value">{isLoading ? '—' : `${Math.round(currentRate).toLocaleString('ru-RU')} ₽/день`}</span>
        </div>
        <div className="summary-card">
          <span className="summary-label">Дней отпуска</span>
          <span className="summary-value">{isLoading ? '—' : totalVacationDays}</span>
        </div>
        <div className="summary-card highlight">
          <span className="summary-label">Сумма отпускных</span>
          <span className="summary-value">{isLoading ? '—' : `${Math.round(totalVacationPay).toLocaleString('ru-RU')} ₽`}</span>
        </div>
      </div>

      <div className="formula-info">
        <p>СДЗ = Сумма зарплат за 12 мес. / (29,3 × полные мес. + дни неполных)</p>
      </div>

      {!isLoading && chartData.some(d => d.value > 0) && (
        <div className="vacation-chart">
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="colorVacation" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="var(--primary)" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} width={40} />
              <Tooltip formatter={(value) => [(value as number).toLocaleString('ru-RU') + ' ₽/день', 'Ставка']} />
              <Area
                type="monotone"
                dataKey="value"
                stroke="var(--primary)"
                strokeWidth={2}
                fill="url(#colorVacation)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {isLoading ? (
        <div className="loading">Загрузка...</div>
      ) : (
        <>
        <div className="months-table">
          <div className="table-header">
            <span>Месяц</span>
            <span>Выплаты</span>
            <span className="center">Отработано</span>
            <span className="center">Отпуск</span>
            <span>Коэфф.</span>
            <span>Ставка</span>
          </div>
          {MONTHS.map((monthName, i) => {
            const month = getMonthData(i)
            const isEmpty = !month
            const isManual = isManualMonth(year, i)
            const rate = getEffectiveRate(i)

            return (
              <div key={i} className={`table-row ${isEmpty ? 'empty' : ''}`}>
                <span className="month-name">{monthName}</span>
                <span>{month ? Math.round(month.base_salary).toLocaleString('ru-RU') : '—'} ₽</span>
                <span className="center">{month ? month.worked_days : '—'}</span>
                <span className="vacation-days center">{month?.vacation_days || '—'}</span>
                <span>{month ? month.adjusted_days.toFixed(1) : '—'}</span>
                {isManual ? (
                  <div className="rate-input">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={getRateInput(i)}
                      placeholder="0"
                      onChange={e => handleRateChange(i, e.target.value)}
                      onBlur={() => handleRateBlur(i)}
                    />
                    <span>₽</span>
                  </div>
                ) : (
                  <span className="rate">{rate > 0 ? Math.round(rate).toLocaleString('ru-RU') : '—'} ₽</span>
                )}
              </div>
            )
          })}
        </div>
        </>
      )}
    </div>
  )
}

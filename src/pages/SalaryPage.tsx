import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { ChevronLeft, ChevronRight, ChevronRight as Arrow, Plus, Receipt } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { supabase } from '../lib/supabase'
import { getWorkDaysNorm as getDefaultWorkDaysNorm } from '../lib/workNorms'
import './SalaryPage.css'

interface Payment {
  id: string
  amount: number
  date: string
  note: string
}

const MONTHS = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
]

const YEARS = [2024, 2025, 2026, 2027, 2028, 2029, 2030]


function isCurrentMonth(year: number, month: number): boolean {
  const now = new Date()
  return now.getFullYear() === year && now.getMonth() === month
}

export default function SalaryPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [year, setYear] = useState(() => {
    const stateYear = (location.state as { year?: number })?.year
    return stateYear || new Date().getFullYear()
  })
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [monthSalaries, setMonthSalaries] = useState<{ [key: string]: number }>({})
  const [monthBonuses, setMonthBonuses] = useState<{ [key: string]: number }>({})
  const [monthTransport, setMonthTransport] = useState<{ [key: string]: number }>({})
  const [monthWorkDaysNorm, setMonthWorkDaysNorm] = useState<{ [key: string]: number }>({})
  const [monthVacationRates, setMonthVacationRates] = useState<{ [key: string]: number }>({})
  const [salaryInputs, setSalaryInputs] = useState<{ [key: string]: string }>({})
  const [monthPayments, setMonthPayments] = useState<{ [key: string]: number }>({})
  const [monthPaymentsList, setMonthPaymentsList] = useState<{ [key: string]: Payment[] }>({})
  const [showAddPayment, setShowAddPayment] = useState<number | null>(null)
  const [newPaymentAmount, setNewPaymentAmount] = useState('')
  const [newPaymentNote, setNewPaymentNote] = useState('')
  const [hoveredPayments, setHoveredPayments] = useState<number | null>(null)
  const [monthStats, setMonthStats] = useState<{ [key: string]: { work: number, worked: number, vacation: number } }>({})
  const [chartMode, setChartMode] = useState<'salary' | 'earned'>('earned')

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUserId(user.id)
        loadData(user.id)
      }
    })
  }, [])

  useEffect(() => {
    if (userId) {
      const isInitialLoad = Object.keys(monthStats).length === 0
      if (isInitialLoad) {
        setLoading(true)
      }
      Promise.all([
        loadData(userId),
        loadPaymentsForYear(userId),
        loadStatsForYear(userId),
        loadVacationRatesForYear(userId)
      ]).then(() => setLoading(false))
    }
  }, [year, userId])

  const isManualMonthCheck = (y: number, m: number) => y < 2025 || (y === 2025 && m <= 2)

  const loadData = async (uid: string) => {
    const { data: salaryData } = await supabase
      .from('salary_settings')
      .select('year, month, base_salary, bonus, transport_base_cost, work_days_norm, manual_vacation_rate')
      .eq('user_id', uid)

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
        // Только для ручных месяцев берём manual_vacation_rate
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
  }

  const loadPaymentsForYear = async (uid: string) => {
    const { data } = await supabase
      .from('salary_payments')
      .select('id, month, amount, date, note')
      .eq('user_id', uid)
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
  }

  const loadStatsForYear = async (uid: string) => {
    const { data } = await supabase
      .from('salary_calculations')
      .select('month, work_days, worked_days, vacation_days')
      .eq('user_id', uid)
      .eq('year', year)

    if (data) {
      const stats: { [key: string]: { work: number, worked: number, vacation: number } } = {}
      data.forEach(row => {
        stats[`${year}-${row.month}`] = {
          work: row.work_days || 0,
          worked: row.worked_days || 0,
          vacation: row.vacation_days || 0
        }
      })
      setMonthStats(stats)
    }
  }

  const isManualMonth = (y: number, m: number) => y < 2025 || (y === 2025 && m <= 2)

  const loadVacationRatesForYear = async (uid: string) => {
    const { data } = await supabase
      .from('vacation_rate')
      .select('month, daily_vacation_rate')
      .eq('user_id', uid)
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
  }

  const getMonthStats = (monthIndex: number) => {
    return monthStats[`${year}-${monthIndex}`] ?? { work: 0, worked: 0, vacation: 0 }
  }

  const getSalary = (monthIndex: number) => {
    return monthSalaries[`${year}-${monthIndex}`] ?? 100000
  }

  const getSalaryInput = (monthIndex: number) => {
    const key = `${year}-${monthIndex}`
    return salaryInputs[key] ?? '100 000'
  }

  const parseNumber = (value: string): number => {
    const cleaned = value.replace(/\s/g, '').replace(',', '.')
    return parseFloat(cleaned) || 0
  }

  const handleSalaryInputChange = (monthIndex: number, value: string) => {
    const key = `${year}-${monthIndex}`
    setSalaryInputs(prev => ({ ...prev, [key]: value }))
  }

  const handleSalaryBlur = async (monthIndex: number) => {
    const key = `${year}-${monthIndex}`
    const value = parseNumber(salaryInputs[key] || '100000') || 100000
    setMonthSalaries(prev => ({ ...prev, [key]: value }))
    setSalaryInputs(prev => ({ ...prev, [key]: Math.round(value).toLocaleString('ru-RU') }))

    if (!userId) return
    await supabase.from('salary_settings').upsert(
      { user_id: userId, year, month: monthIndex, base_salary: value },
      { onConflict: 'user_id,year,month' }
    )
  }

  const getPayment = (monthIndex: number) => {
    return monthPayments[`${year}-${monthIndex}`] ?? 0
  }

  const getBonus = (monthIndex: number) => {
    return monthBonuses[`${year}-${monthIndex}`] ?? 0
  }

  const getTransport = (monthIndex: number) => {
    return monthTransport[`${year}-${monthIndex}`] ?? 0
  }

  const getWorkDaysNorm = (monthIndex: number) => {
    return monthWorkDaysNorm[`${year}-${monthIndex}`] ?? getDefaultWorkDaysNorm(year, monthIndex)
  }

  const getVacationRate = (monthIndex: number) => {
    return monthVacationRates[`${year}-${monthIndex}`] ?? 0
  }

  const getPaymentsList = (monthIndex: number): Payment[] => {
    return monthPaymentsList[`${year}-${monthIndex}`] ?? []
  }

  const addPayment = async (monthIndex: number) => {
    if (!userId || !newPaymentAmount) return
    const amount = parseNumber(newPaymentAmount)
    if (amount <= 0) return

    const { data, error } = await supabase
      .from('salary_payments')
      .insert({
        user_id: userId,
        year,
        month: monthIndex,
        amount,
        date: new Date().toISOString().split('T')[0],
        note: newPaymentNote
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
    }

    setNewPaymentAmount('')
    setNewPaymentNote('')
    setShowAddPayment(null)
  }

  const calcEarned = (monthIndex: number) => {
    const stats = getMonthStats(monthIndex)
    const salary = getSalary(monthIndex)
    const bonus = getBonus(monthIndex)
    const transport = getTransport(monthIndex)
    const vacationRate = getVacationRate(monthIndex)
    const legalDays = getWorkDaysNorm(monthIndex)
    const dailyRate = salary / legalDays
    const transportDailyRate = transport / legalDays
    const vacationPayment = stats.vacation * vacationRate
    return dailyRate * stats.work + dailyRate * stats.worked + bonus + transportDailyRate * stats.work + vacationPayment
  }

  const yearTotals = MONTHS.reduce(
    (acc, _, i) => {
      const m = getMonthStats(i)
      acc.work += m.work
      acc.worked += m.worked
      acc.vacation += m.vacation
      acc.earned += calcEarned(i)
      acc.paid += getPayment(i)
      return acc
    },
    { work: 0, worked: 0, vacation: 0, earned: 0, paid: 0 }
  )

  const chartData = MONTHS.map((name, i) => ({
    name,
    value: chartMode === 'earned' ? Math.round(calcEarned(i)) : Math.round(getSalary(i))
  }))

  return (
    <div className="salary-page">
      <div className="salary-header">
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

      {loading ? (
        <div className="loading">Загрузка...</div>
      ) : (
        <>
          <div className="salary-content">
            <div className="months-list">
              {MONTHS.map((monthName, i) => {
              const stats = getMonthStats(i)
              const salary = getSalary(i)
              const bonus = getBonus(i)
              const transport = getTransport(i)
              const vacationRate = getVacationRate(i)
              const paid = getPayment(i)
              const paymentsList = getPaymentsList(i)
              const legalDays = getWorkDaysNorm(i)
              const dailyRate = salary / legalDays
              const transportDailyRate = transport / legalDays
              const vacationPayment = stats.vacation * vacationRate
              const earned = dailyRate * stats.work + dailyRate * stats.worked + bonus + transportDailyRate * stats.work + vacationPayment
              const hasData = stats.work > 0 || stats.worked > 0 || stats.vacation > 0
              const current = isCurrentMonth(year, i)

              return (
                <div
                  key={i}
                  className={`month-row ${hasData ? '' : 'empty'} ${current ? 'current' : ''}`}
                  onClick={() => navigate(`/salary/${year}/${i}`)}
                >
                  <span className="month-name">{monthName}</span>
                  <div className="month-salary-input" onClick={e => e.stopPropagation()}>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={getSalaryInput(i)}
                      onChange={e => handleSalaryInputChange(i, e.target.value)}
                      onBlur={() => handleSalaryBlur(i)}
                    />
                    <span>₽</span>
                  </div>
                  <span className="month-rate">{Math.round(dailyRate).toLocaleString('ru-RU')} ₽/день</span>
                  <span className="month-norm" title="Норма рабочих дней">{legalDays}</span>
                  <div className="month-stats">
                    <span className="month-stat" title="Рабочих">{stats.work}</span>
                    <span className="month-stat worked" title="Выходных">{stats.worked}</span>
                    <span className="month-stat vacation" title="Отпуск">{stats.vacation}</span>
                  </div>
                  <span className="month-earned">
                    {Math.round(earned).toLocaleString('ru-RU')} ₽
                  </span>
                  <div className="month-actions" onClick={e => e.stopPropagation()}>
                    {paymentsList.length > 0 && (
                      <div
                        className="payments-badge"
                        onMouseEnter={() => setHoveredPayments(i)}
                        onMouseLeave={() => setHoveredPayments(null)}
                      >
                        <Receipt size={14} />
                        <span>{paymentsList.length}</span>
                        {hoveredPayments === i && (
                          <div className="payments-tooltip">
                            {paymentsList.map(p => (
                              <div key={p.id} className="tooltip-item">
                                <span>{Math.round(p.amount).toLocaleString('ru-RU')} ₽</span>
                                <span className="tooltip-date">{new Date(p.date).toLocaleDateString('ru-RU')}</span>
                              </div>
                            ))}
                            <div className="tooltip-footer">
                              <div className="tooltip-row">
                                <span>Итого:</span>
                                <span>{Math.round(paid).toLocaleString('ru-RU')} ₽</span>
                              </div>
                              <div className="tooltip-row difference">
                                <span>Разница:</span>
                                <span>{Math.round(earned - paid).toLocaleString('ru-RU')} ₽</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    <button
                      className="add-payment-btn-small"
                      onClick={() => setShowAddPayment(i)}
                      title="Добавить выплату"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                  <Arrow size={16} className="month-arrow" />
                  {showAddPayment === i && (
                    <div className="inline-add-payment" onClick={e => e.stopPropagation()}>
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="Сумма"
                        value={newPaymentAmount}
                        onChange={e => setNewPaymentAmount(e.target.value)}
                        autoFocus
                      />
                      <input
                        type="text"
                        placeholder="Комментарий"
                        value={newPaymentNote}
                        onChange={e => setNewPaymentNote(e.target.value)}
                      />
                      <button className="btn-add-inline" onClick={() => addPayment(i)}>+</button>
                      <button className="btn-cancel-inline" onClick={() => setShowAddPayment(null)}>×</button>
                    </div>
                  )}
                </div>
              )
            })}

              <div className="months-total">
                <span className="total-label">Итого за год</span>
                <span className="total-value">{Math.round(yearTotals.earned).toLocaleString('ru-RU')} ₽</span>
              </div>
            </div>

            <div className="chart-column">
              <div className="chart-summary">
                <div className="summary-item">
                  <span className="summary-label">Рабочих</span>
                  <span className="summary-value">{yearTotals.work}</span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Выходных</span>
                  <span className="summary-value">{yearTotals.worked}</span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Отпуск</span>
                  <span className="summary-value">{yearTotals.vacation}</span>
                </div>
              </div>

              <div className="salary-chart">
              <div className="chart-header">
                <div className="chart-toggle">
                  <button
                    className={chartMode === 'earned' ? 'active' : ''}
                    onClick={() => setChartMode('earned')}
                  >
                    Начислено
                  </button>
                  <button
                    className={chartMode === 'salary' ? 'active' : ''}
                    onClick={() => setChartMode('salary')}
                  >
                    Оклад
                  </button>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                  <defs>
                    <linearGradient id="colorSalary" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="var(--primary)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} width={45} />
                  <Tooltip formatter={(value) => [(value as number).toLocaleString('ru-RU') + ' ₽', chartMode === 'earned' ? 'Начислено' : 'Оклад']} />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="var(--primary)"
                    strokeWidth={2}
                    fill="url(#colorSalary)"
                  />
                </AreaChart>
              </ResponsiveContainer>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

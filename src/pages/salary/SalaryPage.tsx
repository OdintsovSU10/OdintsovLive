import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { ChevronLeft, ChevronRight, ChevronRight as Arrow, Plus, Receipt } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { supabase } from '../../lib/supabase'
import { MONTHS, YEARS } from '../../lib/constants'
import { isCurrentMonth } from '../../lib/dateUtils'
import { parseNumber } from '../../lib/formatUtils'
import { useSalaryData } from './hooks/useSalaryData'
import { getMonthStats, getSalary, getBonus, getTransport, getWorkDaysNorm, getVacationRate, calcEarned } from './utils'
import { Payment } from './types'
import '../SalaryPage.css'

export default function SalaryPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [year, setYear] = useState(() => {
    const stateYear = (location.state as { year?: number })?.year
    return stateYear || new Date().getFullYear()
  })
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAddPayment, setShowAddPayment] = useState<number | null>(null)
  const [newPaymentAmount, setNewPaymentAmount] = useState('')
  const [newPaymentNote, setNewPaymentNote] = useState('')
  const [hoveredPayments, setHoveredPayments] = useState<number | null>(null)
  const [chartMode, setChartMode] = useState<'salary' | 'earned'>('earned')

  const {
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
  } = useSalaryData()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUserId(user.id)
        loadSalarySettings(user.id)
      }
    })
  }, [loadSalarySettings])

  useEffect(() => {
    if (userId) {
      const isInitialLoad = Object.keys(monthStats).length === 0
      if (isInitialLoad) setLoading(true)

      Promise.all([
        loadSalarySettings(userId),
        loadPaymentsForYear(userId, year),
        loadStatsForYear(userId, year),
        loadVacationRatesForYear(userId, year)
      ]).then(() => setLoading(false))
    }
  }, [year, userId, loadSalarySettings, loadPaymentsForYear, loadStatsForYear, loadVacationRatesForYear, monthStats])

  const getSalaryInput = (monthIndex: number) => {
    const key = `${year}-${monthIndex}`
    return salaryInputs[key] ?? '100 000'
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
    if (userId) await saveSalary(userId, year, monthIndex, value)
  }

  const getPayment = (monthIndex: number) => monthPayments[`${year}-${monthIndex}`] ?? 0
  const getPaymentsList = (monthIndex: number): Payment[] => monthPaymentsList[`${year}-${monthIndex}`] ?? []

  const handleAddPayment = async (monthIndex: number) => {
    if (!userId || !newPaymentAmount) return
    const amount = parseNumber(newPaymentAmount)
    if (amount <= 0) return

    await addPayment(userId, year, monthIndex, amount, newPaymentNote)
    setNewPaymentAmount('')
    setNewPaymentNote('')
    setShowAddPayment(null)
  }

  const data = { monthStats, monthSalaries, monthBonuses, monthTransport, monthWorkDaysNorm, monthVacationRates }

  const yearTotals = MONTHS.reduce(
    (acc, _, i) => {
      const m = getMonthStats(year, i, monthStats)
      acc.work += m.work
      acc.worked += m.worked
      acc.vacation += m.vacation
      acc.earned += calcEarned(year, i, data)
      acc.paid += getPayment(i)
      return acc
    },
    { work: 0, worked: 0, vacation: 0, earned: 0, paid: 0 }
  )

  const chartData = MONTHS.map((name, i) => ({
    name,
    value: chartMode === 'earned' ? Math.round(calcEarned(year, i, data)) : Math.round(getSalary(year, i, monthSalaries))
  }))

  return (
    <div className="salary-page">
      <div className="salary-header">
        <button className="year-btn" onClick={() => setYear(y => Math.max(YEARS[0], y - 1))} disabled={year === YEARS[0]}>
          <ChevronLeft size={20} />
        </button>
        <select className="year-select" value={year} onChange={e => setYear(Number(e.target.value))}>
          {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <button className="year-btn" onClick={() => setYear(y => Math.min(YEARS[YEARS.length - 1], y + 1))} disabled={year === YEARS[YEARS.length - 1]}>
          <ChevronRight size={20} />
        </button>
      </div>

      {loading ? (
        <div className="loading">Загрузка...</div>
      ) : (
        <div className="salary-content">
          <div className="months-list">
            {MONTHS.map((monthName, i) => {
              const stats = getMonthStats(year, i, monthStats)
              const salary = getSalary(year, i, monthSalaries)
              const bonus = getBonus(year, i, monthBonuses)
              const transport = getTransport(year, i, monthTransport)
              const vacationRate = getVacationRate(year, i, monthVacationRates)
              const paid = getPayment(i)
              const paymentsList = getPaymentsList(i)
              const legalDays = getWorkDaysNorm(year, i, monthWorkDaysNorm)
              const dailyRate = salary / legalDays
              const transportDailyRate = transport / legalDays
              const vacationPayment = stats.vacation * vacationRate
              const earned = dailyRate * stats.work + dailyRate * stats.worked + bonus + transportDailyRate * stats.work + vacationPayment
              const hasData = stats.work > 0 || stats.worked > 0 || stats.vacation > 0
              const current = isCurrentMonth(year, i)

              return (
                <div key={i} className={`month-row ${hasData ? '' : 'empty'} ${current ? 'current' : ''}`} onClick={() => navigate(`/salary/${year}/${i}`)}>
                  <span className="month-name">{monthName}</span>
                  <div className="month-salary-input" onClick={e => e.stopPropagation()}>
                    <input type="text" inputMode="numeric" value={getSalaryInput(i)} onChange={e => handleSalaryInputChange(i, e.target.value)} onBlur={() => handleSalaryBlur(i)} />
                    <span>₽</span>
                  </div>
                  <span className="month-rate">{Math.round(dailyRate).toLocaleString('ru-RU')} ₽/день</span>
                  <span className="month-norm" title="Норма рабочих дней">{legalDays}</span>
                  <div className="month-stats">
                    <span className="month-stat" title="Рабочих">{stats.work}</span>
                    <span className="month-stat worked" title="Выходных">{stats.worked}</span>
                    <span className="month-stat vacation" title="Отпуск">{stats.vacation}</span>
                  </div>
                  <span className="month-earned">{Math.round(earned).toLocaleString('ru-RU')} ₽</span>
                  <div className="month-actions" onClick={e => e.stopPropagation()}>
                    {paymentsList.length > 0 && (
                      <div className="payments-badge" onMouseEnter={() => setHoveredPayments(i)} onMouseLeave={() => setHoveredPayments(null)}>
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
                              <div className="tooltip-row"><span>Итого:</span><span>{Math.round(paid).toLocaleString('ru-RU')} ₽</span></div>
                              <div className="tooltip-row difference"><span>Разница:</span><span>{Math.round(earned - paid).toLocaleString('ru-RU')} ₽</span></div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    <button className="add-payment-btn-small" onClick={() => setShowAddPayment(i)} title="Добавить выплату"><Plus size={16} /></button>
                  </div>
                  <Arrow size={16} className="month-arrow" />
                  {showAddPayment === i && (
                    <div className="inline-add-payment" onClick={e => e.stopPropagation()}>
                      <input type="text" inputMode="numeric" placeholder="Сумма" value={newPaymentAmount} onChange={e => setNewPaymentAmount(e.target.value)} autoFocus />
                      <input type="text" placeholder="Комментарий" value={newPaymentNote} onChange={e => setNewPaymentNote(e.target.value)} />
                      <button className="btn-add-inline" onClick={() => handleAddPayment(i)}>+</button>
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
              <div className="summary-item"><span className="summary-label">Рабочих</span><span className="summary-value">{yearTotals.work}</span></div>
              <div className="summary-item"><span className="summary-label">Выходных</span><span className="summary-value">{yearTotals.worked}</span></div>
              <div className="summary-item"><span className="summary-label">Отпуск</span><span className="summary-value">{yearTotals.vacation}</span></div>
            </div>

            <div className="salary-chart">
              <div className="chart-header">
                <div className="chart-toggle">
                  <button className={chartMode === 'earned' ? 'active' : ''} onClick={() => setChartMode('earned')}>Начислено</button>
                  <button className={chartMode === 'salary' ? 'active' : ''} onClick={() => setChartMode('salary')}>Оклад</button>
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
                  <Area type="monotone" dataKey="value" stroke="var(--primary)" strokeWidth={2} fill="url(#colorSalary)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

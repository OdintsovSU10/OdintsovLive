import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Check } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { supabase } from '../lib/supabase'
import { MONTHS, YEARS } from '../lib/constants'
import { isCurrentMonth, isFutureMonth } from '../lib/dateUtils'
import CurrentMonthCard from './rent/CurrentMonthCard'
import './RentPage.css'

interface RentRecord {
  year: number
  month: number
  rent_amount: number
  water_amount: number
  electricity_amount: number
  paid: boolean
}

export default function RentPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const initialYear = Number(searchParams.get('year')) || new Date().getFullYear()
  const [year, setYear] = useState(initialYear)
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [records, setRecords] = useState<RentRecord[]>([])
  const [allTimeTotals, setAllTimeTotals] = useState({ total: 0, water: 0, electricity: 0 })

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUserId(user.id)
      }
    })
  }, [])

  useEffect(() => {
    if (userId) {
      loadData()
      loadAllTimeTotals()
    }
  }, [year, userId])

  const loadAllTimeTotals = async () => {
    if (!userId) return
    const { data } = await supabase
      .from('rent_records')
      .select('year, month, rent_amount, water_amount, electricity_amount')
      .eq('user_id', userId)

    if (data) {
      const totals = data.filter(r => !isFutureMonth(r.year, r.month)).reduce(
        (acc, r) => {
          acc.total += (r.rent_amount || 0) + (r.water_amount || 0) + (r.electricity_amount || 0)
          acc.water += r.water_amount || 0
          acc.electricity += r.electricity_amount || 0
          return acc
        },
        { total: 0, water: 0, electricity: 0 }
      )
      setAllTimeTotals(totals)
    }
  }

  const loadData = async () => {
    if (records.length === 0) {
      setLoading(true)
    }
    const { data } = await supabase
      .from('rent_records')
      .select('year, month, rent_amount, water_amount, electricity_amount, paid')
      .eq('user_id', userId)
      .eq('year', year)
      .order('month')

    if (data) {
      setRecords(data.filter(r => !isFutureMonth(r.year, r.month)))
    }
    setLoading(false)
  }

  const getRecord = (monthIndex: number): RentRecord | null => {
    return records.find(r => r.month === monthIndex) || null
  }

  const yearTotals = records.reduce(
    (acc, r) => {
      acc.rent += r.rent_amount || 0
      acc.water += r.water_amount || 0
      acc.electricity += r.electricity_amount || 0
      return acc
    },
    { rent: 0, water: 0, electricity: 0 }
  )

  const chartData = MONTHS.map((name, i) => {
    const record = getRecord(i)
    return {
      name,
      value: (record?.rent_amount || 0) + (record?.water_amount || 0) + (record?.electricity_amount || 0)
    }
  })

  return (
    <div className="rent-page">
      <div className="rent-header">
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

      {userId && <CurrentMonthCard userId={userId} />}

      {loading ? (
        <div className="loading">Загрузка...</div>
      ) : (
        <>
          <div className="rent-content">
            <div className="months-list">
              {MONTHS.map((monthName, i) => {
                if (isFutureMonth(year, i)) return null
                const record = getRecord(i)
                const rent = record?.rent_amount || 0
                const water = record?.water_amount || 0
                const electricity = record?.electricity_amount || 0
                const total = rent + water + electricity
                const hasData = rent > 0 || water > 0 || electricity > 0
                const current = isCurrentMonth(year, i)
                const paid = record?.paid || false

                return (
                  <div
                    key={i}
                    className={`month-row ${hasData ? '' : 'empty'} ${current ? 'current' : ''} ${paid ? 'paid' : ''}`}
                    onClick={() => navigate(`/rent/${year}/${i}`)}
                  >
                    <span className="month-name">{monthName}</span>
                    <div className="month-amounts">
                      <span className="rent-amount">{rent > 0 ? rent.toLocaleString('ru-RU') : '—'}</span>
                      <span className="separator">+</span>
                      <span className="water-amount">{water > 0 ? water.toLocaleString('ru-RU') : '—'}</span>
                      <span className="separator">+</span>
                      <span className="electricity-amount">{electricity > 0 ? electricity.toLocaleString('ru-RU') : '—'}</span>
                    </div>
                    <span className="month-total">{total > 0 ? `${total.toLocaleString('ru-RU')} ₽` : '—'}</span>
                    <div className="month-status">
                      {paid && <Check size={16} className="paid-icon" />}
                    </div>
                    <ChevronRight size={16} className="month-arrow" />
                  </div>
                )
              })}

              <div className="months-total">
                <span className="total-label">Итого за год</span>
                <span className="total-value">{Math.round(yearTotals.rent + yearTotals.water + yearTotals.electricity).toLocaleString('ru-RU')} ₽</span>
              </div>
            </div>

            <div className="chart-column">
              <div className="chart-summary">
                <div className="summary-item">
                  <span className="summary-label">Аренда</span>
                  <span className="summary-value">{Math.round(yearTotals.rent).toLocaleString('ru-RU')} ₽</span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Вода</span>
                  <span className="summary-value">{Math.round(yearTotals.water).toLocaleString('ru-RU')} ₽</span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Электричество</span>
                  <span className="summary-value">{Math.round(yearTotals.electricity).toLocaleString('ru-RU')} ₽</span>
                </div>
              </div>

              <div className="rent-chart">
              <div className="chart-title-large">Расходы по месяцам</div>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                  <defs>
                    <linearGradient id="colorRent" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="var(--primary)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} width={45} />
                  <Tooltip formatter={(value) => [(value as number).toLocaleString('ru-RU') + ' ₽', 'Итого']} />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="var(--primary)"
                    strokeWidth={2}
                    fill="url(#colorRent)"
                  />
                </AreaChart>
              </ResponsiveContainer>
              </div>

              <div className="chart-total">
                <div className="chart-total-row">
                  <span className="chart-total-label">Всего потрачено</span>
                  <span className="chart-total-value">{Math.round(allTimeTotals.total).toLocaleString('ru-RU')} ₽</span>
                </div>
                <div className="chart-total-details">
                  <span>Вода: {Math.round(allTimeTotals.water).toLocaleString('ru-RU')} ₽</span>
                  <span>Электричество: {Math.round(allTimeTotals.electricity).toLocaleString('ru-RU')} ₽</span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

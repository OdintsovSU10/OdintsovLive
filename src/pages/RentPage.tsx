import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, ChevronRight as Arrow, Check } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { supabase } from '../lib/supabase'
import './RentPage.css'

interface RentRecord {
  year: number
  month: number
  rent_amount: number
  water_amount: number
  electricity_amount: number
  paid: boolean
}

const MONTHS = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
]

const MONTHS_SHORT = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек']

const YEARS = [2024, 2025, 2026, 2027, 2028, 2029, 2030]

function isCurrentMonth(year: number, month: number): boolean {
  const now = new Date()
  return now.getFullYear() === year && now.getMonth() === month
}

export default function RentPage() {
  const navigate = useNavigate()
  const [year, setYear] = useState(new Date().getFullYear())
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [records, setRecords] = useState<RentRecord[]>([])

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
    }
  }, [year, userId])

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
      setRecords(data)
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

  const chartData = MONTHS_SHORT.map((name, i) => {
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

      {loading ? (
        <div className="loading">Загрузка...</div>
      ) : (
        <>
          <div className="rent-content">
            <div className="months-list">
              {MONTHS.map((monthName, i) => {
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
                    <Arrow size={16} className="month-arrow" />
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
              <div className="chart-title">Расходы по месяцам</div>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    formatter={(value) => (value as number).toLocaleString('ru-RU') + ' ₽'}
                    labelStyle={{ color: 'var(--text-primary)' }}
                    contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    name="Итого"
                    stroke="var(--primary)"
                    strokeWidth={2}
                    dot={{ fill: 'var(--primary)', strokeWidth: 2 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

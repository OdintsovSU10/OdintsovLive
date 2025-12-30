import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, ChevronRight as Arrow } from 'lucide-react'
import { supabase } from '../lib/supabase'
import './SalaryPage.css'

interface DayData {
  [key: string]: 'none' | 'work' | 'worked' | 'vacation'
}

const MONTHS = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
]

const YEARS = [2024, 2025, 2026, 2027, 2028, 2029, 2030]

const WORK_DAYS_BY_MONTH: { [year: number]: number[] } = {
  2024: [17, 20, 20, 22, 18, 19, 23, 22, 21, 23, 20, 22],
  2025: [17, 20, 21, 22, 18, 19, 23, 21, 22, 23, 19, 22],
  2026: [15, 19, 21, 22, 19, 21, 23, 21, 22, 22, 20, 22],
}

function getWorkDaysInMonth(year: number, month: number): number {
  return WORK_DAYS_BY_MONTH[year]?.[month] ?? 22
}

function isCurrentMonth(year: number, month: number): boolean {
  const now = new Date()
  return now.getFullYear() === year && now.getMonth() === month
}

export default function SalaryPage() {
  const navigate = useNavigate()
  const [year, setYear] = useState(new Date().getFullYear())
  const [days, setDays] = useState<DayData>({})
  const [userId, setUserId] = useState<string | null>(null)
  const [monthSalaries, setMonthSalaries] = useState<{ [key: string]: number }>({})
  const [monthPayments, setMonthPayments] = useState<{ [key: string]: number }>({})

  useEffect(() => {
    const saved = localStorage.getItem('calendar-days')
    if (saved) setDays(JSON.parse(saved))

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUserId(user.id)
        loadData(user.id)
      }
    })
  }, [])

  useEffect(() => {
    if (userId) {
      loadPaymentsForYear(userId)
    }
  }, [year, userId])

  const loadData = async (uid: string) => {
    const { data: salaryData } = await supabase
      .from('salary_settings')
      .select('year, month, base_salary')
      .eq('user_id', uid)

    if (salaryData) {
      const loaded: { [key: string]: number } = {}
      salaryData.forEach(row => {
        loaded[`${row.year}-${row.month}`] = Number(row.base_salary)
      })
      setMonthSalaries(loaded)
    }
  }

  const loadPaymentsForYear = async (uid: string) => {
    const { data } = await supabase
      .from('salary_payments')
      .select('month, amount')
      .eq('user_id', uid)
      .eq('year', year)

    if (data) {
      const totals: { [key: string]: number } = {}
      data.forEach(row => {
        const key = `${year}-${row.month}`
        totals[key] = (totals[key] || 0) + Number(row.amount)
      })
      setMonthPayments(totals)
    }
  }

  const getMonthStats = (monthIndex: number) => {
    const prefix = `${year}-${monthIndex}-`
    return Object.entries(days)
      .filter(([key]) => key.startsWith(prefix))
      .reduce(
        (acc, [, status]) => {
          if (status === 'work') acc.work++
          if (status === 'worked') acc.worked++
          if (status === 'vacation') acc.vacation++
          return acc
        },
        { work: 0, worked: 0, vacation: 0 }
      )
  }

  const getSalary = (monthIndex: number) => {
    return monthSalaries[`${year}-${monthIndex}`] ?? 100000
  }

  const getPayment = (monthIndex: number) => {
    return monthPayments[`${year}-${monthIndex}`] ?? 0
  }

  const calcEarned = (monthIndex: number) => {
    const stats = getMonthStats(monthIndex)
    const salary = getSalary(monthIndex)
    const legalDays = getWorkDaysInMonth(year, monthIndex)
    const dailyRate = salary / legalDays
    return dailyRate * stats.work + dailyRate * stats.worked
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

      <div className="year-summary">
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
        <div className="summary-item">
          <span className="summary-label">Начислено</span>
          <span className="summary-value">{Math.round(yearTotals.earned).toLocaleString('ru-RU')} ₽</span>
        </div>
        <div className="summary-item paid">
          <span className="summary-label">Выплачено</span>
          <span className="summary-value">{Math.round(yearTotals.paid).toLocaleString('ru-RU')} ₽</span>
        </div>
        <div className="summary-item total">
          <span className="summary-label">Остаток</span>
          <span className="summary-value">{Math.round(yearTotals.earned - yearTotals.paid).toLocaleString('ru-RU')} ₽</span>
        </div>
      </div>

      <div className="months-list">
        {MONTHS.map((monthName, i) => {
          const stats = getMonthStats(i)
          const salary = getSalary(i)
          const paid = getPayment(i)
          const legalDays = getWorkDaysInMonth(year, i)
          const dailyRate = salary / legalDays
          const earned = dailyRate * stats.work + dailyRate * stats.worked
          const remaining = earned - paid
          const hasData = stats.work > 0 || stats.worked > 0 || stats.vacation > 0
          const current = isCurrentMonth(year, i)

          return (
            <button
              key={i}
              className={`month-row ${hasData ? '' : 'empty'} ${current ? 'current' : ''}`}
              onClick={() => navigate(`/salary/${year}/${i}`)}
            >
              <span className="month-name">{monthName}</span>
              <span className="month-salary">{salary.toLocaleString('ru-RU')} ₽</span>
              <span className="month-rate">{Math.round(dailyRate).toLocaleString('ru-RU')} ₽/день</span>
              <div className="month-stats">
                <span className="month-stat" title="Рабочих">{stats.work}</span>
                <span className="month-stat worked" title="Выходных">{stats.worked}</span>
                <span className="month-stat vacation" title="Отпуск">{stats.vacation}</span>
              </div>
              <span className={`month-earned ${remaining <= 0 && earned > 0 ? 'paid-full' : ''}`}>
                {remaining > 0 ? `${Math.round(remaining).toLocaleString('ru-RU')} ₽` : earned > 0 ? 'Выплачено' : '0 ₽'}
              </span>
              <Arrow size={16} className="month-arrow" />
            </button>
          )
        })}
      </div>
    </div>
  )
}

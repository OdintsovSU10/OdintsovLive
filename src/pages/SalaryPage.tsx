import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
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

// Рабочие дни по производственному календарю
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
  const [year, setYear] = useState(new Date().getFullYear())
  const [days, setDays] = useState<DayData>({})
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null)
  const [monthSalaries, setMonthSalaries] = useState<{ [key: string]: number }>(() => {
    const saved = localStorage.getItem('month-salaries')
    return saved ? JSON.parse(saved) : {}
  })

  useEffect(() => {
    const saved = localStorage.getItem('calendar-days')
    if (saved) setDays(JSON.parse(saved))
  }, [])

  useEffect(() => {
    localStorage.setItem('month-salaries', JSON.stringify(monthSalaries))
  }, [monthSalaries])

  const saveSalaryToSupabase = async (monthIndex: number, salary: number) => {
    await supabase.from('salary_settings').upsert(
      { year, month: monthIndex, base_salary: salary },
      { onConflict: 'year,month' }
    )
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
    const key = `${year}-${monthIndex}`
    return monthSalaries[key] ?? 100000
  }

  const setSalary = (monthIndex: number, value: number) => {
    const key = `${year}-${monthIndex}`
    setMonthSalaries(prev => ({ ...prev, [key]: value }))
  }

  const calcEarned = (monthIndex: number) => {
    const stats = getMonthStats(monthIndex)
    const salary = getSalary(monthIndex)
    const legalWorkDays = getWorkDaysInMonth(year, monthIndex)
    const dailyRate = salary / legalWorkDays

    const workPayment = dailyRate * stats.work
    const weekendPayment = dailyRate * stats.worked
    const vacationPayment = 0 // TODO: расчёт отпуска

    return workPayment + weekendPayment + vacationPayment
  }

  const closeModal = () => {
    if (selectedMonth !== null) {
      saveSalaryToSupabase(selectedMonth, getSalary(selectedMonth))
    }
    setSelectedMonth(null)
  }

  const yearTotals = MONTHS.reduce(
    (acc, _, i) => {
      const m = getMonthStats(i)
      acc.work += m.work
      acc.worked += m.worked
      acc.vacation += m.vacation
      acc.earned += calcEarned(i)
      return acc
    },
    { work: 0, worked: 0, vacation: 0, earned: 0 }
  )

  const selectedStats = selectedMonth !== null ? getMonthStats(selectedMonth) : null
  const selectedSalary = selectedMonth !== null ? getSalary(selectedMonth) : 0
  const selectedLegalDays = selectedMonth !== null ? getWorkDaysInMonth(year, selectedMonth) : 0
  const selectedDailyRate = selectedLegalDays > 0 ? selectedSalary / selectedLegalDays : 0
  const selectedWorkPayment = selectedDailyRate * (selectedStats?.work ?? 0)
  const selectedWeekendPayment = selectedDailyRate * (selectedStats?.worked ?? 0)
  const selectedVacationPayment = 0
  const selectedTotal = selectedWorkPayment + selectedWeekendPayment + selectedVacationPayment

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
        <div className="summary-item total">
          <span className="summary-label">Итого за год</span>
          <span className="summary-value">{Math.round(yearTotals.earned).toLocaleString('ru-RU')} ₽</span>
        </div>
      </div>

      <div className="months-list">
        {MONTHS.map((monthName, i) => {
          const stats = getMonthStats(i)
          const earned = calcEarned(i)
          const hasData = stats.work > 0 || stats.worked > 0 || stats.vacation > 0
          const current = isCurrentMonth(year, i)

          return (
            <button
              key={i}
              className={`month-row ${hasData ? '' : 'empty'} ${current ? 'current' : ''}`}
              onClick={() => setSelectedMonth(i)}
            >
              <span className="month-name">{monthName}</span>
              <div className="month-stats">
                <span className="month-stat" title="Рабочих">{stats.work}</span>
                <span className="month-stat worked" title="Выходных">{stats.worked}</span>
                <span className="month-stat vacation" title="Отпуск">{stats.vacation}</span>
              </div>
              <span className="month-earned">{earned.toLocaleString('ru-RU')} ₽</span>
            </button>
          )
        })}
      </div>

      {selectedMonth !== null && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{MONTHS[selectedMonth]} {year}</h2>
              <button className="modal-close" onClick={closeModal}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-body">
              <div className="modal-field">
                <label>Оклад за месяц</label>
                <div className="modal-input-wrap">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={selectedSalary}
                    onChange={e => setSalary(selectedMonth, Number(e.target.value.replace(/\D/g, '')))}
                  />
                  <span>₽</span>
                </div>
              </div>

              <div className="modal-stats">
                <div className="modal-stat">
                  <span className="modal-stat-label">Рабочих дней</span>
                  <span className="modal-stat-value">{selectedStats?.work ?? 0}</span>
                </div>
                <div className="modal-stat">
                  <span className="modal-stat-label">Выходных</span>
                  <span className="modal-stat-value worked">{selectedStats?.worked ?? 0}</span>
                </div>
                <div className="modal-stat">
                  <span className="modal-stat-label">Отпуск</span>
                  <span className="modal-stat-value vacation">{selectedStats?.vacation ?? 0}</span>
                </div>
              </div>

              <div className="modal-calc">
                <div className="calc-row">
                  <span>Рабочих дней в месяце (норма)</span>
                  <span>{selectedLegalDays}</span>
                </div>
                <div className="calc-row">
                  <span>Ставка за день</span>
                  <span>{selectedDailyRate.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽</span>
                </div>
                <div className="calc-row">
                  <span>За рабочие дни</span>
                  <span>{selectedWorkPayment.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽</span>
                </div>
                <div className="calc-row">
                  <span>За выходные</span>
                  <span>{selectedWeekendPayment.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽</span>
                </div>
                <div className="calc-row total">
                  <span>К выплате</span>
                  <span>{selectedTotal.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

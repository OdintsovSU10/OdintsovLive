import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { getWorkDaysNorm } from '../lib/workNorms'
import './Calendar.css'

type DayStatus = 'none' | 'work' | 'worked' | 'vacation'

interface DayData {
  [key: string]: DayStatus
}

const MONTHS = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
]

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

const YEARS = [2024, 2025, 2026, 2027, 2028, 2029, 2030]

const HOLIDAYS: { [key: string]: number[] } = {
  '0': [1, 2, 3, 4, 5, 6, 7, 8],
  '1': [23],
  '2': [8],
  '4': [1, 9],
  '5': [12],
  '10': [4],
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfMonth(year: number, month: number): number {
  const day = new Date(year, month, 1).getDay()
  return day === 0 ? 6 : day - 1
}

function isWeekend(year: number, month: number, day: number): boolean {
  const date = new Date(year, month, day)
  const dayOfWeek = date.getDay()
  return dayOfWeek === 0 || dayOfWeek === 6
}

function isHoliday(month: number, day: number): boolean {
  return HOLIDAYS[month]?.includes(day) ?? false
}

function isToday(year: number, month: number, day: number): boolean {
  const today = new Date()
  return today.getFullYear() === year && today.getMonth() === month && today.getDate() === day
}

function isCurrentMonth(year: number, month: number): boolean {
  const today = new Date()
  return today.getFullYear() === year && today.getMonth() === month
}

export default function Calendar() {
  const navigate = useNavigate()
  const [year, setYear] = useState(() => new Date().getFullYear())
  const [allDays, setAllDays] = useState<DayData>(() => {
    const saved = localStorage.getItem('calendar-days')
    return saved ? JSON.parse(saved) : {}
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadFromSupabase()
  }, [])

  useEffect(() => {
    localStorage.setItem('calendar-days', JSON.stringify(allDays))
  }, [allDays])

  const loadFromSupabase = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('calendar_days')
      .select('date, status')
      .eq('user_id', user.id)

    if (data && data.length > 0) {
      const loaded: DayData = {}
      data.forEach(row => {
        const d = new Date(row.date)
        const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
        loaded[key] = row.status
      })
      setAllDays(loaded)
    }
  }

  const saveToSupabase = useCallback(async (key: string, status: DayStatus | null) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    setSaving(true)
    const [y, m, d] = key.split('-').map(Number)
    const date = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`

    if (status === null || status === 'none') {
      const { error } = await supabase.from('calendar_days').delete().eq('date', date).eq('user_id', user.id)
      if (error) console.error('Delete error:', error)
    } else {
      const { error } = await supabase.from('calendar_days').upsert(
        { user_id: user.id, date, status },
        { onConflict: 'user_id,date' }
      )
      if (error) console.error('Upsert error:', error)
    }

    setSaving(false)
  }, [])

  const cycleStatus = (key: string) => {
    const current = allDays[key] || 'none'
    const next: DayStatus =
      current === 'none' ? 'work' :
      current === 'work' ? 'worked' :
      current === 'worked' ? 'vacation' : 'none'

    if (next === 'none') {
      setAllDays(prev => {
        const copy = { ...prev }
        delete copy[key]
        return copy
      })
      saveToSupabase(key, null)
    } else {
      setAllDays(prev => ({ ...prev, [key]: next }))
      saveToSupabase(key, next)
    }
  }

  const resetMonth = async (monthIndex: number) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const prefix = `${year}-${monthIndex}-`
    const keysToDelete = Object.keys(allDays).filter(k => k.startsWith(prefix))

    if (keysToDelete.length === 0) return

    setAllDays(prev => {
      const copy = { ...prev }
      keysToDelete.forEach(k => delete copy[k])
      return copy
    })

    const dates = keysToDelete.map(k => {
      const [y, m, d] = k.split('-').map(Number)
      return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    })

    await supabase.from('calendar_days').delete().in('date', dates).eq('user_id', user.id)
  }

  const yearDays = Object.entries(allDays).filter(([key]) => key.startsWith(`${year}-`))
  const counts = yearDays.reduce(
    (acc, [, status]) => {
      if (status === 'work') acc.work++
      if (status === 'worked') acc.worked++
      if (status === 'vacation') acc.vacation++
      return acc
    },
    { work: 0, worked: 0, vacation: 0 }
  )

  return (
    <div className="calendar-page">
      <div className="calendar-header">
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
        {saving && <span className="saving-indicator">Сохранение...</span>}
      </div>

      <div className="stats">
        <div className="stat work">
          <span className="stat-value">{counts.work}</span>
          <span className="stat-label">Рабочих</span>
        </div>
        <div className="stat worked">
          <span className="stat-value">{counts.worked}</span>
          <span className="stat-label">Выходных</span>
        </div>
        <div className="stat vacation">
          <span className="stat-value">{counts.vacation}</span>
          <span className="stat-label">Отпуск</span>
        </div>
      </div>

      <div className="legend">
        <span><i className="dot none"></i> Пусто</span>
        <span><i className="dot work"></i> Рабочий</span>
        <span><i className="dot worked"></i> Выходной</span>
        <span><i className="dot vacation"></i> Отпуск</span>
      </div>

      <div className="calendar-grid">
        {MONTHS.map((monthName, monthIndex) => {
          const prefix = `${year}-${monthIndex}-`
          const monthDays = Object.entries(allDays).filter(([k]) => k.startsWith(prefix))
          const workCount = monthDays.filter(([, s]) => s === 'work').length
          const workedCount = monthDays.filter(([, s]) => s === 'worked').length
          const vacationCount = monthDays.filter(([, s]) => s === 'vacation').length
          const norm = getWorkDaysNorm(year, monthIndex)
          return (
          <div key={monthIndex} className={`month ${isCurrentMonth(year, monthIndex) ? 'current' : ''}`}>
            <div className="month-header">
              <h3
                className="month-title"
                onClick={() => navigate(`/salary/${year}/${monthIndex}`)}
              >
                {monthName}
              </h3>
              <span className="month-norm">{norm}</span>
              <div className="month-stats">
                <span className="ms work">{workCount}</span>
                <span className="ms worked">{workedCount}</span>
                <span className="ms vacation">{vacationCount}</span>
              </div>
              <button
                className="reset-month-btn"
                onClick={() => resetMonth(monthIndex)}
                title="Сбросить месяц"
              >
                <RotateCcw size={14} />
              </button>
            </div>
            <div className="weekdays">
              {WEEKDAYS.map((d, i) => (
                <span key={d} className={i >= 5 ? 'weekend' : ''}>{d}</span>
              ))}
            </div>
            <div className="days">
              {Array.from({ length: getFirstDayOfMonth(year, monthIndex) }).map((_, i) => (
                <span key={`empty-${i}`} className="day empty"></span>
              ))}
              {Array.from({ length: getDaysInMonth(year, monthIndex) }).map((_, i) => {
                const day = i + 1
                const key = `${year}-${monthIndex}-${day}`
                const status = allDays[key] || 'none'
                const weekend = isWeekend(year, monthIndex, day)
                const holiday = isHoliday(monthIndex, day)
                const today = isToday(year, monthIndex, day)
                return (
                  <span
                    key={key}
                    className={`day ${status} ${weekend ? 'weekend' : ''} ${holiday ? 'holiday' : ''} ${today ? 'today' : ''}`}
                    onClick={() => cycleStatus(key)}
                  >
                    {day}
                  </span>
                )
              })}
            </div>
          </div>
          )
        })}
      </div>
    </div>
  )
}

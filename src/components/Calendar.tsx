import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { getWorkDaysNorm } from '../lib/workNorms'
import { MONTHS, WEEKDAYS, YEARS } from '../lib/constants'
import { getDaysInMonth, getFirstDayOfMonth, isWeekend, isHoliday, isToday, isCurrentMonth } from '../lib/dateUtils'
import './Calendar.css'

type DayStatus = 'none' | 'work' | 'worked' | 'vacation'

interface DayData {
  [key: string]: DayStatus
}

const DAYS_STORAGE_KEY = 'calendar-days'
const PENDING_DAYS_STORAGE_KEY = 'calendar-days-pending'

function readStoredDays(storageKey: string): DayData {
  try {
    const saved = localStorage.getItem(storageKey)
    if (!saved) return {}

    const parsed = JSON.parse(saved)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}

    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, DayStatus] =>
        entry[1] === 'none'
        || entry[1] === 'work'
        || entry[1] === 'worked'
        || entry[1] === 'vacation'
      )
    )
  } catch {
    return {}
  }
}

function storeDays(storageKey: string, days: DayData) {
  localStorage.setItem(storageKey, JSON.stringify(days))
}

function applyDayStatus(days: DayData, key: string, status: DayStatus): DayData {
  const updated = { ...days }

  if (status === 'none') {
    delete updated[key]
  } else {
    updated[key] = status
  }

  return updated
}

function rememberPendingChanges(keys: string[], status: DayStatus) {
  const pending = readStoredDays(PENDING_DAYS_STORAGE_KEY)
  keys.forEach(key => {
    pending[key] = status
  })
  storeDays(PENDING_DAYS_STORAGE_KEY, pending)
}

function clearPendingChanges(keys: string[], expectedStatus: DayStatus) {
  const pending = readStoredDays(PENDING_DAYS_STORAGE_KEY)
  let changed = false

  keys.forEach(key => {
    if (pending[key] === expectedStatus) {
      delete pending[key]
      changed = true
    }
  })

  if (changed) storeDays(PENDING_DAYS_STORAGE_KEY, pending)
}

function keyToDate(key: string) {
  const [year, month, day] = key.split('-').map(Number)
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function dateToKey(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  return `${year}-${month - 1}-${day}`
}

export default function Calendar() {
  const navigate = useNavigate()
  const [year, setYear] = useState(() => new Date().getFullYear())
  const [allDays, setAllDays] = useState<DayData>(() => readStoredDays(DAYS_STORAGE_KEY))
  const [saving, setSaving] = useState(false)
  const localChanges = useRef<DayData>({})
  const saveQueue = useRef<Promise<void>>(Promise.resolve())

  const enqueueSave = useCallback((task: () => Promise<void>) => {
    const run = async () => {
      setSaving(true)
      try {
        await task()
      } catch (error) {
        console.error('Calendar save error:', error)
      } finally {
        setSaving(false)
      }
    }

    saveQueue.current = saveQueue.current.then(run, run)
  }, [])

  const saveToSupabase = useCallback((key: string, status: DayStatus) => {
    enqueueSave(async () => {
      if (readStoredDays(PENDING_DAYS_STORAGE_KEY)[key] !== status) return

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const date = keyToDate(key)
      const { error } = status === 'none'
        ? await supabase.from('calendar_days').delete().eq('date', date).eq('user_id', user.id)
        : await supabase.from('calendar_days').upsert(
            { user_id: user.id, date, status },
            { onConflict: 'user_id,date' }
          )

      if (error) {
        console.error(status === 'none' ? 'Delete error:' : 'Upsert error:', error)
        return
      }

      clearPendingChanges([key], status)
    })
  }, [enqueueSave])

  const loadFromSupabase = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data, error } = await supabase
      .from('calendar_days')
      .select('date, status')
      .eq('user_id', user.id)

    if (error) {
      console.error('Calendar load error:', error)
      return
    }

    const loaded: DayData = data.length > 0 ? {} : readStoredDays(DAYS_STORAGE_KEY)
    data.forEach(row => {
      loaded[dateToKey(row.date)] = row.status as DayStatus
    })

    const pending = readStoredDays(PENDING_DAYS_STORAGE_KEY)
    const changesToKeep = { ...pending, ...localChanges.current }
    const merged = Object.entries(changesToKeep).reduce(
      (days, [key, status]) => applyDayStatus(days, key, status),
      loaded
    )

    storeDays(DAYS_STORAGE_KEY, merged)
    setAllDays(merged)

    Object.entries(pending).forEach(([key, status]) => {
      saveToSupabase(key, status)
    })
  }, [saveToSupabase])

  useEffect(() => {
    loadFromSupabase()
  }, [loadFromSupabase])

  const cycleStatus = (key: string) => {
    const current = allDays[key] || 'none'
    const next: DayStatus =
      current === 'none' ? 'work' :
      current === 'work' ? 'worked' :
      current === 'worked' ? 'vacation' : 'none'

    localChanges.current[key] = next
    rememberPendingChanges([key], next)
    setAllDays(prev => {
      const updated = applyDayStatus(prev, key, next)
      storeDays(DAYS_STORAGE_KEY, updated)
      return updated
    })
    saveToSupabase(key, next)
  }

  const resetMonth = (monthIndex: number) => {
    const prefix = `${year}-${monthIndex}-`
    const keysToDelete = Object.keys(allDays).filter(k => k.startsWith(prefix))

    if (keysToDelete.length === 0) return

    keysToDelete.forEach(key => {
      localChanges.current[key] = 'none'
    })
    rememberPendingChanges(keysToDelete, 'none')
    setAllDays(prev => {
      const updated = { ...prev }
      keysToDelete.forEach(key => delete updated[key])
      storeDays(DAYS_STORAGE_KEY, updated)
      return updated
    })

    enqueueSave(async () => {
      const pending = readStoredDays(PENDING_DAYS_STORAGE_KEY)
      const pendingDeletions = keysToDelete.filter(key => pending[key] === 'none')
      if (pendingDeletions.length === 0) return

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const dates = pendingDeletions.map(keyToDate)
      const { error } = await supabase.from('calendar_days').delete().in('date', dates).eq('user_id', user.id)

      if (error) {
        console.error('Reset month error:', error)
        return
      }

      clearPendingChanges(pendingDeletions, 'none')
    })
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

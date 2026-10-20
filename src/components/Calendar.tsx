import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react'
import { getUserId } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { getWorkDaysNorm } from '../lib/workNorms'
import { MONTHS, WEEKDAYS, YEARS } from '../lib/constants'
import { timesheetDayKind } from '../pages/salary/timesheetStats'
import type { TimesheetDay } from '../pages/salary/timesheetStats'
import type { TimesheetStatus } from '../pages/tender/types'
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

const pad2 = (n: number): string => String(n).padStart(2, '0')

// Локальная дата YYYY-MM-DD (без сдвига UTC)
const toLocalIso = (d: Date): string => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`

// Привязка к табелю тендера и его строки за год
interface ITenderState {
  year: number
  linked: boolean
  since: string | null
  rows: TimesheetDay[]
}

const formatSince = (iso: string): string => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
    .toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
    .replace(/\s*г\.$/, '')
}

interface ICalendarProps {
  // Год снаружи: тогда переключатель года внутри не показываем
  year?: number
}

export default function Calendar({ year: yearProp }: ICalendarProps) {
  const navigate = useNavigate()
  const [ownYear, setYear] = useState(() => new Date().getFullYear())
  const year = yearProp ?? ownYear
  const [allDays, setAllDays] = useState<DayData>(() => readStoredDays(DAYS_STORAGE_KEY))
  const [saving, setSaving] = useState(false)
  const [tender, setTender] = useState<ITenderState | null>(null)
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

  // Одним заходом уходит всё накопленное: 20 отметок подряд — это 1–2 запроса, а не 20 по очереди
  const flushPending = useCallback(() => {
    enqueueSave(async () => {
      const pending = Object.entries(readStoredDays(PENDING_DAYS_STORAGE_KEY))
      if (pending.length === 0) return

      const uid = await getUserId()
      if (!uid) return

      const marked = pending.filter(([, status]) => status !== 'none')
      const cleared = pending.filter(([, status]) => status === 'none').map(([key]) => key)

      const [upsertRes, deleteRes] = await Promise.all([
        marked.length > 0
          ? supabase.from('calendar_days').upsert(
              marked.map(([key, status]) => ({ user_id: uid, date: keyToDate(key), status })),
              { onConflict: 'user_id,date' }
            )
          : null,
        cleared.length > 0
          ? supabase.from('calendar_days').delete().in('date', cleared.map(keyToDate)).eq('user_id', uid)
          : null
      ])

      // «Не сохранено» снимаем только с того, что ушло и не изменилось за время запроса
      if (upsertRes?.error) {
        console.error('Upsert error:', upsertRes.error)
      } else {
        (['work', 'worked', 'vacation'] as const).forEach(status => {
          clearPendingChanges(marked.filter(([, value]) => value === status).map(([key]) => key), status)
        })
      }

      if (deleteRes?.error) {
        console.error('Delete error:', deleteRes.error)
      } else {
        clearPendingChanges(cleared, 'none')
      }
    })
  }, [enqueueSave])

  const loadFromSupabase = useCallback(async () => {
    const uid = await getUserId()
    if (!uid) return

    const { data, error } = await supabase
      .from('calendar_days')
      .select('date, status')
      .eq('user_id', uid)

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

    if (Object.keys(pending).length > 0) flushPending()
  }, [flushPending])

  useEffect(() => {
    loadFromSupabase()
  }, [loadFromSupabase])

  // Привязка к тендеру и табель за год
  useEffect(() => {
    let cancelled = false

    const loadTender = async () => {
      const uid = await getUserId()
      if (!uid) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('tender_employee_id, tender_since')
        .eq('id', uid)
        .maybeSingle()
      if (cancelled) return

      const employeeId: number | null = profile?.tender_employee_id ?? null
      const since: string | null = profile?.tender_since ?? null
      if (employeeId === null) {
        setTender({ year, linked: false, since: null, rows: [] })
        return
      }

      const { data: rows, error } = await supabase
        .from('tender_timesheet')
        .select('work_date, status, hours_worked')
        .eq('employee_id', employeeId)
        .gte('work_date', `${year}-01-01`)
        .lte('work_date', `${year}-12-31`)
      if (cancelled) return
      if (error) {
        console.error('Timesheet load error:', error)
        return
      }

      setTender({
        year,
        linked: true,
        since,
        rows: (rows || []).map(row => ({
          work_date: row.work_date as string,
          status: row.status as TimesheetStatus,
          hours_worked: row.hours_worked === null || row.hours_worked === undefined ? null : Number(row.hours_worked)
        }))
      })
    }

    loadTender()
    return () => { cancelled = true }
  }, [year])

  const tenderActive = tender !== null && tender.year === year && tender.linked
  const tenderSince = tenderActive ? tender.since : null

  // Прошедшие дни тендерного периода: статус берётся из табеля, правка запрещена
  const lockedDays = useMemo<DayData>(() => {
    if (!tender || tender.year !== year || !tender.linked) return {}

    const byDate = new Map<string, TimesheetDay>()
    tender.rows.forEach(row => byDate.set(row.work_date, row))

    const todayIso = toLocalIso(new Date())
    const locked: DayData = {}
    for (let m = 0; m < 12; m++) {
      const daysInMonth = new Date(year, m + 1, 0).getDate()
      for (let d = 1; d <= daysInMonth; d++) {
        const dateIso = `${year}-${pad2(m + 1)}-${pad2(d)}`
        if (dateIso >= todayIso) break
        if (tender.since !== null && dateIso < tender.since) continue
        const row = byDate.get(dateIso)
        locked[`${year}-${m}-${d}`] = row ? (timesheetDayKind(row, new Date(year, m, d)) ?? 'none') : 'none'
      }
    }
    return locked
  }, [tender, year])

  // Что показываем и считаем: личные дни, поверх них — табель для прошедших дней
  const displayDays = useMemo<DayData>(() => {
    const merged: DayData = { ...allDays }
    Object.entries(lockedDays).forEach(([key, status]) => {
      if (status === 'none') {
        delete merged[key]
      } else {
        merged[key] = status
      }
    })
    return merged
  }, [allDays, lockedDays])

  const cycleStatus = (key: string) => {
    if (key in lockedDays) return
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
    flushPending()
  }

  const resetMonth = (monthIndex: number) => {
    const prefix = `${year}-${monthIndex}-`
    const keysToDelete = Object.keys(allDays).filter(k => k.startsWith(prefix) && !(k in lockedDays))

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

    flushPending()
  }

  const yearDays = Object.entries(displayDays).filter(([key]) => key.startsWith(`${year}-`))
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
      {yearProp === undefined ? (
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
      ) : saving && (
        <div className="calendar-header">
          <span className="saving-indicator">Сохранение...</span>
        </div>
      )}

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

      {tenderActive && (
        <p className="calendar-note">
          {tenderSince ? `Прошедшие дни с ${formatSince(tenderSince)}` : 'Прошедшие дни'} — из табеля тендерного управления. Будущие дни — план для прогноза.
        </p>
      )}

      <div className="calendar-grid">
        {MONTHS.map((monthName, monthIndex) => {
          const prefix = `${year}-${monthIndex}-`
          const monthDays = Object.entries(displayDays).filter(([k]) => k.startsWith(prefix))
          const hasEditable = Object.keys(allDays).some(k => k.startsWith(prefix) && !(k in lockedDays))
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
                disabled={!hasEditable}
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
                const status = displayDays[key] || 'none'
                const locked = key in lockedDays
                const weekend = isWeekend(year, monthIndex, day)
                const holiday = isHoliday(monthIndex, day)
                const today = isToday(year, monthIndex, day)
                return (
                  <span
                    key={key}
                    className={`day ${status} ${weekend ? 'weekend' : ''} ${holiday ? 'holiday' : ''} ${today ? 'today' : ''} ${locked ? 'from-timesheet' : ''}`}
                    onClick={locked ? undefined : () => cycleStatus(key)}
                    aria-disabled={locked || undefined}
                    title={locked ? 'Из табеля — правится в ФОТ' : undefined}
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

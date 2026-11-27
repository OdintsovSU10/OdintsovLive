import { useCallback, useEffect, useMemo, useState, type FC } from 'react'
import { RefreshCw, TriangleAlert } from 'lucide-react'
import { supabase } from '../../../../lib/supabase'
import { useReducedMotion } from '../../../../hooks/useReducedMotion'
import type { EmployeeWithStats, TimesheetEntry } from '../../types'
import { getMoscowParts } from '../../utils/livePayroll'
import { toIsoDate } from '../../utils/employeeFormat'
import { useTodayPresence } from '../dashboard/useTodayPresence'
import {
  OFFICE_SEATS,
  PLAN_HEIGHT,
  PLAN_RADIUS,
  PLAN_WIDTH,
  SEAT_EMPLOYEE_IDS,
  SEAT_WIDTH,
  SPRITE_HEIGHT,
  SPRITE_WIDTH,
  WALL_LINES
} from './officeLayout'
import {
  buildSeatStates,
  pickSeatEmployees,
  type IOfficeSeatState,
  type TOfficePhase,
  type TSeatTone
} from './officeModel'
import { OfficeSprite } from './OfficeSprite'
import styles from './Office.module.css'

// Один общий таймер этажа: поза каждого места пересчитывается от времени (см. workPose)
const CLOCK_TICK_MS = 5000
const LOADING_TEXT = 'Загрузка…'

const TONE_CLASS: Record<TSeatTone, string> = {
  office: styles.toneOffice,
  left: styles.toneLeft,
  none: styles.toneNone,
  leave: styles.toneLeave,
  loading: styles.toneLoading,
  unavailable: styles.toneUnavailable
}

const joinClasses = (...names: Array<string | undefined>): string => names.filter(Boolean).join(' ')

const formatMoscowTime = (date: Date): string => date.toLocaleTimeString('ru-RU', {
  timeZone: 'Europe/Moscow',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
})

interface ITodayTimesheet {
  rows: TimesheetEntry[]
  // Запрос выполнен хотя бы раз (успешно или нет)
  ready: boolean
  failed: boolean
  reload: () => Promise<void>
}

// Табель за сегодня (по Москве) только по сотрудникам мест — независимо от месяца, выбранного в Тендере
const useTodayTimesheet = (): ITodayTimesheet => {
  const [rows, setRows] = useState<TimesheetEntry[]>([])
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)

  const reload = useCallback(async () => {
    const moscow = getMoscowParts(new Date())
    const today = toIsoDate(moscow.year, moscow.month, moscow.day)
    const { data, error } = await supabase
      .from('tender_timesheet')
      .select('*')
      .in('employee_id', [...SEAT_EMPLOYEE_IDS])
      .eq('work_date', today)
    if (error) {
      setFailed(true)
    } else {
      setRows((data ?? []) as TimesheetEntry[])
      setFailed(false)
    }
    setReady(true)
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  return { rows, ready, failed, reload }
}

interface ISeatProps {
  state: IOfficeSeatState
}

const OfficeSeat: FC<ISeatProps> = ({ state }) => {
  const { seat, index, name, fullName, subdivision, pose, status, tone } = state
  const center = SEAT_WIDTH / 2
  const statusText = status || 'загрузка'
  return (
    <g transform={`translate(${seat.x} ${seat.y})`}>
      <title>{`${fullName}, ${subdivision}: ${statusText}`}</title>
      <OfficeSprite
        pose={pose}
        shirt={index}
        x={(SEAT_WIDTH - SPRITE_WIDTH) / 2}
        y={0}
        width={SPRITE_WIDTH}
        height={SPRITE_HEIGHT}
      />
      <text className={styles.seatName} x={center} y={SPRITE_HEIGHT + 16}>{name}</text>
      <text className={joinClasses(styles.seatStatus, TONE_CLASS[tone])} x={center} y={SPRITE_HEIGHT + 33}>{status}</text>
    </g>
  )
}

interface IOfficeFloorProps {
  allEmployees: EmployeeWithStats[]
}

export const OfficeFloor: FC<IOfficeFloorProps> = ({ allEmployees }) => {
  const timesheet = useTodayTimesheet()
  const reducedMotion = useReducedMotion()
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [updatedAt, setUpdatedAt] = useState('')

  // Сотрудники мест. Ссылка на массив меняется только при смене полей, которые читает хук присутствия:
  // иначе каждая смена месяца в Тендере перезапускала бы эффект хука и слала запросы в СКУД заново.
  const picked = pickSeatEmployees(allEmployees)
  const signature = JSON.stringify(
    picked.map(employee => [employee.id, employee.fot_employee_id, employee.excluded_from_timesheet, employee.employmentPeriods])
  )
  const [stable, setStable] = useState({ signature, list: picked })
  if (stable.signature !== signature) setStable({ signature, list: picked })

  // Табель за сегодня подменяет `timesheet` сотрудника целиком — в форме, которую ожидает хук
  const presenceEmployees = useMemo(
    () => stable.list.map(employee => ({
      ...employee,
      timesheet: timesheet.rows.filter(row => row.employee_id === employee.id)
    })),
    [stable.list, timesheet.rows]
  )

  // Проходы запрашиваем только когда табель уже получен: иначе хук отстрелял бы запросы дважды
  const hookEnabled = timesheet.ready && !timesheet.failed
  const presence = useTodayPresence(presenceEmployees, hookEnabled)
  const loaded = hookEnabled && presence.todayIso !== '' && !presence.loading

  let phase: TOfficePhase = 'loading'
  if (timesheet.failed || (loaded && presence.error)) phase = 'unavailable'
  else if (loaded) phase = 'ready'

  const animate = phase === 'ready' && !reducedMotion
  useEffect(() => {
    if (!animate) return
    const timer = window.setInterval(() => setNowMs(Date.now()), CLOCK_TICK_MS)
    return () => window.clearInterval(timer)
  }, [animate])

  const { statuses, passes, firstEntries } = presence
  useEffect(() => {
    if (statuses.size > 0) setUpdatedAt(formatMoscowTime(new Date()))
  }, [statuses])

  const states = useMemo(
    () => buildSeatStates(stable.list, phase, { statuses, passes, firstEntries }, nowMs),
    [stable.list, phase, statuses, passes, firstEntries, nowMs]
  )
  const inOffice = states.filter(state => state.inOffice).length

  const handleRefresh = async () => {
    await timesheet.reload()
    presence.refresh()
  }

  const busy = phase === 'loading' || presence.refreshing
  const bannerText = timesheet.failed ? 'Не удалось загрузить табель' : 'Нет связи со СКУД'

  return (
    <section className={joinClasses(styles.office, phase === 'unavailable' ? styles.frozen : undefined)} aria-busy={phase === 'loading'}>
      <div className={styles.toolbar}>
        <div className={styles.summary}>
          <strong className={styles.count}>
            В офисе: {phase === 'ready' ? inOffice : '—'} из {OFFICE_SEATS.length}
          </strong>
          {phase === 'loading' && (
            <span className={styles.loadingNote} role="status">
              <span className={styles.spinner} aria-hidden="true" />
              {LOADING_TEXT}
            </span>
          )}
          {updatedAt && phase !== 'loading' && <span className={styles.updated}>Обновлено в {updatedAt}</span>}
        </div>
        <button type="button" className={styles.refresh} onClick={handleRefresh} disabled={busy}>
          <RefreshCw size={18} strokeWidth={1.5} className={busy ? styles.spinning : undefined} aria-hidden="true" />
          <span>Обновить</span>
        </button>
      </div>

      {phase === 'unavailable' && (
        <div className={styles.banner} role="alert">
          <TriangleAlert size={18} strokeWidth={1.5} aria-hidden="true" />
          <span>{bannerText}</span>
        </div>
      )}

      <div className={styles.planWrap}>
        <svg className={styles.plan} viewBox={`0 0 ${PLAN_WIDTH} ${PLAN_HEIGHT}`} role="img" aria-label="План офиса">
          <rect
            className={styles.room}
            x="1"
            y="1"
            width={PLAN_WIDTH - 2}
            height={PLAN_HEIGHT - 2}
            rx={PLAN_RADIUS}
          />
          {WALL_LINES.map(line => (
            <line key={`${line.x1}-${line.y1}-${line.x2}-${line.y2}`} className={styles.wall} x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} />
          ))}
          {states.map(state => <OfficeSeat key={state.seat.no} state={state} />)}
        </svg>
      </div>

      <ul className={styles.list}>
        {states.map(state => (
          <li key={state.seat.no} className={joinClasses(styles.item, TONE_CLASS[state.tone])}>
            <span className={styles.marker} aria-hidden="true" />
            <span className={styles.itemText}>
              <span className={styles.itemName}>{state.name}</span>
              <span className={styles.itemStatus}>{state.status || LOADING_TEXT}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

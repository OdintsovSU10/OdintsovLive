import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Activity,
  AlertTriangle,
  Bot,
  ChevronRight,
  Clock3,
  DoorOpen,
  Info,
  RefreshCw,
  Users,
  WalletCards
} from 'lucide-react'
import type { EmployeeWithStats } from '../types'
import { fetchFotEmployeeEvents, type FotEmployeeEvent } from '../utils/fotEmployeeEvents'
import { calculateFotSkudDay, formatSkudDuration, timeToSeconds } from '../utils/skudTimeCalculation'
import { formatMonthsSinceRaise, getMonthsSinceLastRaise } from '../utils/tenderPresentation'
import './ManagementAgent.css'

interface Props {
  employees: EmployeeWithStats[]
  year: number
  month: number
  onSelectEmployee: (employee: EmployeeWithStats) => void
}

type SignalKind = 'late_stay' | 'frequent_exits' | 'long_session' | 'timesheet' | 'salary'
type SignalSeverity = 'high' | 'medium' | 'info'
type SignalFilter = 'all' | 'presence' | 'salary' | 'timesheet'
type LiveStatus = 'on_site' | 'outside' | 'no_events' | 'not_available'

interface AgentSignal {
  id: string
  employee: EmployeeWithStats
  kind: SignalKind
  severity: SignalSeverity
  title: string
  evidence: string
  action: string
}

interface EmployeeAgentMetrics {
  employee: EmployeeWithStats
  trackedDays: number
  lateStayDays: number
  totalBreaks: number
  frequentExitDays: number
  longSessionDays: number
  maxContinuousSeconds: number
  noRaiseMonths: number
  absentDays: number
  liveStatus: LiveStatus
  liveStatusLabel: string
  liveDetail: string
  currentContinuousSeconds: number
}

interface CachedEvents {
  events: FotEmployeeEvent[]
  expiresAt: number
}

const LATE_STAY_AFTER_SECONDS = 20 * 60 * 60
const FREQUENT_BREAKS_PER_DAY = 3
const LONG_SESSION_SECONDS = 4 * 60 * 60
const SALARY_REVIEW_MONTHS = 12
const SALARY_CRITICAL_MONTHS = 18
const EVENTS_REFRESH_MS = 2 * 60 * 1000
const CACHE_ARCHIVE_MS = 30 * 60 * 1000
const REQUEST_CONCURRENCY = 4

const eventCache = new Map<string, CachedEvents>()

const signalMeta: Record<SignalKind, { label: string; icon: ReactNode }> = {
  late_stay: { label: 'Поздние уходы', icon: <Clock3 size={17} /> },
  frequent_exits: { label: 'Частые выходы', icon: <DoorOpen size={17} /> },
  long_session: { label: 'Долго без перерыва', icon: <Activity size={17} /> },
  timesheet: { label: 'Табель', icon: <AlertTriangle size={17} /> },
  salary: { label: 'Пересмотр оклада', icon: <WalletCards size={17} /> }
}

const filterOptions: Array<{ key: SignalFilter; label: string }> = [
  { key: 'all', label: 'Все сигналы' },
  { key: 'presence', label: 'Присутствие' },
  { key: 'salary', label: 'Оклад' },
  { key: 'timesheet', label: 'Табель' }
]

function toLocalIsoDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getMonthRange(year: number, month: number): { from: string; to: string } {
  const monthText = String(month).padStart(2, '0')
  const lastDay = new Date(year, month, 0).getDate()
  return {
    from: `${year}-${monthText}-01`,
    to: `${year}-${monthText}-${String(lastDay).padStart(2, '0')}`
  }
}

function formatTime(value: string): string {
  return value.slice(0, 5)
}

function formatUpdatedAt(value: Date | null): string {
  if (!value) return 'ещё не обновлялся'
  return value.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

function getInitials(employee: EmployeeWithStats): string {
  return employee.full_name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part.charAt(0))
    .join('')
    .toUpperCase()
}

function pluralize(value: number, one: string, few: string, many: string): string {
  const mod100 = Math.abs(value) % 100
  const mod10 = Math.abs(value) % 10
  if (mod100 >= 11 && mod100 <= 14) return `${value} ${many}`
  if (mod10 === 1) return `${value} ${one}`
  if (mod10 >= 2 && mod10 <= 4) return `${value} ${few}`
  return `${value} ${many}`
}

function isCurrentMonth(year: number, month: number, now: Date): boolean {
  return year === now.getFullYear() && month === now.getMonth() + 1
}

function getLiveStatus(
  events: FotEmployeeEvent[],
  year: number,
  month: number,
  now: Date,
  hasFotId: boolean,
  eventsAvailable: boolean
): Pick<EmployeeAgentMetrics, 'liveStatus' | 'liveStatusLabel' | 'liveDetail' | 'currentContinuousSeconds'> {
  if (!hasFotId) {
    return {
      liveStatus: 'not_available',
      liveStatusLabel: 'Нет FOT ID',
      liveDetail: 'События СКУД недоступны',
      currentContinuousSeconds: 0
    }
  }

  if (!eventsAvailable) {
    return {
      liveStatus: 'not_available',
      liveStatusLabel: 'СКУД недоступен',
      liveDetail: 'Не удалось обновить события сотрудника',
      currentContinuousSeconds: 0
    }
  }

  if (!isCurrentMonth(year, month, now)) {
    return {
      liveStatus: 'not_available',
      liveStatusLabel: 'Архивный период',
      liveDetail: 'Онлайн-статус доступен в текущем месяце',
      currentContinuousSeconds: 0
    }
  }

  const today = toLocalIsoDate(now)
  const todayEvents = events.filter(event => event.event_date === today)
  if (todayEvents.length === 0) {
    return {
      liveStatus: 'no_events',
      liveStatusLabel: 'Сегодня без событий',
      liveDetail: 'Входы через СКУД не зафиксированы',
      currentContinuousSeconds: 0
    }
  }

  const calculation = calculateFotSkudDay(todayEvents, today, now)
  const openPair = calculation.pairs.find(pair => pair.isOpen)
  if (openPair) {
    return {
      liveStatus: 'on_site',
      liveStatusLabel: 'Сейчас на объекте',
      liveDetail: `Без выхода ${formatSkudDuration(openPair.durationSeconds)}`,
      currentContinuousSeconds: openPair.durationSeconds
    }
  }

  const lastEvent = calculation.events[calculation.events.length - 1]
  return {
    liveStatus: 'outside',
    liveStatusLabel: 'Вышел с объекта',
    liveDetail: lastEvent ? `Последний выход в ${formatTime(lastEvent.event_time)}` : 'Последний вход не закрыт',
    currentContinuousSeconds: 0
  }
}

function buildMetrics(
  employee: EmployeeWithStats,
  events: FotEmployeeEvent[],
  year: number,
  month: number,
  now: Date,
  eventsAvailable: boolean
): EmployeeAgentMetrics {
  const eventsByDate = new Map<string, FotEmployeeEvent[]>()
  for (const event of events) {
    const dayEvents = eventsByDate.get(event.event_date) || []
    dayEvents.push(event)
    eventsByDate.set(event.event_date, dayEvents)
  }

  let lateStayDays = 0
  let totalBreaks = 0
  let frequentExitDays = 0
  let longSessionDays = 0
  let maxContinuousSeconds = 0

  for (const [date, dayEvents] of eventsByDate) {
    const calculation = calculateFotSkudDay(dayEvents, date, now)
    const lastExitSeconds = calculation.lastExit ? timeToSeconds(calculation.lastExit.event_time) : 0
    const openLateStay = calculation.hasOpenPair
      && date === toLocalIsoDate(now)
      && (now.getHours() * 60 * 60 + now.getMinutes() * 60 + now.getSeconds()) >= LATE_STAY_AFTER_SECONDS

    if (lastExitSeconds >= LATE_STAY_AFTER_SECONDS || openLateStay) lateStayDays += 1
    totalBreaks += calculation.breaks.length
    if (calculation.breaks.length >= FREQUENT_BREAKS_PER_DAY) frequentExitDays += 1

    const longestPair = calculation.pairs.reduce(
      (longest, pair) => Math.max(longest, pair.durationSeconds),
      0
    )
    maxContinuousSeconds = Math.max(maxContinuousSeconds, longestPair)
    if (longestPair >= LONG_SESSION_SECONDS) longSessionDays += 1
  }

  const absentDays = (employee.timesheet || []).filter(entry => (
    entry.status === 'absent' || entry.status === 'unpaid'
  )).length
  const live = getLiveStatus(
    events,
    year,
    month,
    now,
    Boolean(employee.fot_employee_id),
    eventsAvailable
  )

  return {
    employee,
    trackedDays: eventsByDate.size,
    lateStayDays,
    totalBreaks,
    frequentExitDays,
    longSessionDays,
    maxContinuousSeconds,
    noRaiseMonths: getMonthsSinceLastRaise(employee),
    absentDays,
    ...live
  }
}

function buildSignals(metrics: EmployeeAgentMetrics[]): AgentSignal[] {
  const signals: AgentSignal[] = []

  for (const item of metrics) {
    if (item.lateStayDays >= 2) {
      signals.push({
        id: `${item.employee.id}-late-stay`,
        employee: item.employee,
        kind: 'late_stay',
        severity: item.lateStayDays >= 4 ? 'high' : 'medium',
        title: `${pluralize(item.lateStayDays, 'поздний уход', 'поздних ухода', 'поздних уходов')} после 20:00`,
        evidence: 'Повторяющийся паттерн в выбранном месяце',
        action: 'Проверьте нагрузку, сроки и необходимость переработок'
      })
    }

    if (item.frequentExitDays >= 2) {
      signals.push({
        id: `${item.employee.id}-frequent-exits`,
        employee: item.employee,
        kind: 'frequent_exits',
        severity: item.frequentExitDays >= 4 ? 'high' : 'medium',
        title: `Частые выходы в ${pluralize(item.frequentExitDays, 'день', 'дня', 'дней')}`,
        evidence: `${pluralize(item.totalBreaks, 'перерыв', 'перерыва', 'перерывов')} вне объекта за период`,
        action: 'Уточните контекст: встречи, выезды или незапланированные перерывы'
      })
    }

    const persistentLongSessions = item.trackedDays >= 3
      && item.longSessionDays >= Math.max(3, Math.ceil(item.trackedDays / 2))
    if (item.currentContinuousSeconds >= LONG_SESSION_SECONDS || persistentLongSessions) {
      signals.push({
        id: `${item.employee.id}-long-session`,
        employee: item.employee,
        kind: 'long_session',
        severity: item.currentContinuousSeconds >= 6 * 60 * 60 ? 'medium' : 'info',
        title: item.currentContinuousSeconds >= LONG_SESSION_SECONDS
          ? `Сейчас без выхода ${formatSkudDuration(item.currentContinuousSeconds)}`
          : `Длинные сессии в ${pluralize(item.longSessionDays, 'день', 'дня', 'дней')}`,
        evidence: `Максимум без выхода: ${formatSkudDuration(item.maxContinuousSeconds)}`,
        action: 'Проверьте самочувствие и напомните сделать перерыв'
      })
    }

    if (item.absentDays >= 2) {
      signals.push({
        id: `${item.employee.id}-timesheet`,
        employee: item.employee,
        kind: 'timesheet',
        severity: item.absentDays >= 4 ? 'high' : 'medium',
        title: `${pluralize(item.absentDays, 'день', 'дня', 'дней')} отсутствия по табелю`,
        evidence: 'Учтены статусы «неявка» и «без содержания»',
        action: 'Проверьте причины и актуальность статусов табеля'
      })
    }

    if (item.noRaiseMonths >= SALARY_REVIEW_MONTHS) {
      signals.push({
        id: `${item.employee.id}-salary`,
        employee: item.employee,
        kind: 'salary',
        severity: item.noRaiseMonths >= SALARY_CRITICAL_MONTHS ? 'high' : 'medium',
        title: `Оклад без повышения ${formatMonthsSinceRaise(item.noRaiseMonths)}`,
        evidence: `Текущий оклад ${item.employee.current_salary.toLocaleString('ru-RU')} ₽`,
        action: 'Сверьте роль, результат и рыночный уровень перед пересмотром'
      })
    }
  }

  const severityOrder: Record<SignalSeverity, number> = { high: 0, medium: 1, info: 2 }
  return signals.sort((left, right) => (
    severityOrder[left.severity] - severityOrder[right.severity]
      || left.employee.full_name.localeCompare(right.employee.full_name)
  ))
}

function matchesFilter(signal: AgentSignal, filter: SignalFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'presence') return ['late_stay', 'frequent_exits', 'long_session'].includes(signal.kind)
  return signal.kind === filter
}

function getBriefing(signals: AgentSignal[], metrics: EmployeeAgentMetrics[], currentPeriod: boolean): string {
  const people = new Set(signals.map(signal => signal.employee.id)).size
  const lateStayCount = metrics.filter(item => item.lateStayDays >= 2).length
  const salaryCount = metrics.filter(item => item.noRaiseMonths >= SALARY_REVIEW_MONTHS).length
  const onSiteCount = metrics.filter(item => item.liveStatus === 'on_site').length

  if (signals.length === 0) {
    return currentPeriod
      ? `Существенных отклонений не вижу. Сейчас на объекте ${pluralize(onSiteCount, 'сотрудник', 'сотрудника', 'сотрудников')}.`
      : 'Существенных отклонений в выбранном периоде не вижу.'
  }

  const parts = [`Внимания требуют ${pluralize(people, 'сотрудник', 'сотрудника', 'сотрудников')}.`]
  if (lateStayCount > 0) parts.push(`${lateStayCount} регулярно задерживаются после 20:00.`)
  if (salaryCount > 0) parts.push(`У ${salaryCount} пора проверить пересмотр оклада.`)
  return parts.join(' ')
}

export function ManagementAgent({ employees, year, month, onSelectEmployee }: Props) {
  const [eventsByEmployee, setEventsByEmployee] = useState<Record<number, FotEmployeeEvent[]>>({})
  const [eventsPeriod, setEventsPeriod] = useState<string | null>(null)
  const [errorsByEmployee, setErrorsByEmployee] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(false)
  const [loadedCount, setLoadedCount] = useState(0)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [filter, setFilter] = useState<SignalFilter>('all')
  const [now, setNow] = useState(() => new Date())
  const abortRef = useRef<AbortController | null>(null)
  const periodKey = `${year}-${String(month).padStart(2, '0')}`

  const employeesWithFotSignature = employees
    .filter(employee => Boolean(employee.fot_employee_id))
    .map(employee => `${employee.id}:${employee.fot_employee_id}`)
    .join('|')
  const employeesWithFot = useMemo(
    () => employees.filter(employee => Boolean(employee.fot_employee_id)),
    [employeesWithFotSignature]
  )

  const loadEvents = useCallback(async (force = false) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const { from, to } = getMonthRange(year, month)
    const livePeriod = isCurrentMonth(year, month, new Date())
    const expiresIn = livePeriod ? EVENTS_REFRESH_MS : CACHE_ARCHIVE_MS
    const nextEvents: Record<number, FotEmployeeEvent[]> = {}
    const nextErrors: Record<number, string> = {}
    let cursor = 0
    let completed = 0

    setLoading(true)
    setLoadedCount(0)
    setErrorsByEmployee({})

    const worker = async () => {
      while (!controller.signal.aborted) {
        const employee = employeesWithFot[cursor]
        cursor += 1
        if (!employee) return

        const cacheKey = `${employee.fot_employee_id}:${from}:${to}`
        const cached = eventCache.get(cacheKey)
        try {
          if (!force && cached && cached.expiresAt > Date.now()) {
            nextEvents[employee.id] = cached.events
          } else {
            const events = await fetchFotEmployeeEvents(employee.fot_employee_id!, from, to, controller.signal)
            nextEvents[employee.id] = events
            eventCache.set(cacheKey, { events, expiresAt: Date.now() + expiresIn })
          }
        } catch (error) {
          if (controller.signal.aborted) return
          nextErrors[employee.id] = error instanceof Error ? error.message : 'Не удалось загрузить события'
        } finally {
          if (!controller.signal.aborted) {
            completed += 1
            setLoadedCount(completed)
          }
        }
      }
    }

    if (employeesWithFot.length === 0) {
      setEventsByEmployee({})
      setEventsPeriod(periodKey)
      setLoading(false)
      setLastUpdated(new Date())
      return
    }

    await Promise.all(
      Array.from({ length: Math.min(REQUEST_CONCURRENCY, employeesWithFot.length) }, () => worker())
    )
    if (controller.signal.aborted) return

    setEventsByEmployee(nextEvents)
    setEventsPeriod(periodKey)
    setErrorsByEmployee(nextErrors)
    setLastUpdated(new Date())
    setNow(new Date())
    setLoading(false)
  }, [employeesWithFot, month, periodKey, year])

  useEffect(() => {
    void loadEvents()
    return () => abortRef.current?.abort()
  }, [loadEvents])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!isCurrentMonth(year, month, new Date())) return undefined
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadEvents(true)
    }, EVENTS_REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [loadEvents, month, year])

  const metrics = useMemo(
    () => employees.map(employee => buildMetrics(
      employee,
      eventsPeriod === periodKey ? eventsByEmployee[employee.id] || [] : [],
      year,
      month,
      now,
      eventsPeriod !== periodKey || !errorsByEmployee[employee.id]
    )),
    [employees, errorsByEmployee, eventsByEmployee, eventsPeriod, month, now, periodKey, year]
  )
  const signals = useMemo(() => buildSignals(metrics), [metrics])
  const filteredSignals = useMemo(
    () => signals.filter(signal => matchesFilter(signal, filter)),
    [filter, signals]
  )
  const highPriorityCount = signals.filter(signal => signal.severity === 'high').length
  const attentionPeople = new Set(signals.map(signal => signal.employee.id)).size
  const onSiteCount = metrics.filter(item => item.liveStatus === 'on_site').length
  const frequentExitPeople = metrics.filter(item => item.frequentExitDays >= 2).length
  const salaryReviewPeople = metrics.filter(item => item.noRaiseMonths >= SALARY_REVIEW_MONTHS).length
  const currentPeriod = isCurrentMonth(year, month, now)
  const liveMetrics = metrics
    .filter(item => currentPeriod ? item.liveStatus !== 'not_available' : item.trackedDays > 0)
    .sort((left, right) => (
      (currentPeriod
        ? Number(right.liveStatus === 'on_site') - Number(left.liveStatus === 'on_site')
          || right.currentContinuousSeconds - left.currentContinuousSeconds
        : right.lateStayDays - left.lateStayDays || right.totalBreaks - left.totalBreaks)
        || left.employee.full_name.localeCompare(right.employee.full_name)
    ))
  const observationMetrics = [...metrics]
    .filter(item => item.trackedDays > 0 || item.noRaiseMonths >= SALARY_REVIEW_MONTHS || item.absentDays > 0)
    .sort((left, right) => {
      const leftScore = left.lateStayDays * 3 + left.frequentExitDays * 2 + left.absentDays * 3 + Number(left.noRaiseMonths >= SALARY_REVIEW_MONTHS) * 2
      const rightScore = right.lateStayDays * 3 + right.frequentExitDays * 2 + right.absentDays * 3 + Number(right.noRaiseMonths >= SALARY_REVIEW_MONTHS) * 2
      return rightScore - leftScore || left.employee.full_name.localeCompare(right.employee.full_name)
    })
  const failedLoads = Object.keys(errorsByEmployee).length

  return (
    <section className="management-agent">
      <div className="management-agent-hero">
        <div className="management-agent-orb" aria-hidden="true">
          <Bot size={30} />
          <span />
        </div>
        <div className="management-agent-briefing">
          <div className="management-agent-eyebrow">
            <span className={loading ? 'loading' : ''} />
            Управленческий агент
          </div>
          <h2>{loading && !lastUpdated ? 'Собираю картину по отделу…' : getBriefing(signals, metrics, currentPeriod)}</h2>
          <p>
            Сверяю табель, историю окладов и проходы СКУД. Каждый вывод можно проверить по фактам.
          </p>
        </div>
        <div className="management-agent-refresh">
          <button type="button" onClick={() => void loadEvents(true)} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'spinning' : ''} />
            {loading ? `${loadedCount}/${employeesWithFot.length}` : 'Обновить'}
          </button>
          <span>Обновлено: {formatUpdatedAt(lastUpdated)}</span>
        </div>
      </div>

      {failedLoads > 0 && (
        <div className="management-agent-load-warning">
          <AlertTriangle size={16} />
          Не удалось получить СКУД для {pluralize(failedLoads, 'сотрудника', 'сотрудников', 'сотрудников')}.
          Остальные сигналы рассчитаны нормально.
        </div>
      )}

      <div className="management-agent-kpis">
        <article className="attention">
          <span><AlertTriangle size={18} /> Требуют внимания</span>
          <strong>{attentionPeople}</strong>
          <small>{highPriorityCount > 0 ? `${highPriorityCount} приоритетных сигналов` : 'без критичных сигналов'}</small>
        </article>
        <article className="presence">
          <span><Users size={18} /> Сейчас на объекте</span>
          <strong>{loading && !lastUpdated ? '…' : currentPeriod ? onSiteCount : '—'}</strong>
          <small>{currentPeriod ? `из ${employeesWithFot.length} со СКУД` : 'выбран архивный период'}</small>
        </article>
        <article className="exits">
          <span><DoorOpen size={18} /> Часто выходят</span>
          <strong>{frequentExitPeople}</strong>
          <small>3+ выхода минимум в два дня</small>
        </article>
        <article className="salary">
          <span><WalletCards size={18} /> Проверить оклад</span>
          <strong>{salaryReviewPeople}</strong>
          <small>12+ месяцев без повышения</small>
        </article>
      </div>

      <div className="management-agent-layout">
        <div className="management-agent-focus">
          <div className="management-agent-section-head">
            <div>
              <span>Приоритеты</span>
              <h3>Куда обратить внимание</h3>
            </div>
            <div className="management-agent-filters" aria-label="Фильтр сигналов">
              {filterOptions.map(option => (
                <button
                  key={option.key}
                  type="button"
                  className={filter === option.key ? 'active' : ''}
                  onClick={() => setFilter(option.key)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="management-agent-signals">
            {filteredSignals.length === 0 ? (
              <div className="management-agent-empty">
                <Activity size={24} />
                <strong>По этому фильтру сигналов нет</strong>
                <span>Агент продолжает наблюдение и обновляет данные автоматически.</span>
              </div>
            ) : (
              filteredSignals.map(signal => (
                <button
                  key={signal.id}
                  type="button"
                  className={`management-agent-signal ${signal.severity}`}
                  onClick={() => onSelectEmployee(signal.employee)}
                >
                  <span className="management-agent-avatar">{getInitials(signal.employee)}</span>
                  <span className="management-agent-signal-copy">
                    <span className="management-agent-signal-topline">
                      <b>{signal.employee.full_name}</b>
                      <span className={`management-agent-signal-kind ${signal.kind}`}>
                        {signalMeta[signal.kind].icon}
                        {signalMeta[signal.kind].label}
                      </span>
                    </span>
                    <strong>{signal.title}</strong>
                    <small>{signal.evidence}</small>
                    <em>{signal.action}</em>
                  </span>
                  <ChevronRight size={19} />
                </button>
              ))
            )}
          </div>
        </div>

        <aside className="management-agent-live">
          <div className="management-agent-section-head">
            <div>
              <span>{currentPeriod ? 'Онлайн' : 'Период'}</span>
              <h3>{currentPeriod ? 'Кто где сейчас' : 'Архив наблюдений'}</h3>
            </div>
          </div>
          <div className="management-agent-live-list">
            {loading && !lastUpdated ? (
              <div className="management-agent-live-empty">Собираю онлайн-статусы…</div>
            ) : liveMetrics.length === 0 ? (
              <div className="management-agent-live-empty">Нет доступных событий СКУД</div>
            ) : (
              liveMetrics.slice(0, 12).map(item => (
                <button type="button" key={item.employee.id} onClick={() => onSelectEmployee(item.employee)}>
                  <span className={`management-agent-live-dot ${item.liveStatus}`} />
                  <span>
                    <b>{item.employee.full_name}</b>
                    <small>
                      {currentPeriod
                        ? item.liveDetail
                        : `${pluralize(item.trackedDays, 'день', 'дня', 'дней')} со СКУД · ${pluralize(item.totalBreaks, 'выход', 'выхода', 'выходов')}`}
                    </small>
                  </span>
                  <em>
                    {currentPeriod
                      ? item.liveStatusLabel
                      : `${pluralize(item.lateStayDays, 'уход', 'ухода', 'уходов')} после 20:00`}
                  </em>
                </button>
              ))
            )}
          </div>
        </aside>
      </div>

      <article className="management-agent-observations">
        <div className="management-agent-section-head">
          <div>
            <span>Проверяемые данные</span>
            <h3>Паттерны по сотрудникам</h3>
          </div>
          <small>{observationMetrics.length} в наблюдении</small>
        </div>
        <div className="management-agent-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Сотрудник</th>
                <th>Дней со СКУД</th>
                <th>После 20:00</th>
                <th>Выходов</th>
                <th>Макс. без выхода</th>
                <th>Без повышения</th>
              </tr>
            </thead>
            <tbody>
              {observationMetrics.map(item => (
                <tr key={item.employee.id} onClick={() => onSelectEmployee(item.employee)}>
                  <td>
                    <span className="management-agent-table-person">
                      <span className="management-agent-avatar small">{getInitials(item.employee)}</span>
                      <span>
                        <b>{item.employee.full_name}</b>
                        <small>{item.employee.subdivision || item.employee.department || 'Без подразделения'}</small>
                      </span>
                    </span>
                  </td>
                  <td>{item.trackedDays}</td>
                  <td className={item.lateStayDays >= 2 ? 'warn' : ''}>{item.lateStayDays}</td>
                  <td className={item.frequentExitDays >= 2 ? 'warn' : ''}>{item.totalBreaks}</td>
                  <td>{item.maxContinuousSeconds > 0 ? formatSkudDuration(item.maxContinuousSeconds) : '—'}</td>
                  <td className={item.noRaiseMonths >= SALARY_REVIEW_MONTHS ? 'warn' : ''}>
                    {formatMonthsSinceRaise(item.noRaiseMonths)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      <details className="management-agent-rules">
        <summary>
          <Info size={16} />
          Как агент делает выводы
        </summary>
        <div>
          <span><b>Поздний уход</b> — последнее событие после 20:00 минимум два дня.</span>
          <span><b>Частые выходы</b> — три и более перерыва вне объекта минимум два дня.</span>
          <span><b>Долго без выхода</b> — непрерывное присутствие от четырёх часов.</span>
          <span><b>Пересмотр оклада</b> — двенадцать месяцев без зафиксированного повышения.</span>
        </div>
        <p>Сигнал — повод проверить контекст, а не автоматическая оценка эффективности сотрудника.</p>
      </details>
    </section>
  )
}

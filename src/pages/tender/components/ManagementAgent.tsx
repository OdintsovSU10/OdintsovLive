import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
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
  metrics: EmployeeAgentMetrics
}

interface EmployeeAgentMetrics {
  employee: EmployeeWithStats
  days: EmployeeAgentDay[]
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

interface EmployeeAgentDay {
  date: string
  lateStay: boolean
  lastExitTime: string | null
  breaks: number
  maxContinuousSeconds: number
}

interface CachedEvents {
  events: FotEmployeeEvent[]
  expiresAt: number
}

interface SignalDetailStat {
  label: string
  value: string
  caption: string
}

interface SignalExplanation {
  stats: SignalDetailStat[]
  rule: string
  source: string
  rows: SignalEvidenceRow[]
}

interface SignalEvidenceRow {
  date: string
  label: string
  value: string
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

function formatDate(value: string): string {
  const date = new Date(`${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })
}

function getSignalExplanation(signal: AgentSignal): SignalExplanation {
  const item = signal.metrics

  if (signal.kind === 'late_stay') {
    const share = item.trackedDays > 0 ? Math.round((item.lateStayDays / item.trackedDays) * 100) : 0
    return {
      stats: [
        { label: 'Поздних уходов', value: String(item.lateStayDays), caption: 'после 20:00' },
        { label: 'Дней со СКУД', value: String(item.trackedDays), caption: 'в выбранном месяце' },
        { label: 'Доля дней', value: `${share}%`, caption: 'от дней с событиями' }
      ],
      rule: `Сигнал появляется от двух дней, когда последний выход зафиксирован после 20:00. Здесь таких дней: ${item.lateStayDays}.`,
      source: 'События входа и выхода FOT/СКУД за выбранный месяц.',
      rows: item.days
        .filter(day => day.lateStay)
        .map(day => ({
          date: day.date,
          label: 'Последний выход',
          value: day.lastExitTime ? formatTime(day.lastExitTime) : 'ещё на объекте'
        }))
    }
  }

  if (signal.kind === 'frequent_exits') {
    const average = item.trackedDays > 0 ? item.totalBreaks / item.trackedDays : 0
    return {
      stats: [
        { label: 'Всего выходов', value: String(item.totalBreaks), caption: 'между входами' },
        { label: 'Дней с 3+', value: String(item.frequentExitDays), caption: 'с частыми выходами' },
        { label: 'В среднем', value: average.toLocaleString('ru-RU', { maximumFractionDigits: 1 }), caption: 'выхода в день' }
      ],
      rule: `Сигнал появляется, если три и более выхода случились минимум в два дня. Здесь условие выполнено в ${pluralize(item.frequentExitDays, 'день', 'дня', 'дней')}.`,
      source: 'Закрытые последовательности «выход → следующий вход» из FOT/СКУД.',
      rows: item.days
        .filter(day => day.breaks >= FREQUENT_BREAKS_PER_DAY)
        .map(day => ({
          date: day.date,
          label: 'Выходы вне объекта',
          value: pluralize(day.breaks, 'выход', 'выхода', 'выходов')
        }))
    }
  }

  if (signal.kind === 'long_session') {
    return {
      stats: [
        { label: 'Максимум', value: item.maxContinuousSeconds > 0 ? formatSkudDuration(item.maxContinuousSeconds) : '—', caption: 'без выхода' },
        { label: 'Дней с 4ч+', value: String(item.longSessionDays), caption: 'длинных сессий' },
        { label: 'Прямо сейчас', value: item.currentContinuousSeconds > 0 ? formatSkudDuration(item.currentContinuousSeconds) : '—', caption: 'текущая сессия' }
      ],
      rule: 'Длинной считается непрерывная пара «вход → выход» от четырёх часов. Для повторяющегося сигнала такие сессии должны встречаться минимум в половине наблюдаемых дней.',
      source: 'Рассчитанные пары присутствия FOT/СКУД за выбранный месяц.',
      rows: item.days
        .filter(day => day.maxContinuousSeconds >= LONG_SESSION_SECONDS)
        .map(day => ({
          date: day.date,
          label: 'Непрерывное присутствие',
          value: formatSkudDuration(day.maxContinuousSeconds)
        }))
    }
  }

  if (signal.kind === 'timesheet') {
    return {
      stats: [
        { label: 'Отсутствий', value: String(item.absentDays), caption: 'неявка или без содержания' },
        { label: 'Записей табеля', value: String(item.employee.timesheet?.length || 0), caption: 'за выбранный месяц' },
        { label: 'Дней со СКУД', value: String(item.trackedDays), caption: 'для сверки' }
      ],
      rule: `Сигнал появляется от двух дней со статусом «неявка» или «без содержания». Здесь найдено: ${item.absentDays}.`,
      source: 'Табель сотрудника за выбранный месяц; больничные не считаются нарушением.',
      rows: (item.employee.timesheet || [])
        .filter(entry => entry.status === 'absent' || entry.status === 'unpaid')
        .sort((left, right) => right.work_date.localeCompare(left.work_date))
        .map(entry => ({
          date: entry.work_date,
          label: 'Статус табеля',
          value: entry.status === 'absent' ? 'Неявка' : 'Без содержания'
        }))
    }
  }

  return {
    stats: [
      { label: 'Без повышения', value: formatMonthsSinceRaise(item.noRaiseMonths), caption: 'на сегодняшний день' },
      { label: 'Текущий оклад', value: `${item.employee.current_salary.toLocaleString('ru-RU')} ₽`, caption: 'по карточке сотрудника' },
      { label: 'Принят', value: formatDate(item.employee.hire_date), caption: `${item.employee.salaryHistory?.length || 0} записей оклада` }
    ],
    rule: `Сигнал появляется через ${SALARY_REVIEW_MONTHS} месяцев после последнего зафиксированного повышения. Критичный уровень — ${SALARY_CRITICAL_MONTHS} месяцев.`,
    source: 'История окладов и дата приёма сотрудника.',
    rows: item.employee.salaryHistory && item.employee.salaryHistory.length > 0
      ? [...item.employee.salaryHistory]
        .sort((left, right) => right.effective_date.localeCompare(left.effective_date))
        .map(entry => ({
          date: entry.effective_date,
          label: entry.note || 'Запись оклада',
          value: `${entry.salary.toLocaleString('ru-RU')} ₽`
        }))
      : [{ date: item.employee.hire_date, label: 'Дата приёма', value: 'Начало отсчёта' }]
  }
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
  const days: EmployeeAgentDay[] = []

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
    days.push({
      date,
      lateStay: lastExitSeconds >= LATE_STAY_AFTER_SECONDS || openLateStay,
      lastExitTime: openLateStay ? null : calculation.lastExit?.event_time || null,
      breaks: calculation.breaks.length,
      maxContinuousSeconds: longestPair
    })
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
    days: days.sort((left, right) => right.date.localeCompare(left.date)),
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
        action: 'Проверьте нагрузку, сроки и необходимость переработок',
        metrics: item
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
        action: 'Уточните контекст: встречи, выезды или незапланированные перерывы',
        metrics: item
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
        action: 'Проверьте самочувствие и напомните сделать перерыв',
        metrics: item
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
        action: 'Проверьте причины и актуальность статусов табеля',
        metrics: item
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
        action: 'Сверьте роль, результат и рыночный уровень перед пересмотром',
        metrics: item
      })
    }
  }

  const severityOrder: Record<SignalSeverity, number> = { high: 0, medium: 1, info: 2 }
  return signals.sort((left, right) => (
    severityOrder[left.severity] - severityOrder[right.severity]
      || left.employee.full_name.localeCompare(right.employee.full_name)
  ))
}

function SignalDetail({
  signal,
  onBack,
  onOpenEmployee
}: {
  signal: AgentSignal
  onBack: () => void
  onOpenEmployee: () => void
}) {
  const explanation = getSignalExplanation(signal)
  const group = signal.employee.subdivision || signal.employee.department || 'Без подразделения'

  return (
    <div className="management-agent-signal-detail">
      <div className="management-agent-detail-person">
        <span className="management-agent-avatar large">{getInitials(signal.employee)}</span>
        <div>
          <span className={`management-agent-signal-kind ${signal.kind}`}>
            {signalMeta[signal.kind].icon}
            {signalMeta[signal.kind].label}
          </span>
          <h4>{signal.employee.full_name}</h4>
          <p>{signal.employee.position} · {group}</p>
        </div>
        <span className={`management-agent-detail-severity ${signal.severity}`}>
          {signal.severity === 'high' ? 'Высокий приоритет' : signal.severity === 'medium' ? 'Обратить внимание' : 'Наблюдение'}
        </span>
      </div>

      <div className="management-agent-detail-summary">
        <span>Почему появился сигнал</span>
        <strong>{signal.title}</strong>
        <p>{signal.evidence}</p>
      </div>

      <div className="management-agent-detail-stats">
        {explanation.stats.map(stat => (
          <div key={stat.label}>
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
            <small>{stat.caption}</small>
          </div>
        ))}
      </div>

      {explanation.rows.length > 0 && (
        <div className="management-agent-detail-breakdown">
          <div className="management-agent-detail-breakdown-head">
            <span>Из чего собран сигнал</span>
            <small>{pluralize(explanation.rows.length, 'событие', 'события', 'событий')}</small>
          </div>
          <div className="management-agent-detail-breakdown-list">
            {explanation.rows.slice(0, 8).map((row, index) => (
              <div key={`${row.date}-${row.label}-${index}`}>
                <time>{formatDate(row.date)}</time>
                <span>{row.label}</span>
                <strong>{row.value}</strong>
              </div>
            ))}
          </div>
          {explanation.rows.length > 8 && (
            <small className="management-agent-detail-more">
              Ещё {explanation.rows.length - 8} событий скрыто
            </small>
          )}
        </div>
      )}

      <div className="management-agent-detail-explanation">
        <div>
          <Info size={17} />
          <span><b>Как сработало правило</b>{explanation.rule}</span>
        </div>
        <div>
          <Activity size={17} />
          <span><b>Источник данных</b>{explanation.source}</span>
        </div>
      </div>

      <div className="management-agent-detail-action">
        <span>Что стоит сделать</span>
        <p>{signal.action}</p>
      </div>

      <div className="management-agent-detail-buttons">
        <button type="button" className="back" onClick={onBack}>
          <ArrowLeft size={16} /> Назад к приоритетам
        </button>
        <button type="button" className="open" onClick={onOpenEmployee}>
          Открыть карточку сотрудника <ChevronRight size={16} />
        </button>
      </div>
    </div>
  )
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
  const [selectedSignalId, setSelectedSignalId] = useState<string | null>(null)
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
  const selectedSignal = useMemo(
    () => signals.find(signal => signal.id === selectedSignalId) || null,
    [selectedSignalId, signals]
  )

  useEffect(() => {
    if (selectedSignalId && !selectedSignal) setSelectedSignalId(null)
  }, [selectedSignal, selectedSignalId])
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
              <h3>{selectedSignal ? 'Расшифровка сигнала' : 'Куда обратить внимание'}</h3>
            </div>
            {selectedSignal ? (
              <button type="button" className="management-agent-focus-back" onClick={() => setSelectedSignalId(null)}>
                <ArrowLeft size={15} /> Назад
              </button>
            ) : (
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
            )}
          </div>

          <div className="management-agent-signals">
            {selectedSignal ? (
              <SignalDetail
                signal={selectedSignal}
                onBack={() => setSelectedSignalId(null)}
                onOpenEmployee={() => onSelectEmployee(selectedSignal.employee)}
              />
            ) : filteredSignals.length === 0 ? (
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
                  onClick={() => setSelectedSignalId(signal.id)}
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
                  <span className="management-agent-live-copy">
                    <b>{item.employee.full_name}</b>
                    <span className="management-agent-live-time">
                      <Clock3 size={14} />
                      {currentPeriod
                        ? item.liveDetail
                        : `${pluralize(item.trackedDays, 'день', 'дня', 'дней')} со СКУД · ${pluralize(item.totalBreaks, 'выход', 'выхода', 'выходов')}`}
                    </span>
                  </span>
                  <span className={`management-agent-live-status ${item.liveStatus}`}>
                    {currentPeriod
                      ? item.liveStatusLabel
                      : `${pluralize(item.lateStayDays, 'уход', 'ухода', 'уходов')} после 20:00`}
                  </span>
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

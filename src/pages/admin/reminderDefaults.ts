// Настройки напоминаний бота. Дефолты повторяют ops/telegram-bot/reminderSettings.mjs:
// пустой объект в базе = эти значения; бот сам проверяет и чинит мусор.
export interface IMetersReminders {
  enabled: boolean
  day: number
  deadline: string
  dayBefore: string[]
  onDay: string[]
}

export interface ITodosReminders {
  enabled: boolean
  offsets: number[]
}

export interface IDailyReminders {
  fromHour: number
  toHour: number
  checks: Record<string, boolean>
}

export interface ILifeEvent {
  date: string
  label: string
}

export interface ILifeReminders {
  birthDate: string
  events: ILifeEvent[]
}

export interface IReminderSettings {
  meters: IMetersReminders
  todos: ITodosReminders
  daily: IDailyReminders
  life: ILifeReminders
}

export const REMINDER_CHECKS: { key: string; label: string }[] = [
  { key: 'morning', label: 'Утренняя сводка' },
  { key: 'weekly', label: 'Недельный дайджест' },
  { key: 'budget-limits', label: 'Лимиты бюджета' },
  { key: 'service-soon', label: 'Скорое ТО' },
  { key: 'insurance', label: 'Окончание страховки' },
  { key: 'stale-statement', label: 'Устаревшая выписка банка' },
  { key: 'transfer-notes', label: 'Вопросы «за что перевод»' },
  { key: 'life-weeks', label: 'Недели жизни (картинка раз в неделю)' }
]

export const MAX_LIFE_EVENTS = 6
export const MAX_LIFE_EVENT_LABEL = 40
// Цвета памятных дат по порядку после сортировки по дате; совпадают с палитрой бота (lifeWeeks.mjs)
export const LIFE_EVENT_COLORS = ['#f4900c', '#aa8ed6', '#55acee', '#78b159', '#fdcb58', '#c1694f']

export const MAX_OFFSETS = 5
export const MAX_OFFSET_MIN = 1440
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MIN_BIRTH_DATE = '1900-01-01'
const DAY_MS = 24 * 60 * 60 * 1000

// YYYY-MM-DD: реальная дата, не в будущем и не раньше 1900
export const isValidBirthDate = (value: string): boolean => {
  if (!DATE_RE.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return false
  return value >= MIN_BIRTH_DATE && date.getTime() <= Date.now() + DAY_MS
}

// YYYY-MM-DD: реальная дата не раньше 1900 (будущее допустимо)
export const isValidEventDate = (value: string): boolean => {
  if (!DATE_RE.test(value) || value < MIN_BIRTH_DATE) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export const sortLifeEvents = (events: ILifeEvent[]): ILifeEvent[] =>
  [...events].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))

export const DEFAULT_REMINDER_SETTINGS: IReminderSettings = {
  meters: { enabled: true, day: 23, deadline: '23:00', dayBefore: ['10:00'], onDay: ['10:00', '13:00', '16:00', '19:00', '21:00', '22:00'] },
  todos: { enabled: true, offsets: [120, 60, 0] },
  daily: {
    fromHour: 10,
    toHour: 21,
    checks: Object.fromEntries(REMINDER_CHECKS.map(({ key }) => [key, true]))
  },
  life: { birthDate: '', events: [] }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const asBool = (value: unknown, fallback: boolean): boolean => (typeof value === 'boolean' ? value : fallback)

const asInt = (value: unknown, min: number, max: number, fallback: number): number =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : fallback

const asTime = (value: unknown, fallback: string): string =>
  typeof value === 'string' && TIME_RE.test(value) ? value : fallback

export const sortTimes = (times: string[]): string[] =>
  [...new Set(times.filter(time => TIME_RE.test(time)))].sort()

export const sortOffsets = (offsets: number[]): number[] =>
  [...new Set(offsets.filter(item => Number.isInteger(item) && item >= 0 && item <= MAX_OFFSET_MIN))]
    .sort((a, b) => b - a)
    .slice(0, MAX_OFFSETS)

const asTimes = (value: unknown, fallback: string[]): string[] =>
  Array.isArray(value) ? sortTimes(value.filter((item): item is string => typeof item === 'string')) : [...fallback]

const asOffsets = (value: unknown, fallback: number[]): number[] =>
  Array.isArray(value) ? sortOffsets(value.filter((item): item is number => typeof item === 'number')) : [...fallback]

const asLifeEvents = (value: unknown): ILifeEvent[] => {
  if (!Array.isArray(value)) return []
  const events = value
    .filter(isObject)
    .map(item => ({
      date: typeof item.date === 'string' && isValidEventDate(item.date) ? item.date : '',
      label: typeof item.label === 'string' ? item.label.trim().slice(0, MAX_LIFE_EVENT_LABEL).trim() : ''
    }))
    .filter(item => item.date && item.label)
  return sortLifeEvents(events).slice(0, MAX_LIFE_EVENTS)
}

// Слияние сохранённого значения с дефолтами при загрузке
export const mergeReminderSettings = (raw: unknown): IReminderSettings => {
  const src = isObject(raw) ? raw : {}
  const def = DEFAULT_REMINDER_SETTINGS
  const meters = isObject(src.meters) ? src.meters : {}
  const todos = isObject(src.todos) ? src.todos : {}
  const daily = isObject(src.daily) ? src.daily : {}
  const checks = isObject(daily.checks) ? daily.checks : {}
  const life = isObject(src.life) ? src.life : {}

  const fromHour = asInt(daily.fromHour, 0, 24, def.daily.fromHour)
  const toHour = asInt(daily.toHour, 0, 24, def.daily.toHour)
  const validWindow = fromHour < toHour

  return {
    meters: {
      enabled: asBool(meters.enabled, def.meters.enabled),
      day: asInt(meters.day, 1, 28, def.meters.day),
      deadline: asTime(meters.deadline, def.meters.deadline),
      dayBefore: asTimes(meters.dayBefore, def.meters.dayBefore),
      onDay: asTimes(meters.onDay, def.meters.onDay)
    },
    todos: {
      enabled: asBool(todos.enabled, def.todos.enabled),
      offsets: asOffsets(todos.offsets, def.todos.offsets)
    },
    daily: {
      fromHour: validWindow ? fromHour : def.daily.fromHour,
      toHour: validWindow ? toHour : def.daily.toHour,
      checks: Object.fromEntries(REMINDER_CHECKS.map(({ key }) => [key, asBool(checks[key], true)]))
    },
    life: {
      birthDate: typeof life.birthDate === 'string' && isValidBirthDate(life.birthDate) ? life.birthDate : '',
      events: asLifeEvents(life.events)
    }
  }
}

// Проверка формы перед сохранением: текст ошибки или null
export const validateReminderSettings = (settings: IReminderSettings): string | null => {
  const { meters, daily, life } = settings
  if (!Number.isInteger(meters.day) || meters.day < 1 || meters.day > 28) return 'День месяца — от 1 до 28.'
  if (!TIME_RE.test(meters.deadline)) return 'Укажите время срока для счётчиков.'
  if ([...meters.dayBefore, ...meters.onDay].some(time => !TIME_RE.test(time))) return 'Заполните все времена напоминаний о счётчиках.'
  if (daily.fromHour >= daily.toHour) return 'В «Остальных напоминаниях» «Не раньше» должно быть меньше «Не позже».'
  if (life.birthDate && !isValidBirthDate(life.birthDate)) return 'Проверьте дату рождения.'
  if (life.events.length > MAX_LIFE_EVENTS) return `Памятных дат — не больше ${MAX_LIFE_EVENTS}.`
  if (life.events.some(event => !isValidEventDate(event.date) || !event.label.trim())) return 'Заполните дату и название у каждого события.'
  return null
}

// Время по возрастанию без дублей, интервалы по убыванию — как делает бот
export const prepareReminderSettings = (settings: IReminderSettings): IReminderSettings => ({
  ...settings,
  meters: {
    ...settings.meters,
    dayBefore: sortTimes(settings.meters.dayBefore),
    onDay: sortTimes(settings.meters.onDay)
  },
  todos: { ...settings.todos, offsets: sortOffsets(settings.todos.offsets) },
  life: {
    ...settings.life,
    events: sortLifeEvents(settings.life.events.map(event => ({ ...event, label: event.label.trim() })))
  }
})

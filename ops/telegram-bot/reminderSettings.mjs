// Настройки напоминаний бота: хранятся в bot_settings.reminder_settings (jsonb), правятся на сайте.
// Любой мусор в базе заменяется значением по умолчанию для этого поля — бот не падает.
export const CHECK_KEYS = ['morning', 'weekly', 'budget-limits', 'service-soon', 'insurance', 'stale-statement', 'transfer-notes', 'life-weeks']

export const DEFAULT_REMINDER_SETTINGS = {
  meters: { enabled: true, day: 23, deadline: '23:00', dayBefore: ['10:00'], onDay: ['10:00', '13:00', '16:00', '19:00', '21:00', '22:00'] },
  todos: { enabled: true, offsets: [120, 60, 0] },
  daily: {
    fromHour: 10,
    toHour: 21,
    checks: Object.fromEntries(CHECK_KEYS.map(key => [key, true]))
  },
  // дата рождения для картинки «недели жизни»; пусто — картинка отключена
  life: { birthDate: '' }
}

const MAX_OFFSETS = 5
const MAX_OFFSET_MIN = 1440
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MIN_BIRTH_DATE = '1900-01-01'
const DAY_MS = 24 * 60 * 60 * 1000

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const asBool = (value, fallback) => (typeof value === 'boolean' ? value : fallback)
const asInt = (value, min, max, fallback) => (Number.isInteger(value) && value >= min && value <= max ? value : fallback)
const asTime = (value, fallback) => (typeof value === 'string' && TIME_RE.test(value) ? value : fallback)

// YYYY-MM-DD: реальная дата, не в будущем и не раньше 1900 — иначе ''
const asBirthDate = value => {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return ''
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return ''
  if (value < MIN_BIRTH_DATE || date.getTime() > Date.now() + DAY_MS) return ''
  return value
}

// Список времён: невалидные отбрасываются, остальные по возрастанию без дублей; не массив — по умолчанию
const asTimeList = (value, fallback) => {
  if (!Array.isArray(value)) return [...fallback]
  return [...new Set(value.filter(item => typeof item === 'string' && TIME_RE.test(item)))].sort()
}

const asOffsets = (value, fallback) => {
  if (!Array.isArray(value)) return [...fallback]
  const valid = value.filter(item => Number.isInteger(item) && item >= 0 && item <= MAX_OFFSET_MIN)
  return [...new Set(valid)].sort((a, b) => b - a).slice(0, MAX_OFFSETS)
}

export const normalizeReminderSettings = raw => {
  const src = isObject(raw) ? raw : {}
  const def = DEFAULT_REMINDER_SETTINGS
  const meters = isObject(src.meters) ? src.meters : {}
  const todos = isObject(src.todos) ? src.todos : {}
  const daily = isObject(src.daily) ? src.daily : {}
  const checks = isObject(daily.checks) ? daily.checks : {}
  const life = isObject(src.life) ? src.life : {}

  let fromHour = asInt(daily.fromHour, 0, 24, def.daily.fromHour)
  let toHour = asInt(daily.toHour, 0, 24, def.daily.toHour)
  if (fromHour >= toHour) {
    fromHour = def.daily.fromHour
    toHour = def.daily.toHour
  }

  return {
    meters: {
      enabled: asBool(meters.enabled, def.meters.enabled),
      day: asInt(meters.day, 1, 28, def.meters.day),
      deadline: asTime(meters.deadline, def.meters.deadline),
      dayBefore: asTimeList(meters.dayBefore, def.meters.dayBefore),
      onDay: asTimeList(meters.onDay, def.meters.onDay)
    },
    todos: {
      enabled: asBool(todos.enabled, def.todos.enabled),
      offsets: asOffsets(todos.offsets, def.todos.offsets)
    },
    daily: {
      fromHour,
      toHour,
      checks: Object.fromEntries(CHECK_KEYS.map(key => [key, asBool(checks[key], true)]))
    },
    life: { birthDate: asBirthDate(life.birthDate) }
  }
}

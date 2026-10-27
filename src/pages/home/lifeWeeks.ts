// «90 лет жизни в неделях»: порт расчётов из ops/telegram-bot/lifeWeeks.mjs (раскладка, градиент, памятные даты, подпись).
// Неделя жизни — всегда 7 дней от даты рождения, новая неделя начинается в тот же день недели, что и рождение.
import { LIFE_EVENT_COLORS, type ILifeEvent } from '../admin/reminderDefaults'

export type Rgb = [number, number, number]

export const LIFE_YEARS = 90
export const LIFE_MAX_COLS = 53
const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_MS = 7 * DAY_MS

// «Времена года» (LIFE_GRADIENTS.seasons из бота): опорные точки равномерно по t = k / (всего недель − 1)
export const SEASONS_STOPS: Rgb[] = [
  [0xa8, 0xd8, 0x7a],
  [0x2e, 0x9e, 0x4f],
  [0xe8, 0xb9, 0x2f],
  [0xd9, 0x5a, 0x2b],
  [0x6b, 0x84, 0x9c]
]

export interface ILifeStats {
  weeksLived: number
  currentWeek: number
  total: number
  percent: number
  years: number
  months: number
  weeksLeft: number
}

export interface ILifeMark {
  week: number
  color: string
  date: string
  label: string
}

export interface ILifeCell {
  row: number
  col: number
}

const dayStamp = (date: string): number => {
  const [y, m, d] = date.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

// Полных месяцев между датой рождения и датой (не меньше 0)
const fullMonthsBetween = (birthDate: string, date: string): number => {
  const [by, bm, bd] = birthDate.split('-').map(Number)
  const [ty, tm, td] = date.split('-').map(Number)
  return Math.max(0, (ty - by) * 12 + (tm - bm) - (td < bd ? 1 : 0))
}

// Первые недели строк: строка y (год жизни) вмещает недели, начатые от дня рождения в год by+y (включительно)
// до дня рождения в год by+y+1 (не включая); в строке 52 или 53 недели. [LIFE_YEARS] — всего недель в сетке.
export const rowStarts = (birthDate: string): number[] => {
  const [by, bm, bd] = birthDate.split('-').map(Number)
  const birth = dayStamp(birthDate)
  return Array.from({ length: LIFE_YEARS + 1 }, (_, y) => Math.ceil((Date.UTC(by + y, bm - 1, bd) - birth) / WEEK_MS))
}

// Номер недели жизни (0-based) для даты: неделя k начинается в день рождения + 7k. Дата раньше рождения — null
export const weekOf = (birthDate: string, date: string): number | null => {
  const days = Math.round((dayStamp(date) - dayStamp(birthDate)) / DAY_MS)
  return days < 0 ? null : Math.floor(days / 7)
}

export const lifeStats = (birthDate: string, today: string): ILifeStats => {
  const weeksLived = weekOf(birthDate, today) ?? 0
  const total = rowStarts(birthDate)[LIFE_YEARS]
  const fullMonths = fullMonthsBetween(birthDate, today)
  const currentWeek = weeksLived + 1
  return {
    weeksLived,
    currentWeek,
    total,
    percent: Math.min(100, Math.round((weeksLived / total) * 100)),
    years: Math.floor(fullMonths / 12),
    months: fullMonths % 12,
    weeksLeft: Math.max(0, total - currentWeek)
  }
}

// Строка и столбец недели k по первым неделям строк (first — результат rowStarts)
export const cellOf = (first: number[], k: number): ILifeCell | null => {
  for (let row = 0; row < LIFE_YEARS; row++) {
    if (k >= first[row] && k < first[row + 1]) return { row, col: k - first[row] }
  }
  return null
}

// Цвет недели k на градиенте всей жизни (total — всего недель в сетке)
export const gradientColor = (k: number, total: number, stops: Rgb[] = SEASONS_STOPS): Rgb => {
  const t = Math.min(1, Math.max(0, k / Math.max(1, total - 1))) * (stops.length - 1)
  const i = Math.min(stops.length - 2, Math.floor(t))
  const f = t - i
  return stops[i].map((c, ch) => Math.round(c + (stops[i + 1][ch] - c) * f)) as Rgb
}

export const rgbCss = ([r, g, b]: Rgb): string => `rgb(${r}, ${g}, ${b})`

// Тот же градиент для полосы-прогресса
export const gradientCss = (stops: Rgb[] = SEASONS_STOPS): string =>
  `linear-gradient(90deg, ${stops.map((stop, i) => `${rgbCss(stop)} ${Math.round((i / (stops.length - 1)) * 100)}%`).join(', ')})`

// Памятные даты: цвет по порядку после сортировки по дате; раньше рождения и за пределами сетки пропускаются
// (цвет остаётся за своим номером)
export const lifeMarks = (birthDate: string, events: ILifeEvent[]): ILifeMark[] => {
  const total = rowStarts(birthDate)[LIFE_YEARS]
  const sorted = [...events].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  const marks: ILifeMark[] = []
  sorted.slice(0, LIFE_EVENT_COLORS.length).forEach((event, index) => {
    const week = weekOf(birthDate, event.date)
    if (week === null || week >= total) return
    marks.push({ week, color: LIFE_EVENT_COLORS[index], date: event.date, label: event.label })
  })
  return marks
}

export const fmtEventDate = (date: string): string => date.split('-').reverse().join('.')

// Тысячи через неразрывный пробел, чтобы число не рвалось на переносе
export const fmtNum = (n: number): string => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

export const plural = (n: number, one: string, few: string, many: string): string => {
  const mod100 = n % 100
  const mod10 = n % 10
  if (mod100 >= 11 && mod100 <= 14) return many
  if (mod10 === 1) return one
  if (mod10 >= 2 && mod10 <= 4) return few
  return many
}

// «Неделя 1 532 из 4 696 · 29 лет 4 мес. · осталось 3 164 недели»
export const lifeCaption = (stats: ILifeStats): string => {
  const week = Math.min(stats.currentWeek, stats.total)
  const age = [
    `${stats.years} ${plural(stats.years, 'год', 'года', 'лет')}`,
    stats.months > 0 ? `${stats.months} мес.` : ''
  ].filter(Boolean).join(' ')
  const tail = stats.weeksLeft > 0
    ? `осталось ${fmtNum(stats.weeksLeft)} ${plural(stats.weeksLeft, 'неделя', 'недели', 'недель')}`
    : `все ${LIFE_YEARS} лет прожиты`
  return `Неделя ${fmtNum(week)} из ${fmtNum(stats.total)} · ${age} · ${tail}`
}

export interface ILifeModel {
  first: number[]
  stats: ILifeStats
  marks: ILifeMark[]
  caption: string
}

export const buildLifeModel = (birthDate: string, events: ILifeEvent[], today: string): ILifeModel => {
  const stats = lifeStats(birthDate, today)
  return { first: rowStarts(birthDate), stats, marks: lifeMarks(birthDate, events), caption: lifeCaption(stats) }
}

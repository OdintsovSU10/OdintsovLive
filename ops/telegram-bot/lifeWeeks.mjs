// «90 лет жизни в неделях»: PNG-сетка 90 строк (годы) × 52 столбца (недели) и отправка в Telegram.
// Без зависимостей: свой PNG-энкодер (RGB, фильтр 0) и битмап-шрифт цифр 3×5.
import zlib from 'node:zlib'
import { fmtNum } from './actions.mjs'
import { once } from './notify.mjs'

const YEARS = 90
const WEEKS_IN_YEAR = 52
const TOTAL_WEEKS = YEARS * WEEKS_IN_YEAR
const DAY_MS = 24 * 60 * 60 * 1000

// геометрия холста
const CELL = 10
const GAP = 3
const DECADE_GAP = 6
const MARGIN = 24
const FONT_SCALE = 2
const GLYPH_W = 3
const GLYPH_H = 5
const CHAR_STEP = (GLYPH_W + 1) * FONT_SCALE
const LABEL_W = 2 * CHAR_STEP + 4
const LABEL_H = GLYPH_H * FONT_SCALE + 6

// цвета (RGB): фон и границы из Branding.md; акцент проекта (#C4A77D) на светлом фоне слабо контрастен,
// поэтому текущая неделя — красная
const COLOR_BG = [0xf8, 0xf6, 0xf3]
const COLOR_LIVED = [0x1a, 0x1a, 0x1a]
const COLOR_CURRENT = [0xd3, 0x2f, 0x2f]
const COLOR_FUTURE = [0xc9, 0xc3, 0xb8]
const COLOR_LABEL = [0x6b, 0x6b, 0x6b]
// палитра памятных дат по порядку (красный занят текущей неделей): RGB подобран под эмодзи рядом в подписи
const EVENT_COLORS = [
  { rgb: [0xf4, 0x90, 0x0c], emoji: '🟧' },
  { rgb: [0xaa, 0x8e, 0xd6], emoji: '🟪' },
  { rgb: [0x55, 0xac, 0xee], emoji: '🟦' },
  { rgb: [0x78, 0xb1, 0x59], emoji: '🟩' },
  { rgb: [0xfd, 0xcb, 0x58], emoji: '🟨' },
  { rgb: [0xc1, 0x69, 0x4f], emoji: '🟫' }
]
const CURRENT_BORDER = 2

const GRID_W = WEEKS_IN_YEAR * CELL + (WEEKS_IN_YEAR - 1) * GAP
const GRID_H = YEARS * CELL + (YEARS - 1) * GAP + (YEARS / 10 - 1) * DECADE_GAP
const WIDTH = MARGIN * 2 + LABEL_W + GRID_W
const HEIGHT = MARGIN * 2 + LABEL_H + GRID_H
const GRID_X = MARGIN + LABEL_W
const GRID_Y = MARGIN + LABEL_H

// цифры 3×5: строки сверху вниз, бит 4 — левый столбец
const GLYPHS = {
  0: [7, 5, 5, 5, 7],
  1: [2, 6, 2, 2, 7],
  2: [7, 1, 7, 4, 7],
  3: [7, 1, 7, 1, 7],
  4: [5, 5, 7, 1, 1],
  5: [7, 4, 7, 1, 7],
  6: [7, 4, 7, 5, 7],
  7: [7, 1, 1, 1, 1],
  8: [7, 5, 7, 5, 7],
  9: [7, 5, 7, 1, 7]
}

// ---------- PNG ----------

const crcBuf = Buffer.alloc(4)
const chunk = (type, data) => {
  const head = Buffer.alloc(4)
  head.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  crcBuf.writeUInt32BE(zlib.crc32(body))
  return Buffer.concat([head, body, crcBuf])
}

const encodePng = (width, height, pixels) => {
  const stride = width * 3
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    // первый байт строки — фильтр 0
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // бит на канал
  ihdr[9] = 2 // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ])
}

// ---------- рисование ----------

const fillRect = (pixels, x, y, w, h, color) => {
  for (let row = y; row < y + h; row++) {
    for (let col = x; col < x + w; col++) {
      const at = (row * WIDTH + col) * 3
      pixels[at] = color[0]
      pixels[at + 1] = color[1]
      pixels[at + 2] = color[2]
    }
  }
}

const drawText = (pixels, text, x, y, color) => {
  let cursor = x
  for (const char of text) {
    const glyph = GLYPHS[char]
    for (let row = 0; row < GLYPH_H; row++) {
      for (let col = 0; col < GLYPH_W; col++) {
        if (glyph[row] & (4 >> col)) fillRect(pixels, cursor + col * FONT_SCALE, y + row * FONT_SCALE, FONT_SCALE, FONT_SCALE, color)
      }
    }
    cursor += CHAR_STEP
  }
}

const textWidth = text => text.length * CHAR_STEP - FONT_SCALE

const cellX = col => GRID_X + col * (CELL + GAP)
const cellY = row => GRID_Y + row * (CELL + GAP) + Math.floor(row / 10) * DECADE_GAP

// marks — [{ cell, rgb }] памятных дат; при совпадении клеток побеждает первая
export const renderLifeWeeks = (cell, marks = []) => {
  const markColors = new Map()
  for (const mark of marks) {
    if (!markColors.has(mark.cell)) markColors.set(mark.cell, mark.rgb)
  }
  const pixels = Buffer.alloc(WIDTH * HEIGHT * 3)
  fillRect(pixels, 0, 0, WIDTH, HEIGHT, COLOR_BG)

  // подписи недель сверху
  for (const week of [1, 10, 20, 30, 40, 52]) {
    const text = String(week)
    drawText(pixels, text, cellX(week - 1) + Math.round((CELL - textWidth(text)) / 2), MARGIN, COLOR_LABEL)
  }
  // подписи лет слева (по десятилетиям), выровнены по правому краю
  for (let year = 0; year < YEARS; year += 10) {
    const text = String(year)
    drawText(pixels, text, MARGIN + LABEL_W - 4 - textWidth(text), cellY(year) + Math.round((CELL - GLYPH_H * FONT_SCALE) / 2), COLOR_LABEL)
  }

  for (let i = 0; i < TOTAL_WEEKS; i++) {
    const x = cellX(i % WEEKS_IN_YEAR)
    const y = cellY(Math.floor(i / WEEKS_IN_YEAR))
    const mark = markColors.get(i)
    if (i === cell) {
      if (mark) {
        // текущая неделя совпала с памятной датой: красная клетка в рамке цвета даты
        fillRect(pixels, x, y, CELL, CELL, mark)
        fillRect(pixels, x + CURRENT_BORDER, y + CURRENT_BORDER, CELL - CURRENT_BORDER * 2, CELL - CURRENT_BORDER * 2, COLOR_CURRENT)
      } else {
        fillRect(pixels, x, y, CELL, CELL, COLOR_CURRENT)
      }
    } else if (mark) {
      fillRect(pixels, x, y, CELL, CELL, mark)
    } else if (i < cell) {
      fillRect(pixels, x, y, CELL, CELL, COLOR_LIVED)
    } else {
      // контур 1 px, внутри фон
      fillRect(pixels, x, y, CELL, CELL, COLOR_FUTURE)
      fillRect(pixels, x + 1, y + 1, CELL - 2, CELL - 2, COLOR_BG)
    }
  }
  return encodePng(WIDTH, HEIGHT, pixels)
}

// ---------- расчёты и подпись ----------

const dayStamp = date => {
  const [y, m, d] = date.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

// полных месяцев между датой рождения и датой (не меньше 0)
const fullMonthsBetween = (birthDate, date) => {
  const [by, bm, bd] = birthDate.split('-').map(Number)
  const [ty, tm, td] = date.split('-').map(Number)
  return Math.max(0, (ty - by) * 12 + (tm - bm) - (td < bd ? 1 : 0))
}

// Клетка сетки для даты: строка = полный возраст, столбец = неделя с последнего дня рождения (максимум 51):
// в году 52,18 недели, и без этого клетка к 40 годам уезжает на 1,5 месяца вперёд.
// Дата раньше рождения — -1; дальше сетки — TOTAL_WEEKS.
export const cellOf = (birthDate, date) => {
  if (dayStamp(date) < dayStamp(birthDate)) return -1
  const [by, bm, bd] = birthDate.split('-').map(Number)
  const years = Math.floor(fullMonthsBetween(birthDate, date) / 12)
  const sinceBirthday = Math.round((dayStamp(date) - Date.UTC(by + years, bm - 1, bd)) / DAY_MS)
  return Math.min(TOTAL_WEEKS, years * WEEKS_IN_YEAR + Math.min(WEEKS_IN_YEAR - 1, Math.floor(Math.max(0, sinceBirthday) / 7)))
}

export const lifeWeeksStats = (birthDate, today) => {
  const days = Math.max(0, Math.round((dayStamp(today) - dayStamp(birthDate)) / DAY_MS))
  const weeksLived = Math.floor(days / 7)
  const fullMonths = fullMonthsBetween(birthDate, today)
  const years = Math.floor(fullMonths / 12)
  const cell = Math.max(0, cellOf(birthDate, today))
  return {
    weeksLived,
    cell,
    currentWeek: weeksLived + 1,
    total: TOTAL_WEEKS,
    percent: Math.min(100, Math.round((weeksLived / TOTAL_WEEKS) * 100)),
    years,
    months: fullMonths % 12
  }
}

// Памятные даты на сетке: цвет по порядку после сортировки по дате; раньше рождения и за пределами сетки пропускаются
// (цвет при этом остаётся за своим номером — как на сайте)
export const lifeMarks = (birthDate, events = []) => {
  const sorted = [...events].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  const marks = []
  sorted.slice(0, EVENT_COLORS.length).forEach((event, index) => {
    const cell = cellOf(birthDate, event.date)
    if (cell < 0 || cell >= TOTAL_WEEKS) return
    marks.push({ cell, rgb: EVENT_COLORS[index].rgb, emoji: EVENT_COLORS[index].emoji, date: event.date, label: event.label })
  })
  return marks
}

const fmtEventDate = date => date.split('-').reverse().join('.')

const plural = (n, one, few, many) => {
  const mod100 = n % 100
  const mod10 = n % 10
  if (mod100 >= 11 && mod100 <= 14) return many
  if (mod10 === 1) return one
  if (mod10 >= 2 && mod10 <= 4) return few
  return many
}

// marks — результат lifeMarks: после основного текста легенда «🟧 03.10.2022 — предложение»
export const lifeWeeksCaption = (stats, marks = []) => {
  const week = Math.min(stats.currentWeek, stats.total)
  const left = Math.max(0, stats.total - stats.currentWeek)
  const age = [
    `${stats.years} ${plural(stats.years, 'год', 'года', 'лет')}`,
    stats.months > 0 ? `${stats.months} мес` : ''
  ].filter(Boolean).join(' ')
  const tail = left > 0 ? `До ${YEARS} осталось ${fmtNum(left)} ${plural(left, 'неделя', 'недели', 'недель')}.` : `Все ${YEARS} лет прожиты.`
  const text = `🗓 Неделя ${fmtNum(week)} из ${fmtNum(stats.total)} · прожито ${stats.percent}%\nТебе ${age}. ${tail}`
  if (marks.length === 0) return text
  const legend = marks.map(mark => `${mark.emoji} ${fmtEventDate(mark.date)} — ${mark.label}`).join('\n')
  return `${text}\n\n${legend}`
}

// ---------- отправка ----------

export const sendLifeWeeks = async (config, birthDate, today) => {
  const stats = lifeWeeksStats(birthDate, today)
  const marks = lifeMarks(birthDate, config.reminders?.life?.events)
  const form = new FormData()
  form.append('chat_id', config.ownerTelegramId)
  form.append('caption', lifeWeeksCaption(stats, marks))
  form.append('photo', new Blob([renderLifeWeeks(stats.cell, marks)], { type: 'image/png' }), 'life-weeks.png')
  const res = await fetch(`https://api.telegram.org/bot${config.token}/sendPhoto`, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(60_000)
  })
  const data = await res.json().catch(() => null)
  if (!res.ok || !data?.ok) {
    throw new Error(`Telegram sendPhoto ${res.status}: ${data?.description || 'ошибка отправки'}`)
  }
}

// Проверка для цикла напоминаний: один раз на каждую новую клетку сетки.
// Ключ — по клетке, а не по currentWeek: клетка отсчитывается от последнего дня рождения
// и сдвигается в другой день недели, иначе картинка приходила бы со старой клеткой
export const lifeWeeksCheck = async (rest, config, today, bot) => {
  const birthDate = config.reminders?.life?.birthDate
  if (!birthDate) return null
  const stats = lifeWeeksStats(birthDate, today)
  await once(rest, config.userId, `life-weeks:cell:${stats.cell}`, () => sendLifeWeeks(config, birthDate, today))
  return null
}

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

export const renderLifeWeeks = cell => {
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
    if (i < cell) {
      fillRect(pixels, x, y, CELL, CELL, COLOR_LIVED)
    } else if (i === cell) {
      fillRect(pixels, x, y, CELL, CELL, COLOR_CURRENT)
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

export const lifeWeeksStats = (birthDate, today) => {
  const days = Math.max(0, Math.round((dayStamp(today) - dayStamp(birthDate)) / DAY_MS))
  const weeksLived = Math.floor(days / 7)
  const [by, bm, bd] = birthDate.split('-').map(Number)
  const [ty, tm, td] = today.split('-').map(Number)
  const fullMonths = Math.max(0, (ty - by) * 12 + (tm - bm) - (td < bd ? 1 : 0))
  const years = Math.floor(fullMonths / 12)
  // строка сетки = полный возраст, столбец = неделя с последнего дня рождения:
  // в году 52,18 недели, и без этого клетка к 40 годам уезжает на 1,5 месяца вперёд
  const sinceBirthday = Math.round((dayStamp(today) - Date.UTC(by + years, bm - 1, bd)) / DAY_MS)
  const cell = Math.min(TOTAL_WEEKS, years * WEEKS_IN_YEAR + Math.min(WEEKS_IN_YEAR - 1, Math.floor(Math.max(0, sinceBirthday) / 7)))
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

const plural = (n, one, few, many) => {
  const mod100 = n % 100
  const mod10 = n % 10
  if (mod100 >= 11 && mod100 <= 14) return many
  if (mod10 === 1) return one
  if (mod10 >= 2 && mod10 <= 4) return few
  return many
}

export const lifeWeeksCaption = stats => {
  const week = Math.min(stats.currentWeek, stats.total)
  const left = Math.max(0, stats.total - stats.currentWeek)
  const age = [
    `${stats.years} ${plural(stats.years, 'год', 'года', 'лет')}`,
    stats.months > 0 ? `${stats.months} мес` : ''
  ].filter(Boolean).join(' ')
  const tail = left > 0 ? `До ${YEARS} осталось ${fmtNum(left)} ${plural(left, 'неделя', 'недели', 'недель')}.` : `Все ${YEARS} лет прожиты.`
  return `🗓 Неделя ${fmtNum(week)} из ${fmtNum(stats.total)} · прожито ${stats.percent}%\nТебе ${age}. ${tail}`
}

// ---------- отправка ----------

export const sendLifeWeeks = async (config, birthDate, today) => {
  const stats = lifeWeeksStats(birthDate, today)
  const form = new FormData()
  form.append('chat_id', config.ownerTelegramId)
  form.append('caption', lifeWeeksCaption(stats))
  form.append('photo', new Blob([renderLifeWeeks(stats.cell)], { type: 'image/png' }), 'life-weeks.png')
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

// Проверка для цикла напоминаний: один раз на каждую новую неделю жизни
export const lifeWeeksCheck = async (rest, config, today, bot) => {
  const birthDate = config.reminders?.life?.birthDate
  if (!birthDate) return null
  const stats = lifeWeeksStats(birthDate, today)
  await once(rest, config.userId, `life-weeks:${stats.currentWeek}`, () => sendLifeWeeks(config, birthDate, today))
  return null
}

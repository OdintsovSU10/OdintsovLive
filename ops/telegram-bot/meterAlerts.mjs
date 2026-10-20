// Напоминание передать показания счётчиков: срок — 23-е число до 23:00 (Москва).
// 22-го одно напоминание, 23-го несколько в течение дня; как только за месяц есть фото или показания — молчим.
import { setTimeout as sleep } from 'node:timers/promises'
import { nowInZone } from './actions.mjs'

const TICK_MS = 60_000
const DEADLINE_DAY = 23
// Слот считается пропущенным, если бот не успел за это время (перезапуск, сбой сети)
const SLOT_WINDOW_MIN = 15
const SLOTS = [
  { day: DEADLINE_DAY - 1, time: '10:00', text: '📟 Завтра, 23-го, до 23:00 — передать показания счётчиков. Пришли фото счётчиков сюда.' },
  { day: DEADLINE_DAY, time: '10:00', text: '📟 Сегодня до 23:00 — передать показания счётчиков. Пришли фото счётчиков сюда.' },
  { day: DEADLINE_DAY, time: '13:00', text: '📟 Показания счётчиков ещё не переданы — срок сегодня до 23:00.' },
  { day: DEADLINE_DAY, time: '16:00', text: '📟 Показания счётчиков ещё не переданы — срок сегодня до 23:00.' },
  { day: DEADLINE_DAY, time: '19:00', text: '📟 Показания счётчиков: осталось 4 часа, до 23:00.' },
  { day: DEADLINE_DAY, time: '21:00', text: '📟 Показания счётчиков: осталось 2 часа, до 23:00.' },
  { day: DEADLINE_DAY, time: '22:00', text: '📟 Последний час: показания счётчиков до 23:00!' }
]

const toMinutes = hhmm => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))

// Показания за текущий месяц уже есть: фото в очереди «Аренды» или заполненный месяц
const metersSubmitted = async (rest, userId, year, month) => {
  const [jobs, [record]] = await Promise.all([
    rest(`meter_ocr_jobs?user_id=eq.${userId}&year=eq.${year}&month=eq.${month}&status=neq.error&select=id&limit=1`),
    rest(`rent_records?user_id=eq.${userId}&year=eq.${year}&month=eq.${month}&select=cold_water,electricity`)
  ])
  return jobs.length > 0 || Boolean(record?.cold_water && record?.electricity)
}

export const startMeterAlerts = (rest, getConfig, getBot, log) => {
  const sent = new Set()
  const loop = async () => {
    while (true) {
      try {
        const config = getConfig()
        const bot = getBot()
        if (config?.userId && config.ownerTelegramId && bot) {
          const { today, time } = nowInZone(config.timeZone)
          const day = Number(today.slice(8, 10))
          const now = toMinutes(time)
          const slot = SLOTS.find(s => s.day === day && now >= toMinutes(s.time) && now < toMinutes(s.time) + SLOT_WINDOW_MIN)
          const key = slot && `${today} ${slot.time}`
          if (slot && !sent.has(key)) {
            // месяц в таблицах — с нуля, как в meters.mjs
            const submitted = await metersSubmitted(rest, config.userId, Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1)
            if (!submitted) {
              await bot.tg('sendMessage', { chat_id: config.ownerTelegramId, text: slot.text })
              log(`напоминание о счётчиках ${key}`)
            }
            sent.add(key)
          }
        }
      } catch (err) {
        log('meter-alerts:', err.message || err)
      }
      await sleep(TICK_MS)
    }
  }
  void loop()
}

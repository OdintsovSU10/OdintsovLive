// Напоминание передать показания счётчиков: день и время срока, время напоминаний — в настройках (config.reminders.meters, Москва).
// Накануне срока и в день срока — по списку времён; как только за месяц есть фото или показания — молчим.
import { setTimeout as sleep } from 'node:timers/promises'
import { nowInZone } from './actions.mjs'
import { DEFAULT_REMINDER_SETTINGS } from './reminderSettings.mjs'

const TICK_MS = 60_000
// Слот считается пропущенным, если бот не успел за это время (перезапуск, сбой сети)
const SLOT_WINDOW_MIN = 15

const toMinutes = hhmm => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))

const dayBeforeText = (day, deadline) =>
  `📟 Завтра, ${day}-го, до ${deadline} — передать показания счётчиков. Пришли фото счётчиков сюда.`

const onDayText = (time, deadline, isFirst) => {
  const left = toMinutes(deadline) - toMinutes(time)
  if (left < 0) return `📟 Срок показаний счётчиков (${deadline}) прошёл — передай как можно скорее.`
  if (isFirst) return `📟 Сегодня до ${deadline} — передать показания счётчиков. Пришли фото счётчиков сюда.`
  if (left <= 60) return `📟 Последний час: показания счётчиков до ${deadline}!`
  return `📟 Показания счётчиков ещё не переданы — осталось ${Math.floor(left / 60)} ч (до ${deadline}).`
}

// Слоты напоминаний из настроек: [{ day, time, text }]. При day=1 «накануне» — прошлый месяц, его пропускаем
export const buildMeterSlots = meters => {
  if (!meters?.enabled) return []
  const { day, deadline } = meters
  const before = day > 1 ? meters.dayBefore.map(time => ({ day: day - 1, time, text: dayBeforeText(day, deadline) })) : []
  const on = meters.onDay.map((time, index) => ({ day, time, text: onDayText(time, deadline, index === 0) }))
  return [...before, ...on]
}

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
          const slots = buildMeterSlots((config.reminders || DEFAULT_REMINDER_SETTINGS).meters)
          const slot = slots.find(s => s.day === day && now >= toMinutes(s.time) && now < toMinutes(s.time) + SLOT_WINDOW_MIN)
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

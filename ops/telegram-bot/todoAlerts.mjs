// Напоминания о делах со временем: за время из настроек (config.reminders.todos.offsets) и в срок (todo_items.remind_at).
// Отдельный цикл, без тихих часов: напоминание на 9:00 должно прийти в 9:00.
import { setTimeout as sleep } from 'node:timers/promises'
import { DEFAULT_REMINDER_SETTINGS } from './reminderSettings.mjs'

const TICK_MS = 60_000
const MINUTE_MS = 60_000
// Опоздавшее промежуточное напоминание уже не нужно
const MAX_LATE_MS = 10 * MINUTE_MS

// offsets — минуты до срока, по убыванию (config.reminders.todos.offsets)
// due — сколько этапов уже наступило; sendOffset — минуты до срока у этапа, который надо отправить (или null)
export const pickStage = (remindAtMs, remindSent, nowMs, offsets) => {
  const due = offsets.filter(offset => remindAtMs - offset * MINUTE_MS <= nowMs).length
  if (due === 0 || due <= remindSent) return { due, sendOffset: null }
  const offset = offsets[due - 1]
  const late = nowMs - (remindAtMs - offset * MINUTE_MS)
  return { due, sendOffset: offset === 0 || late <= MAX_LATE_MS ? offset : null }
}

const hoursWord = hours => {
  const last = hours % 10
  if (hours % 100 >= 11 && hours % 100 <= 14) return 'часов'
  if (last === 1) return 'час'
  if (last >= 2 && last <= 4) return 'часа'
  return 'часов'
}

// 60 → «час», 120 → «2 часа», 90 → «1 ч 30 мин», 30 → «30 мин», 1440 → «сутки»
export const human = minutes => {
  if (minutes === 1440) return 'сутки'
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `${rest} мин`
  if (rest > 0) return `${hours} ч ${rest} мин`
  return hours === 1 ? 'час' : `${hours} ${hoursWord(hours)}`
}

export const buildText = (offset, title, time) =>
  offset === 0 ? `🔔 Пора: ${title} (${time})` : `⏰ Через ${human(offset)}, в ${time}: ${title}`

const tick = async (rest, config, bot, log, offsets) => {
  const nowMs = Date.now()
  const until = new Date(nowMs + Math.max(...offsets) * MINUTE_MS).toISOString()
  const rows = await rest(
    `todo_items?user_id=eq.${config.userId}&done_at=is.null&remind_sent=lt.${offsets.length}&remind_at=lte.${encodeURIComponent(until)}&select=id,title,remind_at,remind_sent&order=remind_at.asc&limit=20`
  )
  for (const row of rows) {
    try {
      const { due, sendOffset } = pickStage(Date.parse(row.remind_at), row.remind_sent, nowMs, offsets)
      if (due <= row.remind_sent) continue
      if (sendOffset !== null) {
        const time = new Date(row.remind_at).toLocaleTimeString('ru-RU', { timeZone: config.timeZone, hour: '2-digit', minute: '2-digit' })
        await bot.tg('sendMessage', { chat_id: config.ownerTelegramId, text: buildText(sendOffset, row.title, time) })
        log(`напоминание о деле ${row.id} (за ${sendOffset} мин)`)
      }
      // фильтр по remind_at: если срок успели поменять, счётчик не затираем
      await rest(`todo_items?id=eq.${row.id}&remind_at=eq.${encodeURIComponent(row.remind_at)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ remind_sent: due })
      })
    } catch (err) {
      log(`todo-alerts ${row.id}:`, err.message || err)
    }
  }
}

export const startTodoAlerts = (rest, getConfig, getBot, log) => {
  const loop = async () => {
    while (true) {
      try {
        const config = getConfig()
        const bot = getBot()
        const { enabled, offsets } = (config?.reminders || DEFAULT_REMINDER_SETTINGS).todos
        if (enabled && offsets.length > 0 && config?.userId && config.ownerTelegramId && bot) await tick(rest, config, bot, log, offsets)
      } catch (err) {
        log('todo-alerts:', err.message || err)
      }
      await sleep(TICK_MS)
    }
  }
  void loop()
}

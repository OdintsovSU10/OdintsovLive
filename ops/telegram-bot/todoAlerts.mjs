// Напоминания о делах со временем: за 2 часа, за час и в срок (todo_items.remind_at).
// Отдельный цикл, без тихих часов: напоминание на 9:00 должно прийти в 9:00.
import { setTimeout as sleep } from 'node:timers/promises'

const TICK_MS = 60_000
const MINUTE_MS = 60_000
// Минуты до срока, по убыванию
const STAGES = [120, 60, 0]
// Опоздавшее промежуточное напоминание уже не нужно
const MAX_LATE_MS = 10 * MINUTE_MS

// due — сколько этапов уже наступило; sendOffset — минуты до срока у этапа, который надо отправить (или null)
export const pickStage = (remindAtMs, remindSent, nowMs) => {
  const due = STAGES.filter(offset => remindAtMs - offset * MINUTE_MS <= nowMs).length
  if (due === 0 || due <= remindSent) return { due, sendOffset: null }
  const offset = STAGES[due - 1]
  const late = nowMs - (remindAtMs - offset * MINUTE_MS)
  return { due, sendOffset: offset === 0 || late <= MAX_LATE_MS ? offset : null }
}

const buildText = (offset, title, time) => {
  if (offset === 120) return `⏰ Через 2 часа, в ${time}: ${title}`
  if (offset === 60) return `⏰ Через час, в ${time}: ${title}`
  return `🔔 Пора: ${title} (${time})`
}

const tick = async (rest, config, bot, log) => {
  const nowMs = Date.now()
  const until = new Date(nowMs + STAGES[0] * MINUTE_MS).toISOString()
  const rows = await rest(
    `todo_items?user_id=eq.${config.userId}&done_at=is.null&remind_sent=lt.${STAGES.length}&remind_at=lte.${encodeURIComponent(until)}&select=id,title,remind_at,remind_sent&order=remind_at.asc&limit=20`
  )
  for (const row of rows) {
    try {
      const { due, sendOffset } = pickStage(Date.parse(row.remind_at), row.remind_sent, nowMs)
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
        if (config?.userId && config.ownerTelegramId && bot) await tick(rest, config, bot, log)
      } catch (err) {
        log('todo-alerts:', err.message || err)
      }
      await sleep(TICK_MS)
    }
  }
  void loop()
}

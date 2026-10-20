// Напоминания владельцу в Telegram. Каждая проверка — функция (rest, config, today, bot) → текст или null;
// одно и то же напоминание не чаще, чем раз в repeatDays. Состояние в памяти: после перезапуска
// напоминание, которое всё ещё актуально, придёт один раз заново.
import { setTimeout as sleep } from 'node:timers/promises'
import { nowInZone } from './actions.mjs'
import { askNextTransferNote } from './transferNotes.mjs'
import { budgetLimits, insuranceExpiring, morningBrief, serviceSoon, weeklyDigest } from './notify.mjs'

const TICK_MS = 10 * 60_000
// Не будим ночью и не пишем вечером
const FROM_HOUR = 10
const TO_HOUR = 21
const DAY_MS = 24 * 60 * 60 * 1000

const STALE_STATEMENT_DAYS = 7

const daysAgo = (today, date) => Math.round((Date.parse(today) - Date.parse(date)) / DAY_MS)
const ruDate = date => date.split('-').reverse().join('.')

const staleStatement = async (rest, config, today) => {
  const [last] = await rest(`expense_transactions?user_id=eq.${config.userId}&source=eq.bank&select=operation_date&order=operation_date.desc&limit=1`)
  if (!last) return null
  const days = daysAgo(today, last.operation_date)
  if (days < STALE_STATEMENT_DAYS) return null
  return `📥 Выписка не обновлялась ${days} дн. (последняя операция ${ruDate(last.operation_date)}). Скинь CSV из приложения банка сюда файлом — загружу сам.`
}

const CHECKS = [
  // эти проверки шлют сами и помнят отправленное в базе (notify.mjs), поэтому текст не возвращают
  { key: 'morning', repeatDays: 0, run: morningBrief },
  { key: 'weekly', repeatDays: 0, run: weeklyDigest },
  { key: 'budget-limits', repeatDays: 0, run: budgetLimits },
  { key: 'service-soon', repeatDays: 0, run: serviceSoon },
  { key: 'insurance', repeatDays: 0, run: insuranceExpiring },
  { key: 'stale-statement', repeatDays: 3, run: staleStatement },
  // вопросы «за что перевод» идут по одному на каждом тике; текста нет, поэтому sentOn не ставится
  { key: 'transfer-notes', repeatDays: 0, run: async (rest, config, today, bot) => { await askNextTransferNote(rest, config, bot.tg); return null } }
]

export const startReminders = (rest, getConfig, getBot, log) => {
  const sentOn = new Map()
  const loop = async () => {
    while (true) {
      try {
        const config = getConfig()
        const bot = getBot()
        if (config?.userId && config.ownerTelegramId && bot) {
          const { today, time } = nowInZone(config.timeZone)
          const hour = Number(time.slice(0, 2))
          if (hour >= FROM_HOUR && hour < TO_HOUR) {
            for (const check of CHECKS) {
              const last = sentOn.get(check.key)
              if (last && daysAgo(today, last) < check.repeatDays) continue
              try {
                const text = await check.run(rest, config, today, bot)
                if (!text) continue
                await bot.tg('sendMessage', { chat_id: config.ownerTelegramId, text })
                sentOn.set(check.key, today)
                log(`напоминание ${check.key}`)
              } catch (err) {
                // сбой одной проверки не должен глушить остальные
                log(`reminders ${check.key}:`, err.message || err)
              }
            }
          }
        }
      } catch (err) {
        log('reminders:', err.message || err)
      }
      await sleep(TICK_MS)
    }
  }
  void loop()
}

// Вопрос «за что» по исходящим переводам людям: ответ-reply на вопрос бота пишется в expense_transactions.note.
// Вопросы задаются по одному; пока вчерашний без ответа (до суток), следующий не шлём.
import { fmtNum, nowInZone } from './actions.mjs'

const PENDING_TTL_MS = 24 * 60 * 60 * 1000
const LOOKBACK_DAYS = 30
const NOTE_MAX = 500
const SKIP_WORDS = ['-', 'пропустить', 'пропусти', 'не знаю']
// «Артем О.» — перевод человеку; «Между своими счетами» и т.п. не подходят
const PERSON_RE = /^[А-ЯЁ][а-яё]+ [А-ЯЁ]\.$/

let asking = false

const ruDate = date => date.slice(5).split('-').reverse().join('.')

const dateMinusDays = (today, days) => new Date(Date.parse(today) - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

const patch = (rest, id, body) => rest(`expense_transactions?id=eq.${id}`, {
  method: 'PATCH',
  headers: { Prefer: 'return=minimal' },
  body: JSON.stringify(body)
})

export const askNextTransferNote = async (rest, config, tg) => {
  if (asking) return false
  asking = true
  try {
    const since = encodeURIComponent(new Date(Date.now() - PENDING_TTL_MS).toISOString())
    const pending = await rest(`expense_transactions?user_id=eq.${config.userId}&note=is.null&note_prompt_message_id=not.is.null&note_asked_at=gt.${since}&select=id&limit=1`)
    if (pending.length > 0) return false

    const from = dateMinusDays(nowInZone(config.timeZone).today, LOOKBACK_DAYS)
    const status = encodeURIComponent('(status.is.null,status.in.("Ок","OK"))')
    const category = encodeURIComponent('Переводы')
    const rows = await rest(`expense_transactions?user_id=eq.${config.userId}&flow_direction=eq.out&bank_category=eq.${category}&note=is.null&note_asked_at=is.null&operation_date=gte.${from}&or=${status}&select=id,operation_date,payment_amount,description&order=operation_at.asc`)
    const candidates = rows.filter(r => PERSON_RE.test(r.description || ''))
    if (candidates.length === 0) return false

    const [row] = candidates
    const more = candidates.length - 1
    const text = `💸 Перевод ${fmtNum(Math.abs(Number(row.payment_amount)))} ₽ — ${row.description}, ${ruDate(row.operation_date)}. За что?` +
      (more > 0 ? `\nЕщё вопросов: ${more}` : '')
    const sent = await tg('sendMessage', {
      chat_id: config.ownerTelegramId,
      text,
      reply_markup: { force_reply: true, input_field_placeholder: 'За что перевод? «-» — пропустить' }
    })
    await patch(rest, row.id, { note_asked_at: new Date().toISOString(), note_prompt_message_id: sent.message_id })
    return true
  } finally {
    asking = false
  }
}

// Ответ на любой вопрос бота (не только висящий) ищем по id сообщения-вопроса
export const saveTransferNote = async (rest, config, replyToMessageId, text) => {
  const [row] = await rest(`expense_transactions?user_id=eq.${config.userId}&note_prompt_message_id=eq.${replyToMessageId}&select=id&limit=1`)
  if (!row) return null
  const note = text.trim()
  if (SKIP_WORDS.includes(note.toLowerCase())) {
    await patch(rest, row.id, { note_prompt_message_id: null })
    return { skipped: true }
  }
  const saved = note.slice(0, NOTE_MAX)
  await patch(rest, row.id, { note: saved })
  return { skipped: false, note: saved }
}

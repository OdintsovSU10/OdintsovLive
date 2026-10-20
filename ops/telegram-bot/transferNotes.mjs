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

const MATCH_DAYS = 3
const MATCH_AMOUNT = 1
const RENT_MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь']

const sameAmount = (value, amount) => value !== null && Math.abs(Number(value) - amount) <= MATCH_AMOUNT

// Перевод уже записан на портале (ТО, расход на авто, заправка, аренда, запись бота) — спрашивать незачем,
// подпись берём оттуда. Сумма ±1 ₽, дата ±3 дня; аренда — за месяц операции или предыдущий
const findPortalMatch = async (rest, userId, row) => {
  const amount = Math.abs(Number(row.payment_amount))
  const from = dateMinusDays(row.operation_date, MATCH_DAYS)
  const to = dateMinusDays(row.operation_date, -MATCH_DAYS)
  const range = `date=gte.${from}&date=lte.${to}`

  const cars = await rest(`cars?user_id=eq.${userId}&select=id`)
  if (cars.length > 0) {
    const carIds = `car_id=in.(${cars.map(c => c.id).join(',')})`
    const [maintenance, expenses, fuel] = await Promise.all([
      rest(`car_maintenance?${carIds}&${range}&select=type,cost`),
      rest(`car_expenses?${carIds}&${range}&select=category,description,cost`),
      rest(`car_fuel?${carIds}&${range}&select=total_cost`)
    ])
    const service = maintenance.find(r => sameAmount(r.cost, amount))
    if (service) return `Авто (ТО): ${service.type}`
    const expense = expenses.find(r => sameAmount(r.cost, amount))
    if (expense) return `Авто: ${[expense.category, expense.description].filter(Boolean).join(' — ')}`
    if (fuel.some(r => sameAmount(r.total_cost, amount))) return 'Авто: заправка'
  }

  const [year, month] = row.operation_date.split('-').map(Number)
  const months = [[year, month - 1], month === 1 ? [year - 1, 11] : [year, month - 2]]
  const rents = await rest(`rent_records?user_id=eq.${userId}&or=(${months.map(([y, m]) => `and(year.eq.${y},month.eq.${m})`).join(',')})&select=year,month,rent_amount,water_amount,electricity_amount&order=year.asc,month.asc`)
  // полная сумма с коммуналкой точнее голой аренды; при равенстве — предыдущий месяц (платят в начале следующего)
  const rent = rents.find(r => sameAmount(Number(r.rent_amount || 0) + Number(r.water_amount || 0) + Number(r.electricity_amount || 0), amount))
    || rents.find(r => sameAmount(r.rent_amount, amount))
  if (rent) return `Аренда за ${RENT_MONTHS[rent.month]}`

  const own = await rest(`expense_transactions?user_id=eq.${userId}&source=eq.telegram&operation_date=gte.${from}&operation_date=lte.${to}&select=payment_amount,description,note`)
  const entry = own.find(r => sameAmount(Math.abs(Number(r.payment_amount)), amount))
  if (entry) return entry.note || entry.description || 'Записано через бота'
  return null
}

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
    // уже записанное на портале подписываем сами и не спрашиваем
    while (candidates.length > 0) {
      const label = await findPortalMatch(rest, config.userId, candidates[0])
      if (!label) break
      await patch(rest, candidates[0].id, { note: label, note_asked_at: new Date().toISOString() })
      candidates.shift()
    }
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

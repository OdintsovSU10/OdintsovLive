// Импорт банковской выписки (CSV) из Telegram. Логика и ключи (dedupe_key, row_hash) совпадают
// с браузерным импортом src/pages/expenses/utils/statementParser.ts и hooks/useExpensesData.ts:
// один и тот же файл, загруженный и там и там, дублей не даёт. XLSX бот не читает — он без зависимостей.
import { createHash } from 'node:crypto'

const CHUNK_SIZE = 500
const PAGE = 1000
const ERROR_LIMIT = 200
const MERGE_AMOUNT_TOLERANCE = 1
const MERGE_DAYS_TOLERANCE = 2
const DAY_MS = 24 * 60 * 60 * 1000

const COLUMNS = {
  operationDate: ['Дата операции'],
  paymentDate: ['Дата платежа'],
  cardNumber: ['Номер карты'],
  status: ['Статус'],
  operationAmount: ['Сумма операции'],
  operationCurrency: ['Валюта операции'],
  paymentAmount: ['Сумма платежа', 'Сумма в валюте счёта', 'Сумма в валюте счета'],
  paymentCurrency: ['Валюта платежа', 'Валюта счёта', 'Валюта счета'],
  cashback: ['Кэшбэк'],
  category: ['Категория', 'Категория по-умолчанию', 'Категория по умолчанию'],
  userCategory: ['Ваша категория'],
  mcc: ['MCC'],
  description: ['Описание'],
  bonuses: ['Бонусы (включая кэшбэк)', 'Бонусы'],
  roundUp: ['Округление на инвесткопилку', 'Округление'],
  operationWithRounding: ['Сумма операции с округлением'],
  includeInAnalytics: ['Учёт в аналитике', 'Учет в аналитике'],
  message: ['Сообщение']
}
const REQUIRED = ['operationDate', 'paymentAmount']

const normalizeHeader = value => value.replace(/ /g, ' ').trim().replace(/\s+/g, ' ').toLowerCase()
const ALIAS_TO_KEY = new Map(Object.entries(COLUMNS).flatMap(([key, aliases]) => aliases.map(a => [normalizeHeader(a), key])))

export const normalizeCategoryKey = value => normalizeHeader(value || '')

const sha256 = value => createHash('sha256').update(value).digest('hex')

const decodeText = buffer => {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer).replace(/^﻿/, '')
  } catch {
    return new TextDecoder('windows-1251').decode(buffer)
  }
}

// Разделитель — тот, которого больше в первой строке
const detectDelimiter = text => {
  const head = text.slice(0, text.indexOf('\n') > 0 ? text.indexOf('\n') : undefined)
  return [';', '\t', ','].map(d => [d, head.split(d).length]).sort((a, b) => b[1] - a[1])[0][0]
}

const parseCsv = (text, delimiter) => {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === delimiter) { row.push(cell); cell = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell); cell = ''
      rows.push(row); row = []
    } else cell += ch
  }
  if (cell !== '' || row.length > 0) { row.push(cell); rows.push(row) }
  return rows
}

const cellText = value => (value === null || value === undefined ? '' : String(value).trim())

const parseNumber = value => {
  const text = cellText(value)
  if (!text) return null
  const cleaned = text.replace(/ /g, '').replace(/\s/g, '').replace(/[^0-9,.-]/g, '').replace(',', '.')
  if (!cleaned) return null
  const parsed = Number.parseFloat(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

const pad = n => String(n).padStart(2, '0')

// «30.09.2026 13:14:01» или «2026-09-30 13:14:01» → { date, timestamp }; невозможная дата → null
const parseDateTime = value => {
  const text = cellText(value).replace('T', ' ').replace(/\s+/g, ' ')
  let m = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/)
  let parts
  if (m) parts = [Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]), Number(m[2]), Number(m[1]), m[4], m[5], m[6]]
  else {
    m = text.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/)
    if (!m) return null
    parts = [Number(m[1]), Number(m[2]), Number(m[3]), m[4], m[5], m[6]]
  }
  const [year, month, day] = parts
  const [hour, minute, second] = parts.slice(3).map(v => Number(v || 0))
  const check = new Date(Date.UTC(year, month - 1, day, hour, minute, second))
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day
    || check.getUTCHours() !== hour || check.getUTCMinutes() !== minute || check.getUTCSeconds() !== second) return null
  const date = `${year}-${pad(month)}-${pad(day)}`
  return { date, timestamp: `${date} ${pad(hour)}:${pad(minute)}:${pad(second)}` }
}

const findHeader = rows => {
  for (let index = 0; index < Math.min(rows.length, 40); index++) {
    const columns = {}
    rows[index].forEach((cell, i) => {
      const key = ALIAS_TO_KEY.get(normalizeHeader(cellText(cell)))
      if (key && columns[key] === undefined) columns[key] = i
    })
    if (REQUIRED.every(key => columns[key] !== undefined)) return { index, columns }
  }
  return null
}

const isFailed = row => Boolean(row.status) && row.status !== 'Ок' && row.status !== 'OK'

// Порядок полей черновика важен: от него зависит row_hash, как в браузерном парсере.
// message (комментарий к переводу) лежит рядом с черновиком и в хэш не входит
export const parseStatement = (buffer, userId, mappingByBankCategory) => {
  const text = decodeText(buffer)
  const rows = parseCsv(text, detectDelimiter(text))
  const header = rows.length > 0 ? findHeader(rows) : null
  if (!header) throw new Error('Не нашёл колонки «Дата операции» и «Сумма платежа» — это точно CSV-выписка?')

  const { index: headerIndex, columns } = header
  const get = (row, key) => (columns[key] === undefined ? null : (row[columns[key]] ?? null))
  const errors = []
  const drafts = []
  let totalRows = 0

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i]
    if (row.every(cell => cellText(cell) === '')) continue
    totalRows += 1
    const rowNumber = i + 1
    const preview = row.slice(0, 6).map(cellText).filter(Boolean).join(' | ')

    const operationAt = parseDateTime(get(row, 'operationDate'))
    if (!operationAt) {
      errors.push({ rowNumber, message: 'Не удалось распознать «Дата операции»', rawPreview: preview })
      continue
    }
    const paymentAmount = parseNumber(get(row, 'paymentAmount'))
    if (paymentAmount === null) {
      errors.push({ rowNumber, message: 'Не удалось распознать «Сумма платежа»', rawPreview: preview })
      continue
    }
    const paymentDate = parseDateTime(get(row, 'paymentDate'))
    const bankCategory = cellText(get(row, 'userCategory')) || cellText(get(row, 'category')) || null

    const draft = {
      source_row_number: rowNumber,
      operation_at: operationAt.timestamp,
      operation_date: operationAt.date,
      payment_date: paymentDate ? paymentDate.date : null,
      card_mask: cellText(get(row, 'cardNumber')) || null,
      status: cellText(get(row, 'status')) || null,
      operation_amount: parseNumber(get(row, 'operationAmount')),
      operation_currency: cellText(get(row, 'operationCurrency')) || null,
      payment_amount: paymentAmount,
      payment_currency: cellText(get(row, 'paymentCurrency')) || null,
      cashback_amount: parseNumber(get(row, 'cashback')) || 0,
      bank_category: bankCategory,
      mcc: cellText(get(row, 'mcc')) || null,
      description: cellText(get(row, 'description')) || null,
      bonuses_amount: parseNumber(get(row, 'bonuses')) || 0,
      round_up_amount: parseNumber(get(row, 'roundUp')) || 0,
      operation_with_rounding_amount: parseNumber(get(row, 'operationWithRounding')),
      flow_direction: paymentAmount > 0 ? 'in' : paymentAmount < 0 ? 'out' : 'zero',
      include_in_analytics: cellText(get(row, 'includeInAnalytics')).toLowerCase() !== 'нет',
      mapped_category_id: bankCategory ? mappingByBankCategory.get(normalizeCategoryKey(bankCategory)) || null : null
    }
    drafts.push({ draft, message: cellText(get(row, 'message')) || null })
  }

  const parsedRows = drafts.map(({ draft, message }) => ({
    ...draft,
    message,
    dedupe_key: sha256([
      userId, draft.operation_at, draft.card_mask || '', draft.payment_amount,
      draft.payment_currency || '', draft.mcc || '', draft.description || ''
    ].join('|')),
    row_hash: sha256(JSON.stringify(draft))
  }))
  return { fileHash: sha256(buffer), totalRows, parsedRows, errors }
}

const daysBetween = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) / DAY_MS

// Запись бота и банковская операция — одна трата: сумма ±1 ₽, дата ±2 дня (как в браузерном импорте)
const takeBotMatch = (pool, row) => {
  if (row.flow_direction !== 'out' || isFailed(row)) return null
  let best = null
  for (const candidate of pool) {
    if (Math.abs(candidate.payment_amount - row.payment_amount) > MERGE_AMOUNT_TOLERANCE) continue
    const days = daysBetween(candidate.operation_date, row.operation_date)
    if (days > MERGE_DAYS_TOLERANCE) continue
    if (!best || days < daysBetween(best.operation_date, row.operation_date)) best = candidate
  }
  if (best) pool.splice(pool.indexOf(best), 1)
  return best
}

const fetchAll = async (rest, route) => {
  const result = []
  for (let from = 0; ; from += PAGE) {
    const rows = await rest(`${route}&limit=${PAGE}&offset=${from}`)
    result.push(...rows)
    if (rows.length < PAGE) break
  }
  return result
}

const json = value => JSON.stringify(value)
const minimal = { Prefer: 'return=minimal' }

export const importStatement = async (rest, userId, buffer, fileName) => {
  const mappings = await rest(`expense_category_mappings?user_id=eq.${userId}&select=bank_category,target_category_id`)
  const parsed = parseStatement(buffer, userId, new Map(mappings.map(m => [normalizeCategoryKey(m.bank_category), m.target_category_id])))

  const [batch] = await rest('expense_import_batches', {
    method: 'POST',
    body: json({
      user_id: userId,
      source_file_name: fileName,
      source_file_hash: parsed.fileHash,
      rows_total: parsed.totalRows,
      rows_parsed: parsed.parsedRows.length,
      rows_inserted: 0,
      rows_updated: 0,
      rows_skipped: 0,
      errors: null
    })
  })
  const batchId = batch.id

  const existing = new Map(
    (await fetchAll(rest, `expense_transactions?user_id=eq.${userId}&select=id,dedupe_key,row_hash&order=id.asc`))
      .map(r => [r.dedupe_key, r])
  )
  const botPool = (await rest(`expense_transactions?user_id=eq.${userId}&source=eq.telegram&select=id,operation_date,payment_amount`))
    .map(r => ({ ...r, payment_amount: Number(r.payment_amount) }))

  let inserted = 0
  let updated = 0
  let merged = 0
  let unchanged = 0
  let failed = 0
  const errors = [...parsed.errors]
  const toInsert = []
  const toUpdate = []

  // message — не колонка БД: уходит только как note при вставке (у всех строк пачки, иначе PostgREST отклонит разные ключи); при обновлении и склейке note не трогаем
  for (const { message, ...row } of parsed.parsedRows) {
    const found = existing.get(row.dedupe_key)
    if (!found) {
      const botMatch = takeBotMatch(botPool, row)
      if (botMatch) toUpdate.push({ id: botMatch.id, rowNumber: row.source_row_number, merged: true, payload: { ...row, source: 'bank' } })
      else toInsert.push({ ...row, note: message, user_id: userId, import_batch_id: batchId })
    } else if (found.row_hash === row.row_hash) unchanged += 1
    else toUpdate.push({ id: found.id, rowNumber: row.source_row_number, merged: false, payload: row })
    // повтор в самом файле не должен вставиться дважды
    existing.set(row.dedupe_key, { id: null, row_hash: row.row_hash })
  }

  for (let i = 0; i < toInsert.length; i += CHUNK_SIZE) {
    const chunk = toInsert.slice(i, i + CHUNK_SIZE)
    await rest('expense_transactions', { method: 'POST', headers: minimal, body: json(chunk) })
    inserted += chunk.length
  }
  for (const item of toUpdate) {
    try {
      await rest(`expense_transactions?id=eq.${item.id}&user_id=eq.${userId}`, {
        method: 'PATCH',
        headers: minimal,
        body: json({ ...item.payload, import_batch_id: batchId, updated_at: new Date().toISOString() })
      })
      if (item.merged) merged += 1
      else updated += 1
    } catch (err) {
      failed += 1
      errors.push({ rowNumber: item.rowNumber, message: `Не удалось обновить строку: ${err.message}` })
    }
  }

  const skipped = unchanged + parsed.errors.length + failed
  await rest(`expense_import_batches?id=eq.${batchId}`, {
    method: 'PATCH',
    headers: minimal,
    body: json({
      rows_inserted: inserted,
      rows_updated: updated,
      rows_skipped: skipped,
      errors: errors.length > 0 ? errors.slice(0, ERROR_LIMIT) : null
    })
  })

  const dates = parsed.parsedRows.map(r => r.operation_date).sort()
  return {
    totalRows: parsed.totalRows,
    inserted,
    updated,
    merged,
    unchanged,
    errors: errors.length,
    from: dates[0] || null,
    to: dates.at(-1) || null
  }
}

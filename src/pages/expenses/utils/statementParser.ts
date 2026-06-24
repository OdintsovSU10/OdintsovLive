import * as XLSX from 'xlsx'
import type { ExpenseImportError, ParsedStatementResult, PreparedExpenseTransaction } from '../types'

type ColumnKey =
  | 'operationDate'
  | 'paymentDate'
  | 'cardNumber'
  | 'status'
  | 'operationAmount'
  | 'operationCurrency'
  | 'paymentAmount'
  | 'paymentCurrency'
  | 'cashback'
  | 'category'
  | 'mcc'
  | 'description'
  | 'bonuses'
  | 'roundUp'
  | 'operationWithRounding'

interface ColumnConfig {
  key: ColumnKey
  title: string
  required?: boolean
  aliases: string[]
}

interface ParsedDraftRow {
  source_row_number: number
  operation_at: string
  operation_date: string
  payment_date: string | null
  card_mask: string | null
  status: string | null
  operation_amount: number | null
  operation_currency: string | null
  payment_amount: number
  payment_currency: string | null
  cashback_amount: number
  bank_category: string | null
  mcc: string | null
  description: string | null
  bonuses_amount: number
  round_up_amount: number
  operation_with_rounding_amount: number | null
  flow_direction: 'in' | 'out' | 'zero'
  mapped_category_id: string | null
}

const COLUMN_CONFIG: ColumnConfig[] = [
  { key: 'operationDate', title: 'Дата операции', required: true, aliases: ['Дата операции'] },
  { key: 'paymentDate', title: 'Дата платежа', aliases: ['Дата платежа'] },
  { key: 'cardNumber', title: 'Номер карты', aliases: ['Номер карты'] },
  { key: 'status', title: 'Статус', aliases: ['Статус'] },
  { key: 'operationAmount', title: 'Сумма операции', aliases: ['Сумма операции'] },
  { key: 'operationCurrency', title: 'Валюта операции', aliases: ['Валюта операции'] },
  { key: 'paymentAmount', title: 'Сумма платежа', required: true, aliases: ['Сумма платежа'] },
  { key: 'paymentCurrency', title: 'Валюта платежа', aliases: ['Валюта платежа'] },
  { key: 'cashback', title: 'Кэшбэк', aliases: ['Кэшбэк'] },
  { key: 'category', title: 'Категория', aliases: ['Категория'] },
  { key: 'mcc', title: 'MCC', aliases: ['MCC'] },
  { key: 'description', title: 'Описание', aliases: ['Описание'] },
  { key: 'bonuses', title: 'Бонусы (включая кэшбэк)', aliases: ['Бонусы (включая кэшбэк)', 'Бонусы'] },
  { key: 'roundUp', title: 'Округление на инвесткопилку', aliases: ['Округление на инвесткопилку'] },
  { key: 'operationWithRounding', title: 'Сумма операции с округлением', aliases: ['Сумма операции с округлением'] }
]

const ALIAS_TO_KEY = new Map<string, ColumnKey>()

for (const config of COLUMN_CONFIG) {
  for (const alias of config.aliases) {
    ALIAS_TO_KEY.set(normalizeHeader(alias), config.key)
  }
}

export function normalizeCategoryKey(value: string | null | undefined): string {
  return (value || '')
    .replace(/\u00A0/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

function normalizeHeader(value: string): string {
  return value
    .replace(/\u00A0/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

function toCellText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.toLocaleDateString('ru-RU')} ${value.toLocaleTimeString('ru-RU')}`
  }
  return String(value).trim()
}

function isEmptyRow(row: unknown[]): boolean {
  return row.every(cell => toCellText(cell) === '')
}

function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number' && Number.isFinite(value)) return value

  const cleaned = String(value)
    .replace(/\u00A0/g, '')
    .replace(/\s/g, '')
    .replace(/[^0-9,.-]/g, '')
    .replace(',', '.')

  if (!cleaned) return null
  const parsed = Number.parseFloat(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function formatDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function formatTimestamp(date: Date): string {
  return `${formatDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function buildDate(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number
): Date | null {
  const date = new Date(year, month - 1, day, hour, minute, second)
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute ||
    date.getSeconds() !== second
  ) {
    return null
  }
  return date
}

function parseExcelSerialDateTime(serial: number): Date | null {
  if (!Number.isFinite(serial)) return null
  const excelEpochLocal = new Date(1899, 11, 30)
  const milliseconds = Math.round(serial * 24 * 60 * 60 * 1000)
  const date = new Date(excelEpochLocal.getTime() + milliseconds)
  return Number.isNaN(date.getTime()) ? null : date
}

function parseDateTime(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value
  }

  if (typeof value === 'number') {
    return parseExcelSerialDateTime(value)
  }

  const raw = toCellText(value)
  if (!raw) return null

  const text = raw.replace('T', ' ').replace(/\s+/g, ' ')

  let match = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/)
  if (match) {
    const day = Number(match[1])
    const month = Number(match[2])
    const parsedYear = Number(match[3])
    const year = parsedYear < 100 ? 2000 + parsedYear : parsedYear
    const hour = Number(match[4] || 0)
    const minute = Number(match[5] || 0)
    const second = Number(match[6] || 0)
    return buildDate(year, month, day, hour, minute, second)
  }

  match = text.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/)
  if (match) {
    const year = Number(match[1])
    const month = Number(match[2])
    const day = Number(match[3])
    const hour = Number(match[4] || 0)
    const minute = Number(match[5] || 0)
    const second = Number(match[6] || 0)
    return buildDate(year, month, day, hour, minute, second)
  }

  const nativeDate = new Date(text)
  if (!Number.isNaN(nativeDate.getTime())) {
    return nativeDate
  }

  return null
}

async function sha256Hex(value: string | ArrayBuffer): Promise<string> {
  if (!crypto?.subtle) {
    throw new Error('Web Crypto API недоступен в этом браузере')
  }

  const input = typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value)
  const hashBuffer = await crypto.subtle.digest('SHA-256', input)
  return Array.from(new Uint8Array(hashBuffer))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}

function findHeaderRow(rows: unknown[][]): { rowIndex: number; columns: Partial<Record<ColumnKey, number>> } | null {
  const maxRowsToCheck = Math.min(rows.length, 40)

  for (let rowIndex = 0; rowIndex < maxRowsToCheck; rowIndex++) {
    const row = Array.isArray(rows[rowIndex]) ? rows[rowIndex] : []
    const columns: Partial<Record<ColumnKey, number>> = {}

    row.forEach((cell, index) => {
      const key = ALIAS_TO_KEY.get(normalizeHeader(toCellText(cell)))
      if (key && columns[key] === undefined) {
        columns[key] = index
      }
    })

    const hasAllRequired = COLUMN_CONFIG
      .filter(config => config.required)
      .every(config => columns[config.key] !== undefined)

    if (hasAllRequired) {
      return { rowIndex, columns }
    }
  }

  return null
}

function getCell(row: unknown[], index: number | undefined): unknown {
  if (index === undefined) return null
  return row[index] ?? null
}

function previewRow(row: unknown[]): string {
  return row
    .slice(0, 6)
    .map(cell => toCellText(cell))
    .filter(Boolean)
    .join(' | ')
}

export async function parseStatementFile(
  file: File,
  userId: string,
  categoryMappingByBankCategory: Map<string, string>
): Promise<ParsedStatementResult> {
  const arrayBuffer = await file.arrayBuffer()
  const fileHash = await sha256Hex(arrayBuffer)

  const workbook = XLSX.read(arrayBuffer, { type: 'array' })
  const firstSheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[firstSheetName]

  if (!sheet) {
    throw new Error('Не удалось прочитать первый лист выписки')
  }

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: null
  })

  if (!rows.length) {
    throw new Error('Файл пустой: таблица не содержит строк')
  }

  const headerMeta = findHeaderRow(rows)
  if (!headerMeta) {
    throw new Error('Не найдены обязательные колонки: "Дата операции" и "Сумма платежа"')
  }

  const { rowIndex: headerRowIndex, columns } = headerMeta
  const errors: ExpenseImportError[] = []
  const draftRows: ParsedDraftRow[] = []
  let totalRows = 0

  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = Array.isArray(rows[i]) ? rows[i] : []
    if (isEmptyRow(row)) continue

    totalRows += 1
    const sourceRowNumber = i + 1

    const operationAt = parseDateTime(getCell(row, columns.operationDate))
    if (!operationAt) {
      errors.push({
        rowNumber: sourceRowNumber,
        message: 'Не удалось распознать обязательное поле "Дата операции"',
        rawPreview: previewRow(row)
      })
      continue
    }

    const paymentAmount = parseNumber(getCell(row, columns.paymentAmount))
    if (paymentAmount === null) {
      errors.push({
        rowNumber: sourceRowNumber,
        message: 'Не удалось распознать обязательное поле "Сумма платежа"',
        rawPreview: previewRow(row)
      })
      continue
    }

    const paymentDateRaw = getCell(row, columns.paymentDate)
    const parsedPaymentDate = parseDateTime(paymentDateRaw)
    const paymentDateText = toCellText(paymentDateRaw)
    if (paymentDateText && !parsedPaymentDate) {
      errors.push({
        rowNumber: sourceRowNumber,
        message: 'Не удалось распознать "Дата платежа", поле сохранено как пустое',
        rawPreview: previewRow(row)
      })
    }

    const bankCategory = toCellText(getCell(row, columns.category)) || null
    const mappedCategoryId = bankCategory
      ? categoryMappingByBankCategory.get(normalizeCategoryKey(bankCategory)) || null
      : null

    const flowDirection: 'in' | 'out' | 'zero' =
      paymentAmount > 0 ? 'in' : paymentAmount < 0 ? 'out' : 'zero'

    draftRows.push({
      source_row_number: sourceRowNumber,
      operation_at: formatTimestamp(operationAt),
      operation_date: formatDate(operationAt),
      payment_date: parsedPaymentDate ? formatDate(parsedPaymentDate) : null,
      card_mask: toCellText(getCell(row, columns.cardNumber)) || null,
      status: toCellText(getCell(row, columns.status)) || null,
      operation_amount: parseNumber(getCell(row, columns.operationAmount)),
      operation_currency: toCellText(getCell(row, columns.operationCurrency)) || null,
      payment_amount: paymentAmount,
      payment_currency: toCellText(getCell(row, columns.paymentCurrency)) || null,
      cashback_amount: parseNumber(getCell(row, columns.cashback)) || 0,
      bank_category: bankCategory,
      mcc: toCellText(getCell(row, columns.mcc)) || null,
      description: toCellText(getCell(row, columns.description)) || null,
      bonuses_amount: parseNumber(getCell(row, columns.bonuses)) || 0,
      round_up_amount: parseNumber(getCell(row, columns.roundUp)) || 0,
      operation_with_rounding_amount: parseNumber(getCell(row, columns.operationWithRounding)),
      flow_direction: flowDirection,
      mapped_category_id: mappedCategoryId
    })
  }

  const parsedRows: PreparedExpenseTransaction[] = await Promise.all(
    draftRows.map(async draft => {
      const dedupeSeed = [
        userId,
        draft.operation_at,
        draft.card_mask || '',
        draft.payment_amount,
        draft.payment_currency || '',
        draft.mcc || '',
        draft.description || ''
      ].join('|')

      const dedupeKey = await sha256Hex(dedupeSeed)
      const rowHash = await sha256Hex(JSON.stringify(draft))

      return {
        ...draft,
        dedupe_key: dedupeKey,
        row_hash: rowHash
      }
    })
  )

  return {
    fileName: file.name,
    fileHash,
    totalRows,
    parsedRows,
    errors
  }
}

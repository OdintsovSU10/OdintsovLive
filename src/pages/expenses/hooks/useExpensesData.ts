import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import type {
  ExpenseCategoryMapping,
  ExpenseFilters,
  ExpenseImportError,
  ExpenseImportSummary,
  ExpenseTransaction,
  ExpenseUserCategory,
  PreparedExpenseTransaction
} from '../types'
import { buildInsights, isFailed } from '../utils/analysis'
import { normalizeCategoryKey, parseStatementFile } from '../utils/statementParser'

const LOAD_PAGE_SIZE = 1000
const IMPORT_CHUNK_SIZE = 500
const IMPORT_ERROR_LIMIT = 200
const MAX_DEDUPE_KEYS_QUERY_LENGTH = 2000

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function toIsoDate(value: Date): string {
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
}

function getDefaultFilters(): ExpenseFilters {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  return {
    dateFrom: toIsoDate(monthStart),
    dateTo: toIsoDate(now),
    flow: 'all',
    search: '',
    bankCategory: '',
    mappedCategoryId: ''
  }
}

function chunkBySize<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

function chunkDedupeKeysByUrlLength(keys: string[], maxLength: number): string[][] {
  if (keys.length === 0) return []

  const chunks: string[][] = []
  let current: string[] = []
  let currentLength = 0

  for (const key of keys) {
    // "%2C" is 3 chars when query is encoded for "," separator in "in.(...)".
    const nextLength = currentLength + key.length + (current.length > 0 ? 3 : 0)

    if (current.length > 0 && nextLength > maxLength) {
      chunks.push(current)
      current = [key]
      currentLength = key.length
      continue
    }

    current.push(key)
    currentLength = nextLength
  }

  if (current.length > 0) {
    chunks.push(current)
  }

  return chunks
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return 'Неизвестная ошибка'
}

interface ExistingTransactionHash {
  id: string
  dedupe_key: string
  row_hash: string
}

interface BotTransaction {
  id: string
  operation_date: string
  payment_amount: number
}

const MERGE_AMOUNT_TOLERANCE = 1
const MERGE_DAYS_TOLERANCE = 2
const DAY_MS = 24 * 60 * 60 * 1000

function daysBetween(a: string, b: string): number {
  return Math.abs(Date.parse(a) - Date.parse(b)) / DAY_MS
}

// Запись из Telegram-бота и банковская операция — одна трата, если совпали сумма (±1 ₽) и дата (±2 дня).
// Найденную запись забираем из пула, чтобы она не склеилась второй раз.
function takeBotMatch(pool: BotTransaction[], row: PreparedExpenseTransaction): BotTransaction | null {
  if (row.flow_direction !== 'out' || isFailed(row)) return null

  let best: BotTransaction | null = null
  for (const candidate of pool) {
    if (Math.abs(candidate.payment_amount - row.payment_amount) > MERGE_AMOUNT_TOLERANCE) continue
    const days = daysBetween(candidate.operation_date, row.operation_date)
    if (days > MERGE_DAYS_TOLERANCE) continue
    if (!best || days < daysBetween(best.operation_date, row.operation_date)) best = candidate
  }

  if (best) pool.splice(pool.indexOf(best), 1)
  return best
}

export function useExpensesData() {
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [allTransactions, setAllTransactions] = useState<ExpenseTransaction[]>([])
  const [categories, setCategories] = useState<ExpenseUserCategory[]>([])
  const [mappings, setMappings] = useState<ExpenseCategoryMapping[]>([])

  const [filters, setFilters] = useState<ExpenseFilters>(getDefaultFilters)
  const [lastImportSummary, setLastImportSummary] = useState<ExpenseImportSummary | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUserId(user?.id ?? null)
      if (!user) {
        setLoading(false)
      }
    })
  }, [])

  const loadCategories = useCallback(async () => {
    if (!userId) return

    const { data, error: queryError } = await supabase
      .from('expense_user_categories')
      .select('*')
      .eq('user_id', userId)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })

    if (queryError) throw queryError
    setCategories((data || []) as ExpenseUserCategory[])
  }, [userId])

  const loadMappings = useCallback(async () => {
    if (!userId) return

    const { data, error: queryError } = await supabase
      .from('expense_category_mappings')
      .select('*')
      .eq('user_id', userId)
      .order('bank_category', { ascending: true })

    if (queryError) throw queryError
    setMappings((data || []) as ExpenseCategoryMapping[])
  }, [userId])

  // Грузим всю историю: анализу подписок нужны месяцы, фильтры применяются на клиенте
  const loadTransactions = useCallback(async () => {
    if (!userId) return

    setLoading(true)
    setError(null)

    try {
      const rows: ExpenseTransaction[] = []

      for (let from = 0; ; from += LOAD_PAGE_SIZE) {
        const { data, error: queryError } = await supabase
          .from('expense_transactions')
          .select('*')
          .eq('user_id', userId)
          .order('operation_at', { ascending: false })
          .order('id', { ascending: true })
          .range(from, from + LOAD_PAGE_SIZE - 1)

        if (queryError) throw queryError
        rows.push(...((data || []) as ExpenseTransaction[]))
        if (!data || data.length < LOAD_PAGE_SIZE) break
      }

      setAllTransactions(rows)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    if (!userId) return

    Promise.all([loadCategories(), loadMappings()])
      .catch(err => setError(getErrorMessage(err)))
  }, [loadCategories, loadMappings, userId])

  useEffect(() => {
    if (!userId) return
    void loadTransactions()
  }, [loadTransactions, userId])

  const bankCategories = useMemo(() => {
    const unique = new Set<string>()
    for (const transaction of allTransactions) {
      const category = (transaction.bank_category || '').trim()
      if (category) unique.add(category)
    }
    return Array.from(unique).sort((a, b) => a.localeCompare(b, 'ru'))
  }, [allTransactions])

  const insights = useMemo(() => buildInsights(allTransactions), [allTransactions])

  const transactions = useMemo(() => {
    const search = filters.search.trim().toLowerCase()

    return allTransactions.filter(transaction => {
      if (filters.dateFrom && transaction.operation_date < filters.dateFrom) {
        return false
      }

      if (filters.dateTo && transaction.operation_date > filters.dateTo) {
        return false
      }

      if (filters.flow !== 'all' && transaction.flow_direction !== filters.flow) {
        return false
      }

      if (filters.bankCategory && transaction.bank_category !== filters.bankCategory) {
        return false
      }

      if (filters.mappedCategoryId && transaction.mapped_category_id !== filters.mappedCategoryId) {
        return false
      }

      if (!search) {
        return true
      }

      const haystack = [
        transaction.description || '',
        transaction.note || '',
        transaction.bank_category || '',
        transaction.mcc || '',
        transaction.card_mask || '',
        transaction.status || '',
        transaction.payment_amount.toString()
      ]
        .join(' ')
        .toLowerCase()

      return haystack.includes(search)
    })
  }, [allTransactions, filters])

  const updateFilters = useCallback((patch: Partial<ExpenseFilters>) => {
    setFilters(prev => ({ ...prev, ...patch }))
  }, [])

  const resetFilters = useCallback(() => {
    const defaults = getDefaultFilters()
    setFilters(prev => ({
      ...defaults,
      search: prev.search,
      bankCategory: '',
      mappedCategoryId: ''
    }))
  }, [])

  const createCategory = useCallback(async (name: string, color: string) => {
    if (!userId) return null

    const trimmedName = name.trim()
    if (!trimmedName) return null

    const { data, error: queryError } = await supabase
      .from('expense_user_categories')
      .insert({
        user_id: userId,
        name: trimmedName,
        color: color || '#64748B'
      })
      .select('*')
      .single()

    if (queryError) throw queryError

    await loadCategories()
    return data as ExpenseUserCategory
  }, [loadCategories, userId])

  const updateCategory = useCallback(async (id: string, patch: Partial<ExpenseUserCategory>) => {
    if (!userId) return

    const { error: queryError } = await supabase
      .from('expense_user_categories')
      .update({
        ...patch,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('user_id', userId)

    if (queryError) throw queryError
    await loadCategories()
  }, [loadCategories, userId])

  const deleteCategory = useCallback(async (id: string) => {
    if (!userId) return

    const { error: queryError } = await supabase
      .from('expense_user_categories')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)

    if (queryError) throw queryError

    await Promise.all([loadCategories(), loadMappings(), loadTransactions()])
  }, [loadCategories, loadMappings, loadTransactions, userId])

  const upsertMapping = useCallback(async (bankCategory: string, targetCategoryId: string | null) => {
    if (!userId) return

    const bankCategoryValue = bankCategory.trim()
    if (!bankCategoryValue) return

    if (targetCategoryId) {
      const { error: mappingError } = await supabase
        .from('expense_category_mappings')
        .upsert(
          {
            user_id: userId,
            bank_category: bankCategoryValue,
            target_category_id: targetCategoryId,
            updated_at: new Date().toISOString()
          },
          { onConflict: 'user_id,bank_category' }
        )

      if (mappingError) throw mappingError

      const { error: transactionError } = await supabase
        .from('expense_transactions')
        .update({
          mapped_category_id: targetCategoryId,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .eq('bank_category', bankCategoryValue)

      if (transactionError) throw transactionError
    } else {
      const { error: mappingError } = await supabase
        .from('expense_category_mappings')
        .delete()
        .eq('user_id', userId)
        .eq('bank_category', bankCategoryValue)

      if (mappingError) throw mappingError

      const { error: transactionError } = await supabase
        .from('expense_transactions')
        .update({
          mapped_category_id: null,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .eq('bank_category', bankCategoryValue)

      if (transactionError) throw transactionError
    }

    await Promise.all([loadMappings(), loadTransactions()])
  }, [loadMappings, loadTransactions, userId])

  const importStatement = useCallback(async (file: File): Promise<ExpenseImportSummary> => {
    if (!userId) {
      throw new Error('Пользователь не авторизован')
    }

    setImporting(true)
    setError(null)

    let batchId: string | null = null

    try {
      const mappingMap = new Map<string, string>()
      for (const mapping of mappings) {
        mappingMap.set(normalizeCategoryKey(mapping.bank_category), mapping.target_category_id)
      }

      const parsed = await parseStatementFile(file, userId, mappingMap)

      const { data: batch, error: batchError } = await supabase
        .from('expense_import_batches')
        .insert({
          user_id: userId,
          source_file_name: parsed.fileName,
          source_file_hash: parsed.fileHash,
          rows_total: parsed.totalRows,
          rows_parsed: parsed.parsedRows.length,
          rows_inserted: 0,
          rows_updated: 0,
          rows_skipped: 0,
          errors: null
        })
        .select('id')
        .single()

      if (batchError) throw batchError
      batchId = batch?.id || null

      const { data: botRows, error: botError } = await supabase
        .from('expense_transactions')
        .select('id, operation_date, payment_amount')
        .eq('user_id', userId)
        .eq('source', 'telegram')

      if (botError) throw botError
      const botPool: BotTransaction[] = (botRows || []).map(row => ({ ...row, payment_amount: Number(row.payment_amount) }))

      let insertedRows = 0
      let updatedRows = 0
      let mergedRows = 0
      let unchangedRows = 0
      let failedRows = 0
      const importErrors: ExpenseImportError[] = [...parsed.errors]

      const chunks = chunkBySize(parsed.parsedRows, IMPORT_CHUNK_SIZE)

      for (const chunk of chunks) {
        const dedupeKeys = chunk.map(row => row.dedupe_key)

        const existingMap = new Map<string, ExistingTransactionHash>()

        const dedupeKeyChunks = chunkDedupeKeysByUrlLength(dedupeKeys, MAX_DEDUPE_KEYS_QUERY_LENGTH)
        for (const dedupeKeyChunk of dedupeKeyChunks) {
          const { data: existingRows, error: existingError } = await supabase
            .from('expense_transactions')
            .select('id, dedupe_key, row_hash')
            .eq('user_id', userId)
            .in('dedupe_key', dedupeKeyChunk)

          if (existingError) throw existingError

          for (const row of (existingRows || []) as ExistingTransactionHash[]) {
            existingMap.set(row.dedupe_key, row)
          }
        }

        const rowsToInsert: Array<PreparedExpenseTransaction & { user_id: string; import_batch_id: string | null }> = []
        const rowsToUpdate: Array<{ id: string; payload: Partial<ExpenseTransaction>; sourceRow: number; merged?: boolean }> = []

        for (const row of chunk) {
          const existing = existingMap.get(row.dedupe_key)

          if (!existing) {
            // запись из бота становится банковской операцией, её note остаётся
            const botMatch = takeBotMatch(botPool, row)
            if (botMatch) {
              rowsToUpdate.push({
                id: botMatch.id,
                sourceRow: row.source_row_number,
                merged: true,
                payload: {
                  ...row,
                  source: 'bank',
                  import_batch_id: batchId,
                  updated_at: new Date().toISOString()
                }
              })
              continue
            }

            rowsToInsert.push({
              ...row,
              user_id: userId,
              import_batch_id: batchId
            })
            continue
          }

          if (existing.row_hash === row.row_hash) {
            unchangedRows += 1
            continue
          }

          rowsToUpdate.push({
            id: existing.id,
            sourceRow: row.source_row_number,
            payload: {
              ...row,
              import_batch_id: batchId,
              updated_at: new Date().toISOString()
            }
          })
        }

        if (rowsToInsert.length > 0) {
          const { error: insertError } = await supabase
            .from('expense_transactions')
            .insert(rowsToInsert)

          if (insertError) throw insertError
          insertedRows += rowsToInsert.length
        }

        for (const rowToUpdate of rowsToUpdate) {
          const { error: updateError } = await supabase
            .from('expense_transactions')
            .update(rowToUpdate.payload)
            .eq('id', rowToUpdate.id)
            .eq('user_id', userId)

          if (updateError) {
            failedRows += 1
            importErrors.push({
              rowNumber: rowToUpdate.sourceRow,
              message: `Не удалось обновить строку: ${updateError.message}`
            })
            continue
          }

          if (rowToUpdate.merged) {
            mergedRows += 1
          } else {
            updatedRows += 1
          }
        }
      }

      const skippedRows = unchangedRows + parsed.errors.length + failedRows
      const limitedErrors = importErrors.slice(0, IMPORT_ERROR_LIMIT)

      if (batchId) {
        await supabase
          .from('expense_import_batches')
          .update({
            rows_inserted: insertedRows,
            rows_updated: updatedRows,
            rows_skipped: skippedRows,
            errors: limitedErrors.length > 0 ? limitedErrors : null
          })
          .eq('id', batchId)
      }

      const summary: ExpenseImportSummary = {
        batchId,
        fileName: parsed.fileName,
        totalRows: parsed.totalRows,
        parsedRows: parsed.parsedRows.length,
        insertedRows,
        updatedRows,
        mergedRows,
        skippedRows,
        errors: limitedErrors
      }

      setLastImportSummary(summary)
      await loadTransactions()
      return summary
    } catch (err) {
      const message = getErrorMessage(err)
      setError(message)

      if (batchId) {
        const failedError: ExpenseImportError[] = [{ rowNumber: 0, message }]
        await supabase
          .from('expense_import_batches')
          .update({
            errors: failedError,
            rows_skipped: 0
          })
          .eq('id', batchId)
      }

      throw err
    } finally {
      setImporting(false)
    }
  }, [loadTransactions, mappings, userId])

  return {
    userId,
    loading,
    importing,
    error,
    filters,
    transactions,
    allTransactions,
    categories,
    mappings,
    bankCategories,
    insights,
    lastImportSummary,
    updateFilters,
    resetFilters,
    createCategory,
    updateCategory,
    deleteCategory,
    upsertMapping,
    importStatement,
    reloadTransactions: loadTransactions
  }
}

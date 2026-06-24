export type FlowDirection = 'in' | 'out' | 'zero'
export type FlowFilter = 'all' | 'in' | 'out'

export interface ExpenseTransaction {
  id: string
  user_id: string
  import_batch_id: string | null
  source_row_number: number
  dedupe_key: string
  row_hash: string
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
  flow_direction: FlowDirection
  mapped_category_id: string | null
  created_at: string
  updated_at: string
}

export interface ExpenseUserCategory {
  id: string
  user_id: string
  name: string
  color: string
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ExpenseCategoryMapping {
  id: string
  user_id: string
  bank_category: string
  target_category_id: string
  created_at: string
  updated_at: string
}

export interface ExpenseImportError {
  rowNumber: number
  message: string
  rawPreview?: string
}

export interface ExpenseImportSummary {
  batchId: string | null
  fileName: string
  totalRows: number
  parsedRows: number
  insertedRows: number
  updatedRows: number
  skippedRows: number
  errors: ExpenseImportError[]
}

export interface ExpenseFilters {
  dateFrom: string
  dateTo: string
  flow: FlowFilter
  search: string
  bankCategory: string
  mappedCategoryId: string
}

export interface PreparedExpenseTransaction {
  source_row_number: number
  dedupe_key: string
  row_hash: string
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
  flow_direction: FlowDirection
  mapped_category_id: string | null
}

export interface ParsedStatementResult {
  fileName: string
  fileHash: string
  totalRows: number
  parsedRows: PreparedExpenseTransaction[]
  errors: ExpenseImportError[]
}

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
  include_in_analytics: boolean
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
  include_in_analytics: boolean
  mapped_category_id: string | null
}

export interface ParsedStatementResult {
  fileName: string
  fileHash: string
  totalRows: number
  parsedRows: PreparedExpenseTransaction[]
  errors: ExpenseImportError[]
}

export type SubscriptionPeriod = 'weekly' | 'monthly' | 'quarterly' | 'irregular'

export interface SubscriptionInsight {
  key: string
  name: string
  category: string | null
  amount: number
  count: number
  period: SubscriptionPeriod
  lastDate: string
  nextDate: string | null
  active: boolean
  monthlyCost: number
  yearlyCost: number
}

export type FindingKind = 'duplicate' | 'micro' | 'intermediary' | 'tips' | 'insurance' | 'failed'

export interface FindingInsight {
  key: string
  kind: FindingKind
  name: string
  total: number
  count: number
  firstDate: string
  lastDate: string
}

export interface SpendGroupInsight {
  key: string
  name: string
  total: number
  count: number
  avgCheck: number
  monthly: number
  share: number
}

export interface HabitInsight {
  key: string
  name: string
  category: string | null
  total: number
  count: number
  avgCheck: number
  perWeek: number
  monthly: number
}

export interface LargePurchaseInsight {
  id: string
  name: string
  category: string | null
  amount: number
  date: string
}

export interface ExpenseInsights {
  windowFrom: string
  windowTo: string
  months: number
  purchasesTotal: number
  purchasesMonthly: number
  subscriptions: SubscriptionInsight[]
  subscriptionsMonthly: number
  findings: FindingInsight[]
  suspiciousTotal: number
  suspiciousMonthly: number
  discretionary: SpendGroupInsight[]
  discretionaryMonthly: number
  habits: HabitInsight[]
  largePurchases: LargePurchaseInsight[]
  roundUpTotal: number
  internalCount: number
  failedCount: number
  potentialMonthlySavings: number
}

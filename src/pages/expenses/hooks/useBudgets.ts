import { useCallback, useEffect, useState } from 'react'
import { getUserId } from '../../../lib/auth'
import { supabase } from '../../../lib/supabase'
import type { BudgetLimit } from '../utils/budget'

export interface BudgetDraft {
  // category_id → лимит; null — лимит снят
  limits: Map<string, number | null>
}

export function useBudgets() {
  const [limits, setLimits] = useState<BudgetLimit[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const userId = await getUserId()
    if (!userId) {
      setLoading(false)
      return
    }

    const budgets = await supabase.from('expense_budgets').select('category_id, monthly_limit').eq('user_id', userId)
    if (!budgets.error) {
      setLimits((budgets.data || []).map(row => ({ category_id: row.category_id as string, monthly_limit: Number(row.monthly_limit) })))
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  /** Сохраняет только переданное: upsert лимитов и удаление снятых. Возвращает успех. */
  const save = useCallback(async (draft: BudgetDraft): Promise<boolean> => {
    const userId = await getUserId()
    if (!userId) return false

    const toUpsert: Array<{ user_id: string; category_id: string; monthly_limit: number; updated_at: string }> = []
    const toDelete: string[] = []
    const now = new Date().toISOString()
    for (const [categoryId, value] of draft.limits) {
      if (value === null) toDelete.push(categoryId)
      else toUpsert.push({ user_id: userId, category_id: categoryId, monthly_limit: value, updated_at: now })
    }

    if (toUpsert.length > 0) {
      const { error } = await supabase.from('expense_budgets').upsert(toUpsert, { onConflict: 'user_id,category_id' })
      if (error) return false
    }

    if (toDelete.length > 0) {
      const { error } = await supabase
        .from('expense_budgets')
        .delete()
        .eq('user_id', userId)
        .in('category_id', toDelete)
      if (error) return false
    }

    await load()
    return true
  }, [load])

  return { limits, loading, save }
}

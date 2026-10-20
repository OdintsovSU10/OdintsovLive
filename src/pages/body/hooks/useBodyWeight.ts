import { useCallback, useEffect, useState } from 'react'
import { getUserId } from '../../../lib/auth'
import { supabase } from '../../../lib/supabase'
import type { IBodyWeight } from '../bodyParamsConfig'

interface IUseBodyWeight {
  records: IBodyWeight[]
  loading: boolean
  loadError: string | null
  save: (date: string, weight: number) => Promise<string | null>
  remove: (id: string) => Promise<string | null>
}

// Записи веса по возрастанию даты; save/remove возвращают текст ошибки или null
export const useBodyWeight = (): IUseBodyWeight => {
  const [records, setRecords] = useState<IBodyWeight[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const uid = await getUserId()
    if (!uid) {
      setLoading(false)
      return
    }
    const { data, error } = await supabase
      .from('body_weight')
      .select('id, date, weight')
      .eq('user_id', uid)
      .order('date', { ascending: true })

    if (error) setLoadError(`Не удалось загрузить вес: ${error.message}`)
    else {
      setLoadError(null)
      setRecords((data ?? []).map(r => ({ id: r.id, date: r.date, weight: Number(r.weight) })))
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const save = useCallback(async (date: string, weight: number): Promise<string | null> => {
    const uid = await getUserId()
    if (!uid) return 'Нет сессии, войдите заново'
    const { error } = await supabase
      .from('body_weight')
      .upsert({ user_id: uid, date, weight }, { onConflict: 'user_id,date' })
    if (error) return `Не удалось сохранить: ${error.message}`
    await load()
    return null
  }, [load])

  const remove = useCallback(async (id: string): Promise<string | null> => {
    const { error } = await supabase.from('body_weight').delete().eq('id', id)
    if (error) return `Не удалось удалить: ${error.message}`
    await load()
    return null
  }, [load])

  return { records, loading, loadError, save, remove }
}

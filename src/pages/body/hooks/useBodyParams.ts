import { useCallback, useEffect, useState } from 'react'
import { getUserId } from '../../../lib/auth'
import { supabase } from '../../../lib/supabase'
import { PARAMS_CONFIG } from '../bodyParamsConfig'
import type { IBodyParams, ParamValues } from '../bodyParamsConfig'

interface IUseBodyParams {
  records: IBodyParams[]
  loading: boolean
  loadError: string | null
  save: (editingId: string | null, date: string, values: ParamValues) => Promise<string | null>
  remove: (id: string) => Promise<string | null>
}

const toNum = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value)

// Замеры по убыванию даты; save/remove возвращают текст ошибки или null
export const useBodyParams = (): IUseBodyParams => {
  const [records, setRecords] = useState<IBodyParams[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const uid = await getUserId()
    if (!uid) {
      setLoading(false)
      return
    }
    const { data, error } = await supabase
      .from('body_params')
      .select('*')
      .eq('user_id', uid)
      .order('date', { ascending: false })

    if (error) setLoadError(`Не удалось загрузить замеры: ${error.message}`)
    else {
      setLoadError(null)
      setRecords((data ?? []).map(row => {
        const values = {} as ParamValues
        PARAMS_CONFIG.forEach(p => { values[p.key] = toNum(row[p.key]) })
        return { id: row.id, date: row.date, ...values }
      }))
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const save = useCallback(async (editingId: string | null, date: string, values: ParamValues): Promise<string | null> => {
    const uid = await getUserId()
    if (!uid) return 'Нет сессии, войдите заново'

    const sameDate = records.find(r => r.date === date && r.id !== editingId)
    if (editingId && sameDate) return 'На эту дату уже есть другой замер'

    let error
    if (editingId) {
      ({ error } = await supabase.from('body_params').update({ date, ...values }).eq('id', editingId))
    } else if (sameDate) {
      // Новый замер на занятую дату: дополняем существующий, пустые поля его значения не стирают
      const filled = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== null))
      ;({ error } = await supabase.from('body_params').update(filled).eq('id', sameDate.id))
    } else {
      ({ error } = await supabase.from('body_params').insert({ user_id: uid, date, ...values }))
    }
    if (error) return `Не удалось сохранить: ${error.message}`
    await load()
    return null
  }, [records, load])

  const remove = useCallback(async (id: string): Promise<string | null> => {
    const { error } = await supabase.from('body_params').delete().eq('id', id)
    if (error) return `Не удалось удалить: ${error.message}`
    await load()
    return null
  }, [load])

  return { records, loading, loadError, save, remove }
}

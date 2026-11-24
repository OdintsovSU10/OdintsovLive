import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { getPeriodRange, type NewsPeriod } from './newsDates'
import { IMPORTANT_MIN } from './newsSelection'

export interface INewsCounts {
  all: number | null
  important: number | null
  byChannel: Record<string, number | null>
}

// Счётчики постов за период: «Все», «Важные» и по каждому каналу. null в результате хука — идёт загрузка,
// null внутри — запрос не удался. channelKey — id каналов через запятую (пересчёт при добавлении/удалении).
export const useNewsCounts = (period: NewsPeriod, channelKey: string, ready: boolean): INewsCounts | null => {
  const [counts, setCounts] = useState<INewsCounts | null>(null)

  useEffect(() => {
    if (!ready) return
    let cancelled = false
    setCounts(null)
    const { from, to } = getPeriodRange(period)
    const ids = channelKey ? channelKey.split(',') : []

    const base = () => {
      let request = supabase
        .from('news_posts')
        .select('id', { count: 'exact', head: true })
        .eq('llm_state', 'done')
        .gte('published_at', from)
      if (to) request = request.lt('published_at', to)
      return request
    }

    void Promise.all([
      base(),
      base().gte('importance', IMPORTANT_MIN),
      ...ids.map(id => base().eq('channel_id', id))
    ]).then(([all, important, ...perChannel]) => {
      if (cancelled) return
      const byChannel: Record<string, number | null> = {}
      ids.forEach((id, index) => { byChannel[id] = perChannel[index].error ? null : perChannel[index].count })
      setCounts({
        all: all.error ? null : all.count,
        important: important.error ? null : important.count,
        byChannel
      })
    })

    return () => { cancelled = true }
  }, [period, channelKey, ready])

  return counts
}

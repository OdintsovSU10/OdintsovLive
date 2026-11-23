import { useCallback, useEffect, useState } from 'react'
import { getUserId } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import { weekAgoIso } from './newsDates'
import type { INewsChannel } from './types'

const CHANNEL_FIELDS = 'id, user_id, username, title, enabled, last_post_id, last_checked_at, last_error, created_at'

export const useNewsChannels = (withCounts: boolean) => {
  const [userId, setUserId] = useState<string | null>(null)
  const [channels, setChannels] = useState<INewsChannel[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const uid = await getUserId()
    setUserId(uid)
    if (!uid) {
      setLoading(false)
      return
    }
    const { data, error: queryError } = await supabase
      .from('news_channels')
      .select(CHANNEL_FIELDS)
      .eq('user_id', uid)
      .order('created_at', { ascending: true })
      .overrideTypes<INewsChannel[], { merge: false }>()
    if (queryError) {
      setError(queryError.message)
      setLoading(false)
      return
    }
    const rows = data ?? []
    setChannels(rows)
    setError(null)
    setLoading(false)

    if (!withCounts) return
    // Один раз на загрузку: точный count по каждому каналу, без выборки самих постов
    const since = weekAgoIso()
    const results = await Promise.all(rows.map(channel =>
      supabase
        .from('news_posts')
        .select('id', { count: 'exact', head: true })
        .eq('channel_id', channel.id)
        .gte('published_at', since)
    ))
    const next: Record<string, number> = {}
    rows.forEach((channel, index) => { next[channel.id] = results[index].count ?? 0 })
    setCounts(next)
  }, [withCounts])

  useEffect(() => {
    void load()
  }, [load])

  const add = useCallback(async (username: string): Promise<'ok' | 'duplicate' | 'error'> => {
    if (!userId) return 'error'
    const { data, error: queryError } = await supabase
      .from('news_channels')
      .insert({ user_id: userId, username })
      .select(CHANNEL_FIELDS)
      .single<INewsChannel>()
    if (queryError || !data) return queryError?.code === '23505' ? 'duplicate' : 'error'
    setChannels(prev => [...prev, data])
    setCounts(prev => ({ ...prev, [data.id]: 0 }))
    return 'ok'
  }, [userId])

  const setEnabled = useCallback(async (id: string, enabled: boolean): Promise<boolean> => {
    const { error: queryError } = await supabase.from('news_channels').update({ enabled }).eq('id', id)
    if (queryError) return false
    setChannels(prev => prev.map(channel => (channel.id === id ? { ...channel, enabled } : channel)))
    return true
  }, [])

  const remove = useCallback(async (id: string): Promise<boolean> => {
    const { error: queryError } = await supabase.from('news_channels').delete().eq('id', id)
    if (queryError) return false
    setChannels(prev => prev.filter(channel => channel.id !== id))
    return true
  }, [])

  return { channels, counts, loading, error, add, setEnabled, remove }
}

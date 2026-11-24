import { useCallback, useEffect, useState } from 'react'
import { getUserId } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import type { INewsChannel } from './types'

const CHANNEL_FIELDS = 'id, user_id, username, title, enabled, last_post_id, last_checked_at, last_error, created_at'

export interface IAddResult {
  status: 'ok' | 'duplicate' | 'error'
  id?: string
}

export const useNewsChannels = () => {
  const [userId, setUserId] = useState<string | null>(null)
  const [channels, setChannels] = useState<INewsChannel[]>([])
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
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const add = useCallback(async (username: string): Promise<IAddResult> => {
    if (!userId) return { status: 'error' }
    const { data, error: queryError } = await supabase
      .from('news_channels')
      .insert({ user_id: userId, username })
      .select(CHANNEL_FIELDS)
      .single<INewsChannel>()
    if (queryError || !data) return { status: queryError?.code === '23505' ? 'duplicate' : 'error' }
    setChannels(prev => [...prev, data])
    return { status: 'ok', id: data.id }
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

  return { channels, loading, error, add, setEnabled, remove }
}

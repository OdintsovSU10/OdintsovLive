import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { getPeriodRange, type NewsPeriod } from './newsDates'
import type { INewsPost } from './types'

export const PAGE_SIZE = 100
const POST_FIELDS = 'id, user_id, channel_id, post_id, url, published_at, importance, band, category, summary, reason'

export interface INewsFilters {
  period: NewsPeriod
  minImportance: number
  channelId: string
  query: string
}

export const useNewsFeed = (filters: INewsFilters) => {
  const { period, minImportance, channelId, query } = filters
  const [posts, setPosts] = useState<INewsPost[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestRef = useRef(0)

  const fetchPage = useCallback(async (offset: number): Promise<INewsPost[] | null> => {
    const { from, to } = getPeriodRange(period)
    let request = supabase
      .from('news_posts')
      .select(POST_FIELDS)
      .eq('llm_state', 'done')
      .gte('published_at', from)
    if (to) request = request.lt('published_at', to)
    if (minImportance > 0) request = request.gte('importance', minImportance)
    if (channelId) request = request.eq('channel_id', channelId)
    if (query) request = request.textSearch('fts', query, { type: 'websearch', config: 'russian' })

    const { data, error: queryError } = await request
      .order('published_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1)
      .overrideTypes<INewsPost[], { merge: false }>()
    if (queryError) {
      setError(queryError.message)
      return null
    }
    setError(null)
    return data ?? []
  }, [period, minImportance, channelId, query])

  useEffect(() => {
    const requestId = ++requestRef.current
    setLoading(true)
    void fetchPage(0).then(rows => {
      if (requestId !== requestRef.current) return
      if (rows) {
        setPosts(rows)
        setHasMore(rows.length === PAGE_SIZE)
      } else {
        setPosts([])
        setHasMore(false)
      }
      setLoading(false)
    })
  }, [fetchPage])

  const loadMore = useCallback(async () => {
    const requestId = requestRef.current
    setLoadingMore(true)
    const rows = await fetchPage(posts.length)
    if (requestId !== requestRef.current) return
    if (rows) {
      setPosts(prev => {
        const seen = new Set(prev.map(post => post.id))
        return [...prev, ...rows.filter(row => !seen.has(row.id))]
      })
      setHasMore(rows.length === PAGE_SIZE)
    }
    setLoadingMore(false)
  }, [fetchPage, posts.length])

  return { posts, loading, loadingMore, hasMore, error, loadMore }
}

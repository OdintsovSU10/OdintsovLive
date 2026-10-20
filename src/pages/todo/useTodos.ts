import { useCallback, useEffect, useState } from 'react'
import { getUserId } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import type { TodoItem } from './types'

const DONE_LIMIT = 30
const TODO_FIELDS = 'id, user_id, title, due_date, remind_at, done_at, source, created_at'

export function useTodos() {
  const [userId, setUserId] = useState<string | null>(null)
  const [open, setOpen] = useState<TodoItem[]>([])
  const [done, setDone] = useState<TodoItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const uid = await getUserId()
    setUserId(uid)
    if (!uid) {
      setLoading(false)
      return
    }

    const [openRes, doneRes] = await Promise.all([
      supabase.from('todo_items').select(TODO_FIELDS).eq('user_id', uid).is('done_at', null)
        .overrideTypes<TodoItem[], { merge: false }>(),
      supabase.from('todo_items').select(TODO_FIELDS).eq('user_id', uid).not('done_at', 'is', null)
        .order('done_at', { ascending: false }).limit(DONE_LIMIT)
        .overrideTypes<TodoItem[], { merge: false }>()
    ])

    if (openRes.error || doneRes.error) {
      setError((openRes.error ?? doneRes.error)?.message ?? 'Не удалось загрузить дела')
    } else {
      setOpen(openRes.data ?? [])
      setDone(doneRes.data ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const add = useCallback(async (title: string, dueDate: string | null, remindAt: string | null): Promise<boolean> => {
    if (!userId) return false
    const { data, error: queryError } = await supabase
      .from('todo_items')
      .insert({ user_id: userId, title, due_date: dueDate, remind_at: remindAt, source: 'site' })
      .select(TODO_FIELDS)
      .single<TodoItem>()
    if (queryError || !data) return false
    setOpen(prev => [...prev, data])
    return true
  }, [userId])

  const update = useCallback(async (id: string, patch: Pick<TodoItem, 'title' | 'due_date' | 'remind_at'>): Promise<boolean> => {
    const { error: queryError } = await supabase.from('todo_items').update(patch).eq('id', id)
    if (queryError) return false
    setOpen(prev => prev.map(item => (item.id === id ? { ...item, ...patch } : item)))
    return true
  }, [])

  // done = true — отметить сделанным, false — вернуть в открытые
  const setDoneState = useCallback(async (item: TodoItem, isDone: boolean): Promise<boolean> => {
    const doneAt = isDone ? new Date().toISOString() : null
    const { error: queryError } = await supabase.from('todo_items').update({ done_at: doneAt }).eq('id', item.id)
    if (queryError) return false

    const next: TodoItem = { ...item, done_at: doneAt }
    if (isDone) {
      setOpen(prev => prev.filter(row => row.id !== item.id))
      setDone(prev => [next, ...prev.filter(row => row.id !== item.id)].slice(0, DONE_LIMIT))
    } else {
      setDone(prev => prev.filter(row => row.id !== item.id))
      setOpen(prev => [...prev.filter(row => row.id !== item.id), next])
    }
    return true
  }, [])

  const remove = useCallback(async (item: TodoItem): Promise<boolean> => {
    const { error: queryError } = await supabase.from('todo_items').delete().eq('id', item.id)
    if (queryError) return false
    setOpen(prev => prev.filter(row => row.id !== item.id))
    setDone(prev => prev.filter(row => row.id !== item.id))
    return true
  }, [])

  // Отмена удаления: возвращаем строку с тем же id и полями
  const restore = useCallback(async (item: TodoItem): Promise<boolean> => {
    const { error: queryError } = await supabase.from('todo_items').insert(item)
    if (queryError) return false
    if (item.done_at) setDone(prev => [item, ...prev].sort((a, b) => (b.done_at ?? '').localeCompare(a.done_at ?? '')).slice(0, DONE_LIMIT))
    else setOpen(prev => [...prev, item])
    return true
  }, [])

  return { open, done, loading, error, add, update, setDoneState, remove, restore }
}

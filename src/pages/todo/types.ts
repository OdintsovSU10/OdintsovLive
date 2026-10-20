export interface TodoItem {
  id: string
  user_id: string
  title: string
  due_date: string | null
  remind_at: string | null
  done_at: string | null
  source: 'site' | 'telegram'
  created_at: string
}

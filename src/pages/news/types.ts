export type NewsBand = 'critical' | 'important' | 'normal' | 'noise'

export interface INewsChannel {
  id: string
  user_id: string
  username: string
  title: string | null
  enabled: boolean
  last_post_id: number | null
  last_checked_at: string | null
  last_error: string | null
  created_at: string
}

export interface INewsPost {
  id: number
  user_id: string
  channel_id: string
  post_id: number
  url: string
  published_at: string
  importance: number | null
  band: NewsBand | null
  category: string | null
  summary: string | null
  reason: string | null
}

export interface INewsSettings {
  user_id: string
  interests: string
  digest_time: string
  push_threshold: number
  updated_at?: string
}

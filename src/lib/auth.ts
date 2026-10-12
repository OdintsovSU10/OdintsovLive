import { supabase } from './supabase'

// id пользователя из локальной сессии: getUser() ходит в сеть и на это время держит очередь запросов
export const getUserId = async (): Promise<string | null> => {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.user.id ?? null
}

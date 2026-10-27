import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { mergeReminderSettings, type ILifeReminders } from '../admin/reminderDefaults'
import { getMoscowToday } from '../todo/todoDates'
import { buildLifeModel, type ILifeModel } from './lifeWeeks'

// Дата рождения и памятные даты из настроек бота. RPC только для админов: ошибка или пустая дата — null (карточка скрыта)
export const useLifeWeeks = (): ILifeModel | null => {
  const [life, setLife] = useState<ILifeReminders | null>(null)
  const [today] = useState(getMoscowToday)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const { data, error } = await supabase.rpc('get_reminder_settings')
      if (cancelled || error) return
      const merged = mergeReminderSettings(data).life
      if (merged.birthDate) setLife(merged)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return useMemo(() => (life ? buildLifeModel(life.birthDate, life.events, today) : null), [life, today])
}

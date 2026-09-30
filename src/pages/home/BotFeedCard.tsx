import { useEffect, useState } from 'react'
import { MessageSquareText } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { MONTHS_SHORT } from '../../lib/constants'
import { CardPlaceholder, HomeCard } from './HomeCard'

interface BotEntry {
  id: string
  input_text: string | null
  created_rows: { table: string }[]
  undone: boolean
  created_at: string
}

interface Props {
  userId: string
}

const FEED_LIMIT = 5

const TABLE_LABELS: Record<string, string> = {
  expense_transactions: 'Траты',
  car_fuel: 'Заправка',
  car_maintenance: 'ТО',
  car_expenses: 'Машина',
  cars: 'Пробег',
  body_weight: 'Вес',
  body_params: 'Параметры'
}

const formatWhen = (iso: string) => {
  const date = new Date(iso)
  const time = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  const today = new Date()
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
  if (date.toDateString() === today.toDateString()) return time
  if (date.toDateString() === yesterday.toDateString()) return `вчера ${time}`
  return `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]} ${time}`
}

const labelsOf = (entry: BotEntry) =>
  Array.from(new Set(entry.created_rows.map(row => TABLE_LABELS[row.table] || row.table)))

// Что недавно записано через Telegram-бота
export function BotFeedCard({ userId }: Props) {
  const [entries, setEntries] = useState<BotEntry[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    supabase
      .from('telegram_bot_entries')
      .select('id, input_text, created_rows, undone, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(FEED_LIMIT)
      .then(({ data, error }) => {
        if (error) setFailed(true)
        setEntries((data || []) as BotEntry[])
      })
  }, [userId])

  return (
    <HomeCard Icon={MessageSquareText} title="Последние записи" aside="Telegram-бот" span="full">
      {!entries ? (
        <CardPlaceholder />
      ) : failed ? (
        <div className="home-hint">Не удалось загрузить записи</div>
      ) : entries.length === 0 ? (
        <div className="home-hint">Записей пока нет — отправьте боту трату, заправку или вес</div>
      ) : (
        <ul className="home-feed">
          {entries.map(entry => (
            <li key={entry.id} className={`home-feed-item ${entry.undone ? 'undone' : ''}`}>
              <span className="home-feed-when">{formatWhen(entry.created_at)}</span>
              <span className="home-feed-text">{entry.input_text || 'Фото'}</span>
              <span className="home-feed-tags">
                {entry.undone
                  ? <span className="home-tag">отменено</span>
                  : labelsOf(entry).map(label => <span key={label} className="home-tag">{label}</span>)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </HomeCard>
  )
}

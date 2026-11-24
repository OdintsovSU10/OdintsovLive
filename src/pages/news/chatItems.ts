import { getMoscowDayKey, formatDayLabel } from './newsDates'
import type { INewsPost } from './types'

export interface IChatMessage {
  post: INewsPost
  // показывать аватар и имя канала (первое сообщение серии одного канала в течение дня)
  showHead: boolean
  // начало новой серии (другой канал или первый в дне) — отступ крупнее
  newSeries: boolean
}

export interface IChatDay {
  key: string
  label: string
  messages: IChatMessage[]
}

// Лента приходит от новых к старым; в чате — старые сверху, новые снизу, сообщения сгруппированы по дням.
export const buildChatDays = (posts: INewsPost[]): IChatDay[] => {
  const days: IChatDay[] = []
  for (let index = posts.length - 1; index >= 0; index -= 1) {
    const post = posts[index]
    const dayKey = getMoscowDayKey(post.published_at)
    let day = days[days.length - 1]
    if (!day || day.key !== dayKey) {
      day = { key: dayKey, label: formatDayLabel(post.published_at), messages: [] }
      days.push(day)
    }
    const previous = day.messages[day.messages.length - 1]
    const newSeries = !previous || previous.post.channel_id !== post.channel_id
    day.messages.push({ post, showHead: newSeries, newSeries })
  }
  return days
}

const CHANNEL_COLORS = 8

// Стабильный индекс цвета (0..7) по id канала
export const getChannelColorIndex = (channelId: string): number => {
  let hash = 0
  for (let index = 0; index < channelId.length; index += 1) {
    hash = (hash * 31 + channelId.charCodeAt(index)) >>> 0
  }
  return hash % CHANNEL_COLORS
}

import { useEffect, useMemo, useState, type FC } from 'react'
import { Link } from 'react-router-dom'
import { ClearableInput } from '../../components/ui/ClearableInput'
import { NewsCard } from './NewsCard'
import { useNewsChannels } from './useNewsChannels'
import { useNewsFeed } from './useNewsFeed'
import type { NewsPeriod } from './newsDates'
import shared from './NewsShared.module.css'
import styles from './FeedTab.module.css'

const SEARCH_DEBOUNCE_MS = 400

const PERIODS: { value: NewsPeriod; label: string }[] = [
  { value: 'today', label: 'Сегодня' },
  { value: 'yesterday', label: 'Вчера' },
  { value: 'week', label: '7 дней' },
  { value: 'month', label: '30 дней' }
]

const IMPORTANCE_LEVELS: { value: number; label: string }[] = [
  { value: 0, label: 'Все' },
  { value: 25, label: 'Обычное 25+' },
  { value: 55, label: 'Важное 55+' },
  { value: 80, label: 'Критичное 80+' }
]

export const FeedTab: FC = () => {
  const { channels, error: channelsError } = useNewsChannels(false)
  const [period, setPeriod] = useState<NewsPeriod>('week')
  const [minImportance, setMinImportance] = useState(55)
  const [channelId, setChannelId] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [query, setQuery] = useState('')

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(searchInput.trim()), SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  const { posts, loading, loadingMore, hasMore, error, loadMore } = useNewsFeed({ period, minImportance, channelId, query })

  const channelNames = useMemo(() => {
    const map = new Map<string, string>()
    channels.forEach(channel => map.set(channel.id, channel.title || `@${channel.username}`))
    return map
  }, [channels])

  return (
    <div className={styles.feed}>
      <div className={styles.filters}>
        <label className={shared.field}>
          <span>Период</span>
          <select className={shared.input} value={period} onChange={event => setPeriod(event.target.value as NewsPeriod)}>
            {PERIODS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <label className={shared.field}>
          <span>Важность</span>
          <select className={shared.input} value={minImportance} onChange={event => setMinImportance(Number(event.target.value))}>
            {IMPORTANCE_LEVELS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <label className={shared.field}>
          <span>Канал</span>
          <select className={shared.input} value={channelId} onChange={event => setChannelId(event.target.value)}>
            <option value="">Все каналы</option>
            {channels.map(channel => (
              <option key={channel.id} value={channel.id}>{channel.title || `@${channel.username}`}</option>
            ))}
          </select>
        </label>
        <div className={`${shared.field} ${styles.search}`}>
          <span>Поиск</span>
          <ClearableInput
            className={shared.input}
            type="text"
            value={searchInput}
            placeholder="Поиск по тексту"
            aria-label="Поиск по тексту"
            clearLabel="Очистить поиск"
            autoComplete="off"
            enterKeyHint="search"
            onChange={event => setSearchInput(event.target.value)}
            onClear={() => setSearchInput('')}
          />
        </div>
      </div>

      {(error || channelsError) && <div className={shared.alert} role="alert">{error ?? channelsError}</div>}

      {loading ? (
        <div className={shared.skeleton} aria-busy="true" />
      ) : posts.length === 0 ? (
        !error && (
          <div className={shared.empty}>
            Новостей нет. Добавьте каналы во вкладке «<Link to="/news?tab=channels">Каналы</Link>»
          </div>
        )
      ) : (
        <>
          <ul className={styles.list}>
            {posts.map(post => (
              <NewsCard key={post.id} post={post} channelName={channelNames.get(post.channel_id) ?? 'Канал удалён'} />
            ))}
          </ul>
          {hasMore && (
            <button type="button" className={shared.button} disabled={loadingMore} onClick={() => void loadMore()}>
              {loadingMore ? 'Загрузка…' : 'Ещё'}
            </button>
          )}
        </>
      )}
    </div>
  )
}

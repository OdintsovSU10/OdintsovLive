import { useEffect, useState, type FC } from 'react'
import { ClearableInput } from '../../components/ui/ClearableInput'
import { NewsCard } from './NewsCard'
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

interface IFeedTabProps {
  period: NewsPeriod
  onPeriodChange: (period: NewsPeriod) => void
  channelId: string
  minImportance: number
  channelNames: Map<string, string>
  hasChannels: boolean
  error: string | null
}

export const FeedTab: FC<IFeedTabProps> = ({
  period,
  onPeriodChange,
  channelId,
  minImportance,
  channelNames,
  hasChannels,
  error: channelsError
}) => {
  const [searchInput, setSearchInput] = useState('')
  const [query, setQuery] = useState('')

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(searchInput.trim()), SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  const { posts, loading, loadingMore, hasMore, error, loadMore } = useNewsFeed({ period, minImportance, channelId, query })

  return (
    <div className={styles.feed}>
      <div className={styles.filters}>
        <label className={shared.field}>
          <span>Период</span>
          <select className={shared.input} value={period} onChange={event => onPeriodChange(event.target.value as NewsPeriod)}>
            {PERIODS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <div className={shared.field}>
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
            {hasChannels
              ? 'Новостей за период нет. Первые новости нового канала появляются в течение 15 минут.'
              : 'Каналов пока нет. Добавьте первый публичный канал в списке «Каналы».'}
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
            <button type="button" className={`${shared.button} ${styles.more}`} disabled={loadingMore} onClick={() => void loadMore()}>
              {loadingMore ? 'Загрузка…' : 'Ещё'}
            </button>
          )}
        </>
      )}
    </div>
  )
}

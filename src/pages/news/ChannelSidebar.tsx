import { useState, type FC, type ReactNode } from 'react'
import { Flame, Newspaper, Plus } from 'lucide-react'
import { ChannelAddForm } from './ChannelAddForm'
import { SELECT_ALL, SELECT_IMPORTANT } from './newsSelection'
import type { INewsCounts } from './useNewsCounts'
import type { IAddResult } from './useNewsChannels'
import type { INewsChannel } from './types'
import shared from './NewsShared.module.css'
import styles from './ChannelSidebar.module.css'

interface IChannelSidebarProps {
  channels: INewsChannel[]
  channelsLoading: boolean
  selection: string
  counts: INewsCounts | null
  onSelect: (selection: string) => void
  onAdd: (username: string) => Promise<IAddResult>
}

const formatCount = (counts: INewsCounts | null, value: number | null | undefined): string => {
  if (counts === null) return '…'
  return value === null || value === undefined ? '—' : String(value)
}

export const ChannelSidebar: FC<IChannelSidebarProps> = ({
  channels,
  channelsLoading,
  selection,
  counts,
  onSelect,
  onAdd
}) => {
  const [adding, setAdding] = useState(false)

  const renderItem = (key: string, label: string, count: string, icon?: ReactNode, channel?: INewsChannel) => {
    const active = selection === key
    const classes = [styles.btn, active ? styles.active : '', channel && !channel.enabled ? styles.off : '']
    return (
      <li key={key} className={styles.item}>
        <button
          type="button"
          className={classes.filter(Boolean).join(' ')}
          aria-pressed={active}
          aria-current={active ? 'true' : undefined}
          onClick={() => onSelect(key)}
        >
          {icon}
          <span className={styles.name}>{label}</span>
          {channel?.last_error && (
            <span className={styles.warn} role="img" aria-label={`Ошибка: ${channel.last_error}`} title={channel.last_error} />
          )}
          <span className={styles.count}>{count}</span>
        </button>
      </li>
    )
  }

  return (
    <nav className={styles.sidebar} aria-label="Каналы">
      <h2 className={styles.title}>Каналы</h2>
      <ul className={styles.list}>
        {renderItem(SELECT_ALL, 'Все', formatCount(counts, counts?.all), <Newspaper size={18} strokeWidth={1.5} className={styles.icon} />)}
        {renderItem(SELECT_IMPORTANT, 'Важные', formatCount(counts, counts?.important), <Flame size={18} strokeWidth={1.5} className={styles.icon} />)}
        <li className={styles.divider} role="separator" />
        {channelsLoading ? (
          <li className={styles.loading} aria-busy="true">Загрузка…</li>
        ) : (
          channels.map(channel => renderItem(
            channel.id,
            channel.title || `@${channel.username}`,
            formatCount(counts, counts?.byChannel[channel.id]),
            undefined,
            channel
          ))
        )}
        <li className={styles.item}>
          <button
            type="button"
            className={`${styles.btn} ${styles.addBtn}`}
            aria-expanded={adding}
            aria-label="Добавить канал"
            onClick={() => setAdding(prev => !prev)}
          >
            <Plus size={18} strokeWidth={1.5} className={styles.icon} />
            <span className={styles.addLabel}>Добавить канал</span>
          </button>
        </li>
      </ul>

      {adding && (
        <div className={styles.addPanel}>
          <ChannelAddForm onAdd={onAdd} onDone={() => setAdding(false)} />
          <p className={shared.hint}>Первые новости появятся в течение 15 минут</p>
        </div>
      )}
    </nav>
  )
}

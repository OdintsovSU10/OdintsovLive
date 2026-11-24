import { useState, type FC } from 'react'
import { Trash2 } from 'lucide-react'
import { formatRelative } from './newsDates'
import { IMPORTANT_MIN, SELECT_ALL, SELECT_IMPORTANT } from './newsSelection'
import type { INewsChannel } from './types'
import shared from './NewsShared.module.css'
import styles from './ChannelHeader.module.css'

interface IChannelHeaderProps {
  selection: string
  channel: INewsChannel | null
  onToggle: (enabled: boolean) => void
  onDelete: () => void
}

export const ChannelHeader: FC<IChannelHeaderProps> = ({ selection, channel, onToggle, onDelete }) => {
  const [confirming, setConfirming] = useState(false)

  if (selection === SELECT_ALL || selection === SELECT_IMPORTANT) {
    return (
      <section className={styles.card}>
        <h2 className={styles.title}>{selection === SELECT_ALL ? 'Все каналы' : 'Важные'}</h2>
        {selection === SELECT_IMPORTANT && <span className={styles.meta}>Важность {IMPORTANT_MIN} и выше</span>}
      </section>
    )
  }

  if (!channel) {
    return (
      <section className={styles.card}>
        <h2 className={styles.title}>Канал…</h2>
      </section>
    )
  }

  return (
    <section className={styles.card}>
      <div className={styles.main}>
        <h2 className={styles.title}>{channel.title || `@${channel.username}`}</h2>
        {channel.title && (
          <a
            className={styles.username}
            href={`https://t.me/${channel.username}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            @{channel.username}
          </a>
        )}
        <span className={styles.meta}>Проверен: {formatRelative(channel.last_checked_at)}</span>
        {channel.last_error && <span className={styles.error}>{channel.last_error}</span>}
      </div>

      <div className={styles.actions}>
        <label className={styles.switch}>
          <input
            type="checkbox"
            checked={channel.enabled}
            onChange={event => onToggle(event.target.checked)}
          />
          <span className={styles.track} aria-hidden="true" />
          <span className={styles.switchLabel}>Читать</span>
        </label>
        <button
          type="button"
          className={styles.deleteBtn}
          aria-label={`Удалить канал ${channel.username}`}
          onClick={() => setConfirming(true)}
        >
          <Trash2 size={18} strokeWidth={1.5} />
          <span className={styles.deleteLabel}>Удалить</span>
        </button>
      </div>

      {confirming && (
        <div className={styles.confirm} role="alertdialog" aria-label="Подтверждение удаления">
          <span>Удалить канал и все его новости?</span>
          <div className={styles.confirmActions}>
            <button type="button" className={shared.buttonGhost} onClick={() => setConfirming(false)}>Отмена</button>
            <button type="button" className={shared.buttonDanger} onClick={onDelete}>Удалить</button>
          </div>
        </div>
      )}
    </section>
  )
}

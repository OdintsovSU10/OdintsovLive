import { useState, type FC } from 'react'
import { Trash2 } from 'lucide-react'
import { formatRelative } from './newsDates'
import type { INewsChannel } from './types'
import shared from './NewsShared.module.css'
import styles from './ChannelRow.module.css'

interface IChannelRowProps {
  channel: INewsChannel
  postsCount: number | undefined
  onToggle: (enabled: boolean) => void
  onDelete: () => void
}

export const ChannelRow: FC<IChannelRowProps> = ({ channel, postsCount, onToggle, onDelete }) => {
  const [confirming, setConfirming] = useState(false)

  return (
    <li className={styles.row}>
      <div className={styles.main}>
        <a
          className={styles.name}
          href={`https://t.me/${channel.username}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          {channel.title || `@${channel.username}`}
        </a>
        {channel.title && <span className={styles.username}>@{channel.username}</span>}
        <span className={styles.meta}>
          Проверен: {formatRelative(channel.last_checked_at)}
          {postsCount !== undefined && ` · за 7 дней: ${postsCount}`}
        </span>
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
          <span className={styles.switchLabel}>{channel.enabled ? 'Вкл' : 'Выкл'}</span>
        </label>
        <button
          type="button"
          className={styles.deleteBtn}
          aria-label={`Удалить канал ${channel.username}`}
          onClick={() => setConfirming(true)}
        >
          <Trash2 size={18} strokeWidth={1.5} />
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
    </li>
  )
}

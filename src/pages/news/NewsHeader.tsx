import { useState, type FC } from 'react'
import { Send, Settings, Trash2 } from 'lucide-react'
import { SELECT_ALL, SELECT_IMPORTANT } from './newsSelection'
import type { INewsChannel } from './types'
import shared from './NewsShared.module.css'
import styles from './NewsHeader.module.css'

interface INewsHeaderProps {
  selection: string
  channel: INewsChannel | null
  onToggle: (enabled: boolean) => void
  onDelete: () => void
  onOpenSettings: () => void
}

const getSubtitle = (selection: string, channel: INewsChannel | null): string => {
  if (selection === SELECT_ALL) return 'Все каналы'
  if (selection === SELECT_IMPORTANT) return 'Важные'
  if (!channel) return 'Канал…'
  return channel.title || `@${channel.username}`
}

export const NewsHeader: FC<INewsHeaderProps> = ({ selection, channel, onToggle, onDelete, onOpenSettings }) => {
  const [confirming, setConfirming] = useState(false)

  return (
    <header className={styles.header}>
      <div className={styles.row}>
        <h1 className={styles.title}>
          Новости
          <span className={styles.subtitle}> ({getSubtitle(selection, channel)})</span>
        </h1>

        <div className={styles.actions}>
          {channel && (
            <>
              <a
                className={styles.iconBtn}
                href={`https://t.me/${channel.username}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Открыть @${channel.username} в Telegram`}
                title={`@${channel.username} в Telegram`}
              >
                <Send size={18} strokeWidth={1.5} />
              </a>
              <label className={styles.switch}>
                <input type="checkbox" checked={channel.enabled} onChange={event => onToggle(event.target.checked)} />
                <span className={styles.track} aria-hidden="true" />
                <span className={styles.switchLabel}>Читать</span>
              </label>
              <button
                type="button"
                className={`${styles.iconBtn} ${styles.danger}`}
                aria-label={`Удалить канал ${channel.username}`}
                title="Удалить канал"
                onClick={() => setConfirming(true)}
              >
                <Trash2 size={18} strokeWidth={1.5} />
              </button>
            </>
          )}
          <button type="button" className={styles.iconBtn} aria-label="Настройки" title="Настройки" onClick={onOpenSettings}>
            <Settings size={18} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {channel?.last_error && <div className={styles.error}>{channel.last_error}</div>}

      {channel && confirming && (
        <div key={channel.id} className={styles.confirm} role="alertdialog" aria-label="Подтверждение удаления">
          <span>Удалить канал и все его новости?</span>
          <div className={styles.confirmActions}>
            <button type="button" className={shared.buttonGhost} onClick={() => setConfirming(false)}>Отмена</button>
            <button
              type="button"
              className={shared.buttonDanger}
              onClick={() => {
                setConfirming(false)
                onDelete()
              }}
            >
              Удалить
            </button>
          </div>
        </div>
      )}
    </header>
  )
}

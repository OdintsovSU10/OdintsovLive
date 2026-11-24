import { memo, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { getChannelColorIndex } from './chatItems'
import { formatPostTime } from './newsDates'
import { IMPORTANT_MIN } from './newsSelection'
import type { INewsPost } from './types'
import styles from './NewsMessage.module.css'

interface INewsMessageProps {
  post: INewsPost
  channelName: string
  // режимы «Все»/«Важные»: рядом с пузырём аватар канала
  showChannel: boolean
  showHead: boolean
  newSeries: boolean
}

const COLOR_CLASSES = [styles.c0, styles.c1, styles.c2, styles.c3, styles.c4, styles.c5, styles.c6, styles.c7]

const NewsMessageView = ({ post, channelName, showChannel, showHead, newSeries }: INewsMessageProps) => {
  const [showReason, setShowReason] = useState(false)
  const importance = post.importance
  const important = importance !== null && importance >= IMPORTANT_MIN
  const critical = post.band === 'critical'
  const colorClass = COLOR_CLASSES[getChannelColorIndex(post.channel_id)]
  const rowClasses = [styles.row, newSeries ? styles.newSeries : '', colorClass].filter(Boolean).join(' ')

  return (
    <li className={rowClasses} data-news-msg={post.id}>
      {showChannel && (
        showHead ? (
          <span className={styles.avatar} aria-hidden="true">{channelName.replace(/^@/, '').charAt(0).toUpperCase()}</span>
        ) : (
          <span className={styles.avatarSpacer} aria-hidden="true" />
        )
      )}

      <div className={styles.bubble}>
        {showChannel && showHead && <div className={styles.channel}>{channelName}</div>}

        {(important || post.category) && (
          <div className={styles.top}>
            {important && (
              <span className={`${styles.badge} ${critical ? styles.critical : styles.important}`}>
                {critical ? 'Критично' : 'Важно'} <b>{importance}</b>
              </span>
            )}
            {post.category && <span className={styles.category}>{post.category}</span>}
          </div>
        )}

        <p className={styles.summary}>{post.summary || 'Без краткого содержания'}</p>

        {post.reason && (
          <div className={styles.reasonBlock}>
            <button
              type="button"
              className={styles.reasonToggle}
              aria-expanded={showReason}
              onClick={() => setShowReason(prev => !prev)}
            >
              {showReason ? 'Скрыть причину оценки' : 'Почему такая оценка'}
            </button>
            {showReason && <p className={styles.reason}>{post.reason}</p>}
          </div>
        )}

        <div className={styles.footer}>
          <time className={styles.time} dateTime={post.published_at}>{formatPostTime(post.published_at)}</time>
          <a
            className={styles.link}
            href={post.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Открыть в Telegram"
            title="Открыть в Telegram"
          >
            <ExternalLink size={15} strokeWidth={1.5} />
          </a>
        </div>
      </div>
    </li>
  )
}

export const NewsMessage = memo(NewsMessageView)

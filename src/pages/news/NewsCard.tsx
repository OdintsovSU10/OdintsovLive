import { useState, type FC } from 'react'
import { ExternalLink } from 'lucide-react'
import { formatPostDate } from './newsDates'
import type { INewsPost, NewsBand } from './types'
import styles from './NewsCard.module.css'

interface INewsCardProps {
  post: INewsPost
  channelName: string
}

const BAND_LABELS: Record<NewsBand, string> = {
  critical: 'Критично',
  important: 'Важно',
  normal: 'Обычное',
  noise: 'Шум'
}

export const NewsCard: FC<INewsCardProps> = ({ post, channelName }) => {
  const [showReason, setShowReason] = useState(false)
  const band: NewsBand = post.band ?? 'normal'

  return (
    <li className={styles.card}>
      <div className={styles.top}>
        <span className={`${styles.badge} ${styles[band]}`}>
          {BAND_LABELS[band]}
          {post.importance !== null && <b className={styles.score}>{post.importance}</b>}
        </span>
        <span className={styles.meta}>{channelName}</span>
        <span className={styles.meta}>{formatPostDate(post.published_at)}</span>
        {post.category && <span className={styles.category}>{post.category}</span>}
      </div>

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

      <a className={styles.link} href={post.url} target="_blank" rel="noopener noreferrer">
        Открыть пост
        <ExternalLink size={14} strokeWidth={1.5} />
      </a>
    </li>
  )
}

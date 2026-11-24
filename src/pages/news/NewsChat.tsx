import { useEffect, useLayoutEffect, useMemo, useRef, type FC } from 'react'
import { buildChatDays } from './chatItems'
import { NewsMessage } from './NewsMessage'
import type { INewsPost } from './types'
import styles from './NewsChat.module.css'

interface INewsChatProps {
  posts: INewsPost[]
  loading: boolean
  loadingMore: boolean
  hasMore: boolean
  hasError: boolean
  loadMore: () => Promise<void>
  showChannel: boolean
  channelNames: Map<string, string>
  emptyText: string
}

const SKELETON_COUNT = 4
const PIN_THRESHOLD_PX = 48

// Окно чата: старые сообщения сверху, новые снизу; при открытии — внизу, старые подгружаются при прокрутке вверх.
export const NewsChat: FC<INewsChatProps> = ({
  posts,
  loading,
  loadingMore,
  hasMore,
  hasError,
  loadMore,
  showChannel,
  channelNames,
  emptyText
}) => {
  const panelRef = useRef<HTMLDivElement>(null)
  const topRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  // «прилип» к низу: пока пользователь не ушёл вверх, поздние изменения высоты (шрифты, поворот) не сбивают позицию
  const pinnedRef = useRef(true)
  const prevRef = useRef<{ loading: boolean; oldestId: number | null; height: number }>({
    loading: true,
    oldestId: null,
    height: 0
  })
  const latestRef = useRef({ hasMore, loadingMore, loadMore })
  latestRef.current = { hasMore, loadingMore, loadMore }

  const days = useMemo(() => buildChatDays(posts), [posts])
  const hasPosts = !loading && posts.length > 0

  // Загрузка закончилась — в самый низ; подгрузились старые сверху — удерживаем позицию
  useLayoutEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    const prev = prevRef.current
    const oldestId = loading || posts.length === 0 ? null : posts[posts.length - 1].id
    if (!loading && prev.loading) {
      panel.scrollTop = panel.scrollHeight
      pinnedRef.current = true
    } else if (!loading && prev.oldestId !== null && oldestId !== prev.oldestId) {
      panel.scrollTop += panel.scrollHeight - prev.height
    }
    prevRef.current = { loading, oldestId, height: panel.scrollHeight }
  })

  useEffect(() => {
    const panel = panelRef.current
    const content = contentRef.current
    if (!hasPosts || !panel || !content || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      if (pinnedRef.current) panel.scrollTop = panel.scrollHeight
    })
    observer.observe(panel)
    observer.observe(content)
    return () => observer.disconnect()
  }, [hasPosts])

  const handleScroll = () => {
    const panel = panelRef.current
    if (!panel) return
    pinnedRef.current = panel.scrollHeight - panel.scrollTop - panel.clientHeight <= PIN_THRESHOLD_PX
  }

  // Сторож вверху ленты: доскроллили до него — грузим более старые
  useEffect(() => {
    const panel = panelRef.current
    const top = topRef.current
    if (!hasPosts || !panel || !top || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(entries => {
      const { hasMore: more, loadingMore: busy, loadMore: load } = latestRef.current
      if (entries.some(entry => entry.isIntersecting) && more && !busy) void load()
    }, { root: panel, rootMargin: '120px 0px 0px 0px' })
    observer.observe(top)
    return () => observer.disconnect()
  }, [hasPosts, posts.length])

  return (
    <div ref={panelRef} className={styles.panel} data-news-panel onScroll={handleScroll}>
      {loading ? (
        <div key="skeleton" className={`${styles.skeleton} ${styles.fade}`} aria-busy="true" aria-label="Загрузка новостей">
          {Array.from({ length: SKELETON_COUNT }, (_, index) => <span key={index} className={styles.skeletonBubble} />)}
        </div>
      ) : posts.length === 0 ? (
        !hasError && <div key="empty" className={`${styles.empty} ${styles.fade}`}>{emptyText}</div>
      ) : (
        <div key="content" ref={contentRef} className={`${styles.content} ${styles.fade}`}>
          <div ref={topRef} className={styles.top}>
            {hasMore ? (
              <button type="button" className={styles.moreBtn} disabled={loadingMore} onClick={() => void loadMore()}>
                {loadingMore ? 'Загрузка…' : 'Показать ранее'}
              </button>
            ) : (
              <span className={styles.startNote}>Начало ленты за период</span>
            )}
          </div>

          {days.map(day => (
            <section key={day.key} className={styles.day} aria-label={day.label}>
              <h3 className={styles.dateRow}><span className={styles.dateChip}>{day.label}</span></h3>
              <ul className={styles.list}>
                {day.messages.map(({ post, showHead, newSeries }) => (
                  <NewsMessage
                    key={post.id}
                    post={post}
                    channelName={channelNames.get(post.channel_id) ?? 'Канал удалён'}
                    showChannel={showChannel}
                    showHead={showHead}
                    newSeries={newSeries}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

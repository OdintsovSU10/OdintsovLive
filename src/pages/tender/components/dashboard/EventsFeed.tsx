import { memo, useMemo, type FC } from 'react'
import { ArrowLeft, ArrowRight, Radio } from 'lucide-react'
import type { EmployeeWithStats } from '../../types'
import type { IEmployeeTrend, ITodayPass, PassesMap } from './dashboardTypes'
import { toClock } from './todayMetrics'

interface IEventsFeedProps {
  trends: IEmployeeTrend[]
  passes: PassesMap
  loading: boolean
  onSelectEmployee: (employee: EmployeeWithStats) => void
}

interface IFeedItem extends ITodayPass {
  employee: EmployeeWithStats
}

// Лента длиннее не нужна: старые проходы уходят вниз и видны в карточке сотрудника
const FEED_LIMIT = 300

const ICON_SIZE = 14

// Лента проходов за сегодня по сотрудникам области: новые сверху
const EventsFeedBase: FC<IEventsFeedProps> = ({ trends, passes, loading, onSelectEmployee }) => {
  const items = useMemo<IFeedItem[]>(() => {
    const list: IFeedItem[] = []
    for (const { employee } of trends) {
      for (const pass of passes.get(employee.id) ?? []) list.push({ ...pass, employee })
    }
    return list.sort((left, right) => right.time.localeCompare(left.time) || right.id.localeCompare(left.id))
  }, [trends, passes])

  return (
    <section className="dash-card dash-feed">
      <h3 className="dash-card-title">
        <Radio size={16} strokeWidth={1.75} aria-hidden="true" />
        Проходы сегодня
      </h3>
      <div className="dash-feed-total">Всего проходов: {loading ? '…' : items.length}</div>

      {loading ? (
        <div className="dash-muted-text" role="status">Загружаем проходы…</div>
      ) : items.length === 0 ? (
        <div className="dash-muted-text">Проходов пока нет</div>
      ) : (
        <ul className="dash-feed-list">
          {items.slice(0, FEED_LIMIT).map(item => (
            <li key={item.id}>
              <button
                type="button"
                className={`dash-feed-row ${item.direction === 'entry' ? 'is-entry' : 'is-exit'}`}
                title={item.accessPoint ? `${item.employee.full_name} · ${item.accessPoint}` : item.employee.full_name}
                onClick={() => onSelectEmployee(item.employee)}
              >
                <span className="dash-feed-time">{toClock(item.time)}</span>
                <span
                  className="dash-feed-arrow"
                  role="img"
                  aria-label={item.direction === 'entry' ? 'Вход' : 'Выход'}
                >
                  {item.direction === 'entry'
                    ? <ArrowRight size={ICON_SIZE} strokeWidth={2} />
                    : <ArrowLeft size={ICON_SIZE} strokeWidth={2} />}
                </span>
                <span className="dash-feed-info">
                  <span className="dash-feed-name">{item.employee.full_name}</span>
                  {item.accessPoint && <span className="dash-feed-point">{item.accessPoint}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export const EventsFeed = memo(EventsFeedBase)

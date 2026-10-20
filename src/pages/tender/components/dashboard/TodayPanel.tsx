import { memo, type FC } from 'react'
import type { EmployeeWithStats } from '../../types'
import {
  PRESENCE_LABELS,
  PRESENCE_ORDER,
  type IEmployeeTrend,
  type PresenceMap,
  type PresenceStatus
} from './dashboardTypes'
import { countPresence, getPresenceStatusTone } from './dashboardMetrics'

interface ITodayPanelProps {
  trends: IEmployeeTrend[]
  statuses: PresenceMap
  loading: boolean
  onSelectEmployee: (employee: EmployeeWithStats) => void
}

// Статусы, по которым ниже показываем имена
const LISTED_STATUSES: PresenceStatus[] = ['noMark', 'notYet']

const TodayPanelBase: FC<ITodayPanelProps> = ({ trends, statuses, loading, onSelectEmployee }) => {
  const counts = countPresence(trends, statuses)

  return (
    <section className="dash-card">
      <h3 className="dash-card-title">Сегодня</h3>

      {loading ? (
        <div className="dash-skeleton" role="status">
          <span className="dash-skeleton-line" />
          <span className="dash-skeleton-line short" />
          <span className="dash-muted-text">Загружаем проходы…</span>
        </div>
      ) : (
        <>
          <div className="dash-chips">
            {PRESENCE_ORDER.filter(status => counts[status] > 0).map(status => {
              const tone = getPresenceStatusTone(status)
              return (
                <span key={status} className={`dash-chip${tone ? ` is-${tone}` : ''}${status === 'noMark' ? ' filled' : ''}`}>
                  {PRESENCE_LABELS[status]}
                  <strong>{counts[status]}</strong>
                </span>
              )
            })}
          </div>

          {LISTED_STATUSES.filter(status => counts[status] > 0).map(status => (
            <div key={status} className="dash-name-group">
              <div className="dash-name-group-title">{PRESENCE_LABELS[status]}</div>
              <div className="dash-names">
                {trends
                  .filter(trend => statuses.get(trend.employee.id) === status)
                  .map(trend => (
                    <button
                      key={trend.employee.id}
                      type="button"
                      className={`dash-name-btn tone-${status}`}
                      onClick={() => onSelectEmployee(trend.employee)}
                    >
                      {trend.employee.full_name}
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </>
      )}
    </section>
  )
}

export const TodayPanel = memo(TodayPanelBase)

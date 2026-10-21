import { memo, useMemo, useState, type FC } from 'react'
import { AlertTriangle, OctagonAlert, TrendingUp, type LucideIcon } from 'lucide-react'
import type { EmployeeWithStats } from '../../types'
import type { IAttentionItem, Tone } from './dashboardMetrics'

interface IAttentionListProps {
  items: IAttentionItem[]
  onSelectEmployee: (employee: EmployeeWithStats) => void
}

const VISIBLE_LIMIT = 6
const ICON_SIZE = 16

const TONE_ICONS: Record<Tone, LucideIcon> = {
  bad: OctagonAlert,
  warn: AlertTriangle,
  ok: TrendingUp
}

const AttentionListBase: FC<IAttentionListProps> = ({ items, onSelectEmployee }) => {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? items : items.slice(0, VISIBLE_LIMIT)
  const hiddenCount = items.length - VISIBLE_LIMIT

  const counts = useMemo(() => ({
    bad: items.filter(item => item.tone === 'bad').length,
    warn: items.filter(item => item.tone === 'warn').length
  }), [items])

  return (
    <section className="dash-card">
      <div className="dash-card-head">
        <h3 className="dash-card-title">
          <AlertTriangle size={16} strokeWidth={1.75} aria-hidden="true" />
          Требует внимания
        </h3>
        {(counts.bad > 0 || counts.warn > 0) && (
          <span className="dash-attention-counts">
            {counts.bad > 0 && <span className="tone-text is-bad">{counts.bad} критично</span>}
            {counts.bad > 0 && counts.warn > 0 && ' · '}
            {counts.warn > 0 && <span className="tone-text is-warn">{counts.warn} внимание</span>}
          </span>
        )}
      </div>

      {items.length === 0 ? (
        <div className="dash-muted-text">Всё в порядке</div>
      ) : (
        <>
          <ul className="dash-attention">
            {visible.map(item => {
              const Icon = TONE_ICONS[item.tone]
              return (
                <li key={item.key}>
                  <button
                    type="button"
                    className={`dash-attention-row is-${item.tone}`}
                    onClick={() => onSelectEmployee(item.employee)}
                  >
                    <span className="dash-attention-icon" aria-hidden="true">
                      <Icon size={ICON_SIZE} strokeWidth={1.75} />
                    </span>
                    <span className="dash-attention-name">{item.employee.full_name}</span>
                    <span className="dash-attention-title">{item.title}</span>
                    {item.value && <span className="dash-attention-value">{item.value}</span>}
                  </button>
                </li>
              )
            })}
          </ul>

          {hiddenCount > 0 && (
            <button
              type="button"
              className="dash-more-btn"
              aria-expanded={expanded}
              onClick={() => setExpanded(value => !value)}
            >
              {expanded ? 'Свернуть' : `Ещё ${hiddenCount}`}
            </button>
          )}
        </>
      )}
    </section>
  )
}

export const AttentionList = memo(AttentionListBase)

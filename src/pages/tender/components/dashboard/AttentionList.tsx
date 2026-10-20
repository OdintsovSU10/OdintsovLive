import { memo, useState, type FC } from 'react'
import type { EmployeeWithStats } from '../../types'
import type { IAttentionItem } from './dashboardMetrics'

interface IAttentionListProps {
  items: IAttentionItem[]
  onSelectEmployee: (employee: EmployeeWithStats) => void
}

const VISIBLE_LIMIT = 6

const AttentionListBase: FC<IAttentionListProps> = ({ items, onSelectEmployee }) => {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? items : items.slice(0, VISIBLE_LIMIT)
  const hiddenCount = items.length - VISIBLE_LIMIT

  return (
    <section className="dash-card">
      <h3 className="dash-card-title">Требует внимания</h3>

      {items.length === 0 ? (
        <div className="dash-muted-text">Всё в порядке</div>
      ) : (
        <>
          <ul className="dash-attention">
            {visible.map(item => (
              <li key={item.key}>
                <button
                  type="button"
                  className={`dash-attention-row kind-${item.kind}`}
                  onClick={() => onSelectEmployee(item.employee)}
                >
                  <span className="dash-attention-name">{item.employee.full_name}</span>
                  <span className="dash-attention-title">{item.title}</span>
                  {item.value && <span className="dash-attention-value">{item.value}</span>}
                </button>
              </li>
            ))}
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

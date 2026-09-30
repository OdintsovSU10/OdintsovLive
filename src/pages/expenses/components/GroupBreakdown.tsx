import { X } from 'lucide-react'
import type { GroupStat } from '../hooks/useDashboardStats'
import { formatRub } from '../utils/format'

// Меньше 5% — «без изменений», чтобы не шуметь; больше чем вдвое — показываем кратность
const DELTA_THRESHOLD = 0.05
const RATIO_THRESHOLD = 2

interface Props {
  groups: GroupStat[]
  periodLabel: string
  comparisonLabel: string | null
  onReset?: () => void
}

function renderDelta(value: number, prev: number | null) {
  if (prev === null) return null
  if (prev === 0) return <span className="delta up">новое</span>

  const change = (value - prev) / prev
  if (Math.abs(change) < DELTA_THRESHOLD) return <span className="delta flat">≈</span>

  const text = value / prev > RATIO_THRESHOLD
    ? `×${(value / prev).toLocaleString('ru-RU', { maximumFractionDigits: 1 })}`
    : `${Math.round(Math.abs(change) * 100)}%`
  return <span className={`delta ${change > 0 ? 'up' : 'down'}`}>{change > 0 ? '▲' : '▼'} {text}</span>
}

export function GroupBreakdown({ groups, periodLabel, comparisonLabel, onReset }: Props) {
  const max = Math.max(...groups.map(group => group.value), 0)
  const total = groups.reduce((acc, group) => acc + group.value, 0)

  return (
    <article className={`section-card groups-card ${onReset ? 'selected' : ''}`}>
      <div className="section-header">
        <h3>Куда уходят деньги</h3>
        {onReset && (
          <button className="reset-btn" onClick={onReset}>
            <X size={14} strokeWidth={1.5} />
            Сбросить
          </button>
        )}
      </div>

      <div className="group-period">
        <span>
          {periodLabel}
          {comparisonLabel && <span className="group-compare"> · {comparisonLabel}</span>}
        </span>
        <strong>{formatRub(total)}</strong>
      </div>

      {groups.length === 0 ? (
        <div className="empty-state">Нет расходов за период</div>
      ) : (
        <ul className="group-list">
          {groups.map(group => (
            <li key={group.key} className="group-row">
              <div className="group-head">
                <span className="group-name">
                  <span className="dot" style={{ background: group.color }} />
                  {group.name}
                </span>
                <strong>{formatRub(group.value)}</strong>
              </div>
              <div className="group-foot">
                <div className="share-track">
                  <div
                    className="share-fill"
                    style={{ transform: `scaleX(${max > 0 ? group.value / max : 0})`, background: group.color }}
                  />
                </div>
                <span className="group-meta">
                  {Math.round(group.share * 100)}%
                  {renderDelta(group.value, group.prevValue)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </article>
  )
}

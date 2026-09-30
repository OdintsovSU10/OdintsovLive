import { useState } from 'react'
import { ArrowRight, ChevronDown, X } from 'lucide-react'
import type { BreakdownItem } from '../../utils/buckets'
import { formatRub } from '../../utils/format'

// Меньше 5% — «≈», больше чем вдвое — кратность
const DELTA_THRESHOLD = 0.05
const RATIO_THRESHOLD = 2
// Длинный хвост категорий не растягивает строку сетки — остальное по кнопке
const VISIBLE_ITEMS = 6

interface Props {
  items: BreakdownItem[]
  periodLabel: string
  comparisonLabel: string | null
  onReset?: () => void
  onSelectItem: (item: BreakdownItem) => void
  onOpenJournal: () => void
}

function renderDelta(value: number, prev: number | null) {
  if (prev === null) return null
  if (prev === 0) return <span className="car-delta up">новое</span>

  const change = (value - prev) / prev
  if (Math.abs(change) < DELTA_THRESHOLD) return <span className="car-delta flat">≈</span>

  const text = value / prev > RATIO_THRESHOLD
    ? `×${(value / prev).toLocaleString('ru-RU', { maximumFractionDigits: 1 })}`
    : `${Math.round(Math.abs(change) * 100)}%`
  return <span className={`car-delta ${change > 0 ? 'up' : 'down'}`}>{change > 0 ? '▲' : '▼'} {text}</span>
}

export function CostBreakdown({ items, periodLabel, comparisonLabel, onReset, onSelectItem, onOpenJournal }: Props) {
  const [showAll, setShowAll] = useState(false)
  const max = Math.max(...items.map(item => item.value), 0)
  const hiddenCount = items.length - VISIBLE_ITEMS
  const visible = showAll || hiddenCount <= 0 ? items : items.slice(0, VISIBLE_ITEMS)
  const total = items.reduce((acc, item) => acc + item.value, 0)

  return (
    <article className={`car-card car-breakdown ${onReset ? 'selected' : ''}`}>
      <div className="car-card-header">
        <h3>Куда уходят деньги</h3>
        {onReset && (
          <button type="button" className="car-reset-btn" onClick={onReset}>
            <X size={14} />
            Сбросить
          </button>
        )}
      </div>

      <div className="car-breakdown-period">
        <span>
          {periodLabel}
          {comparisonLabel && <span className="car-muted"> · {comparisonLabel}</span>}
        </span>
        <strong>{formatRub(total)}</strong>
      </div>

      {items.length === 0 ? (
        <p className="car-muted">Нет трат за период</p>
      ) : (
        <ul className="car-share-list">
          {visible.map(item => (
            <li key={item.key}>
              <button type="button" className="car-share-row" onClick={() => onSelectItem(item)}>
                <span className="car-share-head">
                  <span className="car-share-name">
                    <span className="ui-chart-dot" style={{ background: item.color }} />
                    {item.name}
                  </span>
                  <strong>{formatRub(item.value)}</strong>
                </span>
                <span className="car-share-foot">
                  <span className="car-share-track">
                    <span
                      className="car-share-fill"
                      style={{ transform: `scaleX(${max > 0 ? item.value / max : 0})`, background: item.color }}
                    />
                  </span>
                  <span className="car-share-meta">
                    {Math.round(item.share * 100)}%
                    {renderDelta(item.value, item.prevValue)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {items.length > 0 && (
        <div className="car-breakdown-actions">
          {hiddenCount > 0 && (
            <button type="button" className="car-link-btn" aria-expanded={showAll} onClick={() => setShowAll(prev => !prev)}>
              {showAll ? 'Свернуть' : `Показать все (${items.length})`}
              <ChevronDown size={16} className={showAll ? 'car-rotated' : ''} />
            </button>
          )}
          <button type="button" className="car-link-btn" onClick={onOpenJournal}>
            Открыть в журнале
            <ArrowRight size={16} />
          </button>
        </div>
      )}
    </article>
  )
}

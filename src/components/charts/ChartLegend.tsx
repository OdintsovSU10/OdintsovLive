import './charts.css'

export interface LegendItem {
  key: string
  name: string
  color: string
}

interface Props {
  items: LegendItem[]
  hidden: Set<string>
  onToggle: (key: string) => void
}

// Легенда-переключатель: нажатие скрывает/показывает серию
export function ChartLegend({ items, hidden, onToggle }: Props) {
  if (items.length < 2) return null

  return (
    <div className="ui-chart-legend" role="group" aria-label="Серии графика">
      {items.map(item => {
        const isHidden = hidden.has(item.key)
        return (
          <button
            key={item.key}
            type="button"
            className={`ui-chart-legend-item ${isHidden ? 'off' : ''}`}
            aria-pressed={!isHidden}
            onClick={() => onToggle(item.key)}
          >
            <span className="ui-chart-dot" style={{ background: item.color }} />
            {item.name}
          </button>
        )
      })}
    </div>
  )
}

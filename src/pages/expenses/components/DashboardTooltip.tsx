import { formatRub } from '../utils/format'

interface Props {
  active?: boolean
  payload?: Array<{
    name?: string | number
    dataKey?: string | number
    value?: string | number
    color?: string
  }>
  label?: string | number
  showTotal?: boolean
}

export function DashboardTooltip({ active, payload, label, showTotal = false }: Props) {
  if (!active || !payload?.length) return null

  const items = payload
    .filter(item => Number(item.value || 0) > 0)
    .sort((a, b) => Number(b.value || 0) - Number(a.value || 0))
  const total = items.reduce((acc, item) => acc + Number(item.value || 0), 0)

  return (
    <div className="chart-tooltip">
      {label ? <div className="tooltip-label">{label}</div> : null}
      {items.map(item => (
        <div key={`${item.name}-${item.dataKey}`} className="tooltip-row">
          <span className="tooltip-dot" style={{ background: item.color }} />
          <span>{item.name}:</span>
          <strong>{formatRub(Number(item.value || 0))}</strong>
        </div>
      ))}
      {showTotal && items.length > 1 && (
        <div className="tooltip-row tooltip-total">
          <span>Итого:</span>
          <strong>{formatRub(total)}</strong>
        </div>
      )}
    </div>
  )
}

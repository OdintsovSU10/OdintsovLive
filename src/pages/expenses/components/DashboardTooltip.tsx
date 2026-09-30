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
}

export function DashboardTooltip({ active, payload, label }: Props) {
  if (!active || !payload?.length) return null

  return (
    <div className="chart-tooltip">
      {label ? <div className="tooltip-label">{label}</div> : null}
      {payload.map(item => (
        <div key={`${item.name}-${item.dataKey}`} className="tooltip-row">
          <span className="tooltip-dot" style={{ background: item.color }} />
          <span>{item.name}:</span>
          <strong>{formatRub(Number(item.value || 0))}</strong>
        </div>
      ))}
    </div>
  )
}

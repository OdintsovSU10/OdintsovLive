import { formatRub } from './chartUtils'
import './charts.css'

interface TooltipItem {
  name?: string | number
  dataKey?: string | number
  value?: string | number | null
  color?: string
}

interface Props {
  active?: boolean
  payload?: TooltipItem[]
  label?: string | number
  showTotal?: boolean
  formatValue?: (value: number, dataKey: string) => string
  formatLabel?: (label: string | number) => string
}

export function ChartTooltip({
  active,
  payload,
  label,
  showTotal = false,
  formatValue = value => formatRub(value),
  formatLabel
}: Props) {
  if (!active || !payload?.length) return null

  const items = payload
    .filter(item => item.value !== null && item.value !== undefined && Number(item.value) !== 0)
    .sort((a, b) => Number(b.value) - Number(a.value))
  if (items.length === 0) return null

  const total = items.reduce((acc, item) => acc + Number(item.value), 0)
  const title = label === undefined || label === '' ? null : formatLabel ? formatLabel(label) : label

  return (
    <div className="ui-chart-tooltip">
      {title !== null && <div className="ui-chart-tooltip-label">{title}</div>}
      {items.map(item => (
        <div key={`${item.name}-${item.dataKey}`} className="ui-chart-tooltip-row">
          <span className="ui-chart-dot" style={{ background: item.color }} />
          <span>{item.name}</span>
          <strong>{formatValue(Number(item.value), String(item.dataKey))}</strong>
        </div>
      ))}
      {showTotal && items.length > 1 && (
        <div className="ui-chart-tooltip-row ui-chart-tooltip-total">
          <span>Итого</span>
          <strong>{formatRub(total)}</strong>
        </div>
      )}
    </div>
  )
}

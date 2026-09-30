import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { BreakdownItem } from '../hooks/useDashboardStats'
import { CHART_COLORS, formatAxisTick } from '../utils/format'
import { DashboardTooltip } from './DashboardTooltip'

const AXIS_TICK = { fill: 'var(--text-muted)', fontSize: 11 }
const CATEGORY_TICK = { fill: 'var(--text-secondary)', fontSize: 12 }
const ROW_HEIGHT = 30
const LABEL_MAX = 16

const shortLabel = (value: string) => (value.length > LABEL_MAX ? `${value.slice(0, LABEL_MAX - 1)}…` : value)

interface Props {
  items: BreakdownItem[]
  colorOffset: number
}

export function BreakdownChart({ items, colorOffset }: Props) {
  if (items.length === 0) return <div className="empty-state">Нет данных для графика</div>

  return (
    <div className="chart-box" style={{ height: Math.max(160, items.length * ROW_HEIGHT) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={items} layout="vertical" margin={{ left: 0, right: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
          <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={formatAxisTick} />
          <YAxis type="category" dataKey="name" tick={CATEGORY_TICK} axisLine={false} tickLine={false} width={128} tickFormatter={shortLabel} />
          <Tooltip content={<DashboardTooltip />} cursor={{ fill: 'var(--bg-tertiary)' }} />
          <Bar dataKey="value" name="Сумма" radius={[0, 6, 6, 0]}>
            {items.map((item, index) => (
              <Cell key={item.name} fill={CHART_COLORS[(index + colorOffset) % CHART_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

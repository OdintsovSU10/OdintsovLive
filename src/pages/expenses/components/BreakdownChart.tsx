import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { CategoryBreakdownItem } from '../hooks/useDashboardStats'
import { CHART_COLORS, formatAxisTick } from '../utils/format'
import { DashboardTooltip } from './DashboardTooltip'

const AXIS_TICK = { fill: 'var(--text-muted)', fontSize: 11 }
const CATEGORY_TICK = { fill: 'var(--text-secondary)', fontSize: 12 }
const ROW_HEIGHT = 30

interface Props {
  items: CategoryBreakdownItem[]
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
          <YAxis type="category" dataKey="name" tick={CATEGORY_TICK} axisLine={false} tickLine={false} width={112} />
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

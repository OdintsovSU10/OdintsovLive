import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { MONTHS, MONTHS_SHORT } from '../../../lib/constants'
import { ChartLegend } from '../../../components/charts/ChartLegend'
import { ChartTooltip } from '../../../components/charts/ChartTooltip'
import { AXIS_TICK, GRID_STROKE, formatAxisTick } from '../../../components/charts/chartUtils'
import { CHART_ANIMATION_MS, useChartAnimation } from '../../../hooks/useChartAnimation'
import type { IMonthRow } from './MonthsTable'

const FUTURE_OPACITY = 0.4

const SERIES = [
  { key: 'earned', name: 'Начислено', color: 'var(--chart-1)' },
  { key: 'paid', name: 'Выплачено', color: 'var(--chart-2)' }
]

interface IPaymentsChartProps {
  rows: IMonthRow[]
}

export const PaymentsChart = ({ rows }: IPaymentsChartProps) => {
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const animate = useChartAnimation()

  const data = rows.map(row => ({
    name: MONTHS_SHORT[row.monthIndex],
    earned: Math.round(row.earned),
    paid: Math.round(row.paid),
    isFuture: row.isFuture
  }))

  const toggle = (key: string) => {
    setHidden(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <article className="sd-card">
      <h3 className="sd-card-title">Начислено и выплачено</h3>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 8, left: 0, right: 4, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
          <XAxis dataKey="name" tick={AXIS_TICK} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={4} />
          <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={formatAxisTick} width={64} />
          <Tooltip
            content={<ChartTooltip formatLabel={label => MONTHS[MONTHS_SHORT.indexOf(String(label))] ?? String(label)} />}
            cursor={{ fill: 'var(--bg-tertiary)' }}
          />
          {!hidden.has('earned') && (
            <Bar
              dataKey="earned"
              name="Начислено"
              fill="var(--chart-1)"
              radius={[4, 4, 0, 0]}
              maxBarSize={20}
              isAnimationActive={animate}
              animationDuration={CHART_ANIMATION_MS}
            >
              {data.map(item => (
                <Cell key={item.name} fillOpacity={item.isFuture ? FUTURE_OPACITY : 1} />
              ))}
            </Bar>
          )}
          {!hidden.has('paid') && (
            <Bar
              dataKey="paid"
              name="Выплачено"
              fill="var(--chart-2)"
              radius={[4, 4, 0, 0]}
              maxBarSize={20}
              isAnimationActive={animate}
              animationDuration={CHART_ANIMATION_MS}
            />
          )}
        </BarChart>
      </ResponsiveContainer>
      <ChartLegend items={SERIES} hidden={hidden} onToggle={toggle} />
    </article>
  )
}

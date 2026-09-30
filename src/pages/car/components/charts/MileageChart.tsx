import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ChartTooltip } from '../../../../components/charts/ChartTooltip'
import { AXIS_TICK, GRID_STROKE } from '../../../../components/charts/chartUtils'
import { CHART_ANIMATION_MS, useChartAnimation } from '../../../../hooks/useChartAnimation'
import { buildTimeAxis, formatTimeLabel } from '../../utils/dates'
import { formatKmTick, formatMileage, formatNumber } from '../../utils/format'
import type { MileagePoint } from '../../utils/mileage'

interface Props {
  points: MileagePoint[]
  kmPerMonth: number
}

// Наклон линии — интенсивность езды
export function MileageChart({ points, kmPerMonth }: Props) {
  const animate = useChartAnimation()
  const axis = buildTimeAxis(points.map(point => point.time))
  const growth = points.length > 1 ? points[points.length - 1].mileage - points[0].mileage : 0

  return (
    <article className="car-card car-mileage-chart">
      <div className="car-card-header">
        <h3>Пробег</h3>
        <span className="car-muted">≈ {formatNumber(Math.round(kmPerMonth))} км/мес</span>
      </div>

      {growth <= 0 ? (
        <p className="car-muted">За период пробег не менялся — добавьте заправку или ТО с пробегом.</p>
      ) : (
        <div className="car-chart-box small">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 8, left: 0, right: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
              <XAxis dataKey="time" type="number" scale="time" domain={['dataMin', 'dataMax']}
                ticks={axis.ticks} tickFormatter={axis.format} tick={AXIS_TICK} axisLine={false} tickLine={false} />
              <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={formatKmTick} width={44}
                domain={['dataMin', 'dataMax']} />
              <Tooltip
                content={<ChartTooltip formatValue={formatMileage} formatLabel={formatTimeLabel} />}
                cursor={{ stroke: 'var(--border)' }}
              />
              <Area dataKey="mileage" name="Пробег" type="monotone" stroke="var(--chart-4)" strokeWidth={2}
                fill="var(--chart-4)" fillOpacity={0.12} isAnimationActive={animate} animationDuration={CHART_ANIMATION_MS} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </article>
  )
}

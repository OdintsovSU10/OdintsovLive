import { useState } from 'react'
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Fuel } from 'lucide-react'
import { ChartLegend } from '../../../../components/charts/ChartLegend'
import { ChartTooltip } from '../../../../components/charts/ChartTooltip'
import { AXIS_TICK, GRID_STROKE } from '../../../../components/charts/chartUtils'
import { SegmentedControl } from '../../../../components/ui/SegmentedControl'
import { CHART_ANIMATION_MS, useChartAnimation } from '../../../../hooks/useChartAnimation'
import { MIN_CONSUMPTION_INTERVALS } from '../../constants'
import type { ConsumptionInterval } from '../../utils/consumption'
import { buildTimeAxis, formatTimeLabel } from '../../utils/dates'
import type { FuelPricePoint } from '../../utils/fuelPrices'
import { formatMileage, formatNumber, formatRub } from '../../utils/format'

type Mode = 'l100' | 'price'

const MODE_OPTIONS: { value: Mode; label: string }[] = [
  { value: 'l100', label: 'л/100 км' },
  { value: 'price', label: '₽/л' }
]

const PRICE_COLORS = ['var(--chart-3)', 'var(--chart-6)', 'var(--chart-8)', 'var(--chart-7)']

interface Props {
  consumption: ConsumptionInterval[]
  avgL100: number | null
  prices: { types: string[]; points: FuelPricePoint[] }
  onAdd: () => void
}

interface DotProps {
  cx?: number
  cy?: number
  payload?: ConsumptionInterval
}

// Выбросы (частичная заправка, опечатка в пробеге) — цветом опасности
function ConsumptionDot({ cx, cy, payload }: DotProps) {
  if (cx === undefined || cy === undefined || !payload) return null
  return (
    <circle
      cx={cx}
      cy={cy}
      r={payload.outlier ? 5 : 4}
      fill={payload.outlier ? 'var(--danger)' : 'var(--chart-3)'}
      stroke="var(--surface)"
      strokeWidth={1.5}
    />
  )
}

interface ConsumptionTooltipProps {
  active?: boolean
  payload?: { payload?: ConsumptionInterval }[]
}

function ConsumptionTooltip({ active, payload }: ConsumptionTooltipProps) {
  const item = payload?.[0]?.payload
  if (!active || !item) return null
  return (
    <div className="ui-chart-tooltip">
      <div className="ui-chart-tooltip-label">{formatTimeLabel(item.time)}</div>
      <div className="ui-chart-tooltip-row">
        <span>Расход</span>
        <strong>{formatNumber(item.l100, 1)} л/100</strong>
      </div>
      <div className="ui-chart-tooltip-row">
        <span>{formatMileage(item.km)} · {formatNumber(item.liters, 1)} л</span>
      </div>
      {item.outlier && <div className="ui-chart-tooltip-row car-danger-text">Похоже на неполный бак или опечатку</div>}
    </div>
  )
}

export function FuelChart({ consumption, avgL100, prices, onAdd }: Props) {
  const [mode, setMode] = useState<Mode>('l100')
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const animate = useChartAnimation()

  const toggle = (key: string) => {
    setHidden(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const consumptionAxis = buildTimeAxis(consumption.map(item => item.time))
  const priceAxis = buildTimeAxis(prices.points.map(point => point.time))
  const enoughConsumption = consumption.length >= MIN_CONSUMPTION_INTERVALS
  const hasPrices = prices.points.length > 0

  return (
    <article className="car-card car-fuel-chart">
      <div className="car-card-header">
        <h3>Топливо</h3>
        <SegmentedControl options={MODE_OPTIONS} value={mode} onChange={setMode} ariaLabel="Показатель топлива" size="sm" />
      </div>

      {mode === 'l100' && (
        enoughConsumption ? (
          <>
            {avgL100 !== null && (
              <p className="car-muted">В среднем <strong>{formatNumber(avgL100, 1)} л/100 км</strong> · пунктир — среднее</p>
            )}
            <div className="car-chart-box">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={consumption} margin={{ top: 8, left: 0, right: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                  <XAxis dataKey="time" type="number" scale="time" domain={['dataMin', 'dataMax']}
                    ticks={consumptionAxis.ticks} tickFormatter={consumptionAxis.format} tick={AXIS_TICK} axisLine={false} tickLine={false} />
                  <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={36}
                    domain={[(min: number) => Math.max(0, Math.floor(min - 1)), (max: number) => Math.ceil(max + 1)]} />
                  <Tooltip content={<ConsumptionTooltip />} cursor={{ stroke: 'var(--border)' }} />
                  {avgL100 !== null && <ReferenceLine y={avgL100} stroke="var(--text-muted)" strokeDasharray="4 4" />}
                  <Line dataKey="l100" name="Расход" stroke="var(--chart-3)" strokeWidth={2} dot={<ConsumptionDot />}
                    activeDot={{ r: 6 }} isAnimationActive={animate} animationDuration={CHART_ANIMATION_MS} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        ) : (
          <div className="car-empty compact">
            <Fuel size={32} strokeWidth={1.25} />
            <p>
              Для графика расхода нужно {MIN_CONSUMPTION_INTERVALS + 1} заправки подряд с пробегом
              {consumption.length > 0 && ` (есть интервалов: ${consumption.length})`}
            </p>
            <button type="button" className="car-btn ghost" onClick={onAdd}>Добавить заправку</button>
          </div>
        )
      )}

      {mode === 'price' && (
        hasPrices ? (
          <>
            <div className="car-chart-box">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={prices.points} margin={{ top: 8, left: 0, right: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                  <XAxis dataKey="time" type="number" scale="time" domain={['dataMin', 'dataMax']}
                    ticks={priceAxis.ticks} tickFormatter={priceAxis.format} tick={AXIS_TICK} axisLine={false} tickLine={false} />
                  <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={36}
                    domain={[(min: number) => Math.floor(min - 1), (max: number) => Math.ceil(max + 1)]} />
                  <Tooltip
                    content={<ChartTooltip formatValue={value => `${formatRub(value, 2)}/л`} formatLabel={formatTimeLabel} />}
                    cursor={{ stroke: 'var(--border)' }}
                  />
                  {prices.types.filter(type => !hidden.has(type)).map(type => (
                    <Line key={type} dataKey={type} name={type} type="stepAfter" connectNulls
                      stroke={PRICE_COLORS[prices.types.indexOf(type) % PRICE_COLORS.length]} strokeWidth={2}
                      dot={{ r: 3 }} activeDot={{ r: 5 }} isAnimationActive={animate} animationDuration={CHART_ANIMATION_MS} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <ChartLegend
              items={prices.types.map((type, index) => ({ key: type, name: type, color: PRICE_COLORS[index % PRICE_COLORS.length] }))}
              hidden={hidden}
              onToggle={toggle}
            />
          </>
        ) : (
          <div className="car-empty compact">
            <Fuel size={32} strokeWidth={1.25} />
            <p>Нет заправок за период</p>
            <button type="button" className="car-btn ghost" onClick={onAdd}>Добавить заправку</button>
          </div>
        )
      )}
    </article>
  )
}

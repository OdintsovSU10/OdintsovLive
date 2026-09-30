import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { MouseHandlerDataParam } from 'recharts'
import { BarChart3 } from 'lucide-react'
import { ChartLegend } from '../../../../components/charts/ChartLegend'
import { ChartTooltip } from '../../../../components/charts/ChartTooltip'
import { AXIS_TICK, DIMMED_OPACITY, GRID_STROKE, formatAxisTick } from '../../../../components/charts/chartUtils'
import { CHART_ANIMATION_MS, useChartAnimation } from '../../../../hooks/useChartAnimation'
import { KIND_META } from '../../constants'
import type { RecordKind } from '../../types'
import type { CostBucket } from '../../utils/buckets'

// Снизу вверх: бензин — самая частая трата, допы — сверху
const STACK_ORDER: RecordKind[] = ['fuel', 'maintenance', 'expense']

interface Props {
  buckets: CostBucket[]
  selectedKey: string | null
  onSelect: (key: string | null) => void
  onAdd: () => void
}

export function CostByMonthChart({ buckets, selectedKey, onSelect, onAdd }: Props) {
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const animate = useChartAnimation()

  const usedKinds = STACK_ORDER.filter(kind => buckets.some(bucket => bucket[kind] > 0))
  const visibleKinds = usedKinds.filter(kind => !hidden.has(kind))
  const hasData = usedKinds.length > 0
  const isQuarterly = buckets[0]?.key.includes('Q')
  // Ось по уникальному ключу: подписи месяцев разных лет совпадают
  const byKey = new Map(buckets.map(bucket => [bucket.key, bucket]))

  const toggle = (key: string) => {
    setHidden(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // Клик по столбцу — выбрать, повторный — сбросить
  const handleClick = (state: MouseHandlerDataParam) => {
    const bucket = buckets[Number(state.activeIndex)]
    if (!bucket) return
    onSelect(bucket.key === selectedKey ? null : bucket.key)
  }

  return (
    <article className="car-card car-cost-chart">
      <div className="car-card-header">
        <h3>Расходы по {isQuarterly ? 'кварталам' : 'месяцам'}</h3>
        {hasData && <span className="car-muted">{selectedKey ? 'нажмите ещё раз — сброс' : 'нажмите на столбец'}</span>}
      </div>

      {!hasData ? (
        <div className="car-empty compact">
          <BarChart3 size={32} strokeWidth={1.25} />
          <p>Нет трат за период</p>
          <button type="button" className="car-btn ghost" onClick={onAdd}>Добавить запись</button>
        </div>
      ) : (
        <>
          <div className="car-chart-box clickable">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={buckets} margin={{ top: 8, left: 0, right: 4, bottom: 0 }} onClick={handleClick}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                <XAxis dataKey="key" tickFormatter={key => byKey.get(key)?.label ?? key} tick={AXIS_TICK} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={8} />
                <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={formatAxisTick} width={56} />
                <Tooltip
                  content={<ChartTooltip showTotal formatLabel={key => byKey.get(String(key))?.title ?? String(key)} />}
                  cursor={{ fill: 'var(--bg-tertiary)' }}
                />
                {visibleKinds.map((kind, index) => (
                  <Bar
                    key={kind}
                    dataKey={kind}
                    name={KIND_META[kind].label}
                    stackId="cost"
                    fill={KIND_META[kind].color}
                    radius={index === visibleKinds.length - 1 ? [4, 4, 0, 0] : undefined}
                    maxBarSize={44}
                    isAnimationActive={animate}
                    animationDuration={CHART_ANIMATION_MS}
                  >
                    {buckets.map(bucket => (
                      <Cell key={bucket.key} fillOpacity={selectedKey && bucket.key !== selectedKey ? DIMMED_OPACITY : 1} />
                    ))}
                  </Bar>
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <ChartLegend
            items={usedKinds.map(kind => ({ key: kind, name: KIND_META[kind].label, color: KIND_META[kind].color }))}
            hidden={hidden}
            onToggle={toggle}
          />
        </>
      )}
    </article>
  )
}

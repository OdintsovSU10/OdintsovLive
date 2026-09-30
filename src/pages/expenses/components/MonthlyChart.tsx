import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { MouseHandlerDataParam } from 'recharts'
import type { MonthStat } from '../hooks/useDashboardStats'
import { formatAxisTick } from '../utils/format'
import { SPENDING_GROUPS } from '../utils/spendingGroups'
import { DashboardTooltip } from './DashboardTooltip'

const AXIS_TICK = { fill: 'var(--text-muted)', fontSize: 11 }
const DIMMED_OPACITY = 0.3

interface Props {
  months: MonthStat[]
  selectedKey: string | null
  onSelect: (key: string | null) => void
}

export function MonthlyChart({ months, selectedKey, onSelect }: Props) {
  const usedGroups = SPENDING_GROUPS.filter(group => months.some(month => Number(month[group.key]) > 0))
  const hasPartial = months.some(month => month.partial)

  // Клик по месяцу — выбрать, повторный клик — сбросить
  const handleClick = (state: MouseHandlerDataParam) => {
    const month = months[Number(state.activeIndex)]
    if (!month) return
    onSelect(month.key === selectedKey ? null : month.key)
  }

  return (
    <article className="section-card monthly-card">
      <div className="section-header">
        <h3>Расходы по месяцам</h3>
        <span className="table-meta">{selectedKey ? 'повторное нажатие — сброс' : 'нажмите на месяц'}</span>
      </div>

      {months.length === 0 ? (
        <div className="empty-state">Нет данных для графика</div>
      ) : (
        <>
          <div className="chart-box clickable">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={months} margin={{ left: 0, right: 4 }} onClick={handleClick}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="name" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={formatAxisTick} width={60} />
                <Tooltip content={<DashboardTooltip showTotal />} cursor={{ fill: 'var(--bg-tertiary)' }} />
                <Legend iconType="circle" iconSize={8} />
                {usedGroups.map((group, index) => (
                  <Bar
                    key={group.key}
                    dataKey={group.key}
                    name={group.name}
                    stackId="spend"
                    fill={group.color}
                    radius={index === usedGroups.length - 1 ? [4, 4, 0, 0] : undefined}
                    maxBarSize={48}
                  >
                    {months.map(month => (
                      <Cell
                        key={month.key}
                        fillOpacity={selectedKey && month.key !== selectedKey ? DIMMED_OPACITY : 1}
                      />
                    ))}
                  </Bar>
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="chart-note">
            Без переводов между своими счетами.{hasPartial && ' * — месяц загружен не полностью.'}
          </p>
        </>
      )}
    </article>
  )
}

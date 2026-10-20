import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatFullDate, formatNum, formatShortDate } from '../bodyFormat'

const AXIS_TICK = { fill: 'var(--text-muted)', fontSize: 11 }

export interface ITrendPoint {
  date: string
  value: number
}

interface IProps {
  points: ITrendPoint[]
  unit: string
  decimals: number
}

interface ITipProps {
  active?: boolean
  payload?: { payload?: ITrendPoint }[]
  unit: string
  decimals: number
}

const TrendTip = ({ active, payload, unit, decimals }: ITipProps) => {
  const point = payload?.[0]?.payload
  if (!active || !point) return null
  return (
    <div className="ui-chart-tooltip">
      {formatFullDate(point.date)}: <strong>{formatNum(point.value, decimals)} {unit}</strong>
    </div>
  )
}

// Линия по датам: одна точка на дату, Y — от min−1 до max+1
export const TrendChart = ({ points, unit, decimals }: IProps) => (
  <div className="body-chart">
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={points} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="date"
          tick={AXIS_TICK}
          tickFormatter={formatShortDate}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
          minTickGap={24}
        />
        <YAxis
          tick={AXIS_TICK}
          axisLine={false}
          tickLine={false}
          width={40}
          domain={[(min: number) => Math.floor(min - 1), (max: number) => Math.ceil(max + 1)]}
        />
        <Tooltip content={<TrendTip unit={unit} decimals={decimals} />} />
        <Line
          type="monotone"
          dataKey="value"
          stroke="var(--primary)"
          strokeWidth={2}
          dot={{ r: 3, fill: 'var(--primary)', stroke: 'var(--primary)' }}
          activeDot={{ r: 5 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  </div>
)

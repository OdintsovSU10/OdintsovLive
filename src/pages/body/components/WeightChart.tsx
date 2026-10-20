import { useMemo, useState } from 'react'
import { SegmentedControl } from '../../../components/ui/SegmentedControl'
import { toLocalIsoDate } from '../../../lib/dateUtils'
import { addMonths } from '../bodyFormat'
import type { IBodyWeight } from '../bodyParamsConfig'
import { TrendChart } from './TrendChart'

type Period = 'month' | '3m' | 'year' | 'all'

const OPTIONS: { value: Period; label: string }[] = [
  { value: 'month', label: 'Месяц' },
  { value: '3m', label: '3 мес' },
  { value: 'year', label: 'Год' },
  { value: 'all', label: 'Всё' }
]

const PERIOD_MONTHS: Record<Exclude<Period, 'all'>, number> = { month: -1, '3m': -3, year: -12 }

interface IProps {
  records: IBodyWeight[]
}

export const WeightChart = ({ records }: IProps) => {
  const [period, setPeriod] = useState<Period>('3m')

  const points = useMemo(() => {
    const from = period === 'all' ? null : addMonths(toLocalIsoDate(), PERIOD_MONTHS[period])
    return records
      .filter(r => from === null || r.date >= from)
      .map(r => ({ date: r.date, value: r.weight }))
  }, [records, period])

  return (
    <div className="body-chart-block">
      <SegmentedControl options={OPTIONS} value={period} onChange={setPeriod} ariaLabel="Период графика" stretch />
      {points.length < 2 ? (
        <p className="body-muted body-chart-empty">Мало записей за период — нужно минимум 2</p>
      ) : (
        <TrendChart points={points} unit="кг" decimals={2} />
      )}
    </div>
  )
}

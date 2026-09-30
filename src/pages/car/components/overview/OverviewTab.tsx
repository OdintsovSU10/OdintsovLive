import { useMemo, useState } from 'react'
import { SegmentedControl } from '../../../../components/ui/SegmentedControl'
import { PERIOD_OPTIONS } from '../../constants'
import type { CarStats } from '../../hooks/useCarStats'
import type { JournalEntry, JournalFilter, PeriodPreset, RecordKind } from '../../types'
import { buildBreakdown, previousBucketRange } from '../../utils/buckets'
import type { BreakdownItem } from '../../utils/buckets'
import { formatDate } from '../../utils/dates'
import { CostBreakdown } from '../charts/CostBreakdown'
import { CostByMonthChart } from '../charts/CostByMonthChart'
import { FuelChart } from '../charts/FuelChart'
import { MileageChart } from '../charts/MileageChart'
import { KpiGrid } from './KpiGrid'
import { ServiceDueCard } from './ServiceDueCard'

interface Props {
  stats: CarStats
  entries: JournalEntry[]
  period: PeriodPreset
  onPeriodChange: (period: PeriodPreset) => void
  onOpenJournal: (filter: Pick<JournalFilter, 'range' | 'group'>) => void
  onAdd: (kind?: RecordKind) => void
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function OverviewTab({ stats, entries, period, onPeriodChange, onOpenJournal, onAdd }: Props) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const { ranges, kpi, buckets, breakdown, consumption, fuelPrices, mileage, serviceDue } = stats

  // Выбранный столбец мог пропасть после смены периода
  const selectedBucket = buckets.find(bucket => bucket.key === selectedKey) ?? null
  const bucketBreakdown = useMemo(
    () => selectedBucket ? buildBreakdown(entries, selectedBucket.range, previousBucketRange(selectedBucket)) : null,
    [entries, selectedBucket]
  )

  const periodLabel = capitalize(ranges.label)
  const journalRange = selectedBucket
    ? { ...selectedBucket.range, label: selectedBucket.title }
    : { ...ranges.current, label: periodLabel }

  const openGroup = (item: BreakdownItem) => onOpenJournal({ range: journalRange, group: { key: item.key, label: item.name } })

  return (
    <div className="car-overview">
      <div className="car-overview-toolbar">
        <SegmentedControl options={PERIOD_OPTIONS} value={period} onChange={onPeriodChange} ariaLabel="Период" />
        <span className="car-muted">{formatDate(ranges.current.from)} — {formatDate(ranges.current.to)}</span>
      </div>

      <KpiGrid kpi={kpi} />

      {/* Десктоп — две колонки; на телефоне порядок карточек задаёт CSS order */}
      <div className="car-overview-grid">
        <div className="car-overview-main">
          <CostByMonthChart buckets={buckets} selectedKey={selectedBucket?.key ?? null} onSelect={setSelectedKey} onAdd={() => onAdd()} />
          <FuelChart consumption={consumption} avgL100={kpi.l100} prices={fuelPrices} onAdd={() => onAdd('fuel')} />
        </div>

        <div className="car-overview-side">
          {selectedBucket && bucketBreakdown ? (
            <CostBreakdown
              items={bucketBreakdown}
              periodLabel={selectedBucket.title}
              comparisonLabel={selectedBucket.key.includes('Q') ? 'к прошлому кварталу' : 'к прошлому месяцу'}
              onReset={() => setSelectedKey(null)}
              onSelectItem={openGroup}
              onOpenJournal={() => onOpenJournal({ range: journalRange, group: null })}
            />
          ) : (
            <CostBreakdown
              items={breakdown}
              periodLabel={periodLabel}
              comparisonLabel={ranges.previous ? 'к прошлому периоду' : null}
              onSelectItem={openGroup}
              onOpenJournal={() => onOpenJournal({ range: journalRange, group: null })}
            />
          )}
          <ServiceDueCard due={serviceDue} onAdd={() => onAdd('maintenance')} />
          <MileageChart points={mileage} kmPerMonth={kpi.kmPerMonth} />
        </div>
      </div>
    </div>
  )
}

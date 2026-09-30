import { Car } from 'lucide-react'
import { SERVICE_WARNING_SHARE } from '../car/constants'
import { useCarRecords } from '../car/hooks/useCarRecords'
import { useCarStats } from '../car/hooks/useCarStats'
import { useCars } from '../car/hooks/useCars'
import { useJournalEntries } from '../car/hooks/useJournalEntries'
import { formatMileage, formatNumber, formatRub } from '../car/utils/format'
import type { ServiceDue } from '../car/utils/serviceDue'
import { CardPlaceholder, HomeCard, type CardTone } from './HomeCard'

const serviceTone = (due: ServiceDue): CardTone =>
  due.progress >= 1 ? 'danger' : due.progress >= SERVICE_WARNING_SHARE ? 'warning' : 'ok'

const serviceText = (due: ServiceDue): string => {
  if (due.progress >= 1) return 'Пора на ТО'
  return due.kmLeft !== null ? `ТО через ${formatMileage(due.kmLeft)}` : `ТО через ${due.monthsLeft} мес.`
}

// Выбранная на странице «Машина» машина: ТО, расход и траты за 3 месяца
export function CarSummaryCard() {
  const { selectedCar: car, loading, loadCars } = useCars()
  const records = useCarRecords(car, loadCars)
  const { entries, intervals } = useJournalEntries(records.maintenance, records.fuel, records.expenses)
  const stats = useCarStats({
    car, entries, maintenance: records.maintenance, fuel: records.fuel, intervals, period: '3m'
  })

  if (loading || records.loading) {
    return <HomeCard Icon={Car} title="Машина" to="/car"><CardPlaceholder /></HomeCard>
  }
  if (!car || !stats) {
    return <HomeCard Icon={Car} title="Машина" to="/car"><CardPlaceholder text="Машина не добавлена" /></HomeCard>
  }

  const due = stats.serviceDue

  return (
    <HomeCard Icon={Car} title="Машина" to="/car" aside={`${car.brand} ${car.model}`} tone={due ? serviceTone(due) : undefined}>
      <div className="home-value small">{due ? serviceText(due) : 'ТО не отмечено'}</div>
      {due && (
        <div className="home-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(due.progress, 1) * 100)}>
          <div className="home-progress-fill" style={{ transform: `scaleX(${Math.min(due.progress, 1)})` }} />
        </div>
      )}
      {due && due.progress < 1 && due.kmLeft !== null && <div className="home-hint">или через {due.monthsLeft} мес.</div>}
      <div className="home-rows">
        <div className="home-row"><span>Пробег</span><span>{formatMileage(car.current_mileage)}</span></div>
        <div className="home-row">
          <span>Расход за 3 мес.</span>
          <span>{stats.kpi.l100 !== null ? `${formatNumber(stats.kpi.l100, 1)} л/100 км` : '—'}</span>
        </div>
        <div className="home-row"><span>Траты за 3 мес.</span><span>{formatRub(stats.kpi.spent)}</span></div>
      </div>
    </HomeCard>
  )
}

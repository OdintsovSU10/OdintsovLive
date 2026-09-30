import { Wrench } from 'lucide-react'
import { SERVICE_INTERVAL_KM, SERVICE_INTERVAL_MONTHS, SERVICE_WARNING_SHARE } from '../../constants'
import { formatDayShort } from '../../utils/dates'
import { formatMileage, formatNumber, plural } from '../../utils/format'
import type { ServiceDue } from '../../utils/serviceDue'

interface Props {
  due: ServiceDue | null
  onAdd: () => void
}

const MONTH_FORMS: [string, string, string] = ['месяц', 'месяца', 'месяцев']

function describeLeft(due: ServiceDue): string {
  if (due.progress >= 1) return 'Пора на ТО'
  const parts = [
    due.kmLeft !== null ? `${formatNumber(due.kmLeft)} км` : null,
    `${due.monthsLeft} ${plural(due.monthsLeft, MONTH_FORMS)}`
  ].filter(Boolean)
  return `через ${parts.join(' или ')}`
}

export function ServiceDueCard({ due, onAdd }: Props) {
  if (!due) {
    return (
      <article className="car-card car-service">
        <div className="car-card-header"><h3>Следующее ТО</h3></div>
        <p className="car-muted">
          Добавьте ТО или замену масла — посчитаем, когда следующее
          (каждые {formatNumber(SERVICE_INTERVAL_KM)} км или {SERVICE_INTERVAL_MONTHS} мес.).
        </p>
        <button type="button" className="car-btn ghost" onClick={onAdd}>
          <Wrench size={18} />
          <span>Добавить ТО</span>
        </button>
      </article>
    )
  }

  const tone = due.progress >= 1 ? 'danger' : due.progress >= SERVICE_WARNING_SHARE ? 'warning' : 'ok'
  const since = [
    `${formatDayShort(due.date, true)}`,
    due.kmSince !== null ? `${formatMileage(due.kmSince)} назад` : null
  ].filter(Boolean).join(' · ')

  return (
    <article className={`car-card car-service ${tone}`}>
      <div className="car-card-header"><h3>Следующее ТО</h3></div>
      <div className="car-service-left">{describeLeft(due)}</div>
      <div
        className="car-progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(Math.min(due.progress, 1) * 100)}
        aria-label="Прошло от интервала ТО"
      >
        <div className="car-progress-fill" style={{ transform: `scaleX(${Math.min(due.progress, 1)})` }} />
      </div>
      <p className="car-muted">Последнее: {due.title} · {since}</p>
    </article>
  )
}

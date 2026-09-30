import type { CSSProperties } from 'react'
import { SERVICE_INTERVAL_KM, SERVICE_WARNING_SHARE } from '../../constants'
import { formatDayShort } from '../../utils/dates'
import { formatMileage, formatNumber } from '../../utils/format'
import type { ServiceDue } from '../../utils/serviceDue'

interface Props {
  due: ServiceDue | null
  onAdd: () => void
}

const TONE_COLORS = {
  ok: 'var(--chart-4)',
  warning: 'var(--chart-warning)',
  danger: 'var(--danger)'
}

// Карточка в ряду KPI: сколько осталось до ТО по пробегу или сроку — что раньше
export function ServiceDueCard({ due, onAdd }: Props) {
  if (!due) {
    return (
      <article className="car-kpi car-kpi-service" style={{ '--kpi-color': TONE_COLORS.ok } as CSSProperties}>
        <div className="car-kpi-label">Следующее ТО</div>
        <div className="car-kpi-value">—</div>
        <button type="button" className="car-kpi-link" onClick={onAdd}>
          Отметить ТО — посчитаем интервал {formatNumber(SERVICE_INTERVAL_KM)} км
        </button>
      </article>
    )
  }

  const tone = due.progress >= 1 ? 'danger' : due.progress >= SERVICE_WARNING_SHARE ? 'warning' : 'ok'
  const value = due.progress >= 1
    ? 'Пора на ТО'
    : due.kmLeft !== null ? `через ${formatMileage(due.kmLeft)}` : `через ${due.monthsLeft} мес.`
  const hint = due.progress >= 1
    ? (due.kmSince !== null ? `прошло ${formatMileage(due.kmSince)}` : `прошло ${due.monthsSince} мес.`)
    : (due.kmLeft !== null ? `или ${due.monthsLeft} мес.` : 'пробег последнего ТО не указан')
  const last = `${due.title} · ${formatDayShort(due.date, true)}`

  return (
    <article
      className={`car-kpi car-kpi-service ${tone}`}
      style={{ '--kpi-color': TONE_COLORS[tone] } as CSSProperties}
      title={`Последнее: ${last}${due.kmSince !== null ? ` · ${formatMileage(due.kmSince)} назад` : ''}`}
    >
      <div className="car-kpi-label">Следующее ТО</div>
      <div className="car-kpi-value">{value}</div>
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
      <div className="car-kpi-hint">{hint}</div>
      <div className="car-kpi-hint car-kpi-last">{last}</div>
    </article>
  )
}

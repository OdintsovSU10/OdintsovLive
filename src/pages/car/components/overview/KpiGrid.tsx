import type { CSSProperties } from 'react'
import type { CarKpi } from '../../hooks/useCarStats'
import { formatNumber, formatRub } from '../../utils/format'

interface Props {
  kpi: CarKpi
}

interface Change {
  text: string
  tone: 'up' | 'down' | 'flat'
}

// Для всех метрик машины рост — это плохо (дороже, больше расход)
function describeChange(current: number | null, prev: number | null): Change | null {
  if (current === null || prev === null || prev <= 0) return null
  const percent = Math.round(Math.abs((current - prev) / prev) * 100)
  if (percent === 0) return { text: 'как в прошлом периоде', tone: 'flat' }
  return current > prev
    ? { text: `▲ ${percent}% к прошлому`, tone: 'up' }
    : { text: `▼ ${percent}% к прошлому`, tone: 'down' }
}

interface CardProps {
  label: string
  value: string
  color: string
  change?: Change | null
  hint?: string
}

function KpiCard({ label, value, color, change, hint }: CardProps) {
  return (
    <article className="car-kpi" style={{ '--kpi-color': color } as CSSProperties}>
      <div className="car-kpi-label">{label}</div>
      <div className="car-kpi-value">{value}</div>
      {change ? (
        <div className={`car-kpi-hint ${change.tone}`}>{change.text}</div>
      ) : hint ? (
        <div className="car-kpi-hint">{hint}</div>
      ) : null}
    </article>
  )
}

export function KpiGrid({ kpi }: Props) {
  return (
    <section className="car-kpi-grid" aria-label="Показатели за период">
      <KpiCard
        label="Расходы"
        value={formatRub(kpi.spent)}
        color="var(--chart-1)"
        change={describeChange(kpi.spent, kpi.prevSpent)}
        hint="ТО, бензин и допы"
      />
      <KpiCard
        label="Рублей на км"
        value={kpi.perKm !== null ? formatRub(kpi.perKm, 1) : '—'}
        color="var(--chart-7)"
        change={describeChange(kpi.perKm, kpi.prevPerKm)}
        hint={kpi.perKm === null ? 'нет пробега за период' : undefined}
      />
      <KpiCard
        label="Расход топлива"
        value={kpi.l100 !== null ? `${formatNumber(kpi.l100, 1)} л/100` : '—'}
        color="var(--chart-3)"
        change={describeChange(kpi.l100, kpi.prevL100)}
        hint={kpi.l100 === null ? 'нужны 2 заправки с пробегом' : undefined}
      />
      <KpiCard
        label="Пробег в месяц"
        value={`${formatNumber(Math.round(kpi.kmPerMonth))} км`}
        color="var(--chart-4)"
        hint={`${formatNumber(Math.round(kpi.km))} км за период`}
      />
    </section>
  )
}

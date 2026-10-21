import { memo, type FC } from 'react'
import { Clock } from 'lucide-react'
import { getPercentOf } from './dashboardFormat'
import type { IPunctuality } from './todayMetrics'

interface IPunctualityCardProps {
  punctuality: IPunctuality
  loading: boolean
}

// Окружность кольца при r=42
const CIRCUMFERENCE = 2 * Math.PI * 42

interface ILegendRow {
  key: string
  label: string
  value: number
}

// Пунктуальность по первому входу сегодня: кольцо «вовремя» и легенда
const PunctualityCardBase: FC<IPunctualityCardProps> = ({ punctuality, loading }) => {
  const { total } = punctuality
  const onTimePercent = Math.round(getPercentOf(punctuality.onTime, total))
  const offset = CIRCUMFERENCE - (onTimePercent / 100) * CIRCUMFERENCE

  const rows: ILegendRow[] = [
    { key: 'ok', label: 'До 09:00', value: punctuality.onTime },
    { key: 'warn', label: '09:01–09:15', value: punctuality.slightlyLate },
    { key: 'bad', label: 'После 09:15', value: punctuality.veryLate },
    { key: 'muted', label: 'Не пришли', value: punctuality.absent }
  ]

  return (
    <section className="dash-card">
      <h3 className="dash-card-title">
        <Clock size={16} strokeWidth={1.75} aria-hidden="true" />
        Пунктуальность сегодня
      </h3>

      {loading ? (
        <div className="dash-muted-text" role="status">Загружаем проходы…</div>
      ) : (
        <div className="dash-punct">
          <div className="dash-ring" role="img" aria-label={`Вовремя: ${onTimePercent}%`}>
            <svg viewBox="0 0 100 100" focusable="false" aria-hidden="true">
              <circle className="dash-ring-track" cx="50" cy="50" r="42" />
              <circle
                className="dash-ring-value"
                cx="50"
                cy="50"
                r="42"
                strokeDasharray={CIRCUMFERENCE}
                strokeDashoffset={offset}
              />
            </svg>
            <div className="dash-ring-text">
              <span>{total > 0 ? `${onTimePercent}%` : '—'}</span>
              <small>вовремя</small>
            </div>
          </div>

          <ul className="dash-legend">
            {rows.map(row => (
              <li key={row.key} className="dash-legend-row">
                <span className="dash-legend-label">
                  <span className={`dash-legend-dot is-${row.key}`} aria-hidden="true" />
                  {row.label}
                </span>
                <span className="dash-legend-value">
                  {row.value}
                  <span className="dash-legend-percent">{Math.round(getPercentOf(row.value, total))}%</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

export const PunctualityCard = memo(PunctualityCardBase)

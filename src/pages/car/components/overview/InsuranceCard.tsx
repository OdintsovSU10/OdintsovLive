import type { CarType } from '../../types'
import { formatDate, isoToTime, todayIso } from '../../utils/dates'

interface Props {
  car: CarType
}

const DAY_MS = 24 * 60 * 60 * 1000
const WARNING_DAYS = 30

type Tone = 'ok' | 'warning' | 'danger'

function describe(daysLeft: number): { tone: Tone; text: string } {
  if (daysLeft < 0) return { tone: 'danger', text: `просрочено на ${-daysLeft} дн.` }
  if (daysLeft === 0) return { tone: 'warning', text: 'истекает сегодня' }
  return { tone: daysLeft <= WARNING_DAYS ? 'warning' : 'ok', text: `осталось ${daysLeft} дн.` }
}

// Сроки страховок: строка на каждую заданную дату
export function InsuranceCard({ car }: Props) {
  const today = isoToTime(todayIso())
  const rows = [
    { key: 'osago', label: 'ОСАГО', until: car.osago_until },
    { key: 'kasko', label: 'КАСКО', until: car.kasko_until }
  ].filter((row): row is { key: string; label: string; until: string } => Boolean(row.until))

  if (rows.length === 0) return null

  return (
    <article className="car-card car-insurance">
      {rows.map(row => {
        const { tone, text } = describe(Math.round((isoToTime(row.until) - today) / DAY_MS))
        return (
          <p key={row.key} className={`car-insurance-row ${tone}`}>
            {row.label} до {formatDate(row.until)} · {text}
          </p>
        )
      })}
    </article>
  )
}

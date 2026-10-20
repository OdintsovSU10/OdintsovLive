const RING_RADIUS = 42
const RING_LENGTH = 2 * Math.PI * RING_RADIUS

interface Props {
  // Число в кольце; null — кольцо без заливки, число не показывается
  total: number | null
  // Класс цвета грейда (score-good и т.п.): кладётся на родителя и задаёт --tone
  className: string
  // Показывать число внутри кольца
  showValue?: boolean
}

// Кольцо оценки: размер задаёт CSS родителя, число — моноширинным шрифтом внутри
export function ScoreRing({ total, className, showValue = true }: Props) {
  const filled = total === null ? 0 : (Math.min(100, total) / 100) * RING_LENGTH
  return (
    <span className={`emp-score-ring ${className}`} aria-hidden="true">
      <svg viewBox="0 0 100 100">
        <circle className="track" cx="50" cy="50" r={RING_RADIUS} />
        <circle
          className="value"
          cx="50"
          cy="50"
          r={RING_RADIUS}
          strokeDasharray={`${filled} ${RING_LENGTH}`}
          transform="rotate(-90 50 50)"
        />
      </svg>
      {showValue && total !== null && <strong>{total}</strong>}
    </span>
  )
}

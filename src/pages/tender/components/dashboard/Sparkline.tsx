import type { FC } from 'react'

interface ISparklineProps {
  data: number[]
  width?: number
  height?: number
}

// Мини-график начислений по месяцам окна
export const Sparkline: FC<ISparklineProps> = ({ data, width = 110, height = 32 }) => {
  if (data.length < 2) {
    return <span className="dash-sparkline-empty">—</span>
  }

  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1

  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * (width - 4) + 2
    const y = height - ((value - min) / range) * (height - 6) - 3
    return { x, y }
  })
  const last = points[points.length - 1]

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="dash-sparkline" aria-hidden="true" focusable="false">
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points.map(point => `${point.x},${point.y}`).join(' ')}
      />
      <circle cx={last.x} cy={last.y} r="2.8" fill="currentColor" />
    </svg>
  )
}

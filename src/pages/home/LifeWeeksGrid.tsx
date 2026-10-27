import { useMemo } from 'react'
import { gradientColor, LIFE_MAX_COLS, LIFE_YEARS, rgbCss, type ILifeModel } from './lifeWeeks'

interface Props {
  model: ILifeModel
}

// Геометрия в единицах viewBox (как в картинке бота)
const CELL = 10
const GAP = 3
const DECADE_GAP = 6
const LEFT = 38
const TOP = 30
const FONT = 20
const GRID_W = LIFE_MAX_COLS * CELL + (LIFE_MAX_COLS - 1) * GAP
const GRID_H = LIFE_YEARS * CELL + (LIFE_YEARS - 1) * GAP + (LIFE_YEARS / 10 - 1) * DECADE_GAP
const VIEW_W = LEFT + GRID_W
const VIEW_H = TOP + GRID_H
const WEEK_LABELS = [1, 10, 20, 30, 40, 52]
const YEAR_LABELS = Array.from({ length: LIFE_YEARS / 10 }, (_, i) => i * 10)

const cellX = (col: number) => LEFT + col * (CELL + GAP)
const cellY = (row: number) => TOP + row * (CELL + GAP) + Math.floor(row / 10) * DECADE_GAP

// Сетка 90 строк (годы) × до 53 клеток (недели). Прожитые — цвет градиента, будущие — бледные
export const LifeWeeksGrid = ({ model }: Props) => {
  const { first, stats, marks } = model

  const cells = useMemo(() => {
    const markColors = new Map<number, string>()
    marks.forEach(mark => {
      if (!markColors.has(mark.week)) markColors.set(mark.week, mark.color)
    })
    const items = []
    for (let row = 0; row < LIFE_YEARS; row++) {
      for (let k = first[row]; k < first[row + 1]; k++) {
        const x = cellX(k - first[row])
        const y = cellY(row)
        const mark = markColors.get(k)
        if (k === stats.weeksLived) {
          // текущая неделя — сплошная (цвет в CSS: в тёмной теме красная, иначе сливается с белой памятной датой)
          items.push(<rect key={k} className="life-grid-current" x={x} y={y} width={CELL} height={CELL} />)
          if (mark) items.push(<rect key={`m${k}`} x={x + 2} y={y + 2} width={CELL - 4} height={CELL - 4} fill={mark} />)
        } else if (mark) {
          items.push(<rect key={k} x={x + 0.5} y={y + 0.5} width={CELL - 1} height={CELL - 1} fill={mark} stroke="var(--text-primary)" strokeWidth={1} />)
        } else {
          const color = rgbCss(gradientColor(k, stats.total))
          if (k < stats.weeksLived) {
            items.push(<rect key={k} x={x} y={y} width={CELL} height={CELL} fill={color} />)
          } else {
            items.push(
              <rect
                key={k}
                x={x + 0.5}
                y={y + 0.5}
                width={CELL - 1}
                height={CELL - 1}
                fill={`color-mix(in srgb, ${color} 14%, var(--surface))`}
                stroke={`color-mix(in srgb, ${color} 45%, var(--surface))`}
                strokeWidth={1}
              />
            )
          }
        }
      }
    }
    return items
  }, [first, stats.weeksLived, stats.total, marks])

  return (
    <svg className="life-grid" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} role="img" aria-label="Сетка недель жизни: 90 лет по неделям">
      {WEEK_LABELS.map(week => (
        <text key={week} className="life-grid-label" x={cellX(week - 1) + CELL / 2} y={TOP - 8} fontSize={FONT} textAnchor="middle">
          {week}
        </text>
      ))}
      {YEAR_LABELS.map(year => (
        <text key={year} className="life-grid-label" x={LEFT - 6} y={cellY(year) + CELL / 2} fontSize={FONT} textAnchor="end" dominantBaseline="central">
          {year}
        </text>
      ))}
      {cells}
    </svg>
  )
}

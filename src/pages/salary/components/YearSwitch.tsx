import type { FC } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { YEARS } from '../../../lib/constants'

interface IYearSwitchProps {
  year: number
  onChange: (year: number) => void
}

const FIRST_YEAR = YEARS[0]
const LAST_YEAR = YEARS[YEARS.length - 1]

export const YearSwitch: FC<IYearSwitchProps> = ({ year, onChange }) => (
  <div className="year-switch">
    <button
      type="button"
      className="year-switch-btn"
      aria-label="Предыдущий год"
      onClick={() => onChange(Math.max(FIRST_YEAR, year - 1))}
      disabled={year <= FIRST_YEAR}
    >
      <ChevronLeft size={20} />
    </button>
    <select
      className="year-switch-select"
      aria-label="Год"
      value={year}
      onChange={e => onChange(Number(e.target.value))}
    >
      {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
    </select>
    <button
      type="button"
      className="year-switch-btn"
      aria-label="Следующий год"
      onClick={() => onChange(Math.min(LAST_YEAR, year + 1))}
      disabled={year >= LAST_YEAR}
    >
      <ChevronRight size={20} />
    </button>
  </div>
)

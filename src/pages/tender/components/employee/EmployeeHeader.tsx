import { ChevronLeft, Info } from 'lucide-react'
import { formatAgeYears, formatMonthsSinceRaise } from '../../utils/tenderPresentation'

const NO_RAISE_WARN_MONTHS = 6
const NO_RAISE_CRITICAL_MONTHS = 9

interface Props {
  fullName: string
  initials: string
  position: string
  department: string | null
  subdivision: string | null
  ageYears: number | null
  tenureMonths: number
  noRaiseMonths: number
  onBack: () => void
  onOpenInfo: () => void
}

export function EmployeeHeader({
  fullName,
  initials,
  position,
  department,
  subdivision,
  ageYears,
  tenureMonths,
  noRaiseMonths,
  onBack,
  onOpenInfo
}: Props) {
  const subtitle = [position, department, subdivision].filter(Boolean).join(' · ')
  const noRaiseTone = noRaiseMonths >= NO_RAISE_CRITICAL_MONTHS ? 'critical' : 'warn'

  return (
    <header className="emp-card emp-head">
      <button type="button" className="emp-head-back" onClick={onBack}>
        <ChevronLeft size={20} aria-hidden="true" />
        Список
      </button>

      <span className="emp-head-avatar" aria-hidden="true">{initials}</span>

      <div className="emp-head-main">
        <h2>{fullName}</h2>
        {subtitle && <p className="emp-head-sub">{subtitle}</p>}
      </div>

      <div className="emp-head-stats">
        <div className="emp-stat">
          <strong>{ageYears !== null ? formatAgeYears(ageYears) : '—'}</strong>
          <span>возраст</span>
        </div>
        <div className="emp-stat">
          <strong>{formatMonthsSinceRaise(tenureMonths)}</strong>
          <span>стаж</span>
        </div>
        {noRaiseMonths >= NO_RAISE_WARN_MONTHS && (
          <span className={`emp-head-chip ${noRaiseTone}`}>
            Без повышения {formatMonthsSinceRaise(noRaiseMonths)}
          </span>
        )}
      </div>

      <button
        type="button"
        className="emp-icon-btn emp-head-info"
        onClick={onOpenInfo}
        aria-haspopup="dialog"
        aria-label="Информация о сотруднике"
      >
        <Info size={22} aria-hidden="true" />
      </button>
    </header>
  )
}

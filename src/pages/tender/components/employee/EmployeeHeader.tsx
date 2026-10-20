import { useState } from 'react'
import { ChevronDown, ChevronLeft, Phone } from 'lucide-react'
import { formatRuPhone } from '../../../../lib/formatUtils'
import { formatAgeYears, formatMonthsSinceRaise } from '../../utils/tenderPresentation'

const NO_RAISE_WARN_MONTHS = 6
const NO_RAISE_CRITICAL_MONTHS = 9

interface Props {
  fullName: string
  initials: string
  position: string
  department: string | null
  subdivision: string | null
  phone: string | null
  ageYears: number | null
  tenureMonths: number
  noRaiseMonths: number
  onBack: () => void
}

export function EmployeeHeader({
  fullName,
  initials,
  position,
  department,
  subdivision,
  phone,
  ageYears,
  tenureMonths,
  noRaiseMonths,
  onBack
}: Props) {
  const [aboutOpen, setAboutOpen] = useState(false)
  const phoneText = formatRuPhone(phone)
  const phoneHref = (phone || '').replace(/[^\d+]/g, '')
  const subtitle = [position, department, subdivision].filter(Boolean).join(' · ')
  const ageText = ageYears !== null ? formatAgeYears(ageYears) : '—'
  const tenureText = formatMonthsSinceRaise(tenureMonths)
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

      <p className="emp-head-meta">
        Возраст: {ageText} · Стаж: {tenureText}
      </p>

      {noRaiseMonths >= NO_RAISE_WARN_MONTHS && (
        <span className={`emp-head-chip ${noRaiseTone}`}>
          Без повышения {formatMonthsSinceRaise(noRaiseMonths)}
        </span>
      )}

      {phoneHref && (
        <a className="emp-icon-btn emp-head-phone" href={`tel:${phoneHref}`} aria-label={`Позвонить: ${phoneText}`}>
          <Phone size={20} aria-hidden="true" />
        </a>
      )}

      <button
        type="button"
        className={`emp-icon-btn emp-head-chevron ${aboutOpen ? 'open' : ''}`}
        onClick={() => setAboutOpen(value => !value)}
        aria-expanded={aboutOpen}
        aria-controls="emp-about"
        aria-label="О сотруднике"
      >
        <ChevronDown size={20} aria-hidden="true" />
      </button>

      {aboutOpen && (
        <dl id="emp-about" className="emp-head-about">
          <div><dt>Возраст</dt><dd>{ageText}</dd></div>
          <div><dt>Стаж</dt><dd>{tenureText}</dd></div>
          <div><dt>Подразделение</dt><dd>{subdivision || '—'}</dd></div>
          <div><dt>Телефон</dt><dd>{phoneText || '—'}</dd></div>
        </dl>
      )}
    </header>
  )
}

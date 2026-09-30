import type { CSSProperties } from 'react'
import { KIND_META } from '../../constants'
import type { JournalEntry } from '../../types'
import { formatDayShort } from '../../utils/dates'
import { formatMileage, formatRub } from '../../utils/format'
import { KIND_ICONS } from '../kindIcons'

interface Props {
  entry: JournalEntry
  onOpen: (entry: JournalEntry) => void
}

export function JournalRow({ entry, onOpen }: Props) {
  const Icon = KIND_ICONS[entry.kind]
  const meta = [formatDayShort(entry.date), entry.mileage ? formatMileage(entry.mileage) : null].filter(Boolean).join(' · ')

  return (
    <li>
      <button
        type="button"
        className="car-row"
        style={{ '--kind-color': KIND_META[entry.kind].color } as CSSProperties}
        onClick={() => onOpen(entry)}
      >
        <span className="car-row-icon" aria-hidden="true"><Icon size={18} /></span>
        <span className="car-row-main">
          <span className="car-row-title">{entry.title}</span>
          <span className="car-row-meta">
            <span className="car-row-date">{meta}</span>
            {entry.details && <span className="car-row-details">{entry.details}</span>}
          </span>
        </span>
        <span className="car-row-amount">{entry.amount > 0 ? formatRub(entry.amount) : '—'}</span>
      </button>
    </li>
  )
}

import { useState, type ReactNode } from 'react'
import { parseNumber } from '../../lib/formatUtils'
import { formatReading, formatUsage, type ReadingRow } from './readings'
import './ReadingsSection.css'

export interface ReadingsNotice {
  text: string
  level: 'warning' | 'info'
}

interface ReadingsSectionProps {
  rows: ReadingRow[]
  status: string
  hint: string | null
  notices: ReadingsNotice[]
  onChange: (id: string, value: number) => void
  children?: ReactNode
}

export const readingInputId = (rowId: string) => `reading-${rowId}`

export default function ReadingsSection({ rows, status, hint, notices, onChange, children }: ReadingsSectionProps) {
  const [editing, setEditing] = useState<Record<string, string>>({})

  const handleBlur = (row: ReadingRow) => {
    const text = editing[row.id]
    if (text === undefined) return
    setEditing(prev => {
      const next = { ...prev }
      delete next[row.id]
      return next
    })
    const value = parseNumber(text)
    if (value !== (row.cur ?? 0)) onChange(row.id, value)
  }

  const issues = rows.flatMap(r => (r.issue ? [r.issue] : []))

  return (
    <div className="content-section">
      <div className="section-header">
        <div className="section-title">Показания</div>
        <span className="readings-status">{status}</span>
      </div>
      {hint && <p className="readings-hint">{hint}</p>}

      <div className="readings-table">
        <div className="readings-head">
          <span />
          <span>было</span>
          <span>стало</span>
          <span>расход</span>
        </div>
        {rows.map(row => (
          <div key={row.id} className={`readings-row ${row.issue ? `has-${row.issue.level}` : ''}`}>
            <label className="readings-label" htmlFor={readingInputId(row.id)}>{row.label}</label>
            <span className="readings-prev">{formatReading(row.prev, row.kind)}</span>
            <input
              id={readingInputId(row.id)}
              className="readings-input"
              type="text"
              inputMode="decimal"
              placeholder="—"
              value={editing[row.id] ?? (row.cur === null ? '' : formatReading(row.cur, row.kind))}
              onChange={e => setEditing(prev => ({ ...prev, [row.id]: e.target.value }))}
              onBlur={() => handleBlur(row)}
            />
            <span className="readings-usage">
              {formatUsage(row.usage, row.kind)}
              {row.issue && <span className="readings-mark">!</span>}
            </span>
          </div>
        ))}
      </div>

      {(issues.length > 0 || notices.length > 0) && (
        <ul className="readings-issues">
          {issues.map(issue => (
            <li key={issue.text} className={`is-${issue.level}`}>{issue.text}</li>
          ))}
          {notices.map(notice => (
            <li key={notice.text} className={`is-${notice.level}`}>{notice.text}</li>
          ))}
        </ul>
      )}

      {children}
    </div>
  )
}

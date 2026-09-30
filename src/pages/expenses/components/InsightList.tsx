import type { ReactNode } from 'react'

export type InsightTone = 'danger' | 'warning' | 'info' | 'muted'

export interface InsightRow {
  key: string
  title: string
  meta: string
  value: string
  valueHint?: string
  badge?: string
  tone?: InsightTone
  share?: number
  muted?: boolean
}

interface Props {
  title: string
  icon: ReactNode
  description?: string
  rows: InsightRow[]
  emptyText: string
  footer?: ReactNode
}

export function InsightList({ title, icon, description, rows, emptyText, footer }: Props) {
  return (
    <section className="section-card insight-card">
      <div className="insight-card-head">
        <h3 className="with-icon">
          {icon}
          {title}
        </h3>
        {description && <p className="insight-description">{description}</p>}
      </div>

      {rows.length === 0 ? (
        <div className="empty-state">{emptyText}</div>
      ) : (
        <ul className="insight-list">
          {rows.map(row => (
            <li key={row.key} className={`insight-row ${row.muted ? 'muted' : ''}`}>
              <div className="insight-title">
                <span>{row.title}</span>
                {row.badge && <span className={`insight-badge ${row.tone || 'info'}`}>{row.badge}</span>}
              </div>
              <strong className="insight-value">{row.value}</strong>
              <div className="insight-meta">{row.meta}</div>
              {row.valueHint && <div className="insight-hint">{row.valueHint}</div>}
              {row.share !== undefined && (
                <div className="share-track">
                  <div className="share-fill" style={{ transform: `scaleX(${Math.min(1, row.share)})` }} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {footer && <div className="insight-footer">{footer}</div>}
    </section>
  )
}

import type { FC } from 'react'
import {
  formatHours,
  formatNumber,
  formatRub,
  formatSignedPercent,
  formatSignedRub
} from './dashboardFormat'
import type { ISubdivisionRow } from './dashboardMetrics'
import { AttentionBadge, SeverityDot } from './SeverityMarkers'

interface ISubdivisionsOverviewProps {
  rows: ISubdivisionRow[]
  total: ISubdivisionRow
  isCurrentMonth: boolean
  onSelect: (name: string) => void
}

interface ICellsProps {
  row: ISubdivisionRow
  isCurrentMonth: boolean
}

// Рост ФОТ к прошлому месяцу — внимание, снижение — нейтрально
const getDeltaClass = (delta: number): string => (delta > 0 ? 'is-warn-text' : '')

// Значения строки; подписи видны на карточках (узкий экран), на таблице скрыты шапкой
const RowCells: FC<ICellsProps> = ({ row, isCurrentMonth }) => (
  <>
    <span className="dash-sub-cell">
      <span className="dash-sub-label">Людей</span>
      <span className="dash-sub-value">{formatNumber(row.employeesCount)}</span>
    </span>
    {isCurrentMonth && (
      <span className="dash-sub-cell">
        <span className="dash-sub-label">На месте</span>
        <span className={`dash-sub-value${row.onSiteTone ? ` tone-text is-${row.onSiteTone}` : ''}`}>
          {row.onSite}/{row.accounted}
        </span>
      </span>
    )}
    <span className="dash-sub-cell">
      <span className="dash-sub-label">Начислено</span>
      <span className="dash-sub-value">{formatRub(row.accrued)}</span>
    </span>
    <span className="dash-sub-cell">
      <span className="dash-sub-label">Переработки, ч</span>
      <span className="dash-sub-value">{formatHours(row.overtime)}</span>
    </span>
    <span className="dash-sub-cell">
      <span className="dash-sub-label">Δ к прошл. мес.</span>
      <span className={`dash-sub-value ${getDeltaClass(row.delta)}`}>
        {formatSignedRub(row.delta)}
        <span className="dash-sub-percent">{formatSignedPercent(row.deltaPercent)}</span>
      </span>
    </span>
  </>
)

// Таблица подразделений во всю ширину: клик по строке открывает список людей
export const SubdivisionsOverview: FC<ISubdivisionsOverviewProps> = ({ rows, total, isCurrentMonth, onSelect }) => (
  <div className={`dash-subs${isCurrentMonth ? ' with-presence' : ''}`}>
    <div className="dash-subs-head" aria-hidden="true">
      <span>Подразделение</span>
      <span>Людей</span>
      {isCurrentMonth && <span>На месте</span>}
      <span>Начислено</span>
      <span>Переработки, ч</span>
      <span>Δ к прошл. мес.</span>
    </div>

    {rows.map(row => (
      <button
        key={row.name}
        type="button"
        className="dash-sub-row"
        onClick={() => onSelect(row.name)}
      >
        <span className="dash-sub-name">
          <SeverityDot severity={row.severity} />
          <span className="dash-sub-title">{row.name}</span>
          <AttentionBadge count={row.attentionCount} severity={row.severity} />
        </span>
        <RowCells row={row} isCurrentMonth={isCurrentMonth} />
      </button>
    ))}

    <div className="dash-sub-row total">
      <span className="dash-sub-name">
        <span className="dash-sub-title">{total.name}</span>
      </span>
      <RowCells row={total} isCurrentMonth={isCurrentMonth} />
    </div>
  </div>
)

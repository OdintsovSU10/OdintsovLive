import type { FC } from 'react'
import {
  formatHours,
  formatNumber,
  formatRub,
  formatSignedPercent,
  formatSignedRub
} from './dashboardFormat'
import type { ISubdivisionRow } from './dashboardMetrics'

interface ISubdivisionsTableProps {
  rows: ISubdivisionRow[]
  total: ISubdivisionRow
  selected: string | null
  isCurrentMonth: boolean
  onSelect: (name: string | null) => void
}

interface ICellsProps {
  row: ISubdivisionRow
  isCurrentMonth: boolean
}

const getDeltaTone = (delta: number): string => (delta > 0 ? 'dash-up' : delta < 0 ? 'dash-down' : '')

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
        <span className="dash-sub-value">{row.onSite}/{row.accounted}</span>
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
      <span className={`dash-sub-value ${getDeltaTone(row.delta)}`}>
        {formatSignedRub(row.delta)}
        <span className="dash-sub-percent">{formatSignedPercent(row.deltaPercent)}</span>
      </span>
    </span>
  </>
)

// Таблица подразделений: клик по строке включает фильтр, повторный клик сбрасывает
export const SubdivisionsTable: FC<ISubdivisionsTableProps> = ({
  rows,
  total,
  selected,
  isCurrentMonth,
  onSelect
}) => (
  <section className="dash-card">
    <div className="dash-card-head">
      <h3 className="dash-card-title">Подразделения</h3>
      <div className="dash-filter">
        <button
          type="button"
          className="dash-filter-chip"
          aria-pressed={selected === null}
          onClick={() => onSelect(null)}
        >
          Все
        </button>
        {selected && <span className="dash-filter-current">{selected}</span>}
      </div>
    </div>

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
          aria-pressed={selected === row.name}
          onClick={() => onSelect(selected === row.name ? null : row.name)}
        >
          <span className="dash-sub-name">{row.name}</span>
          <RowCells row={row} isCurrentMonth={isCurrentMonth} />
        </button>
      ))}

      <div className="dash-sub-row total">
        <span className="dash-sub-name">{total.name}</span>
        <RowCells row={total} isCurrentMonth={isCurrentMonth} />
      </div>
    </div>
  </section>
)

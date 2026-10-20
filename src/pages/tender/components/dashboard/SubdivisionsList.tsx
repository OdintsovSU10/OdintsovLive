import type { FC } from 'react'
import { formatNumber } from './dashboardFormat'
import type { ISubdivisionRow } from './dashboardMetrics'
import { AttentionBadge, SeverityDot } from './SeverityMarkers'

interface ISubdivisionsListProps {
  rows: ISubdivisionRow[]
  total: ISubdivisionRow
  // null — выбраны все сотрудники
  selected: string | null
  isCurrentMonth: boolean
  onSelect: (name: string) => void
  onSelectAll: () => void
}

interface IItemProps {
  row: ISubdivisionRow
  title: string
  isCurrentMonth: boolean
  active: boolean
  onClick: () => void
}

const ListItem: FC<IItemProps> = ({ row, title, isCurrentMonth, active, onClick }) => (
  <button type="button" className="sub-list-item" aria-pressed={active} onClick={onClick}>
    <SeverityDot severity={row.severity} />
    <span className="sub-list-name">{title}</span>
    <span className="sub-list-meta">
      <span>{formatNumber(row.employeesCount)} чел.</span>
      {isCurrentMonth && (
        <span className={row.onSiteTone ? `tone-text is-${row.onSiteTone}` : undefined}>
          {row.onSite}/{row.accounted}
        </span>
      )}
    </span>
    <AttentionBadge count={row.attentionCount} severity={row.severity} />
  </button>
)

// Компактный список подразделений слева от панели людей
export const SubdivisionsList: FC<ISubdivisionsListProps> = ({
  rows,
  total,
  selected,
  isCurrentMonth,
  onSelect,
  onSelectAll
}) => (
  <nav className="sub-list" aria-label="Подразделения">
    <ListItem
      row={total}
      title="Все сотрудники"
      isCurrentMonth={isCurrentMonth}
      active={selected === null}
      onClick={onSelectAll}
    />
    {rows.map(row => (
      <ListItem
        key={row.name}
        row={row}
        title={row.name}
        isCurrentMonth={isCurrentMonth}
        active={selected === row.name}
        onClick={() => onSelect(row.name)}
      />
    ))}
  </nav>
)

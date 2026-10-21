import { memo, type FC } from 'react'
import type { EmployeeWithStats } from '../../types'
import type { IListScore } from '../../hooks/useEmployeeScores'
import { ScoreBadge } from '../ScoreBadge'
import { formatHours, formatNumber, formatRub } from './dashboardFormat'
import { OVERTIME_ATTENTION_HOURS } from './dashboardMetrics'
import { PRESENCE_LABELS, type PresenceStatus } from './dashboardTypes'
import type { IPanelRow } from './employeesPanelUtils'
import { RowMenu } from './RowMenu'
import { isLateArrival, toClock } from './todayMetrics'

export interface IAdminRowActions {
  archivingIds: ReadonlySet<number>
  onEdit: (employee: EmployeeWithStats) => void
  onArchive: (employee: EmployeeWithStats) => void
}

interface IPersonRowProps {
  row: IPanelRow
  score: IListScore | undefined
  scoresLoading: boolean
  admin: IAdminRowActions | null
  // Скрыть суммы (начисление и оклад)
  hideMoney: boolean
  onSelect: (employee: EmployeeWithStats) => void
}

// Цвет точки статуса на аватаре: в офисе — ok, удалённо — primary, ушёл — muted, ещё не пришёл — warn, нет отметки — bad
const DOT_CLASSES: Record<PresenceStatus, string> = {
  office: 'dot-ok',
  remote: 'dot-primary',
  left: 'dot-muted',
  notYet: 'dot-warn',
  noMark: 'dot-bad',
  vacation: 'dot-neutral',
  sick: 'dot-neutral',
  dayoff: 'dot-neutral',
  noData: 'dot-neutral'
}

const STATUS_TEXT_CLASSES: Partial<Record<PresenceStatus, string>> = {
  notYet: 'is-warn',
  noMark: 'is-bad'
}

const PersonRowBase: FC<IPersonRowProps> = ({ row, score, scoresLoading, admin, hideMoney, onSelect }) => {
  const { trend, accrued, severity, salary, status, firstEntry } = row
  const { employee, latest } = trend
  const overtimeHigh = latest.overtime > OVERTIME_ATTENTION_HOURS

  return (
    <li
      className={`dash-person${severity ? ` sev-${severity}` : ''}${admin ? ' is-admin' : ''}`}
      onClick={() => onSelect(employee)}
    >
      <span className="dash-avatar-wrap">
        <span className="dash-avatar">{employee.avatar}</span>
        {status && <span className={`dash-status-dot ${DOT_CLASSES[status]}`} title={PRESENCE_LABELS[status]} />}
      </span>

      <span className="dash-person-main">
        <button type="button" className="dash-person-name">{employee.full_name}</button>
        <span className="dash-person-meta">{employee.position || '—'}</span>
      </span>

      <span className="dash-person-side">
        {status && (
          firstEntry
            ? (
              <span className={`dash-person-arrival${isLateArrival(firstEntry) ? ' is-late' : ''}`}>
                → {toClock(firstEntry)}
              </span>
            )
            : <span className={`dash-person-state ${STATUS_TEXT_CLASSES[status] ?? ''}`}>{PRESENCE_LABELS[status]}</span>
        )}
        {admin && (
          <RowMenu
            name={employee.full_name}
            archiving={admin.archivingIds.has(employee.id)}
            onEdit={() => admin.onEdit(employee)}
            onArchive={() => admin.onArchive(employee)}
          />
        )}
      </span>

      <span className="dash-person-line">
        <ScoreBadge score={score} loading={scoresLoading} />
        <span className="dash-person-accrued">{hideMoney ? '••• ₽' : formatRub(accrued)}</span>
        <span className="dash-person-hours">
          {formatNumber(latest.hours)}/{formatNumber(latest.normHoursWeekdays)} ч
          {latest.overtime > 0 && (
            <span className={overtimeHigh ? 'dash-person-overtime is-warn' : 'dash-person-overtime'}>
              {' '}+{formatHours(latest.overtime)}
            </span>
          )}
        </span>
      </span>

      {admin && (
        <span className="dash-person-salary">{hideMoney ? '••• ₽' : formatRub(salary)}</span>
      )}
    </li>
  )
}

export const PersonRow = memo(PersonRowBase)

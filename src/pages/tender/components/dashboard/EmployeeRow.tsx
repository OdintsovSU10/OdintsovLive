import { memo, type FC } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import type { EmployeeWithStats } from '../../types'
import type { IListScore } from '../../hooks/useEmployeeScores'
import { formatMonthsSinceRaise } from '../../utils/tenderPresentation'
import { ScoreBadge } from '../ScoreBadge'
import { Sparkline } from './Sparkline'
import { formatHours, formatNumber, formatRub } from './dashboardFormat'
import { getPresenceStatusTone, OVERTIME_ATTENTION_HOURS } from './dashboardMetrics'
import { PRESENCE_LABELS, type PresenceStatus } from './dashboardTypes'
import type { IPanelRow } from './employeesPanelUtils'

export interface IAdminRowActions {
  hideSalaries: boolean
  archivingIds: ReadonlySet<number>
  onEdit: (employee: EmployeeWithStats) => void
  onArchive: (employee: EmployeeWithStats) => void
}

interface IEmployeeRowProps {
  row: IPanelRow
  // Статус «сегодня»: только в текущем месяце, иначе undefined
  status: PresenceStatus | undefined
  score: IListScore | undefined
  scoresLoading: boolean
  admin: IAdminRowActions | null
  onSelect: (employee: EmployeeWithStats) => void
}

const EmployeeRowBase: FC<IEmployeeRowProps> = ({ row, status, score, scoresLoading, admin, onSelect }) => {
  const { trend, accrued, severity, salary, noRaiseMonths } = row
  const { employee, latest } = trend
  const statusTone = status ? getPresenceStatusTone(status) : null
  const overtimeHigh = latest.overtime > OVERTIME_ATTENTION_HOURS

  return (
    <li
      className={`dash-emp-row${severity ? ` sev-${severity}` : ''}${admin ? ' is-admin' : ''}`}
      onClick={() => onSelect(employee)}
    >
      <div className="dash-emp-cell dash-emp-id">
        <span className="dash-avatar">{employee.avatar}</span>
        <span className="dash-emp-info">
          <button type="button" className="dash-emp-name-btn">{employee.full_name}</button>
          <span className="dash-emp-meta">{employee.position || '—'}</span>
        </span>
      </div>

      <div className="dash-emp-cell dash-emp-score">
        <ScoreBadge score={score} loading={scoresLoading} />
      </div>

      <div className="dash-emp-line">
        <div className="dash-emp-cell dash-emp-today">
          {status && (
            <span className={`dash-emp-status${statusTone ? ` is-${statusTone}` : ''}`}>{PRESENCE_LABELS[status]}</span>
          )}
        </div>

        <div className="dash-emp-cell dash-emp-money">
          <span className="dash-emp-main">{formatRub(accrued)}</span>
          <span className="dash-emp-sub">
            {formatNumber(latest.hours)} / {formatNumber(latest.normHoursWeekdays)} ч
            {latest.overtime > 0 && (
              <span className={overtimeHigh ? 'dash-emp-overtime is-warn' : 'dash-emp-overtime'}>
                {' · '}+{formatHours(latest.overtime)} ч
              </span>
            )}
          </span>
        </div>

        <div className="dash-emp-cell dash-emp-trend" aria-label="Динамика начислений по месяцам">
          <Sparkline data={trend.points.map(point => point.earned)} />
        </div>
      </div>

      {admin && (
        <div className="dash-emp-cell dash-emp-admin">
          <span className="dash-emp-salary">
            <span className="dash-emp-salary-value">
              {admin.hideSalaries ? '••• ₽' : `${formatNumber(salary)} ₽`}
            </span>
            <span className="dash-emp-meta">без повышения {formatMonthsSinceRaise(noRaiseMonths)}</span>
          </span>
          <span className="dash-emp-actions">
            <button
              type="button"
              className="dash-emp-action-btn"
              title="Изменить"
              aria-label={`Изменить: ${employee.full_name}`}
              onClick={event => { event.stopPropagation(); admin.onEdit(employee) }}
            >
              <span className="dash-emp-action-face"><Pencil size={16} strokeWidth={1.5} /></span>
            </button>
            <button
              type="button"
              className="dash-emp-action-btn danger"
              title="В архив"
              aria-label={`В архив: ${employee.full_name}`}
              disabled={admin.archivingIds.has(employee.id)}
              onClick={event => { event.stopPropagation(); admin.onArchive(employee) }}
            >
              <span className="dash-emp-action-face"><Trash2 size={16} strokeWidth={1.5} /></span>
            </button>
          </span>
        </div>
      )}
    </li>
  )
}

export const EmployeeRow = memo(EmployeeRowBase)

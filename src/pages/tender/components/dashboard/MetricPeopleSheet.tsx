import { useMemo, type FC } from 'react'
import { BottomSheet } from '../../../../components/ui/BottomSheet'
import type { EmployeeWithStats } from '../../types'
import { MONTH_NAMES } from '../../utils/employeeFormat'
import { pluralize } from './dashboardFormat'
import type { IEmployeeTrend } from './dashboardTypes'
import { buildMetricPeople, getMetricTitle, type MetricKind } from './metricPeople'
import { buildTodayPeople, getLateSummary, isTodayKind, type ITodayPeopleInput } from './todayPeople'

interface IMetricPeopleSheetProps {
  kind: MetricKind
  trends: IEmployeeTrend[]
  year: number
  month: number
  // Проходы и статусы за сегодня; null — не текущий месяц
  todayData: ITodayPeopleInput | null
  onClose: () => void
  onSelectEmployee: (employee: EmployeeWithStats) => void
}

// Мини-окно показателя: сотрудники, вошедшие в цифру, и переход в карточку
export const MetricPeopleSheet: FC<IMetricPeopleSheetProps> = ({
  kind,
  trends,
  year,
  month,
  todayData,
  onClose,
  onSelectEmployee
}) => {
  const today = isTodayKind(kind)
  const people = useMemo(() => {
    if (!isTodayKind(kind)) return buildMetricPeople(kind, trends, year, month)
    return todayData ? buildTodayPeople(kind, trends, todayData) : []
  }, [kind, month, todayData, trends, year])

  const lateSummary = kind === 'today:late' ? getLateSummary(people) : null

  return (
    <BottomSheet
      variant="modal"
      size="small"
      title={`${getMetricTitle(kind)} · ${today ? 'сегодня' : `${MONTH_NAMES[month - 1]} ${year}`}`}
      onClose={onClose}
    >
      {people.length === 0 ? (
        <p className="dash-metric-empty">Никого</p>
      ) : (
        <>
          <p className="dash-metric-lead">
            {people.length} {pluralize(people.length, 'сотрудник', 'сотрудника', 'сотрудников')}
            {lateSummary ? ` · ${lateSummary}` : ''}
          </p>
          <ul className="dash-metric-list">
            {people.map(person => (
              <li key={person.employee.id}>
                <button
                  type="button"
                  className={`dash-metric-item${person.valueTone ? ` dash-metric-item--${person.valueTone}` : ''}`}
                  onClick={() => {
                    onClose()
                    onSelectEmployee(person.employee)
                  }}
                >
                  <span className="dash-metric-top">
                    <span className="dash-metric-name">{person.employee.full_name}</span>
                    <span className={`dash-metric-value dash-metric-value--${person.valueTone ?? 'none'}`}>
                      {person.value}
                    </span>
                  </span>
                  <span className="dash-metric-sub">
                    {person.employee.position}
                    {person.employee.position && person.subdivision ? ' · ' : ''}
                    <span className="dash-metric-subdivision">{person.subdivision}</span>
                  </span>
                  {person.tags && person.tags.length > 0 && (
                    <span className="dash-metric-tags">
                      {person.tags.map(tag => (
                        <span key={tag.text} className={`dash-metric-tag dash-metric-tag--${tag.tone ?? 'muted'}`}>
                          {tag.text}
                        </span>
                      ))}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </BottomSheet>
  )
}

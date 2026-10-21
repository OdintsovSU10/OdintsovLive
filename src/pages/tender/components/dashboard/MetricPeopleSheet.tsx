import { useMemo, type FC } from 'react'
import { BottomSheet } from '../../../../components/ui/BottomSheet'
import type { EmployeeWithStats } from '../../types'
import { MONTH_NAMES } from '../../utils/employeeFormat'
import { pluralize } from './dashboardFormat'
import type { IEmployeeTrend } from './dashboardTypes'
import { buildMetricPeople, getMetricTitle, type MetricKind } from './metricPeople'

interface IMetricPeopleSheetProps {
  kind: MetricKind
  trends: IEmployeeTrend[]
  year: number
  month: number
  onClose: () => void
  onSelectEmployee: (employee: EmployeeWithStats) => void
}

// Мини-окно показателя: сотрудники, вошедшие в цифру, и переход в карточку
export const MetricPeopleSheet: FC<IMetricPeopleSheetProps> = ({
  kind,
  trends,
  year,
  month,
  onClose,
  onSelectEmployee
}) => {
  const people = useMemo(() => buildMetricPeople(kind, trends, year, month), [kind, month, trends, year])

  return (
    <BottomSheet
      variant="modal"
      size="small"
      title={`${getMetricTitle(kind)} · ${MONTH_NAMES[month - 1]} ${year}`}
      onClose={onClose}
    >
      {people.length === 0 ? (
        <p className="dash-metric-empty">Никого</p>
      ) : (
        <>
          <p className="dash-metric-lead">
            {people.length} {pluralize(people.length, 'сотрудник', 'сотрудника', 'сотрудников')}
          </p>
          <ul className="dash-metric-list">
            {people.map(person => (
              <li key={person.employee.id}>
                <button
                  type="button"
                  className="dash-metric-item"
                  onClick={() => {
                    onClose()
                    onSelectEmployee(person.employee)
                  }}
                >
                  <span className="dash-metric-main">
                    <span className="dash-metric-name">{person.employee.full_name}</span>
                    <span className="dash-metric-sub">
                      {person.detail ? `${person.subdivision} · ${person.detail}` : person.subdivision}
                    </span>
                  </span>
                  <span className="dash-metric-value">{person.value}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </BottomSheet>
  )
}

import { useCallback, useMemo, useRef, useState } from 'react'
import type { EmployeeWithStats } from '../types'
import { useLivePayroll } from '../hooks/useLivePayroll'
import { AttendancePanel } from './dashboard/AttendancePanel'
import { AttentionList } from './dashboard/AttentionList'
import { DashboardPulse } from './dashboard/DashboardPulse'
import { MoneyPanel } from './dashboard/MoneyPanel'
import { SubdivisionEmployees } from './dashboard/SubdivisionEmployees'
import { SubdivisionsTable } from './dashboard/SubdivisionsTable'
import { TodayPanel } from './dashboard/TodayPanel'
import {
  buildAttentionItems,
  buildSubdivisionRows,
  countAccounted,
  countPresence,
  summarizeScope
} from './dashboard/dashboardMetrics'
import { MONTHS_WINDOW } from './dashboard/dashboardTypes'
import { useDashboardAnalytics } from './dashboard/useDashboardAnalytics'
import { useTodayPresence } from './dashboard/useTodayPresence'
import './dashboard/Dashboard.css'
import './dashboard/DashboardToday.css'
import './dashboard/DashboardMoney.css'
import './dashboard/DashboardSubdivisions.css'
import './dashboard/DashboardAttention.css'

interface Props {
  employees: EmployeeWithStats[]
  year: number
  month: number
  onSelectEmployee: (employee: EmployeeWithStats) => void
}

// Доля месяца округляется до ~5 минут, чтобы список сотрудников не перерисовывался каждую секунду
const PROGRESS_STEP = 2000

export function DashboardOverview({ employees, year, month, onSelectEmployee }: Props) {
  const [selectedSubdivision, setSelectedSubdivision] = useState<string | null>(null)

  // Стабильный обработчик для мемоизированных блоков
  const selectRef = useRef(onSelectEmployee)
  selectRef.current = onSelectEmployee
  const handleSelectEmployee = useCallback((employee: EmployeeWithStats) => selectRef.current(employee), [])

  const { monthSlots, trends, loading, error } = useDashboardAnalytics(employees, year, month)

  const activeSubdivision = useMemo(() => (
    selectedSubdivision && trends.some(trend => trend.subdivision === selectedSubdivision)
      ? selectedSubdivision
      : null
  ), [selectedSubdivision, trends])

  const scopedTrends = useMemo(() => (
    activeSubdivision ? trends.filter(trend => trend.subdivision === activeSubdivision) : trends
  ), [activeSubdivision, trends])

  const scopePlan = useMemo(
    () => scopedTrends.reduce((sum, trend) => sum + trend.latest.plan, 0),
    [scopedTrends]
  )
  const live = useLivePayroll(scopePlan, year, month)
  const isCurrentMonth = live.isLive

  const presence = useTodayPresence(employees, isCurrentMonth)

  const summary = summarizeScope(scopedTrends, live)
  const allSubdivisions = buildSubdivisionRows(trends, presence.statuses, live)
  const presenceCounts = countPresence(scopedTrends, presence.statuses)
  const roundedProgress = Math.round(live.progress * PROGRESS_STEP) / PROGRESS_STEP

  const attentionItems = useMemo(() => buildAttentionItems({
    trends: scopedTrends,
    year,
    month,
    statuses: isCurrentMonth ? presence.statuses : null
  }), [isCurrentMonth, month, presence.statuses, scopedTrends, year])

  if (employees.length === 0) {
    return (
      <div className="dashboard-overview">
        <div className="dashboard-surface">
          <div className="dash-empty">Нет сотрудников для построения дашборда</div>
        </div>
      </div>
    )
  }

  const handleSelectSubdivision = (name: string | null) => setSelectedSubdivision(name)

  return (
    <div className="dashboard-overview">
      <div className="dashboard-surface">
        {loading && (
          <div className="dash-loading">Обновляем аналитику за последние {MONTHS_WINDOW + 1} месяцев…</div>
        )}
        {error && (
          <div className="dash-error">Часть данных недоступна: {error}</div>
        )}

        <DashboardPulse
          isCurrentMonth={isCurrentMonth}
          summary={summary}
          live={live}
          presence={presenceCounts}
          accountedCount={countAccounted(scopedTrends)}
          presenceLoading={presence.loading}
        />

        <div className="dash-columns">
          {isCurrentMonth ? (
            <TodayPanel
              trends={scopedTrends}
              statuses={presence.statuses}
              loading={presence.loading}
              onSelectEmployee={handleSelectEmployee}
            />
          ) : (
            <AttendancePanel statusCounts={summary.statusCounts} />
          )}

          <MoneyPanel
            monthSlots={monthSlots}
            trends={scopedTrends}
            summary={summary}
            live={live}
          />
        </div>

        <SubdivisionsTable
          rows={allSubdivisions.rows}
          total={allSubdivisions.total}
          selected={activeSubdivision}
          isCurrentMonth={isCurrentMonth}
          onSelect={handleSelectSubdivision}
        />

        {activeSubdivision && (
          <SubdivisionEmployees
            name={activeSubdivision}
            trends={scopedTrends}
            isLive={isCurrentMonth}
            progress={roundedProgress}
            onSelectEmployee={handleSelectEmployee}
          />
        )}

        <AttentionList items={attentionItems} onSelectEmployee={handleSelectEmployee} />
      </div>
    </div>
  )
}

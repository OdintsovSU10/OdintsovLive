import { useCallback, useMemo, useRef, useState } from 'react'
import { Toast } from '../../../components/ui/Toast'
import type { EmployeeWithStats } from '../types'
import { useLivePayroll } from '../hooks/useLivePayroll'
import { useEmployeeScores } from '../hooks/useEmployeeScores'
import { AddEmployeeModal } from './AddEmployeeModal'
import { EmployeeModal } from './EmployeeModal'
import { SubdivisionsSheet } from './SubdivisionsSheet'
import { AttendancePanel } from './dashboard/AttendancePanel'
import { AttentionList } from './dashboard/AttentionList'
import { DashboardHeader, type ISubdivisionOption } from './dashboard/DashboardHeader'
import { EventsFeed } from './dashboard/EventsFeed'
import { MetricPeopleSheet } from './dashboard/MetricPeopleSheet'
import { MoneyPanel } from './dashboard/MoneyPanel'
import type { MetricKind } from './dashboard/metricPeople'
import { PeopleColumn } from './dashboard/PeopleColumn'
import type { IAdminRowActions } from './dashboard/PersonRow'
import { PunctualityCard } from './dashboard/PunctualityCard'
import { StatCards, type StatsMode } from './dashboard/StatCards'
import { buildAttentionItems, buildSeverityMap, summarizeScope } from './dashboard/dashboardMetrics'
import { MONTHS_WINDOW, type AdminPanelSheet } from './dashboard/dashboardTypes'
import { buildMonthStats, buildTodaySummary } from './dashboard/todayMetrics'
import { useDashboardAnalytics } from './dashboard/useDashboardAnalytics'
import { useEmployeeAdmin } from './dashboard/useEmployeeAdmin'
import { useHiddenMoney } from './dashboard/useHiddenMoney'
import { useTodayPresence } from './dashboard/useTodayPresence'
import './dashboard/Dashboard.css'
import './dashboard/DashboardHeader.css'
import './dashboard/DashboardPeople.css'
import './dashboard/DashboardFeed.css'
import './dashboard/DashboardStats.css'
import './dashboard/DashboardMoney.css'
import './dashboard/DashboardAttention.css'
import './dashboard/DashboardMetricSheet.css'

interface Props {
  employees: EmployeeWithStats[]
  year: number
  month: number
  isAdmin: boolean
  // Лист администратора, открытый кнопкой в строке вкладок оболочки
  panelSheet: AdminPanelSheet | null
  // Открыть лист из шапки колонки «Люди» (телефон)
  onOpenSheet: (sheet: AdminPanelSheet) => void
  onSheetClose: () => void
  // Растёт, когда листы «Архив»/«Настройки» что-то поменяли
  refreshKey: number
  // Перечитать сотрудников оболочки после правки, добавления или архивации
  onEmployeesChanged: () => Promise<void> | void
  onSelectEmployee: (employee: EmployeeWithStats) => void
}

// Доля месяца округляется до ~5 минут, чтобы список сотрудников не перерисовывался каждую секунду
const PROGRESS_STEP = 2000

export function DashboardOverview({
  employees,
  year,
  month,
  isAdmin,
  panelSheet,
  onOpenSheet,
  onSheetClose,
  refreshKey,
  onEmployeesChanged,
  onSelectEmployee
}: Props) {
  const [selectedSubdivision, setSelectedSubdivision] = useState<string | null>(null)
  const [statsMode, setStatsMode] = useState<StatsMode>('today')
  // Показатель, открытый в мини-окне со списком сотрудников
  const [metric, setMetric] = useState<MetricKind | null>(null)

  // Стабильный обработчик для мемоизированных блоков
  const selectRef = useRef(onSelectEmployee)
  selectRef.current = onSelectEmployee
  const handleSelectEmployee = useCallback((employee: EmployeeWithStats) => selectRef.current(employee), [])

  const { monthSlots, trends, loading, error } = useDashboardAnalytics(employees, year, month)
  const { scores, loading: scoresLoading } = useEmployeeScores(employees)

  const admin = useEmployeeAdmin({ enabled: isAdmin, refreshKey, onEmployeesChanged, onSheetClose })
  const money = useHiddenMoney()

  const adminRef = useRef(admin)
  adminRef.current = admin
  const handleEdit = useCallback((employee: EmployeeWithStats) => adminRef.current.startEdit(employee), [])
  const handleArchive = useCallback((employee: EmployeeWithStats) => {
    void adminRef.current.quickArchive(employee)
  }, [])

  const adminActions = useMemo<IAdminRowActions | null>(() => (
    isAdmin
      ? { archivingIds: admin.archivingIds, onEdit: handleEdit, onArchive: handleArchive }
      : null
  ), [admin.archivingIds, handleArchive, handleEdit, isAdmin])

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

  // Пункты внимания считаются по всем подразделениям: из них маркеры тяжести слева и в строках
  const allAttentionItems = useMemo(() => buildAttentionItems({
    trends,
    year,
    month,
    statuses: isCurrentMonth ? presence.statuses : null,
    scores
  }), [isCurrentMonth, month, presence.statuses, scores, trends, year])

  const attentionItems = useMemo(() => (
    activeSubdivision
      ? allAttentionItems.filter(item => item.subdivision === activeSubdivision)
      : allAttentionItems
  ), [activeSubdivision, allAttentionItems])

  const severity = useMemo(() => buildSeverityMap(allAttentionItems), [allAttentionItems])

  const roundedProgress = Math.round(live.progress * PROGRESS_STEP) / PROGRESS_STEP

  const summary = useMemo(
    () => summarizeScope(scopedTrends, { isLive: isCurrentMonth, progress: roundedProgress }),
    [isCurrentMonth, roundedProgress, scopedTrends]
  )
  const today = useMemo(() => (
    isCurrentMonth
      ? buildTodaySummary(scopedTrends, {
        statuses: presence.statuses,
        passes: presence.passes,
        firstEntries: presence.firstEntries
      })
      : null
  ), [isCurrentMonth, presence.firstEntries, presence.passes, presence.statuses, scopedTrends])
  const monthStats = useMemo(() => buildMonthStats(
    summary,
    isCurrentMonth,
    roundedProgress,
    attentionItems.filter(item => item.kind === 'unfilled').length
  ), [attentionItems, isCurrentMonth, roundedProgress, summary])

  const subdivisionOptions = useMemo<ISubdivisionOption[]>(() => {
    const counts = new Map<string, number>()
    for (const trend of trends) counts.set(trend.subdivision, (counts.get(trend.subdivision) ?? 0) + 1)
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((left, right) => left.name.localeCompare(right.name, 'ru'))
  }, [trends])

  // «Сегодня» есть только в текущем месяце
  const mode: StatsMode = isCurrentMonth ? statsMode : 'month'
  const peopleStatuses = isCurrentMonth ? presence.statuses : null

  // Модалки и листы администратора стоят рядом с содержимым; .tender-page даёт им стили карточки сотрудника
  const adminLayer = isAdmin && (
    <div className="tender-page admin-panel">
      {admin.editingEmployee && (
        <EmployeeModal
          employee={admin.editingEmployee}
          onClose={admin.closeEdit}
          onSave={admin.saveEmployee}
          onSalaryHistoryChange={admin.reloadEmployees}
          onArchive={admin.archiveEmployee}
          subdivisions={admin.subdivisionNames}
        />
      )}
      {panelSheet === 'addEmployee' && (
        <AddEmployeeModal
          onClose={onSheetClose}
          onSave={admin.addEmployee}
          subdivisions={admin.subdivisionNames}
        />
      )}
      {panelSheet === 'subdivisions' && (
        <SubdivisionsSheet
          subdivisions={admin.subdivisions}
          employees={employees}
          onChanged={admin.loadSubdivisions}
          onClose={onSheetClose}
        />
      )}
      <Toast toast={admin.toast} onClose={admin.hideToast} />
    </div>
  )

  if (employees.length === 0) {
    return (
      <>
        <div className="dashboard-overview">
          <div className="dashboard-surface">
            <div className="dash-empty">Нет сотрудников для построения дашборда</div>
          </div>
        </div>
        {adminLayer}
      </>
    )
  }

  return (
    <>
      <div className="dashboard-overview">
        <div className="dashboard-surface">
          {loading && (
            <div className="dash-loading">Обновляем аналитику за последние {MONTHS_WINDOW + 1} месяцев…</div>
          )}
          {error && (
            <div className="dash-error">Часть данных недоступна: {error}</div>
          )}

          <DashboardHeader
            year={year}
            month={month}
            today={today}
            monthStats={monthStats}
            presenceLoading={presence.loading}
            refreshing={presence.refreshing}
            onRefresh={presence.refresh}
            subdivisions={subdivisionOptions}
            totalCount={trends.length}
            selected={activeSubdivision}
            onSelectSubdivision={setSelectedSubdivision}
            hideMoney={money.hidden}
            onToggleHideMoney={money.toggle}
            mode={mode}
            onModeChange={setStatsMode}
            onOpenMetric={setMetric}
          />

          <div className="dash-grid">
            <div className="dash-slot slot-people">
              <PeopleColumn
                trends={scopedTrends}
                isLive={isCurrentMonth}
                progress={roundedProgress}
                statuses={peopleStatuses}
                firstEntries={presence.firstEntries}
                scores={scores}
                scoresLoading={scoresLoading}
                severity={severity}
                admin={adminActions}
                hideMoney={money.hidden}
                onSelectEmployee={handleSelectEmployee}
                onOpenSheet={isAdmin ? onOpenSheet : null}
              />
            </div>

            <div className="dash-slot slot-feed">
              {isCurrentMonth ? (
                <EventsFeed
                  trends={scopedTrends}
                  passes={presence.passes}
                  loading={presence.loading}
                  onSelectEmployee={handleSelectEmployee}
                />
              ) : (
                <AttendancePanel
                  statusCounts={summary.statusCounts}
                  trends={scopedTrends}
                  onOpenMetric={setMetric}
                />
              )}
            </div>

            <div className="dash-stats">
              <div className="dash-slot slot-cards">
                <StatCards
                  mode={mode}
                  today={today}
                  monthStats={monthStats}
                  presenceLoading={presence.loading}
                />
              </div>

              {today && mode === 'today' && (
                <div className="dash-slot slot-punct">
                  <PunctualityCard punctuality={today.punctuality} loading={presence.loading} />
                </div>
              )}

              <div className="dash-slot slot-fot">
                <MoneyPanel
                  monthSlots={monthSlots}
                  trends={scopedTrends}
                  summary={summary}
                  live={live}
                  hideMoney={money.hidden}
                />
              </div>

              <div className="dash-slot slot-attention">
                <AttentionList items={attentionItems} onSelectEmployee={handleSelectEmployee} />
              </div>
            </div>
          </div>
        </div>
      </div>
      {metric !== null && (
        <MetricPeopleSheet
          kind={metric}
          trends={scopedTrends}
          year={year}
          month={month}
          onClose={() => setMetric(null)}
          onSelectEmployee={handleSelectEmployee}
        />
      )}
      {adminLayer}
    </>
  )
}

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
import { DashboardPulse } from './dashboard/DashboardPulse'
import { EmployeesSection } from './dashboard/EmployeesSection'
import type { IAdminRowActions } from './dashboard/EmployeeRow'
import { MoneyPanel } from './dashboard/MoneyPanel'
import { TodayPanel } from './dashboard/TodayPanel'
import {
  buildAttentionItems,
  buildSeverityMap,
  buildSubdivisionRows,
  countAccounted,
  countPresence,
  summarizeScope
} from './dashboard/dashboardMetrics'
import { MONTHS_WINDOW, type AdminPanelSheet } from './dashboard/dashboardTypes'
import { useDashboardAnalytics } from './dashboard/useDashboardAnalytics'
import { useEmployeeAdmin } from './dashboard/useEmployeeAdmin'
import { useTodayPresence } from './dashboard/useTodayPresence'
import './dashboard/Dashboard.css'
import './dashboard/DashboardToday.css'
import './dashboard/DashboardMoney.css'
import './dashboard/DashboardSubdivisions.css'
import './dashboard/DashboardEmployees.css'
import './dashboard/DashboardEmployeeRow.css'
import './dashboard/DashboardAttention.css'

interface Props {
  employees: EmployeeWithStats[]
  year: number
  month: number
  isAdmin: boolean
  // Лист администратора, открытый кнопкой в строке вкладок оболочки
  panelSheet: AdminPanelSheet | null
  // Открыть лист из шапки секции «Сотрудники» (телефон)
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
  const [panelOpen, setPanelOpen] = useState(false)

  // Стабильный обработчик для мемоизированных блоков
  const selectRef = useRef(onSelectEmployee)
  selectRef.current = onSelectEmployee
  const handleSelectEmployee = useCallback((employee: EmployeeWithStats) => selectRef.current(employee), [])

  const { monthSlots, trends, loading, error } = useDashboardAnalytics(employees, year, month)
  const { scores, loading: scoresLoading } = useEmployeeScores(employees)

  const admin = useEmployeeAdmin({ enabled: isAdmin, refreshKey, onEmployeesChanged, onSheetClose })
  const adminRef = useRef(admin)
  adminRef.current = admin
  const handleEdit = useCallback((employee: EmployeeWithStats) => adminRef.current.startEdit(employee), [])
  const handleArchive = useCallback((employee: EmployeeWithStats) => {
    void adminRef.current.quickArchive(employee)
  }, [])
  const handleToggleHideSalaries = useCallback(() => adminRef.current.toggleHideSalaries(), [])

  const adminActions = useMemo<IAdminRowActions | null>(() => (
    isAdmin
      ? { hideSalaries: admin.hideSalaries, archivingIds: admin.archivingIds, onEdit: handleEdit, onArchive: handleArchive }
      : null
  ), [admin.archivingIds, admin.hideSalaries, handleArchive, handleEdit, isAdmin])

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

  const summary = summarizeScope(scopedTrends, live)
  const allSubdivisions = buildSubdivisionRows(trends, presence.statuses, live, allAttentionItems)
  const presenceCounts = countPresence(scopedTrends, presence.statuses)
  const roundedProgress = Math.round(live.progress * PROGRESS_STEP) / PROGRESS_STEP

  const handleSelectSubdivision = (name: string) => {
    if (panelOpen && activeSubdivision === name) {
      setPanelOpen(false)
      setSelectedSubdivision(null)
      return
    }
    setSelectedSubdivision(name)
    setPanelOpen(true)
  }

  const handleSelectAll = () => {
    if (panelOpen && activeSubdivision === null) {
      setPanelOpen(false)
      return
    }
    setSelectedSubdivision(null)
    setPanelOpen(true)
  }

  const handleClosePanel = useCallback(() => {
    setPanelOpen(false)
    setSelectedSubdivision(null)
  }, [])

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

          <EmployeesSection
            rows={allSubdivisions.rows}
            total={allSubdivisions.total}
            isCurrentMonth={isCurrentMonth}
            selected={activeSubdivision}
            open={panelOpen}
            onSelectSubdivision={handleSelectSubdivision}
            onSelectAll={handleSelectAll}
            onClose={handleClosePanel}
            onOpenSheet={isAdmin ? onOpenSheet : null}
            panel={{
              trends: scopedTrends,
              isLive: isCurrentMonth,
              progress: roundedProgress,
              statuses: isCurrentMonth ? presence.statuses : null,
              scores,
              scoresLoading,
              severity,
              admin: adminActions,
              onToggleHideSalaries: handleToggleHideSalaries,
              onSelectEmployee: handleSelectEmployee
            }}
          />

          <AttentionList items={attentionItems} onSelectEmployee={handleSelectEmployee} />
        </div>
      </div>
      {adminLayer}
    </>
  )
}

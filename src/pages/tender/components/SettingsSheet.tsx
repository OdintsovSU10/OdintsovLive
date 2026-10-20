import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { BottomSheet } from '../../../components/ui/BottomSheet'
import { Toast } from '../../../components/ui/Toast'
import { useOverlayClose } from '../../../hooks/useOverlayClose'
import { useToast } from '../../../hooks/useToast'
import { ImportEmployeesModal } from './ImportEmployeesModal'
import { ImportSalaryHistoryModal } from './ImportSalaryHistoryModal'
import type { Employee } from '../types'
import { syncFotTimesheetMonth } from '../utils/fotTimesheetSync'
import './AdminSheets.css'

interface TimesheetSummary {
  year: number
  month: number
  records_count: number
  employees_count: number
}

interface Props {
  employees: Employee[]
  clearAllEmployees: () => Promise<void>
  onChanged: () => void
  onClose: () => void
}

const MONTH_NAMES = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
]

export function SettingsSheet({ employees, clearAllEmployees, onChanged, onClose }: Props) {
  const { toast, showToast, hideToast } = useToast()
  const [showImportEmployees, setShowImportEmployees] = useState(false)
  const [showImportSalaryHistory, setShowImportSalaryHistory] = useState(false)
  const [showConfirmClearSalaryHistory, setShowConfirmClearSalaryHistory] = useState(false)
  const [showConfirmClear, setShowConfirmClear] = useState(false)
  const [clearingSalaryHistory, setClearingSalaryHistory] = useState(false)
  const [clearingAll, setClearingAll] = useState(false)
  const [timesheetSummary, setTimesheetSummary] = useState<TimesheetSummary[]>([])
  const [loadingTimesheet, setLoadingTimesheet] = useState(false)
  const [timesheetYear, setTimesheetYear] = useState<number | null>(null)
  const [timesheetSyncYear, setTimesheetSyncYear] = useState(new Date().getFullYear())
  const [timesheetSyncMonth, setTimesheetSyncMonth] = useState(new Date().getMonth() + 1)
  const [syncingTimesheet, setSyncingTimesheet] = useState(false)

  const notify = (message: string, isError = false) => showToast({
    message,
    tone: isError ? 'error' : 'default',
    duration: isError ? 7000 : 3000
  })

  const loadTimesheetSummary = async () => {
    setLoadingTimesheet(true)
    try {
      const { data: activeEmployees, error: activeEmployeesError } = await supabase
        .from('tender_employees')
        .select('id')
        .eq('is_archived', false)

      if (activeEmployeesError) throw activeEmployeesError

      const activeEmployeeIds = (activeEmployees || []).map(item => item.id)
      if (activeEmployeeIds.length === 0) {
        setTimesheetSummary([])
        setTimesheetYear(prev => prev ?? new Date().getFullYear())
        return
      }

      const { data, error } = await supabase
        .from('tender_timesheet')
        .select('employee_id, work_date')
        .in('employee_id', activeEmployeeIds)

      if (error) throw error

      const summary: Record<string, { year: number; month: number; records: number; employees: Set<number> }> = {}
      for (const row of data || []) {
        const date = new Date(row.work_date)
        const year = date.getFullYear()
        const month = date.getMonth() + 1
        const key = `${year}-${month}`
        if (!summary[key]) {
          summary[key] = { year, month, records: 0, employees: new Set() }
        }
        summary[key].records++
        summary[key].employees.add(row.employee_id)
      }
      const result: TimesheetSummary[] = Object.values(summary)
        .map(s => ({
          year: s.year,
          month: s.month,
          records_count: s.records,
          employees_count: s.employees.size
        }))

      setTimesheetSummary(result)
      if (result.length > 0) {
        const latestYear = Math.max(...result.map(item => item.year))
        setTimesheetYear(prev => prev ?? latestYear)
      } else {
        setTimesheetYear(prev => prev ?? new Date().getFullYear())
      }
    } catch (err) {
      console.error('Error loading timesheet summary:', err)
      setTimesheetSummary([])
      setTimesheetYear(prev => prev ?? new Date().getFullYear())
    } finally {
      setLoadingTimesheet(false)
    }
  }

  useEffect(() => {
    void loadTimesheetSummary()
  }, [])

  const getMonthStatus = (month: number) => {
    if (!timesheetYear) return undefined
    return timesheetSummary.find(s => s.year === timesheetYear && s.month === month)
  }

  const displayYear = timesheetYear ?? new Date().getFullYear()

  const handleSyncTimesheetPeriod = async (year: number, month: number) => {
    setSyncingTimesheet(true)
    try {
      const result = await syncFotTimesheetMonth(year, month, employees)
      await loadTimesheetSummary()
      setTimesheetYear(year)
      onChanged()
      notify(`FOT табель: ${result.matched} строк, ${result.failed} ошибок`)
    } catch (err) {
      console.error('Error syncing FOT timesheet:', err)
      notify(err instanceof Error ? err.message : 'Ошибка синхронизации FOT', true)
    } finally {
      setSyncingTimesheet(false)
    }
  }

  const handleClearSalaryHistory = async () => {
    setClearingSalaryHistory(true)
    try {
      const { error } = await supabase
        .from('tender_salary_history')
        .delete()
        .neq('id', 0)

      if (error) throw error

      onChanged()
      setShowConfirmClearSalaryHistory(false)
      notify('История повышений очищена')
    } catch (err) {
      console.error('Error clearing salary history:', err)
      notify('Ошибка при очистке истории повышений', true)
    } finally {
      setClearingSalaryHistory(false)
    }
  }

  const handleClearAll = async () => {
    setClearingAll(true)
    try {
      await clearAllEmployees()
      await loadTimesheetSummary()
      onChanged()
      setShowConfirmClear(false)
      notify('Данные очищены')
    } catch {
      notify('Ошибка при очистке', true)
    } finally {
      setClearingAll(false)
    }
  }

  const clearSalaryOverlayClose = useOverlayClose(() => {
    if (!clearingSalaryHistory) setShowConfirmClearSalaryHistory(false)
  })
  const clearAllOverlayClose = useOverlayClose(() => {
    if (!clearingAll) setShowConfirmClear(false)
  })

  return (
    <>
      <BottomSheet title="Настройки" onClose={onClose}>
        <div className="tsh-settings">
          <div className="tsh-setting">
            <div className="tsh-setting-copy">
              <h3>Сотрудники</h3>
              <p>Синхронизация сотрудников из FOT API</p>
            </div>
            <button type="button" className="tsh-btn primary" onClick={() => setShowImportEmployees(true)}>Синхронизировать</button>
          </div>

          <div className="tsh-setting">
            <div className="tsh-setting-copy">
              <h3>История ЗП</h3>
              <p>Импорт изменений окладов сотрудников</p>
            </div>
            <button type="button" className="tsh-btn primary" onClick={() => setShowImportSalaryHistory(true)}>Импортировать</button>
          </div>

          <div className="tsh-setting">
            <div className="tsh-setting-copy">
              <h3>Загрузка табеля</h3>
            </div>
            <div className="tsh-year-nav">
              <button type="button" className="tsh-icon-btn" onClick={() => setTimesheetYear(displayYear - 1)} aria-label="Предыдущий год">←</button>
              <span className="tsh-year-title">{displayYear}</span>
              <button type="button" className="tsh-icon-btn" onClick={() => setTimesheetYear(displayYear + 1)} aria-label="Следующий год">→</button>
            </div>

            {loadingTimesheet ? (
              <div className="tsh-loading"><div className="tender-spinner" /></div>
            ) : (
              <div className="tsh-months-grid">
                {MONTH_NAMES.map((name, idx) => {
                  const month = idx + 1
                  const status = getMonthStatus(month)
                  return (
                    <div key={month} className={`tsh-month-card ${status ? 'loaded' : 'empty'}`}>
                      <div className="tsh-month-name">{name}</div>
                      <div className="tsh-month-status">
                        <span className={status ? 'tsh-check' : 'tsh-cross'}>{status ? '✓' : '✗'}</span>
                        <span>{status ? `${status.employees_count} сотр.` : 'нет данных'}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="tsh-setting">
            <div className="tsh-setting-copy">
              <h3>Табель</h3>
              <p>Ручная синхронизация табеля из FOT API</p>
            </div>
            <div className="tsh-period">
              <label className="tsh-period-field tsh-period-year">
                <span>Год</span>
                <input
                  type="number"
                  min="2000"
                  max="2100"
                  value={timesheetSyncYear}
                  onChange={event => setTimesheetSyncYear(Number(event.target.value))}
                  disabled={syncingTimesheet}
                />
              </label>
              <label className="tsh-period-field">
                <span>Месяц</span>
                <select
                  value={timesheetSyncMonth}
                  onChange={event => setTimesheetSyncMonth(Number(event.target.value))}
                  disabled={syncingTimesheet}
                >
                  {MONTH_NAMES.map((name, idx) => (
                    <option key={name} value={idx + 1}>{name}</option>
                  ))}
                </select>
              </label>
            </div>
            <button
              type="button"
              className="tsh-btn primary"
              onClick={() => handleSyncTimesheetPeriod(timesheetSyncYear, timesheetSyncMonth)}
              disabled={syncingTimesheet || employees.length === 0 || timesheetSyncYear < 2000 || timesheetSyncYear > 2100}
            >
              {syncingTimesheet ? 'Синхронизация...' : 'Синхронизировать'}
            </button>
          </div>

          <div className="tsh-setting">
            <div className="tsh-setting-copy">
              <h3>История повышений</h3>
              <p>Удалить всю историю изменений окладов</p>
            </div>
            <button type="button" className="tsh-btn danger" onClick={() => setShowConfirmClearSalaryHistory(true)}>Очистить</button>
          </div>

          <div className="tsh-setting">
            <div className="tsh-setting-copy">
              <h3>Все данные сотрудников</h3>
              <p>Удалить сотрудников и данные табеля</p>
            </div>
            <button type="button" className="tsh-btn danger" onClick={() => setShowConfirmClear(true)}>Удалить всё</button>
          </div>
        </div>
      </BottomSheet>

      {/* Модалки вне листа: у листа transform-анимация, внутри него position: fixed считался бы от панели */}
      {showImportEmployees && (
        <ImportEmployeesModal
          onClose={() => setShowImportEmployees(false)}
          onSuccess={() => {
            void loadTimesheetSummary()
            onChanged()
            notify('Сотрудники синхронизированы')
          }}
        />
      )}
      {showImportSalaryHistory && (
        <ImportSalaryHistoryModal
          onClose={() => setShowImportSalaryHistory(false)}
          onSuccess={() => {
            onChanged()
            notify('История окладов импортирована')
          }}
        />
      )}
      {showConfirmClearSalaryHistory && (
        <div className="tsh-confirm-overlay" {...clearSalaryOverlayClose}>
          <div className="tsh-confirm" role="alertdialog" aria-modal="true">
            <p>Удалить всю историю повышений окладов? Сотрудники и табель останутся без изменений.</p>
            <div className="tsh-confirm-actions">
              <button
                type="button"
                className="tsh-btn"
                onClick={() => setShowConfirmClearSalaryHistory(false)}
                disabled={clearingSalaryHistory}
              >
                Отмена
              </button>
              <button type="button" className="tsh-btn danger" onClick={handleClearSalaryHistory} disabled={clearingSalaryHistory}>
                {clearingSalaryHistory ? 'Удаление...' : 'Удалить повышения'}
              </button>
            </div>
          </div>
        </div>
      )}
      {showConfirmClear && (
        <div className="tsh-confirm-overlay" {...clearAllOverlayClose}>
          <div className="tsh-confirm" role="alertdialog" aria-modal="true">
            <p>Удалить всех сотрудников и данные табеля?</p>
            <div className="tsh-confirm-actions">
              <button type="button" className="tsh-btn" onClick={() => setShowConfirmClear(false)} disabled={clearingAll}>Отмена</button>
              <button type="button" className="tsh-btn danger" onClick={handleClearAll} disabled={clearingAll}>
                {clearingAll ? 'Удаление...' : 'Удалить всё'}
              </button>
            </div>
          </div>
        </div>
      )}
      <Toast toast={toast} onClose={hideToast} />
    </>
  )
}

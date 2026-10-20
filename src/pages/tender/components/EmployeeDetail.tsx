import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BottomSheet } from '../../../components/ui/BottomSheet'
import { useReducedMotion } from '../../../hooks/useReducedMotion'
import { useLivePayroll } from '../hooks/useLivePayroll'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { useEmployeeYearTimesheet } from '../hooks/useEmployeeYearTimesheet'
import { useEmployeeSkudMonth } from '../hooks/useEmployeeSkudMonth'
import { useEmployeeDetailData } from '../hooks/useEmployeeDetailData'
import { useEmployeeSalaryTimeline } from '../hooks/useEmployeeSalaryTimeline'
import { useEmployeeScore } from '../hooks/useEmployeeScore'
import { buildMonthDays, getSkudHoursByDate } from '../utils/attendanceDay'
import {
  getHireMonthIndex,
  monthIndex,
  MONTH_SHORT_GENITIVE,
  shiftMonth,
  toIsoDate,
  WEEKDAYS_SHORT,
  MONTH_GENITIVE
} from '../utils/employeeFormat'
import {
  getAgeFromBirthDate,
  getEmployeeInitials,
  getEmployeeTenureMonths,
  getMonthsSinceLastRaise
} from '../utils/tenderPresentation'
import type { EmployeeWithStats } from '../types'
import { EmployeeHeader } from './employee/EmployeeHeader'
import { EmployeeInfoSheet } from './employee/EmployeeInfoSheet'
import { MonthToolbar } from './employee/MonthToolbar'
import { PayrollCard } from './employee/PayrollCard'
import { ScoreChip } from './employee/ScoreChip'
import { AttendanceCalendar } from './employee/AttendanceCalendar'
import { DayPassesPanel } from './employee/DayPassesPanel'
import { YearDynamics, type DynamicsMode } from './employee/YearDynamics'
import { SalaryTimeline } from './employee/SalaryTimeline'
import './employee/EmployeeDetail.css'
import './employee/EmployeeHeader.css'
import './employee/EmployeeAttendance.css'
import './employee/EmployeeDynamics.css'
import './employee/EmployeeScore.css'
import './employee/ScoreChip.css'

const WIDE_QUERY = '(min-width: 1100px)'
const NO_PEERS: EmployeeWithStats[] = []
const DIALOG_SELECTOR = '.ui-sheet-root, [role="dialog"]'

interface DetailHistoryState {
  employeeDetail?: boolean
}

function hasDetailState(): boolean {
  return (window.history.state as DetailHistoryState | null)?.employeeDetail === true
}

function monthFromIndex(index: number): { year: number; month: number } {
  const year = Math.floor((index - 1) / 12)
  return { year, month: index - year * 12 }
}

export function EmployeeDetail({
  employee,
  year,
  month,
  peers = NO_PEERS,
  onBack
}: {
  employee: EmployeeWithStats
  year: number
  month: number
  // Сотрудники списка: из них берутся коллеги отдела для оценки
  peers?: EmployeeWithStats[]
  onBack: () => void
}) {
  const [chartYear, setChartYear] = useState(year)
  const [chartMonth, setChartMonth] = useState(month)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [infoOpen, setInfoOpen] = useState(false)
  const [dynamicsMode, setDynamicsMode] = useState<DynamicsMode>('income')
  const [today] = useState(() => new Date())
  const isWide = useMediaQuery(WIDE_QUERY)
  const reducedMotion = useReducedMotion()
  const dynamicsRef = useRef<HTMLDivElement>(null)

  const yearTimesheet = useEmployeeYearTimesheet(employee.id, chartYear)
  const skud = useEmployeeSkudMonth(employee.fot_employee_id, chartYear, chartMonth)
  const data = useEmployeeDetailData(employee, chartYear, chartMonth, yearTimesheet.entries, yearTimesheet.plans)
  const timeline = useEmployeeSalaryTimeline(employee)
  const live = useLivePayroll(data.monthlyPlan, chartYear, chartMonth)
  const score = useEmployeeScore(employee, peers, chartYear)

  const onBackRef = useRef(onBack)
  const mountedRef = useRef(false)
  const backHandledRef = useRef(false)

  useEffect(() => {
    onBackRef.current = onBack
  }, [onBack])

  useEffect(() => {
    setChartYear(year)
    setChartMonth(month)
    setSelectedDate(null)
    setInfoOpen(false)
    setDynamicsMode('income')
  }, [employee.id, month, year])

  // Системная кнопка «назад» закрывает карточку, а не уходит со страницы
  useEffect(() => {
    mountedRef.current = true
    backHandledRef.current = false
    // StrictMode монтирует эффект дважды: вторая запись в историю не нужна
    if (!hasDetailState()) {
      window.history.pushState({ ...(window.history.state as object | null), employeeDetail: true }, '')
    }

    const handlePopState = () => {
      if (hasDetailState() || backHandledRef.current) return
      backHandledRef.current = true
      onBackRef.current()
    }
    window.addEventListener('popstate', handlePopState)

    return () => {
      mountedRef.current = false
      window.removeEventListener('popstate', handlePopState)
      // Карточка закрыта не «назад» (архивация, вкладка): убираем лишнюю запись истории
      window.setTimeout(() => {
        if (!mountedRef.current && hasDetailState()) window.history.back()
      }, 0)
    }
  }, [])

  const goBack = useCallback(() => {
    if (hasDetailState()) {
      window.history.back()
    } else if (!backHandledRef.current) {
      backHandledRef.current = true
      onBackRef.current()
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      if (!window.matchMedia(WIDE_QUERY).matches) return
      if (document.querySelector(DIALOG_SELECTOR)) return
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      goBack()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [goBack])

  const todayYear = today.getFullYear()
  const todayMonth = today.getMonth() + 1
  const currentIndex = monthIndex(todayYear, todayMonth)
  const chartIndex = monthIndex(chartYear, chartMonth)
  const hireIndex = getHireMonthIndex(employee.hire_date)
  const hireYear = hireIndex === null ? null : monthFromIndex(hireIndex).year
  const isCurrentMonth = chartIndex === currentIndex
  const canPrev = hireIndex === null || chartIndex > hireIndex
  const canNext = chartIndex < currentIndex

  const changeMonth = useCallback((nextYear: number, nextMonth: number) => {
    setChartYear(nextYear)
    setChartMonth(nextMonth)
    setSelectedDate(null)
  }, [])

  const shiftBy = (offset: number) => {
    const next = shiftMonth(chartYear, chartMonth, offset)
    changeMonth(next.year, next.month)
  }

  const shiftYear = (direction: -1 | 1) => {
    const target = chartIndex + direction * 12
    let nextIndex = target
    if (nextIndex > currentIndex) nextIndex = currentIndex
    if (hireIndex !== null && nextIndex < hireIndex) nextIndex = hireIndex
    const next = monthFromIndex(nextIndex)
    changeMonth(next.year, next.month)
  }

  const skudHoursByDate = useMemo(
    () => getSkudHoursByDate(skud.eventsByDate, today),
    [skud.eventsByDate, today]
  )
  const days = useMemo(
    () => buildMonthDays(chartYear, chartMonth, data.entriesByDay, skudHoursByDate, today, yearTimesheet.plans),
    [chartMonth, chartYear, data.entriesByDay, skudHoursByDate, today, yearTimesheet.plans]
  )

  // Проходы дня — только в модалке и только по нажатию на день
  const selectedDay = selectedDate ? Number(selectedDate.slice(8, 10)) : null
  const selectedInfo = selectedDay ? days[selectedDay - 1] ?? null : null
  const sheetOpen = selectedDate !== null

  const selectDay = (day: number) => setSelectedDate(toIsoDate(chartYear, chartMonth, day))

  // Из подсказки оценки: «Динамика за год» в режиме «Оценка» и прокрутка к ней
  const showScoreMonthly = useCallback(() => {
    setDynamicsMode('score')
    // Даём подсказке или шторке закрыться, чтобы прокрутка не блокировалась
    window.setTimeout(() => {
      dynamicsRef.current?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' })
    }, 60)
  }, [reducedMotion])

  const swipeEnabled = !isWide && !sheetOpen
  const noRaiseMonths = useMemo(() => getMonthsSinceLastRaise(employee), [employee])
  const tenureMonths = useMemo(() => getEmployeeTenureMonths(employee), [employee])
  const ageYears = useMemo(() => getAgeFromBirthDate(employee.birth_date), [employee.birth_date])

  const sheetDate = selectedDay ? new Date(chartYear, chartMonth - 1, selectedDay) : null
  const prevDay = selectedDay && selectedDay > 1 ? selectedDay - 1 : null
  const nextDay = selectedDay && selectedDay < days.length && !days[selectedDay].disabled ? selectedDay + 1 : null

  return (
    <section className="emp-page">
      <div className="emp-main">
        <EmployeeHeader
          fullName={employee.full_name}
          initials={getEmployeeInitials(employee)}
          position={employee.position}
          department={employee.department}
          subdivision={employee.subdivision}
          ageYears={ageYears}
          tenureMonths={tenureMonths}
          noRaiseMonths={noRaiseMonths}
          scoreChip={(
            <ScoreChip
              view={score.view}
              loading={score.loading}
              error={score.error}
              noRaiseMonths={noRaiseMonths}
              onRetry={score.reload}
              onShowMonthly={showScoreMonthly}
            />
          )}
          monthSwitcher={(
            <MonthToolbar
              year={chartYear}
              month={chartMonth}
              canPrev={canPrev}
              canNext={canNext}
              isCurrent={isCurrentMonth}
              onPrev={() => shiftBy(-1)}
              onNext={() => shiftBy(1)}
              onToday={() => changeMonth(todayYear, todayMonth)}
            />
          )}
          onBack={goBack}
          onOpenInfo={() => setInfoOpen(true)}
        />

        <div className="emp-layout">
          <div className="emp-area-payroll">
            <PayrollCard
              year={chartYear}
              month={chartMonth}
              live={live}
              plan={data.monthlyPlan}
              timesheetEarned={data.point.earned}
              loading={yearTimesheet.loading}
            />
          </div>

          <div className="emp-area-attendance">
            <AttendanceCalendar
              year={chartYear}
              month={chartMonth}
              days={days}
              summary={data.point}
              loading={yearTimesheet.loading}
              error={yearTimesheet.error}
              selectedDay={selectedDay}
              onSelect={selectDay}
              onRetry={yearTimesheet.reload}
              onSwipePrev={swipeEnabled && canPrev ? () => shiftBy(-1) : null}
              onSwipeNext={swipeEnabled && canNext ? () => shiftBy(1) : null}
            />
          </div>

          <div ref={dynamicsRef} className="emp-area-dynamics">
            <YearDynamics
              year={chartYear}
              month={chartMonth}
              history={data.history}
              loading={yearTimesheet.loading}
              error={yearTimesheet.error}
              averageMonthlyIncome={data.averageMonthlyIncome}
              averageWeekendIncome={data.averageWeekendIncome}
              hasYearData={data.hasYearData}
              minIndex={hireIndex}
              maxIndex={currentIndex}
              canPrevYear={hireYear === null || chartYear > hireYear}
              canNextYear={chartYear < todayYear}
              scoreMonthly={score.view?.monthly ?? null}
              scoreLoading={score.loading}
              scoreError={score.error}
              mode={dynamicsMode}
              onModeChange={setDynamicsMode}
              onSelectMonth={monthValue => changeMonth(chartYear, monthValue)}
              onShiftYear={shiftYear}
              onRetry={yearTimesheet.reload}
              onRetryScore={score.reload}
            />
          </div>

          <div className="emp-area-salary">
            <SalaryTimeline
              salary={data.baseSalary}
              monthlyBonus={employee.monthly_bonus || 0}
              transport={data.transport}
              items={timeline.items}
              latestRaise={timeline.latestRaise}
              loading={timeline.loadingEvents}
            />
          </div>
        </div>
      </div>

      {infoOpen && (
        <EmployeeInfoSheet
          employee={employee}
          initials={getEmployeeInitials(employee)}
          ageYears={ageYears}
          tenureMonths={tenureMonths}
          noRaiseMonths={noRaiseMonths}
          onClose={() => setInfoOpen(false)}
        />
      )}

      {sheetOpen && sheetDate && selectedDay && (
        <BottomSheet
          variant="modal"
          title={`${WEEKDAYS_SHORT[sheetDate.getDay()]}, ${selectedDay} ${MONTH_GENITIVE[chartMonth - 1]}`}
          onClose={() => setSelectedDate(null)}
          footer={(
            <div className="emp-sheet-nav">
              <button
                type="button"
                className="emp-text-btn"
                disabled={prevDay === null}
                onClick={() => prevDay && selectDay(prevDay)}
              >
                {prevDay ? `‹ ${prevDay} ${MONTH_SHORT_GENITIVE[chartMonth - 1]}` : '‹'}
              </button>
              <button
                type="button"
                className="emp-text-btn"
                disabled={nextDay === null}
                onClick={() => nextDay && selectDay(nextDay)}
              >
                {nextDay ? `${nextDay} ${MONTH_SHORT_GENITIVE[chartMonth - 1]} ›` : '›'}
              </button>
            </div>
          )}
        >
          <DayPassesPanel
            fotEmployeeId={employee.fot_employee_id}
            date={selectedDate}
            info={selectedInfo}
            skud={skud}
          />
        </BottomSheet>
      )}
    </section>
  )
}

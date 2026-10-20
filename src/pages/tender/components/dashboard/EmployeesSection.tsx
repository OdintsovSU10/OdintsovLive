import { useEffect, useMemo, useRef, type FC } from 'react'
import { Building2, Plus } from 'lucide-react'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { EmployeesPanel, type IEmployeesPanelProps } from './EmployeesPanel'
import type { ISubdivisionRow } from './dashboardMetrics'
import type { AdminPanelSheet } from './dashboardTypes'
import { SubdivisionsList } from './SubdivisionsList'
import { SubdivisionsOverview } from './SubdivisionsOverview'

const ALL_EMPLOYEES_TITLE = 'Все сотрудники'

type PanelProps = Omit<IEmployeesPanelProps, 'title' | 'onClose' | 'compact' | 'headExtra'>

interface IEmployeesSectionProps {
  rows: ISubdivisionRow[]
  total: ISubdivisionRow
  isCurrentMonth: boolean
  // Выбранное подразделение; null — все сотрудники (если панель открыта)
  selected: string | null
  open: boolean
  onSelectSubdivision: (name: string) => void
  onSelectAll: () => void
  onClose: () => void
  // Открыть лист администратора; null — не админ. На телефоне кнопки стоят здесь, на широком экране — в строке вкладок
  onOpenSheet: ((sheet: AdminPanelSheet) => void) | null
  panel: PanelProps
}

// Иконки «Подразделения» и «Добавить сотрудника» для телефона
const PhoneActions: FC<{ onOpenSheet: (sheet: AdminPanelSheet) => void }> = ({ onOpenSheet }) => (
  <div className="dash-section-actions">
    <button
      type="button"
      className="dash-emp-icon-toggle"
      onClick={() => onOpenSheet('subdivisions')}
      aria-label="Подразделения"
      title="Подразделения"
    >
      <Building2 size={18} strokeWidth={1.5} />
    </button>
    <button
      type="button"
      className="dash-emp-icon-toggle is-primary"
      onClick={() => onOpenSheet('addEmployee')}
      aria-label="Добавить сотрудника"
      title="Добавить сотрудника"
    >
      <Plus size={18} strokeWidth={1.5} />
    </button>
  </div>
)

// Секция «Сотрудники»: таблица подразделений, по клику — список людей справа (на узком экране вместо таблицы)
export const EmployeesSection: FC<IEmployeesSectionProps> = ({
  rows,
  total,
  isCurrentMonth,
  selected,
  open,
  onSelectSubdivision,
  onSelectAll,
  onClose,
  onOpenSheet,
  panel
}) => {
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const isPhone = !useMediaQuery('(min-width: 768px)')
  // Элемент мемоизирован, чтобы не сбивать memo панели людей
  const phoneActions = useMemo(
    () => (onOpenSheet && isPhone ? <PhoneActions onOpenSheet={onOpenSheet} /> : null),
    [isPhone, onOpenSheet]
  )
  const sectionRef = useRef<HTMLElement>(null)
  const desktopRef = useRef(isDesktop)
  desktopRef.current = isDesktop

  // На узком экране панель заменяет таблицу: возвращаем взгляд к началу секции
  useEffect(() => {
    if (open && !desktopRef.current) sectionRef.current?.scrollIntoView({ block: 'start' })
  }, [open])

  const panelTitle = selected ?? ALL_EMPLOYEES_TITLE

  return (
    <section ref={sectionRef} className="dash-card dash-emp-section">
      {!open && (
        <>
          <div className="dash-card-head">
            <h3 className="dash-card-title">Сотрудники</h3>
            <div className="dash-section-tools">
              <button type="button" className="dash-filter-chip" onClick={onSelectAll}>
                {ALL_EMPLOYEES_TITLE}
              </button>
              {phoneActions}
            </div>
          </div>
          <SubdivisionsOverview
            rows={rows}
            total={total}
            isCurrentMonth={isCurrentMonth}
            onSelect={onSelectSubdivision}
          />
        </>
      )}

      {open && (
        <div className={`dash-emp-split${isDesktop ? ' is-split' : ''}`}>
          {isDesktop && (
            <SubdivisionsList
              rows={rows}
              total={total}
              selected={selected}
              isCurrentMonth={isCurrentMonth}
              onSelect={onSelectSubdivision}
              onSelectAll={onSelectAll}
            />
          )}
          <EmployeesPanel {...panel} title={panelTitle} compact={!isDesktop} headExtra={phoneActions} onClose={onClose} />
        </div>
      )}
    </section>
  )
}

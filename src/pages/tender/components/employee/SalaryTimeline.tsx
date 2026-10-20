import { useState } from 'react'
import { Archive, ArchiveRestore, ChevronDown } from 'lucide-react'
import type { SalaryRaiseTimelineItem, SalaryTimelineItem } from '../../hooks/useEmployeeSalaryTimeline'
import { formatRub, formatShortDate } from '../../utils/employeeFormat'
import { useMediaQuery } from '../../hooks/useMediaQuery'

const VISIBLE_ITEMS = 5

interface Props {
  salary: number
  monthlyBonus: number
  transport: number
  items: SalaryTimelineItem[]
  latestRaise: SalaryRaiseTimelineItem | null
  loading: boolean
}

function formatInterval(months: number): string {
  return months > 0 ? `через ${months} мес` : 'менее месяца'
}

export function SalaryTimeline({ salary, monthlyBonus, transport, items, latestRaise, loading }: Props) {
  const isWide = useMediaQuery('(min-width: 1100px)')
  // Пока пользователь не нажимал — на широком экране развёрнуто, на телефоне свёрнуто
  const [userOpen, setUserOpen] = useState<boolean | null>(null)
  const [showAll, setShowAll] = useState(false)
  const open = userOpen ?? isWide
  const visibleItems = showAll ? items : items.slice(0, VISIBLE_ITEMS)

  const summary = latestRaise
    ? `Оклад ${formatRub(salary)} · повышение ${formatShortDate(latestRaise.date)} (+${Math.round(latestRaise.deltaPercent)}%)`
    : `Оклад ${formatRub(salary)} · Повышений не было`

  return (
    <section className="emp-card emp-salary" aria-label="Оклад и события">
      <h3 className="emp-visually-hidden">Оклад и события</h3>
      <button
        type="button"
        className="emp-salary-toggle"
        onClick={() => setUserOpen(!open)}
        aria-expanded={open}
        aria-controls="emp-salary-body"
      >
        <span>{summary}</span>
        <ChevronDown size={20} className={open ? 'open' : ''} aria-hidden="true" />
      </button>

      {open && (
        <div id="emp-salary-body" className="emp-salary-body">
          <dl className="emp-salary-facts">
            <div><dt>Базовый оклад</dt><dd>{formatRub(salary)}</dd></div>
            <div><dt>Ежемесячный бонус</dt><dd>{formatRub(monthlyBonus)}</dd></div>
            <div><dt>Проезд</dt><dd>{formatRub(transport)}</dd></div>
          </dl>

          {loading && items.length === 0 ? (
            <p className="emp-hint">Загрузка событий…</p>
          ) : items.length === 0 ? (
            <p className="emp-hint">История сотрудника пуста</p>
          ) : (
            <ol className="emp-events">
              {visibleItems.map(item => (
                item.kind === 'raise' ? (
                  <li key={item.key} className="emp-event raise">
                    <i className="emp-event-dot" aria-hidden="true" />
                    <p className="emp-event-title">
                      {formatShortDate(item.date)} · +{formatRub(item.delta)}
                      {item.deltaPercent > 0 && ` (+${Math.round(item.deltaPercent)}%)`}
                    </p>
                    <p className="emp-event-sub">
                      {item.fromSalary.toLocaleString('ru-RU')} → {formatRub(item.toSalary)} · {formatInterval(item.monthsBetween)}
                    </p>
                    {item.note && <p className="emp-event-note">{item.note}</p>}
                  </li>
                ) : (
                  <li key={item.key} className="emp-event archive">
                    <span className="emp-event-icon" aria-hidden="true">
                      {item.eventType === 'archive' ? <Archive size={14} /> : <ArchiveRestore size={14} />}
                    </span>
                    <p className="emp-event-title">
                      {formatShortDate(item.date)} · {item.eventType === 'archive' ? 'Перемещён в архив' : 'Возвращён из архива'}
                    </p>
                    {item.note && <p className="emp-event-note">{item.note}</p>}
                  </li>
                )
              ))}
            </ol>
          )}

          {!showAll && items.length > VISIBLE_ITEMS && (
            <button type="button" className="emp-text-btn" onClick={() => setShowAll(true)}>
              Показать все ({items.length})
            </button>
          )}
        </div>
      )}
    </section>
  )
}

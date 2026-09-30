import { useEffect, useMemo, useState } from 'react'
import { ReceiptText } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { MONTHS, MONTHS_SHORT } from '../../lib/constants'
import { formatRub } from '../../components/charts/chartUtils'
import { isCountable } from '../expenses/utils/analysis'
import { getSpendingGroup } from '../expenses/utils/spendingGroups'
import type { ExpenseTransaction } from '../expenses/types'
import { CardPlaceholder, HomeCard } from './HomeCard'

type Row = Pick<ExpenseTransaction,
  'operation_date' | 'payment_amount' | 'flow_direction' | 'bank_category' | 'status' | 'description' | 'include_in_analytics'>

interface Props {
  userId: string
}

const FIELDS = 'operation_date, payment_amount, flow_direction, bank_category, status, description, include_in_analytics'
const TOP_GROUPS = 3

const isoDay = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

const formatShortDay = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS_SHORT[Number(iso.slice(5, 7)) - 1]}`

// Траты с начала месяца против того же отрезка прошлого месяца — сравнение без перекоса
export function ExpensesCard({ userId }: Props) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [today] = useState(() => new Date())

  const range = useMemo(() => {
    const day = today.getDate()
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
    const prevStart = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    const prevDays = new Date(today.getFullYear(), today.getMonth(), 0).getDate()
    const prevEnd = new Date(today.getFullYear(), today.getMonth() - 1, Math.min(day, prevDays))
    return { day, from: isoDay(monthStart), prevFrom: isoDay(prevStart), prevTo: isoDay(prevEnd) }
  }, [today])

  useEffect(() => {
    supabase
      .from('expense_transactions')
      .select(FIELDS)
      .eq('user_id', userId)
      .gte('operation_date', range.prevFrom)
      .then(({ data }) => setRows((data || []) as Row[]))
  }, [userId, range.prevFrom])

  const stats = useMemo(() => {
    if (!rows) return null
    const spend = rows.filter(t => t.flow_direction === 'out' && isCountable(t))
    const sum = (list: Row[]) => list.reduce((acc, t) => acc + Math.abs(t.payment_amount), 0)

    const current = spend.filter(t => t.operation_date >= range.from)
    const previous = spend.filter(t => t.operation_date >= range.prevFrom && t.operation_date <= range.prevTo)
    const spent = sum(current)
    const prevSpent = sum(previous)

    const byGroup = new Map<string, { name: string; value: number }>()
    for (const t of current) {
      const group = getSpendingGroup(t.bank_category)
      const item = byGroup.get(group.key) || { name: group.name, value: 0 }
      item.value += Math.abs(t.payment_amount)
      byGroup.set(group.key, item)
    }
    const groups = Array.from(byGroup.values()).sort((a, b) => b.value - a.value).slice(0, TOP_GROUPS)
    const lastDate = rows.reduce((max, t) => (t.operation_date > max ? t.operation_date : max), '')

    return {
      spent,
      perDay: spent / range.day,
      change: prevSpent > 0 ? (spent - prevSpent) / prevSpent : null,
      groups,
      lastDate
    }
  }, [rows, range])

  const aside = MONTHS[today.getMonth()]

  if (!stats) {
    return <HomeCard Icon={ReceiptText} title="Траты" to="/expenses" aside={aside}><CardPlaceholder /></HomeCard>
  }

  return (
    <HomeCard Icon={ReceiptText} title="Траты" to="/expenses" aside={aside}>
      <div className="home-value">{formatRub(stats.spent)}</div>
      <div className="home-hint">
        {formatRub(stats.perDay)} в день
        {stats.change !== null && (
          <span className={`home-change ${stats.change > 0 ? 'up' : 'down'}`}>
            {' · '}{stats.change > 0 ? '+' : '−'}{Math.round(Math.abs(stats.change) * 100)}% к прошлому месяцу
          </span>
        )}
      </div>
      {stats.groups.length > 0 && (
        <div className="home-rows">
          {stats.groups.map(group => (
            <div key={group.name} className="home-share">
              <div className="home-row"><span>{group.name}</span><span>{formatRub(group.value)}</span></div>
              <div className="home-share-bar">
                <div className="home-share-fill" style={{ transform: `scaleX(${stats.spent > 0 ? group.value / stats.spent : 0})` }} />
              </div>
            </div>
          ))}
        </div>
      )}
      {stats.lastDate && <div className="home-hint home-foot">последняя операция {formatShortDay(stats.lastDate)}</div>}
    </HomeCard>
  )
}

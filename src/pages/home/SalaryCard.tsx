import { Wallet } from 'lucide-react'
import { formatRub } from '../../components/charts/chartUtils'
import { MONTHS } from '../../lib/constants'
import { CardPlaceholder, HomeCard } from './HomeCard'
import type { SalarySummary } from './useSalarySummary'

interface Props {
  summary: SalarySummary | null
}

export function SalaryCard({ summary }: Props) {
  if (!summary) {
    return <HomeCard Icon={Wallet} title="Зарплата" to="/salary"><CardPlaceholder /></HomeCard>
  }

  const debt = summary.ytdEarned - summary.ytdPaid

  return (
    <HomeCard Icon={Wallet} title="Зарплата" to={`/salary/${summary.year}/${summary.month}`} aside={MONTHS[summary.month]}>
      <div className="home-value">{formatRub(summary.earned)}</div>
      <div className="home-hint">начислено за месяц</div>
      <div className="home-rows">
        <div className="home-row"><span>Выплачено за месяц</span><span>{formatRub(summary.paid)}</span></div>
        <div className="home-row"><span>Начислено с начала года</span><span>{formatRub(summary.ytdEarned)}</span></div>
        <div className="home-row">
          <span>{debt >= 0 ? 'Ещё не выплачено' : 'Выплачено сверх'}</span>
          <span>{formatRub(Math.abs(debt))}</span>
        </div>
      </div>
    </HomeCard>
  )
}

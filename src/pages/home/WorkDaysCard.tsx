import { CalendarDays } from 'lucide-react'
import { MONTHS } from '../../lib/constants'
import { CardPlaceholder, HomeCard } from './HomeCard'
import type { SalarySummary } from './useSalarySummary'

interface Props {
  summary: SalarySummary | null
}

export function WorkDaysCard({ summary }: Props) {
  if (!summary) {
    return <HomeCard Icon={CalendarDays} title="Рабочие дни" to="/calendar" span="half"><CardPlaceholder /></HomeCard>
  }

  const { stats, norm } = summary
  const share = norm > 0 ? Math.min(stats.work / norm, 1) : 0

  return (
    <HomeCard Icon={CalendarDays} title="Рабочие дни" to="/calendar" span="half" aside={MONTHS[summary.month]}>
      <div className="home-value">{stats.work}<span className="home-value-of"> из {norm}</span></div>
      <div className="home-progress" role="progressbar" aria-valuemin={0} aria-valuemax={norm} aria-valuenow={stats.work}>
        <div className="home-progress-fill" style={{ transform: `scaleX(${share})` }} />
      </div>
      {(stats.worked > 0 || stats.vacation > 0) && (
        <div className="home-hint">
          {stats.worked > 0 && <>в выходные: {stats.worked}<br /></>}
          {stats.vacation > 0 && `отпуск: ${stats.vacation} дн.`}
        </div>
      )}
    </HomeCard>
  )
}

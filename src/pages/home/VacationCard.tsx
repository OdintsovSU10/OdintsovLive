import { Umbrella } from 'lucide-react'
import { formatRub } from '../../components/charts/chartUtils'
import { CardPlaceholder, HomeCard } from './HomeCard'
import type { SalarySummary } from './useSalarySummary'

interface Props {
  summary: SalarySummary | null
}

export function VacationCard({ summary }: Props) {
  return (
    <HomeCard Icon={Umbrella} title="Отпускные" to="/vacation-rate" span="half">
      {!summary || summary.vacationRate <= 0 ? (
        <CardPlaceholder />
      ) : (
        <>
          <div className="home-value">{formatRub(summary.vacationRate)}</div>
          <div className="home-hint">
            в день отпуска<br />
            {summary.yearVacationDays > 0 ? `в ${summary.year}: ${summary.yearVacationDays} дн. отпуска` : `в ${summary.year} отпуска не было`}
          </div>
        </>
      )}
    </HomeCard>
  )
}

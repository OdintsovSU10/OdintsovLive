import Logo from '../components/Logo'
import WeatherWidget from '../components/WeatherWidget'
import { useMoscowDateTime } from '../hooks/useMoscowDateTime'
import { BotFeedCard } from './home/BotFeedCard'
import { CarSummaryCard } from './home/CarSummaryCard'
import { ExpensesCard } from './home/ExpensesCard'
import { RentCard } from './home/RentCard'
import { SalaryCard } from './home/SalaryCard'
import { useSalarySummary } from './home/useSalarySummary'
import { VacationCard } from './home/VacationCard'
import { WorkDaysCard } from './home/WorkDaysCard'
import './HomePage.css'

interface Props {
  userId: string
}

export default function HomePage({ userId }: Props) {
  const dateTime = useMoscowDateTime({ dateFormat: 'long', includeSeconds: true })
  const salary = useSalarySummary(userId)

  return (
    <div className="home-page">
      <div className="home-content">
        <Logo size={80} />
        <div className="home-datetime">
          <span className="home-date">{dateTime.date}</span>
          <span className="home-time">{dateTime.time}</span>
        </div>

        <WeatherWidget />

        <div className="home-grid">
          <ExpensesCard userId={userId} />
          <WorkDaysCard summary={salary} />
          <VacationCard summary={salary} />
          <SalaryCard summary={salary} />
          <RentCard userId={userId} />
          <CarSummaryCard />
          <BotFeedCard userId={userId} />
        </div>
      </div>
    </div>
  )
}

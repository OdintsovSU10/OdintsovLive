import Logo from '../components/Logo'
import WeatherWidget from '../components/WeatherWidget'
import { BotFeedCard } from './home/BotFeedCard'
import { CarSummaryCard } from './home/CarSummaryCard'
import { ExpensesCard } from './home/ExpensesCard'
import { HomeClock } from './home/HomeClock'
import { RentCard } from './home/RentCard'
import { SalaryCard } from './home/SalaryCard'
import { useSalarySummary } from './home/useSalarySummary'
import { WorkDaysCard } from './home/WorkDaysCard'
import './HomePage.css'

interface Props {
  userId: string
}

export default function HomePage({ userId }: Props) {
  const salary = useSalarySummary(userId)

  return (
    <div className="home-page">
      <div className="home-content">
        <Logo size={80} />
        <HomeClock />

        <WeatherWidget />

        <div className="home-grid">
          <ExpensesCard userId={userId} />
          <WorkDaysCard summary={salary} />
          <SalaryCard summary={salary} />
          <RentCard userId={userId} />
          <CarSummaryCard />
          <BotFeedCard userId={userId} />
        </div>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Home } from 'lucide-react'
import { MONTHS } from '../../lib/constants'
import { loadCardState, type CardState } from '../rent/CurrentMonthCard'
import { CardPlaceholder, HomeCard } from './HomeCard'

interface Props {
  userId: string
}

// Тот же месяц и статус, что в карточке на странице «Аренда»
export function RentCard({ userId }: Props) {
  const [card, setCard] = useState<CardState | null>(null)

  useEffect(() => {
    loadCardState(userId).then(setCard)
  }, [userId])

  if (!card) {
    return <HomeCard Icon={Home} title="Аренда" to="/rent"><CardPlaceholder /></HomeCard>
  }

  return (
    <HomeCard
      Icon={Home}
      title="Аренда"
      to={`/rent/${card.year}/${card.month}`}
      aside={`${MONTHS[card.month]} ${card.year}`}
      tone={card.paid ? 'ok' : 'warning'}
    >
      <div className="home-value small">{card.status}</div>
    </HomeCard>
  )
}

import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, type LucideIcon } from 'lucide-react'

export type CardTone = 'ok' | 'warning' | 'danger'

interface Props {
  Icon: LucideIcon
  title: string
  /** Без ссылки карточка не кликается */
  to?: string
  aside?: string
  /** На телефоне: half — полширины, full — вся ширина и на широком экране */
  span?: 'half' | 'full'
  tone?: CardTone
  children: ReactNode
}

// Оболочка карточки главной: шапка с иконкой, тело — показатели раздела
export function HomeCard({ Icon, title, to, aside, span, tone, children }: Props) {
  const className = ['home-card', span, tone].filter(Boolean).join(' ')
  const head = (
    <div className="home-card-head">
      <span className="home-card-icon"><Icon size={18} strokeWidth={1.5} /></span>
      <span className="home-card-title">{title}</span>
      {aside && <span className="home-card-aside">{aside}</span>}
      {to && <ChevronRight size={16} className="home-card-arrow" />}
    </div>
  )

  if (!to) {
    return <section className={className}>{head}{children}</section>
  }
  return <Link to={to} className={className}>{head}{children}</Link>
}

export function CardPlaceholder({ text = '—' }: { text?: string }) {
  return <div className="home-value muted">{text}</div>
}

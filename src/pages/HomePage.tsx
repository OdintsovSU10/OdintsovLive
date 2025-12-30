import { Link } from 'react-router-dom'
import { Calendar, Wallet } from 'lucide-react'
import Logo from '../components/Logo'
import './HomePage.css'

const pages = [
  { path: '/calendar', Icon: Calendar, title: 'Календарь', desc: 'Учёт рабочих дней' },
  { path: '/salary', Icon: Wallet, title: 'Зарплата', desc: 'Расчёт заработка' },
]

export default function HomePage() {
  return (
    <div className="home-page">
      <div className="home-content">
        <Logo size={80} />
        <p className="subtitle">Персональный портал</p>

        <div className="quick-links">
          {pages.map(p => (
            <Link key={p.path} to={p.path} className="quick-card">
              <div className="quick-icon">
                <p.Icon size={28} strokeWidth={1.5} />
              </div>
              <span className="quick-title">{p.title}</span>
              <span className="quick-desc">{p.desc}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

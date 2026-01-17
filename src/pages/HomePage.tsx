import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Calendar, Wallet, Umbrella, Home, Scale, Ruler, StickyNote, Car, Users } from 'lucide-react'
import Logo from '../components/Logo'
import WeatherWidget from '../components/WeatherWidget'
import './HomePage.css'

const pages = [
  { path: '/tender', Icon: Users, title: 'Тендерный отдел', desc: 'Сотрудники отдела' },
  { path: '/notes', Icon: StickyNote, title: 'Заметки', desc: 'Личные записи' },
  { path: '/calendar', Icon: Calendar, title: 'Календарь', desc: 'Учёт рабочих дней' },
  { path: '/salary', Icon: Wallet, title: 'Зарплата', desc: 'Расчёт заработка' },
  { path: '/vacation-rate', Icon: Umbrella, title: 'Отпускные', desc: 'Расчёт ставки' },
  { path: '/rent', Icon: Home, title: 'Аренда', desc: 'Платежи за квартиру' },
  { path: '/body/weight', Icon: Scale, title: 'Мой вес', desc: 'Трекер веса' },
  { path: '/body/params', Icon: Ruler, title: 'Параметры', desc: 'Замеры тела' },
  { path: '/car', Icon: Car, title: 'Машина', desc: 'Учёт авто' },
]

export default function HomePage() {
  const [dateTime, setDateTime] = useState({ date: '', time: '' })

  useEffect(() => {
    const updateDateTime = () => {
      const now = new Date()
      const date = now.toLocaleDateString('ru-RU', {
        timeZone: 'Europe/Moscow',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      }).replace(' г.', '')
      const time = now.toLocaleTimeString('ru-RU', {
        timeZone: 'Europe/Moscow',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })
      setDateTime({ date, time })
    }
    updateDateTime()
    const interval = setInterval(updateDateTime, 1000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="home-page">
      <div className="home-content">
        <Logo size={80} />
        <div className="home-datetime">
          <span className="home-date">{dateTime.date}</span>
          <span className="home-time">{dateTime.time}</span>
        </div>

        <WeatherWidget />

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

import { useMoscowDateTime } from '../../hooks/useMoscowDateTime'

// Часы с секундами живут отдельно: раз в секунду перерисовываются только они, а не вся главная
export function HomeClock() {
  const dateTime = useMoscowDateTime({ dateFormat: 'long', includeSeconds: true })

  return (
    <div className="home-datetime">
      <span className="home-date">{dateTime.date}</span>
      <span className="home-time">{dateTime.time}</span>
    </div>
  )
}

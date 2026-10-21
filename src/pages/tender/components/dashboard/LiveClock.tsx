import { memo, useEffect, useState } from 'react'

const CLOCK_FORMATTER = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Europe/Moscow',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit'
})

const formatClock = (): string => CLOCK_FORMATTER.format(new Date())

// Тикает раз в секунду только сам: страница вокруг не перерисовывается
export const LiveClock = memo(() => {
  const [clock, setClock] = useState(formatClock)

  useEffect(() => {
    const timer = window.setInterval(() => setClock(formatClock()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  return <span className="dash-clock">{clock} МСК</span>
})

LiveClock.displayName = 'LiveClock'

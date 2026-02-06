import { useEffect, useState } from 'react'

type DateFormat = 'short' | 'long'

interface UseMoscowDateTimeOptions {
  dateFormat?: DateFormat
  includeSeconds?: boolean
}

interface MoscowDateTime {
  date: string
  time: string
  dateTime: string
}

function formatMoscowDateTime(dateFormat: DateFormat, includeSeconds: boolean): MoscowDateTime {
  const now = new Date()
  const date = now
    .toLocaleDateString('ru-RU', {
      timeZone: 'Europe/Moscow',
      day: 'numeric',
      month: dateFormat === 'long' ? 'long' : 'short',
      ...(dateFormat === 'long' ? { year: 'numeric' } : {}),
    })
    .replace(' г.', '')

  const time = now.toLocaleTimeString('ru-RU', {
    timeZone: 'Europe/Moscow',
    hour: '2-digit',
    minute: '2-digit',
    ...(includeSeconds ? { second: '2-digit' } : {}),
  })

  return {
    date,
    time,
    dateTime: `${date}, ${time}`,
  }
}

export function useMoscowDateTime(options: UseMoscowDateTimeOptions = {}): MoscowDateTime {
  const { dateFormat = 'short', includeSeconds = false } = options
  const [dateTime, setDateTime] = useState<MoscowDateTime>(() => formatMoscowDateTime(dateFormat, includeSeconds))

  useEffect(() => {
    const update = () => setDateTime(formatMoscowDateTime(dateFormat, includeSeconds))
    update()

    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [dateFormat, includeSeconds])

  return dateTime
}

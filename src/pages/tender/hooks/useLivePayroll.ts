import { useEffect, useMemo, useState } from 'react'
import { calculateLivePayrollSnapshot } from '../utils/livePayroll'

export function useLivePayroll(plannedMonthlyTotal: number, year: number, month: number) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const update = () => setNow(Date.now())
    update()

    const interval = window.setInterval(update, 1000)
    return () => window.clearInterval(interval)
  }, [])

  return useMemo(
    () => calculateLivePayrollSnapshot(plannedMonthlyTotal, year, month, new Date(now)),
    [month, now, plannedMonthlyTotal, year]
  )
}

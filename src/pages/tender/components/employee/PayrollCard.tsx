import { useEffect, useRef, useState } from 'react'
import type { LivePayrollSnapshot } from '../../utils/livePayroll'
import { formatLiveMoney, formatLiveNumber, getLivePayrollPauseLabel } from '../../utils/livePayroll'
import { formatRub } from '../../utils/employeeFormat'

const ARIA_UPDATE_MS = 60 * 1000

// Значение для aria-valuenow: обновляется не чаще раза в минуту (или сразу при смене месяца)
function useSlowValue(value: number, resetKey: string): number {
  const [slow, setSlow] = useState(value)
  const lastRef = useRef({ at: Date.now(), key: resetKey })

  useEffect(() => {
    const last = lastRef.current
    if (last.key !== resetKey || Date.now() - last.at >= ARIA_UPDATE_MS) {
      lastRef.current = { at: Date.now(), key: resetKey }
      setSlow(value)
    }
  }, [resetKey, value])

  return slow
}

interface Props {
  year: number
  month: number
  live: LivePayrollSnapshot
  plan: number
  // Начислено по табелю за месяц
  timesheetEarned: number
  loading: boolean
}

export function PayrollCard({ year, month, live, plan, timesheetEarned, loading }: Props) {
  const accrued = live.isLive ? live.accrued : timesheetEarned
  const progress = plan > 0 ? Math.min(100, Math.max(0, (accrued / plan) * 100)) : 0
  const ariaProgress = useSlowValue(Math.round(progress), `${year}-${month}`)
  const showTimesheetLine = !loading && live.isLive && Math.round(timesheetEarned) !== Math.round(accrued)

  let statusLine = 'Период завершён'
  if (live.isLive) {
    statusLine = live.isAccruing
      ? `+${formatLiveMoney(live.ratePerSecond)} / сек`
      : getLivePayrollPauseLabel(live.accrualState)
  }

  return (
    <section className="emp-card emp-payroll" aria-label="Начисление за месяц">
      <div className="emp-payroll-head">
        <span className={`emp-payroll-label ${live.isLive ? 'live' : ''}`}>
          {live.isLive ? <><i aria-hidden="true" />Живое начисление</> : 'Расчёт периода'}
        </span>
      </div>

      <div className="emp-payroll-total">
        <small>Начислено</small>
        <strong>{loading ? '—' : `${formatLiveNumber(accrued)} ₽`}</strong>
        <span className={live.isAccruing && !loading ? 'accruing' : ''}>{loading ? '' : statusLine}</span>
      </div>

      <div
        className={`emp-progress ${loading ? 'skeleton' : ''}`}
        role="progressbar"
        aria-label="Выполнение плана начисления"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={loading ? undefined : ariaProgress}
      >
        <div style={{ width: loading ? '0%' : `${progress}%` }} />
      </div>
      <p className="emp-payroll-plan">
        {loading ? '—' : `${Math.round(progress)}% · из ${formatRub(plan)}`}
      </p>

      <p className="emp-payroll-sheet">
        {showTimesheetLine ? `По табелю ${formatRub(timesheetEarned)}` : ''}
      </p>
    </section>
  )
}

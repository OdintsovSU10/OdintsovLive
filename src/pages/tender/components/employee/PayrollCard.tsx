import { useEffect, useRef, useState } from 'react'
import { Info } from 'lucide-react'
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

// Полоса на всю ширину: сумма, прогресс (на телефоне — отдельной строкой) и доля плана; скорость и «по табелю» спрятаны в ⓘ
export function PayrollCard({ year, month, live, plan, timesheetEarned, loading }: Props) {
  const [infoOpen, setInfoOpen] = useState(false)
  const accrued = live.isLive ? live.accrued : timesheetEarned
  const progress = plan > 0 ? Math.min(100, Math.max(0, (accrued / plan) * 100)) : 0
  const ariaProgress = useSlowValue(Math.round(progress), `${year}-${month}`)
  const showTimesheetLine = !loading && live.isLive && Math.round(timesheetEarned) !== Math.round(accrued)

  let statusLine = 'Период завершён'
  if (live.isLive) {
    statusLine = live.isAccruing
      ? `+${formatLiveMoney(live.ratePerSecond)}/сек`
      : getLivePayrollPauseLabel(live.accrualState)
  }
  const timesheetLine = showTimesheetLine ? `По табелю ${formatRub(timesheetEarned)}` : ''
  const titleText = [statusLine, timesheetLine].filter(Boolean).join(' · ')

  return (
    <section className="emp-card emp-payroll" aria-label="Начисление за месяц" title={loading ? undefined : titleText}>
      <div className="emp-payroll-row">
        <div className="emp-payroll-total">
          <span className={`emp-payroll-label ${live.isLive ? 'live' : ''}`}>
            {live.isLive && <i aria-hidden="true" />}Начислено
          </span>
          <strong>{loading ? '—' : `${formatLiveNumber(accrued)} ₽`}</strong>
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
          {loading ? '—' : <><b>{Math.round(progress)}%</b> <span>из {formatRub(plan)}</span></>}
        </p>
        <button
          type="button"
          className="emp-icon-btn"
          onClick={() => setInfoOpen(value => !value)}
          aria-expanded={infoOpen}
          aria-controls="emp-payroll-info"
          aria-label="Подробности начисления"
        >
          <Info size={16} aria-hidden="true" />
        </button>
      </div>

      {infoOpen && (
        <div id="emp-payroll-info" className="emp-payroll-info">
          <p className={live.isAccruing ? 'accruing' : ''}>{loading ? '—' : statusLine}</p>
          <p>{timesheetLine || 'Совпадает с табелем'}</p>
        </div>
      )}
    </section>
  )
}

import type { FC } from 'react'
import { formatMoney } from '../utils/salaryCalculator'
import { formatLiveMoney, getLivePayrollPauseLabel } from '../utils/livePayroll'
import type { useLivePayroll } from '../hooks/useLivePayroll'
import './DepartmentFOT.css'

export type FotGrowthTone = 'over' | 'under' | 'equal'

interface IFotSummaryBarProps {
  /** Итого ФОТ по табелю */
  totalFinal: number
  /** Базовый ФОТ (оклады + бонусы) */
  baseFot: number
  growthAbsolute: number
  growthPercent: number
  growthTone: FotGrowthTone
  livePayroll: ReturnType<typeof useLivePayroll>
  livePayrollColor: string
  employeesCount: number
  workDaysNorm: number
  weekendsNorm: number
  baseTransport: number
  onTransportChange: (value: number) => void
}

export const FotSummaryBar: FC<IFotSummaryBarProps> = ({
  totalFinal,
  baseFot,
  growthAbsolute,
  growthPercent,
  growthTone,
  livePayroll,
  livePayrollColor,
  employeesCount,
  workDaysNorm,
  weekendsNorm,
  baseTransport,
  onTransportChange
}) => {
  const { isLive } = livePayroll
  const growthSign = growthAbsolute > 0 ? '▲' : growthAbsolute < 0 ? '▼' : '•'
  const growthHint = isLive
    ? `По табелю: ${formatMoney(totalFinal)}`
    : `Отклонение от базы: ${formatMoney(growthAbsolute)}`

  return (
    <section className="fot-summary-bar">
      <div className="fot-summary-total">
        <div className="fot-summary-total-main">
          <strong
            className={`fot-total ${isLive ? 'live' : growthTone}`}
            style={isLive ? {
              color: livePayrollColor,
              textShadow: `0 0 24px color-mix(in srgb, ${livePayrollColor} 22%, transparent)`
            } : undefined}
          >
            {isLive ? formatLiveMoney(livePayroll.accrued) : formatMoney(totalFinal)}
          </strong>
          <span className={`fot-growth ${growthTone}`} title={growthHint}>
            {growthSign} {Math.abs(growthPercent).toFixed(1)}%
          </span>
        </div>
        <div className="fot-summary-meta">
          <span>{isLive ? 'Начислено сейчас' : 'Итого ФОТ'}</span>
          <span>База {formatMoney(baseFot)}</span>
          {isLive && (
            <span
              className={`fot-live-rate${livePayroll.isAccruing ? '' : ' paused'}`}
              style={livePayroll.isAccruing ? { color: livePayrollColor } : undefined}
            >
              {livePayroll.isAccruing
                ? `● +${formatLiveMoney(livePayroll.ratePerSecond)} / сек`
                : `● ${getLivePayrollPauseLabel(livePayroll.accrualState)}`}
            </span>
          )}
        </div>
      </div>

      <div className="fot-kpi-chip">
        <strong>{employeesCount}</strong>
        <small>Сотрудников</small>
      </div>
      <div className="fot-kpi-chip">
        <strong>{workDaysNorm}</strong>
        <small>Раб. дней</small>
      </div>
      <div className="fot-kpi-chip">
        <strong>{weekendsNorm}</strong>
        <small>Выходных</small>
      </div>

      <label className="fot-transport-control">
        <span>Проезд / день</span>
        <div>
          <input
            type="number"
            value={baseTransport}
            onChange={event => onTransportChange(Number(event.target.value))}
          />
          <b>₽</b>
        </div>
      </label>
    </section>
  )
}

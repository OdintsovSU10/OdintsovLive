import { MONTHS } from '../../../lib/constants'
import { formatRub } from '../../../components/charts/chartUtils'

interface IKpiTilesProps {
  year: number
  earnedToDate: number
  paidTotal: number
  debt: number
  forecastYear: number
  salarySource: 'tender' | 'personal'
}

export const KpiTiles = ({ year, earnedToDate, paidTotal, debt, forecastYear, salarySource }: IKpiTilesProps) => {
  const now = new Date()
  const earnedHint = year === now.getFullYear() ? `по ${MONTHS[now.getMonth()].toLowerCase()}` : 'за год'

  // Нулём считаем остаток меньше рубля: копейки не должны давать «долг»
  const roundedDebt = Math.round(debt)
  const isDebt = roundedDebt > 0
  const isOverpaid = roundedDebt < 0

  return (
    <section className="sd-kpi" aria-label="Итоги за год">
      <div className="sd-kpi-grid">
        <div className="sd-kpi-tile">
          <span className="sd-kpi-label">Начислено</span>
          <strong className="sd-kpi-value">{formatRub(earnedToDate)}</strong>
          <span className="sd-kpi-hint">{earnedHint}</span>
        </div>

        <div className="sd-kpi-tile">
          <span className="sd-kpi-label">Выплачено</span>
          <strong className="sd-kpi-value">{formatRub(paidTotal)}</strong>
        </div>

        <div className="sd-kpi-tile">
          <span className="sd-kpi-label">{isOverpaid ? 'Переплата' : 'Долг'}</span>
          {isDebt || isOverpaid ? (
            <strong className={`sd-kpi-value ${isDebt ? 'debt' : 'over'}`}>{formatRub(Math.abs(roundedDebt))}</strong>
          ) : (
            <span className="sd-kpi-hint ok">Всё выплачено</span>
          )}
          {(isDebt || isOverpaid) && <span className="sd-kpi-hint">за прошлые месяцы</span>}
        </div>

        <div className="sd-kpi-tile">
          <span className="sd-kpi-label">Прогноз за год</span>
          <strong className="sd-kpi-value">{formatRub(forecastYear)}</strong>
          <span className="sd-kpi-hint">с планом из «Дней»</span>
        </div>
      </div>

      <p className="sd-kpi-source">
        {salarySource === 'tender'
          ? 'Оклад и дни — из табеля тендерного управления'
          : 'Табель не привязан — дни из календаря'}
      </p>
    </section>
  )
}

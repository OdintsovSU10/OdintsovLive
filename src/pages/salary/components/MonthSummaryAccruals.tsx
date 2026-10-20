import { formatRub } from '../../../components/charts/chartUtils'
import type { IMonthRow } from './MonthsTable'

interface IAccrualLine {
  key: string
  label: string
  amount: number
  // Формула: «21 дн. × 16 667 ₽»
  caption: string
  // Токен цвета полоски доли
  color: string
}

interface IMonthSummaryAccrualsProps {
  row: IMonthRow
}

// Состав начислений; формулы те же, что в calcEarned (utils.ts)
const buildLines = (row: IMonthRow): IAccrualLine[] => {
  const { stats, dailyRate, vacationRate, norm, transport, bonus } = row
  const transportRate = transport / norm
  const lines: IAccrualLine[] = [
    {
      key: 'work',
      label: 'Оклад за рабочие дни',
      amount: dailyRate * stats.work,
      caption: `${stats.work} дн. × ${formatRub(dailyRate)}`,
      color: 'var(--chart-1)'
    },
    {
      key: 'worked',
      label: 'Работа в выходные',
      amount: dailyRate * stats.worked,
      caption: `${stats.worked} дн. × ${formatRub(dailyRate)}`,
      color: 'var(--chart-2)'
    },
    {
      key: 'vacation',
      label: 'Отпускные',
      amount: stats.vacation * vacationRate,
      caption: `${stats.vacation} дн. × ${formatRub(vacationRate)}`,
      color: 'var(--chart-4)'
    },
    {
      key: 'transport',
      label: 'Проезд',
      amount: transportRate * stats.work,
      caption: `${stats.work} дн. × ${formatRub(transportRate)}`,
      color: 'var(--chart-7)'
    },
    {
      key: 'bonus',
      label: 'Премия',
      amount: bonus,
      caption: 'Задаётся в настройках месяца',
      color: 'var(--chart-5)'
    }
  ]
  return lines.filter(line => Math.round(line.amount) !== 0)
}

export const MonthSummaryAccruals = ({ row }: IMonthSummaryAccrualsProps) => {
  const lines = buildLines(row)
  const total = lines.reduce((sum, line) => sum + line.amount, 0)

  return (
    <section className="ms-card" aria-label="Начисления">
      <h3 className="ms-card-title">Начисления</h3>

      {lines.length === 0 ? (
        <p className="ms-note">Начислений пока нет</p>
      ) : (
        <ul className="ms-accruals">
          {lines.map(line => {
            const share = total > 0 ? Math.min(Math.max(line.amount / total, 0), 1) : 0
            return (
              <li key={line.key} className="ms-accrual">
                <div className="ms-accrual-top">
                  <span className="ms-accrual-label">{line.label}</span>
                  <span className="ms-accrual-amount">{formatRub(line.amount)}</span>
                  <span className="ms-accrual-share">{Math.round(share * 100)} %</span>
                </div>
                <div className="ms-bar" aria-hidden="true">
                  <span className="ms-bar-fill" style={{ transform: `scaleX(${share})`, background: line.color }} />
                </div>
                <span className="ms-accrual-caption">{line.caption}</span>
              </li>
            )
          })}
        </ul>
      )}

      <div className="ms-total">
        <span>Итого начислено</span>
        <span className="ms-total-amount">{formatRub(row.earned)}</span>
      </div>
    </section>
  )
}

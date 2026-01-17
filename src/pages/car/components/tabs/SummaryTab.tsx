import { AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { MONTHS } from '../../../../lib/constants'
import type { CarType, MaintenanceType, FuelType, ExpenseType, ChartTab } from '../../types'
import { formatPrice, formatMileage, getExpensesChartData, getMileageChartData, getFuelPriceChartData, calculateTotals } from '../../utils'

interface Props {
  selectedCar: CarType
  maintenance: MaintenanceType[]
  fuel: FuelType[]
  expenses: ExpenseType[]
  chartTab: ChartTab
  setChartTab: (tab: ChartTab) => void
}

export function SummaryTab({ selectedCar, maintenance, fuel, expenses, chartTab, setChartTab }: Props) {
  const totals = calculateTotals(selectedCar, maintenance, fuel, expenses)
  const expensesData = getExpensesChartData(selectedCar, maintenance, fuel, expenses)
  const mileageData = getMileageChartData(selectedCar, maintenance, fuel)
  const fuelData = getFuelPriceChartData(selectedCar, fuel)

  const hasChartData = () => {
    if (chartTab === 'expenses') return expensesData.length > 1
    if (chartTab === 'mileage') return mileageData.length > 1
    if (chartTab === 'fuel') return fuelData.length > 0
    return false
  }

  return (
    <div className="summary-tab">
      <div className="car-info-card">
        {selectedCar.vin && <div className="car-vin-header">{selectedCar.vin}</div>}
        <div className="car-info-grid">
          <div className="info-item">
            <span className="info-label">Год выпуска</span>
            <span className="info-value">
              {selectedCar.manufacture_month ? MONTHS[selectedCar.manufacture_month - 1] + ' ' : ''}
              {selectedCar.manufacture_year}
            </span>
          </div>
          <div className="info-item">
            <span className="info-label">Дата покупки</span>
            <span className="info-value">
              {new Date(selectedCar.purchase_date).toLocaleDateString('ru-RU')}
            </span>
          </div>
          <div className="info-item">
            <span className="info-label">Пробег при покупке</span>
            <span className="info-value">{formatMileage(selectedCar.purchase_mileage)}</span>
          </div>
          <div className="info-item">
            <span className="info-label">Текущий пробег</span>
            <span className="info-value highlight">{formatMileage(selectedCar.current_mileage)}</span>
          </div>
          <div className="info-item">
            <span className="info-label">Пройдено</span>
            <span className="info-value">
              {formatMileage(selectedCar.current_mileage - selectedCar.purchase_mileage)}
            </span>
          </div>
          <div className="info-item">
            <span className="info-label">Стоимость покупки</span>
            <span className="info-value">{formatPrice(selectedCar.purchase_price)}</span>
          </div>
          <div className="info-item">
            <span className="info-label">Всего расходов</span>
            <span className="info-value">{formatPrice(totals.allExpensesTotal)}</span>
          </div>
          <div className="info-item">
            <span className="info-label">Общая стоимость</span>
            <span className="info-value highlight">{formatPrice(totals.totalCarCost)}</span>
          </div>
        </div>
      </div>

      <div className="car-chart-card">
        <div className="chart-tabs">
          <button className={`chart-tab ${chartTab === 'expenses' ? 'active' : ''}`} onClick={() => setChartTab('expenses')}>
            Расходы
          </button>
          <button className={`chart-tab ${chartTab === 'mileage' ? 'active' : ''}`} onClick={() => setChartTab('mileage')}>
            Пробег
          </button>
          <button className={`chart-tab ${chartTab === 'fuel' ? 'active' : ''}`} onClick={() => setChartTab('fuel')}>
            Бензин
          </button>
        </div>

        {hasChartData() ? (
          <div className="chart-container">
            <ResponsiveContainer width="100%" height={220}>
              {chartTab === 'expenses' ? (
                <AreaChart data={expensesData}>
                  <defs>
                    <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="var(--primary)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v) => v >= 1000000 ? `${(v / 1000000).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} кк` : `${(v / 1000).toFixed(0)}к`} tick={{ fontSize: 11 }} width={50} />
                  <Tooltip formatter={(value) => [formatPrice(value as number), 'Итого']} />
                  <Area type="monotone" dataKey="total" stroke="var(--primary)" strokeWidth={2} fill="url(#colorTotal)" />
                </AreaChart>
              ) : chartTab === 'mileage' ? (
                <AreaChart data={mileageData}>
                  <defs>
                    <linearGradient id="colorMileage" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v) => v >= 1000000 ? `${(v / 1000000).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} кк` : `${(v / 1000).toFixed(0)}к`} tick={{ fontSize: 11 }} width={50} />
                  <Tooltip formatter={(value) => [formatMileage(value as number), 'Пробег']} />
                  <Area type="monotone" dataKey="mileage" stroke="#3b82f6" strokeWidth={2} fill="url(#colorMileage)" />
                </AreaChart>
              ) : (
                <LineChart data={fuelData}>
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v) => `${v}₽`} tick={{ fontSize: 11 }} width={45} domain={['dataMin - 2', 'dataMax + 2']} />
                  <Tooltip formatter={(value) => value ? [`${value} ₽/л`, ''] : ['-', '']} />
                  <Legend />
                  <Line type="monotone" dataKey="ai95" name="АИ-95" stroke="#22c55e" strokeWidth={2} dot={{ r: 4 }} connectNulls />
                  <Line type="monotone" dataKey="ai100" name="АИ-100" stroke="#f59e0b" strokeWidth={2} dot={{ r: 4 }} connectNulls />
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="chart-empty">
            {chartTab === 'expenses' && 'Добавьте расходы для отображения графика'}
            {chartTab === 'mileage' && 'Добавьте записи с пробегом'}
            {chartTab === 'fuel' && 'Добавьте заправки с ценой за литр'}
          </div>
        )}
      </div>
    </div>
  )
}

import { useSearchParams } from 'react-router-dom'
import Calendar from '../../components/Calendar'
import SalaryMonthsTab from './SalaryMonthsTab'
import VacationRateTab from './VacationRateTab'
import '../SalaryPage.css'

type SalaryTab = 'months' | 'vacation' | 'days'

const TABS: { id: SalaryTab; label: string }[] = [
  { id: 'months', label: 'Месяцы' },
  { id: 'vacation', label: 'Отпускные' },
  { id: 'days', label: 'Дни' }
]

const parseTab = (value: string | null): SalaryTab =>
  value === 'vacation' || value === 'days' ? value : 'months'

export default function SalaryPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = parseTab(searchParams.get('tab'))

  const selectTab = (next: SalaryTab) => {
    if (next === tab) return
    setSearchParams(next === 'months' ? {} : { tab: next })
  }

  return (
    <div className="salary-shell">
      <div className="salary-tabs" role="tablist" aria-label="Разделы зарплаты">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`salary-tab ${tab === id ? 'active' : ''}`}
            onClick={() => selectTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {tab === 'months' && <SalaryMonthsTab />}
        {tab === 'vacation' && <VacationRateTab />}
        {tab === 'days' && <Calendar />}
      </div>
    </div>
  )
}

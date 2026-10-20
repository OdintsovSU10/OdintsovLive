import { useSearchParams } from 'react-router-dom'
import { PageTabs } from '../../components/PageTabs'
import Calendar from '../../components/Calendar'
import SalaryDashboardTab from './SalaryDashboardTab'
import VacationRateTab from './VacationRateTab'
import '../SalaryPage.css'

type SalaryTab = 'months' | 'vacation' | 'days'

const TABS: { id: SalaryTab; label: string }[] = [
  { id: 'months', label: 'Обзор' },
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
      <PageTabs tabs={TABS} active={tab} onChange={selectTab} ariaLabel="Разделы зарплаты" />

      <div role="tabpanel">
        {tab === 'months' && <SalaryDashboardTab />}
        {tab === 'vacation' && <VacationRateTab />}
        {tab === 'days' && <Calendar />}
      </div>
    </div>
  )
}

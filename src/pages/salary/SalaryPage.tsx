import { useSearchParams } from 'react-router-dom'
import { YEARS } from '../../lib/constants'
import { PageTabs } from '../../components/PageTabs'
import Calendar from '../../components/Calendar'
import SalaryDashboardTab from './SalaryDashboardTab'
import VacationRateTab from './VacationRateTab'
import { YearSwitch } from './components/YearSwitch'
import '../SalaryPage.css'

type SalaryTab = 'months' | 'vacation' | 'days'

const TABS: { id: SalaryTab; label: string }[] = [
  { id: 'months', label: 'Обзор' },
  { id: 'vacation', label: 'Отпускные' },
  { id: 'days', label: 'Дни' }
]

const parseTab = (value: string | null): SalaryTab =>
  value === 'vacation' || value === 'days' ? value : 'months'

const parseYear = (value: string | null): number => {
  const year = Number(value)
  return value !== null && YEARS.includes(year) ? year : new Date().getFullYear()
}

export default function SalaryPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = parseTab(searchParams.get('tab'))
  const year = parseYear(searchParams.get('year'))

  const selectTab = (next: SalaryTab) => {
    if (next === tab) return
    // Год сохраняем, раскрытый месяц сбрасываем
    const params = new URLSearchParams()
    if (next !== 'months') params.set('tab', next)
    const yearParam = searchParams.get('year')
    if (yearParam) params.set('year', yearParam)
    setSearchParams(params)
  }

  const changeYear = (next: number) => {
    if (next === year) return
    const params = new URLSearchParams(searchParams)
    params.set('year', String(next))
    params.delete('month')
    setSearchParams(params)
  }

  return (
    <div className="salary-shell">
      <div className="salary-toolbar">
        <PageTabs tabs={TABS} active={tab} onChange={selectTab} ariaLabel="Разделы зарплаты" />
        <YearSwitch year={year} onChange={changeYear} />
      </div>

      <div role="tabpanel">
        {tab === 'months' && <SalaryDashboardTab year={year} />}
        {tab === 'vacation' && <VacationRateTab year={year} />}
        {tab === 'days' && <Calendar year={year} />}
      </div>
    </div>
  )
}

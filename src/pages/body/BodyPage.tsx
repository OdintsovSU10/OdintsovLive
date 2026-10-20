import { useSearchParams } from 'react-router-dom'
import { PageTabs } from '../../components/PageTabs'
import WeightTab from './WeightTab'
import BodyParamsTab from './BodyParamsTab'
import './BodyPage.css'

type BodyTab = 'weight' | 'params'

const TABS: { id: BodyTab; label: string }[] = [
  { id: 'weight', label: 'Вес' },
  { id: 'params', label: 'Параметры' }
]

const parseTab = (value: string | null): BodyTab =>
  value === 'params' ? value : 'weight'

export default function BodyPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = parseTab(searchParams.get('tab'))

  const selectTab = (next: BodyTab) => {
    if (next === tab) return
    setSearchParams(next === 'weight' ? {} : { tab: next })
  }

  return (
    <div className="body-shell">
      <PageTabs tabs={TABS} active={tab} onChange={selectTab} ariaLabel="Разделы «Тело»" />

      <div role="tabpanel">
        {tab === 'weight' && <WeightTab />}
        {tab === 'params' && <BodyParamsTab />}
      </div>
    </div>
  )
}

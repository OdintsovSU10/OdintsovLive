import { useSearchParams } from 'react-router-dom'
import { PageTabs } from '../../components/PageTabs'
import { FeedTab } from './FeedTab'
import { ChannelsTab } from './ChannelsTab'
import { SettingsTab } from './SettingsTab'
import styles from './NewsPage.module.css'

type NewsTab = 'feed' | 'channels' | 'settings'

const TABS: { id: NewsTab; label: string }[] = [
  { id: 'feed', label: 'Лента' },
  { id: 'channels', label: 'Каналы' },
  { id: 'settings', label: 'Настройки' }
]

const parseTab = (value: string | null): NewsTab =>
  value === 'channels' || value === 'settings' ? value : 'feed'

export default function NewsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = parseTab(searchParams.get('tab'))

  const selectTab = (next: NewsTab) => {
    if (next === tab) return
    setSearchParams(next === 'feed' ? {} : { tab: next })
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>Новости</h1>
      </header>

      <PageTabs tabs={TABS} active={tab} onChange={selectTab} ariaLabel="Разделы новостей" />

      <div role="tabpanel">
        {tab === 'feed' && <FeedTab />}
        {tab === 'channels' && <ChannelsTab />}
        {tab === 'settings' && <SettingsTab />}
      </div>
    </div>
  )
}

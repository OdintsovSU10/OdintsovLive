import { useSearchParams } from 'react-router-dom'
import { ArrowLeft, Settings } from 'lucide-react'
import { NewsMain } from './NewsMain'
import { SettingsTab } from './SettingsTab'
import styles from './NewsPage.module.css'

export default function NewsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  // Старые ?tab=feed и ?tab=channels открывают основной вид
  const inSettings = searchParams.get('tab') === 'settings'

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>Новости</h1>
        {inSettings ? (
          <button type="button" className={styles.backBtn} onClick={() => setSearchParams({})}>
            <ArrowLeft size={18} strokeWidth={1.5} />
            К ленте
          </button>
        ) : (
          <button
            type="button"
            className={styles.iconBtn}
            aria-label="Настройки"
            title="Настройки"
            onClick={() => setSearchParams({ tab: 'settings' })}
          >
            <Settings size={20} strokeWidth={1.5} />
          </button>
        )}
      </header>

      {inSettings ? (
        <div className={styles.settings}>
          <SettingsTab />
        </div>
      ) : (
        <NewsMain />
      )}
    </div>
  )
}

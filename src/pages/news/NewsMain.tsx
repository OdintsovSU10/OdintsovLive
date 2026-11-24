import { useMemo, useState, type FC } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BottomSheet } from '../../components/ui/BottomSheet'
import { Toast } from '../../components/ui/Toast'
import { useToast } from '../../hooks/useToast'
import { ChannelSidebar } from './ChannelSidebar'
import { FeedTab } from './FeedTab'
import { NewsHeader } from './NewsHeader'
import { getFeedFilter, isSpecialSelection, SELECT_ALL } from './newsSelection'
import { SettingsTab } from './SettingsTab'
import { useNewsChannels } from './useNewsChannels'
import { useNewsCounts } from './useNewsCounts'
import type { NewsPeriod } from './newsDates'
import styles from './NewsMain.module.css'

export const NewsMain: FC = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const { channels, loading, error, add, setEnabled, remove } = useNewsChannels()
  const { toast, showToast, hideToast } = useToast()
  const [period, setPeriod] = useState<NewsPeriod>('week')

  const channelKey = useMemo(() => channels.map(channel => channel.id).join(','), [channels])
  const counts = useNewsCounts(period, channelKey, !loading)

  const channelNames = useMemo(() => {
    const map = new Map<string, string>()
    channels.forEach(channel => map.set(channel.id, channel.title || `@${channel.username}`))
    return map
  }, [channels])

  // ?ch=all | important | <id канала>; неизвестный id (канал удалён) — «Все»
  const requested = searchParams.get('ch') || SELECT_ALL
  const selectedChannel = channels.find(channel => channel.id === requested) ?? null
  const selection = isSpecialSelection(requested) || selectedChannel || loading ? requested : SELECT_ALL
  const { channelId, minImportance } = getFeedFilter(selection)

  // Настройки — модалка поверх ленты; открыта, пока в адресе tab=settings (старые ссылки тоже открывают её)
  const settingsOpen = searchParams.get('tab') === 'settings'

  const openSettings = () => {
    setSearchParams(prev => {
      const params = new URLSearchParams(prev)
      params.set('tab', 'settings')
      return params
    })
  }

  const closeSettings = () => {
    setSearchParams(prev => {
      const params = new URLSearchParams(prev)
      params.delete('tab')
      return params
    }, { replace: true })
  }

  const select = (next: string) => {
    if (next === selection) return
    setSearchParams(next === SELECT_ALL ? {} : { ch: next })
  }

  const handleAdd = async (username: string) => {
    const result = await add(username)
    if (result.status === 'ok' && result.id) select(result.id)
    return result
  }

  const handleToggle = async (id: string, enabled: boolean) => {
    if (!(await setEnabled(id, enabled))) showToast({ message: 'Не удалось сохранить', tone: 'error' })
  }

  const handleDelete = async (id: string) => {
    if (await remove(id)) select(SELECT_ALL)
    else showToast({ message: 'Не удалось удалить', tone: 'error' })
  }

  return (
    <div className={styles.root}>
      <NewsHeader
        key={selection}
        selection={selection}
        channel={selectedChannel}
        onToggle={enabled => selectedChannel && void handleToggle(selectedChannel.id, enabled)}
        onDelete={() => selectedChannel && void handleDelete(selectedChannel.id)}
        onOpenSettings={openSettings}
      />
      <div className={styles.layout}>
        <ChannelSidebar
          channels={channels}
          channelsLoading={loading}
          selection={selection}
          counts={counts}
          onSelect={select}
          onAdd={handleAdd}
        />
        <div className={styles.content}>
          <FeedTab
            period={period}
            onPeriodChange={setPeriod}
            channelId={channelId}
            minImportance={minImportance}
            channelNames={channelNames}
            hasChannels={channels.length > 0}
            error={error}
          />
        </div>
      </div>
      {settingsOpen && (
        <BottomSheet title="Настройки новостей" variant="modal" onClose={closeSettings}>
          <div className={styles.settingsBody}>
            <SettingsTab />
          </div>
        </BottomSheet>
      )}
      <Toast toast={toast} onClose={hideToast} />
    </div>
  )
}

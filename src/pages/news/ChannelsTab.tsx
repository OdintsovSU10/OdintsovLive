import { useState, type FC, type FormEvent } from 'react'
import { ClearableInput } from '../../components/ui/ClearableInput'
import { Toast } from '../../components/ui/Toast'
import { useToast } from '../../hooks/useToast'
import { ChannelRow } from './ChannelRow'
import { normalizeChannel } from './normalizeChannel'
import { useNewsChannels } from './useNewsChannels'
import shared from './NewsShared.module.css'
import styles from './ChannelsTab.module.css'

export const ChannelsTab: FC = () => {
  const { channels, counts, loading, error, add, setEnabled, remove } = useNewsChannels(true)
  const { toast, showToast, hideToast } = useToast()
  const [input, setInput] = useState('')
  const [inputError, setInputError] = useState<string | null>(null)
  const [added, setAdded] = useState(false)
  const [adding, setAdding] = useState(false)

  const handleAdd = async (event: FormEvent) => {
    event.preventDefault()
    if (adding) return
    setAdded(false)
    const parsed = normalizeChannel(input)
    if (!parsed.ok) {
      setInputError(parsed.error)
      return
    }
    setInputError(null)
    setAdding(true)
    const result = await add(parsed.username)
    setAdding(false)
    if (result === 'duplicate') return setInputError('Канал уже добавлен')
    if (result === 'error') return setInputError('Не удалось добавить канал')
    setInput('')
    setAdded(true)
  }

  const handleToggle = async (id: string, enabled: boolean) => {
    if (!(await setEnabled(id, enabled))) showToast({ message: 'Не удалось сохранить', tone: 'error' })
  }

  const handleDelete = async (id: string) => {
    if (!(await remove(id))) showToast({ message: 'Не удалось удалить', tone: 'error' })
  }

  return (
    <div className={styles.channels}>
      <form className={styles.add} onSubmit={event => void handleAdd(event)} noValidate>
        <div className={styles.addRow}>
          <ClearableInput
            className={shared.input}
            wrapperClassName={styles.addInput}
            type="text"
            value={input}
            placeholder="@канал или ссылка"
            aria-label="@канал или ссылка"
            aria-invalid={inputError !== null}
            clearLabel="Очистить канал"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="done"
            onChange={event => { setInput(event.target.value); setInputError(null); setAdded(false) }}
            onClear={() => { setInput(''); setInputError(null) }}
          />
          <button type="submit" className={shared.button} disabled={!input.trim() || adding}>
            Добавить
          </button>
        </div>
        {inputError && <p className={shared.fieldError} role="alert">{inputError}</p>}
        {added && <p className={shared.hint}>Первые новости появятся в течение 15 минут</p>}
      </form>

      {error && <div className={shared.alert} role="alert">{error}</div>}

      {loading ? (
        <div className={shared.skeleton} aria-busy="true" />
      ) : channels.length === 0 ? (
        !error && <div className={shared.empty}>Каналов пока нет. Добавьте первый публичный канал.</div>
      ) : (
        <ul className={styles.list}>
          {channels.map(channel => (
            <ChannelRow
              key={channel.id}
              channel={channel}
              postsCount={counts[channel.id]}
              onToggle={enabled => void handleToggle(channel.id, enabled)}
              onDelete={() => void handleDelete(channel.id)}
            />
          ))}
        </ul>
      )}

      <Toast toast={toast} onClose={hideToast} />
    </div>
  )
}

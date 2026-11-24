import { useState, type FC, type FormEvent } from 'react'
import { ClearableInput } from '../../components/ui/ClearableInput'
import { normalizeChannel } from './normalizeChannel'
import type { IAddResult } from './useNewsChannels'
import shared from './NewsShared.module.css'
import styles from './ChannelAddForm.module.css'

interface IChannelAddFormProps {
  onAdd: (username: string) => Promise<IAddResult>
  onDone: () => void
}

export const ChannelAddForm: FC<IChannelAddFormProps> = ({ onAdd, onDone }) => {
  const [input, setInput] = useState('')
  const [inputError, setInputError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (adding) return
    const parsed = normalizeChannel(input)
    if (!parsed.ok) {
      setInputError(parsed.error)
      return
    }
    setInputError(null)
    setAdding(true)
    const result = await onAdd(parsed.username)
    setAdding(false)
    if (result.status === 'duplicate') return setInputError('Канал уже добавлен')
    if (result.status === 'error') return setInputError('Не удалось добавить канал')
    setInput('')
    onDone()
  }

  return (
    <form className={styles.form} onSubmit={event => void handleSubmit(event)} noValidate>
      <div className={styles.row}>
        <ClearableInput
          className={shared.input}
          wrapperClassName={styles.field}
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
          autoFocus
          onChange={event => { setInput(event.target.value); setInputError(null) }}
          onClear={() => { setInput(''); setInputError(null) }}
        />
        <button type="submit" className={shared.button} disabled={!input.trim() || adding}>
          Добавить
        </button>
      </div>
      {inputError && <p className={shared.fieldError} role="alert">{inputError}</p>}
    </form>
  )
}

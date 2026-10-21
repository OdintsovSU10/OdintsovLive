import { useCallback, useState, type FC } from 'react'
import './GroupByDeptToggle.css'

interface IGroupByDeptToggleProps {
  checked: boolean
  onChange: (next: boolean) => void
  className?: string
}

// Чекбокс-переключатель «По подразделениям» (общий для Табеля и ФОТ)
export const GroupByDeptToggle: FC<IGroupByDeptToggleProps> = ({ checked, onChange, className }) => (
  <button
    type="button"
    className={className ? `group-toggle ${className}` : 'group-toggle'}
    aria-pressed={checked}
    onClick={() => onChange(!checked)}
  >
    <span className="group-toggle-box" aria-hidden="true">
      <svg viewBox="0 0 12 12" width="10" height="10" focusable="false">
        <path d="M2.2 6.3 4.8 8.8 9.8 3.4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
    По подразделениям
  </button>
)

const readFlag = (storageKey: string): boolean => {
  try {
    return localStorage.getItem(storageKey) !== '0'
  } catch {
    return true
  }
}

const writeFlag = (storageKey: string, value: boolean): void => {
  try {
    localStorage.setItem(storageKey, value ? '1' : '0')
  } catch {
    // хранилище недоступно — настройка живёт только в сессии
  }
}

// Состояние «По подразделениям» с сохранением в localStorage (по умолчанию включено)
export const useGroupByDept = (storageKey: string): [boolean, (value: boolean) => void] => {
  const [value, setValue] = useState<boolean>(() => readFlag(storageKey))

  const update = useCallback((next: boolean) => {
    setValue(next)
    writeFlag(storageKey, next)
  }, [storageKey])

  return [value, update]
}

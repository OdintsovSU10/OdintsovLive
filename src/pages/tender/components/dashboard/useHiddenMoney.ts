import { useCallback, useState } from 'react'

// Скрытие сумм запоминаем в браузере — чтобы не светить деньги при показе экрана
const HIDE_SALARIES_KEY = 'tender-admin-hide-salaries'

const readHideSalaries = (): boolean => {
  try {
    return localStorage.getItem(HIDE_SALARIES_KEY) === '1'
  } catch {
    return false
  }
}

// Переключатель «скрыть суммы» для всего дашборда
export function useHiddenMoney(): { hidden: boolean; toggle: () => void } {
  const [hidden, setHidden] = useState(readHideSalaries)

  const toggle = useCallback(() => {
    const next = !hidden
    setHidden(next)
    try {
      localStorage.setItem(HIDE_SALARIES_KEY, next ? '1' : '0')
    } catch {
      // Хранилище недоступно (приватный режим) — переключатель работает до перезагрузки
    }
  }, [hidden])

  return { hidden, toggle }
}

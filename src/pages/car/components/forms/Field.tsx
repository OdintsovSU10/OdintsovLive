import type { ReactNode } from 'react'

interface Props {
  id: string
  label: string
  error?: string
  hint?: ReactNode
  children: ReactNode
}

// Подпись, поле и сообщение под ним. Поле связывает себя с сообщением через describedBy(id).
export function Field({ id, label, error, hint, children }: Props) {
  return (
    <div className={`car-field ${error ? 'invalid' : ''}`}>
      <label htmlFor={id}>{label}</label>
      {children}
      {error ? (
        <p id={`${id}-msg`} className="car-field-error" role="alert">{error}</p>
      ) : hint ? (
        <p id={`${id}-msg`} className="car-field-hint">{hint}</p>
      ) : null}
    </div>
  )
}

export function describedBy(id: string, error?: string, hint?: ReactNode) {
  return {
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error || hint ? `${id}-msg` : undefined
  }
}

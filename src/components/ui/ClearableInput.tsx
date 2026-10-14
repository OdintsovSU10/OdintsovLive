import { forwardRef, useImperativeHandle, useRef, type InputHTMLAttributes } from 'react'
import { X } from 'lucide-react'
import './ClearableInput.css'

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  value: string
  onClear: () => void
  clearLabel: string
  wrapperClassName?: string
}

export const ClearableInput = forwardRef<HTMLInputElement, Props>(({
  value,
  onClear,
  clearLabel,
  wrapperClassName = '',
  className = '',
  ...inputProps
}, ref) => {
  const inputRef = useRef<HTMLInputElement>(null)
  useImperativeHandle(ref, () => inputRef.current as HTMLInputElement)

  const canClear = value.length > 0 && !inputProps.disabled && !inputProps.readOnly

  const handleClear = () => {
    onClear()
    inputRef.current?.focus()
  }

  return (
    <div className={`ui-clearable ${wrapperClassName}`}>
      <input ref={inputRef} value={value} className={`ui-clearable-input ${className}`} {...inputProps} />
      {canClear && (
        <button
          type="button"
          className="ui-clearable-btn"
          aria-label={clearLabel}
          onMouseDown={event => event.preventDefault()}
          onClick={handleClear}
        >
          <X size={16} strokeWidth={1.5} />
        </button>
      )}
    </div>
  )
})

ClearableInput.displayName = 'ClearableInput'

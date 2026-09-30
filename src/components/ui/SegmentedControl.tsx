import type { ReactNode } from 'react'
import './SegmentedControl.css'

export interface SegmentOption<T extends string> {
  value: T
  label: string
  icon?: ReactNode
}

interface Props<T extends string> {
  options: SegmentOption<T>[]
  value: T
  onChange: (value: T) => void
  ariaLabel: string
  size?: 'md' | 'sm'
  stretch?: boolean
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  size = 'md',
  stretch = false
}: Props<T>) {
  return (
    <div className={`ui-segmented ${size} ${stretch ? 'stretch' : ''}`} role="group" aria-label={ariaLabel}>
      {options.map(option => (
        <button
          key={option.value}
          type="button"
          className={option.value === value ? 'active' : ''}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.icon}
          <span>{option.label}</span>
        </button>
      ))}
    </div>
  )
}

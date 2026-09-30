interface Props {
  options: string[]
  value: string
  onChange: (value: string) => void
  ariaLabel: string
}

// Быстрый выбор: чипы подсказывают, но не ограничивают ввод
export function ChipGroup({ options, value, onChange, ariaLabel }: Props) {
  return (
    <div className="car-chips" role="group" aria-label={ariaLabel}>
      {options.map(option => (
        <button
          key={option}
          type="button"
          className={`car-chip ${option === value ? 'active' : ''}`}
          aria-pressed={option === value}
          onClick={() => onChange(option)}
        >
          {option}
        </button>
      ))}
    </div>
  )
}

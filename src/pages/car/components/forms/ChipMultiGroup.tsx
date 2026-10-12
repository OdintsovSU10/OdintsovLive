interface Option {
  key: string
  label: string
}

interface Props {
  label: string
  options: Option[]
  values: string[]
  onChange: (values: string[]) => void
  hint?: string
}

// Чипы с несколькими отметками сразу: повторный тап снимает выбор
export function ChipMultiGroup({ label, options, values, onChange, hint }: Props) {
  const toggle = (key: string) =>
    onChange(values.includes(key) ? values.filter(value => value !== key) : [...values, key])

  return (
    <div className="car-field">
      <span className="car-field-label">{label}</span>
      <div className="car-chips" role="group" aria-label={label}>
        {options.map(option => {
          const active = values.includes(option.key)
          return (
            <button
              key={option.key}
              type="button"
              className={`car-chip ${active ? 'active' : ''}`}
              aria-pressed={active}
              onClick={() => toggle(option.key)}
            >
              {option.label}
            </button>
          )
        })}
      </div>
      {hint && <p className="car-field-hint">{hint}</p>}
    </div>
  )
}

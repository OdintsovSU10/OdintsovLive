import './PageTabs.css'

interface PageTabsProps<T extends string> {
  tabs: ReadonlyArray<{ id: T; label: string }>
  active: T
  onChange: (id: T) => void
  ariaLabel: string
}

export function PageTabs<T extends string>({ tabs, active, onChange, ariaLabel }: PageTabsProps<T>) {
  return (
    <div className="page-tabs" role="tablist" aria-label={ariaLabel}>
      {tabs.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={active === id}
          className={`page-tab ${active === id ? 'active' : ''}`}
          onClick={() => onChange(id)}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

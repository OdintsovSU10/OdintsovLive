import './ThemeToggle.css'

interface ThemeToggleProps {
  theme: 'light' | 'dark'
  onToggle: (theme: 'light' | 'dark') => void
}

export default function ThemeToggle({ theme, onToggle }: ThemeToggleProps) {
  return (
    <div className="theme-toggle">
      <button
        className={theme === 'light' ? 'active' : ''}
        onClick={() => onToggle('light')}
      >
        ☀ Light
      </button>
      <button
        className={theme === 'dark' ? 'active' : ''}
        onClick={() => onToggle('dark')}
      >
        ◐ Dark
      </button>
    </div>
  )
}

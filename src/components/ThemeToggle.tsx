import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Settings } from 'lucide-react'
import './ThemeToggle.css'

interface ThemeToggleProps {
  theme: 'light' | 'dark'
  onToggle: (theme: 'light' | 'dark') => void
  isAdmin?: boolean
}

export default function ThemeToggle({ theme, onToggle, isAdmin }: ThemeToggleProps) {
  const [moscowDateTime, setMoscowDateTime] = useState('')

  useEffect(() => {
    const updateTime = () => {
      const now = new Date()
      const date = now.toLocaleDateString('ru-RU', {
        timeZone: 'Europe/Moscow',
        day: 'numeric',
        month: 'short'
      })
      const time = now.toLocaleTimeString('ru-RU', {
        timeZone: 'Europe/Moscow',
        hour: '2-digit',
        minute: '2-digit'
      })
      setMoscowDateTime(`${date}, ${time}`)
    }
    updateTime()
    const interval = setInterval(updateTime, 1000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="top-bar">
      <span className="moscow-time">{moscowDateTime}</span>
      {isAdmin && (
        <Link to="/admin" className="admin-btn" title="Админ">
          <Settings size={16} strokeWidth={1.5} />
        </Link>
      )}
      <div className="theme-toggle">
        <div className={`slider-bg ${theme}`} />
        <button
          className={theme === 'light' ? 'active' : ''}
          onClick={() => onToggle(theme === 'light' ? 'dark' : 'light')}
        >
          ☀<span className="btn-text"> Light</span>
        </button>
        <button
          className={theme === 'dark' ? 'active' : ''}
          onClick={() => onToggle(theme === 'dark' ? 'light' : 'dark')}
        >
          ◐<span className="btn-text"> Dark</span>
        </button>
      </div>
    </div>
  )
}

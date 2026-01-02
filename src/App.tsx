import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { supabase } from './lib/supabase'
import type { User } from '@supabase/supabase-js'
import { Coffee } from 'lucide-react'
import './App.css'
import Sidebar from './components/Sidebar'
import ThemeToggle from './components/ThemeToggle'
import Logo from './components/Logo'
import AuthPage from './pages/AuthPage'
import HomePage from './pages/HomePage'
import CalendarPage from './pages/CalendarPage'
import SalaryPage from './pages/SalaryPage'
import SalaryMonthPage from './pages/SalaryMonthPage'
import VacationRatePage from './pages/VacationRatePage'
import RentPage from './pages/RentPage'
import RentMonthPage from './pages/RentMonthPage'
import WeightPage from './pages/WeightPage'
import BodyParamsPage from './pages/BodyParamsPage'
import NotesPage from './pages/NotesPage'
import AdminPage from './pages/AdminPage'

type Theme = 'light' | 'dark'

interface Profile {
  approved: boolean
  is_admin: boolean
}

function App() {
  const [collapsed, setCollapsed] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [idleMode, setIdleMode] = useState(false)
  const [idleDateTime, setIdleDateTime] = useState({ date: '', time: '' })
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('theme') as Theme
    if (saved) return saved
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  useEffect(() => {
    if (!idleMode) return
    const update = () => {
      const now = new Date()
      setIdleDateTime({
        date: now.toLocaleDateString('ru-RU', {
          timeZone: 'Europe/Moscow',
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        }).replace(' г.', ''),
        time: now.toLocaleTimeString('ru-RU', {
          timeZone: 'Europe/Moscow',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        })
      })
    }
    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [idleMode])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        loadProfile(session.user.id)
      } else {
        setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        loadProfile(session.user.id)
      } else {
        setProfile(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const loadProfile = async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('approved, is_admin')
      .eq('id', userId)
      .single()

    setProfile(data)
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
      </div>
    )
  }

  if (!user) {
    return (
      <>
        <ThemeToggle theme={theme} onToggle={setTheme} />
        <AuthPage onAuth={() => {}} />
      </>
    )
  }

  if (!profile?.approved) {
    return (
      <>
        <ThemeToggle theme={theme} onToggle={setTheme} />
        <div className="pending-screen">
          <div className="pending-card">
            <h2>Ожидание одобрения</h2>
            <p>Ваша заявка на регистрацию находится на рассмотрении.</p>
            <p>Администратор свяжется с вами после одобрения.</p>
            <button onClick={() => supabase.auth.signOut()} className="logout-link">
              Выйти
            </button>
          </div>
        </div>
      </>
    )
  }

  return (
    <BrowserRouter>
      <div className="app">
        <Sidebar
          collapsed={collapsed}
          onToggle={() => setCollapsed(!collapsed)}
        />
        <ThemeToggle theme={theme} onToggle={setTheme} isAdmin={profile?.is_admin} />
        <main className={`main-content ${collapsed ? 'collapsed' : ''}`}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/notes" element={<NotesPage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/salary" element={<SalaryPage />} />
            <Route path="/salary/:year/:month" element={<SalaryMonthPage />} />
            <Route path="/vacation-rate" element={<VacationRatePage />} />
            <Route path="/rent" element={<RentPage />} />
            <Route path="/rent/:year/:month" element={<RentMonthPage />} />
            <Route path="/body/weight" element={<WeightPage />} />
            <Route path="/body/params" element={<BodyParamsPage />} />
            {profile?.is_admin && <Route path="/admin" element={<AdminPage />} />}
          </Routes>
        </main>

        <button className="idle-btn" onClick={() => setIdleMode(true)} title="Ожидание">
          <Coffee size={20} />
        </button>

        {idleMode && (
          <div className="idle-screen" onClick={() => setIdleMode(false)}>
            <Logo size={100} />
            <div className="idle-time">{idleDateTime.time}</div>
            <div className="idle-date">{idleDateTime.date}</div>
          </div>
        )}
      </div>
    </BrowserRouter>
  )
}

export default App

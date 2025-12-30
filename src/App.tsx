import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { supabase } from './lib/supabase'
import type { User } from '@supabase/supabase-js'
import './App.css'
import Sidebar from './components/Sidebar'
import ThemeToggle from './components/ThemeToggle'
import AuthPage from './pages/AuthPage'
import HomePage from './pages/HomePage'
import CalendarPage from './pages/CalendarPage'
import SalaryPage from './pages/SalaryPage'
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
          isAdmin={profile?.is_admin}
        />
        <ThemeToggle theme={theme} onToggle={setTheme} />
        <main className={`main-content ${collapsed ? 'collapsed' : ''}`}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/salary" element={<SalaryPage />} />
            {profile?.is_admin && <Route path="/admin" element={<AdminPage />} />}
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

export default App

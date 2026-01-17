import { useState, useEffect, lazy, Suspense } from 'react'
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

const CalendarPage = lazy(() => import('./pages/CalendarPage'))
const SalaryPage = lazy(() => import('./pages/salary'))
const SalaryMonthPage = lazy(() => import('./pages/SalaryMonthPage'))
const VacationRatePage = lazy(() => import('./pages/VacationRatePage'))
const RentPage = lazy(() => import('./pages/RentPage'))
const RentMonthPage = lazy(() => import('./pages/RentMonthPage'))
const WeightPage = lazy(() => import('./pages/WeightPage'))
const BodyParamsPage = lazy(() => import('./pages/BodyParamsPage'))
const NotesPage = lazy(() => import('./pages/NotesPage'))
const CarPage = lazy(() => import('./pages/car'))
const TenderPage = lazy(() => import('./pages/tender'))
const AdminPage = lazy(() => import('./pages/AdminPage'))

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
  const [idleDateTime, setIdleDateTime] = useState({ weekday: '', day: '', time: '', period: '', colorIndex: 0 })
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
      const hours24 = now.toLocaleString('en-US', { timeZone: 'Europe/Moscow', hour: 'numeric', hour12: false })
      const hours = parseInt(hours24)
      const hours12 = hours % 12 || 12
      const minuteNum = now.toLocaleString('en-US', { timeZone: 'Europe/Moscow', minute: 'numeric' })
      const minutes = minuteNum.padStart(2, '0')
      const period = hours < 12 ? 'AM' : 'PM'
      const currentMinute = parseInt(minuteNum)

      setIdleDateTime({
        weekday: now.toLocaleDateString('ru-RU', {
          timeZone: 'Europe/Moscow',
          weekday: 'short'
        }).toUpperCase().replace('.', ''),
        day: now.toLocaleDateString('ru-RU', {
          timeZone: 'Europe/Moscow',
          day: 'numeric'
        }),
        time: `${hours12}:${minutes}`,
        period,
        colorIndex: currentMinute % 7
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
    loadFontSettings(userId)
    setLoading(false)
  }

  const loadFontSettings = async (userId: string) => {
    const { data } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (data) {
      const settings = {
        headline: data.font_headline || 'Cormorant Garamond',
        body: data.font_body || 'DM Sans',
        mono: data.font_mono || 'DM Mono',
        fontSize: data.font_size_base || 16,
        customFonts: data.custom_fonts || []
      }

      // Применяем шрифты
      document.documentElement.style.setProperty('--font-headline', `'${settings.headline}', Georgia, serif`)
      document.documentElement.style.setProperty('--font-body', `'${settings.body}', sans-serif`)
      document.documentElement.style.setProperty('--font-mono', `'${settings.mono}', monospace`)

      // Применяем размер шрифта
      document.documentElement.style.setProperty('--font-size-base', `${settings.fontSize}px`)
      document.documentElement.style.fontSize = `${settings.fontSize}px`

      // Загружаем кастомные шрифты
      settings.customFonts.forEach((font: { name: string; url: string }) => {
        if (!document.getElementById(`custom-font-${font.name}`)) {
          const style = document.createElement('style')
          style.id = `custom-font-${font.name}`
          style.textContent = `
            @font-face {
              font-family: '${font.name}';
              src: url('${font.url}') format('woff2');
              font-weight: 100 900;
              font-style: normal;
            }
          `
          document.head.appendChild(style)
        }
      })

      // Загружаем Google Fonts
      const googleFonts = [settings.headline, settings.body, settings.mono]
        .filter(f => !settings.customFonts.find((cf: { name: string }) => cf.name === f))
        .filter(f => f !== 'Georgia')
        .map(f => f.replace(/ /g, '+'))
        .join('&family=')

      if (googleFonts) {
        let link = document.getElementById('dynamic-fonts') as HTMLLinkElement
        if (!link) {
          link = document.createElement('link')
          link.id = 'dynamic-fonts'
          link.rel = 'stylesheet'
          document.head.appendChild(link)
        }
        link.href = `https://fonts.googleapis.com/css2?family=${googleFonts}:wght@400;500;600;700&display=swap`
      }
    }
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
          <Suspense fallback={<div className="page-loading"><div className="loading-spinner" /></div>}>
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
              <Route path="/car" element={<CarPage />} />
              <Route path="/tender" element={<TenderPage />} />
              {profile?.is_admin && <Route path="/admin" element={<AdminPage />} />}
            </Routes>
          </Suspense>
        </main>

        <button className="idle-btn" onClick={() => setIdleMode(true)} title="Ожидание">
          <Coffee size={20} />
        </button>

        {idleMode && (
          <div className="idle-screen" onClick={() => setIdleMode(false)}>
            <div className="idle-date">
              <span className="idle-weekday" data-color={idleDateTime.colorIndex}>{idleDateTime.weekday}</span>
              <span className="idle-day">{idleDateTime.day}</span>
            </div>
            <div className="idle-time-wrapper">
              <div className="idle-time" data-color={idleDateTime.colorIndex}>{idleDateTime.time}</div>
              <div className="idle-period">{idleDateTime.period}</div>
            </div>
            <div className="idle-logo">
              <Logo size={96} showText={false} />
            </div>
          </div>
        )}
      </div>
    </BrowserRouter>
  )
}

export default App

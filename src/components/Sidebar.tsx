import { useState, useEffect, useRef, useCallback } from 'react'
import { NavLink, Link, useLocation } from 'react-router-dom'
import { Calendar, Wallet, Umbrella, Home, LogOut, ChevronLeft, ChevronRight, ChevronDown, Briefcase, Activity, Scale, Ruler, Menu, X, Car, Users, Settings, Sun, Moon, Clock, ReceiptText, type LucideIcon } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useMoscowDateTime } from '../hooks/useMoscowDateTime'
import Logo from './Logo'
import './Sidebar.css'

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
  theme: 'light' | 'dark'
  onThemeToggle: () => void
  isAdmin?: boolean
}

interface WorkLink {
  path: string
  icon: LucideIcon
  label: string
  adminOnly?: boolean
}

const workLinks: WorkLink[] = [
  { path: '/tender', icon: Users, label: 'Тендерное управление' },
  { path: '/tender/admin', icon: Settings, label: 'Администрирование ТУ', adminOnly: true },
  { path: '/calendar', icon: Calendar, label: 'Календарь' },
  { path: '/salary', icon: Wallet, label: 'Зарплата' },
  { path: '/vacation-rate', icon: Umbrella, label: 'Отпускные' },
]

const bodyLinks = [
  { path: '/body/weight', icon: Scale, label: 'Мой вес' },
  { path: '/body/params', icon: Ruler, label: 'Параметры тела' },
]

const otherLinks = [
  { path: '/expenses', icon: ReceiptText, label: 'Траты' },
  { path: '/rent', icon: Home, label: 'Аренда' },
  { path: '/car', icon: Car, label: 'Машина' },
]

export default function Sidebar({ collapsed, onToggle, theme, onThemeToggle, isAdmin }: SidebarProps) {
  const location = useLocation()
  const moscowDateTime = useMoscowDateTime()
  const visibleWorkLinks = workLinks.filter(link => !link.adminOnly || isAdmin)
  const isWorkActive = visibleWorkLinks.some(l => location.pathname.startsWith(l.path))
  const isBodyActive = bodyLinks.some(l => location.pathname.startsWith(l.path))
  const [workExpanded, setWorkExpanded] = useState(isWorkActive)
  const [bodyExpanded, setBodyExpanded] = useState(isBodyActive)
  const [mobileHidden, setMobileHidden] = useState(true)
  const [isMobile, setIsMobile] = useState(false)
  const swipeStartX = useRef(0)
  const swipeStartY = useRef(0)
  const isSwipeFromEdge = useRef(false)

  useEffect(() => {
    const isTenderRoute = location.pathname === '/tender' || location.pathname.startsWith('/tender/')

    if (isTenderRoute) {
      document.documentElement.dataset.routeTheme = 'tender'
      return
    }

    delete document.documentElement.dataset.routeTheme
  }, [location.pathname])

  useEffect(() => {
    return () => {
      delete document.documentElement.dataset.routeTheme
    }
  }, [])

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 430)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Swipe from left edge to open sidebar
  const handleTouchStart = useCallback((e: TouchEvent) => {
    const touch = e.touches[0]
    swipeStartX.current = touch.clientX
    swipeStartY.current = touch.clientY
    isSwipeFromEdge.current = touch.clientX < 25
  }, [])

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    if (!isSwipeFromEdge.current || !isMobile) return

    const touch = e.changedTouches[0]
    const diffX = touch.clientX - swipeStartX.current
    const diffY = Math.abs(touch.clientY - swipeStartY.current)

    // Swipe right from edge, mostly horizontal
    if (diffX > 80 && diffY < 100 && mobileHidden) {
      setMobileHidden(false)
    }

    isSwipeFromEdge.current = false
  }, [isMobile, mobileHidden])

  useEffect(() => {
    if (!isMobile) return

    document.addEventListener('touchstart', handleTouchStart, { passive: true })
    document.addEventListener('touchend', handleTouchEnd, { passive: true })

    return () => {
      document.removeEventListener('touchstart', handleTouchStart)
      document.removeEventListener('touchend', handleTouchEnd)
    }
  }, [isMobile, handleTouchStart, handleTouchEnd])

  useEffect(() => {
    if (isMobile) setMobileHidden(true)
  }, [location.pathname, isMobile])

  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

  const mobileMenuOpen = isMobile && !mobileHidden

  return (
    <>
      {isMobile && (
        <>
          <button
            className={`mobile-menu-btn ${!mobileHidden ? 'menu-open' : ''}`}
            onClick={() => setMobileHidden(!mobileHidden)}
          >
            {mobileHidden ? <Menu size={20} /> : <X size={20} />}
          </button>
          {mobileHidden && (
            <Link to="/" className="mobile-logo">
              <Logo size={24} showText={false} />
            </Link>
          )}
          <div
            className={`sidebar-overlay ${!mobileHidden ? 'visible' : ''}`}
            onClick={() => setMobileHidden(true)}
          />
        </>
      )}
      <aside className={`sidebar ${collapsed ? 'collapsed' : ''} ${isMobile && mobileHidden ? 'mobile-hidden' : ''} ${mobileMenuOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-header">
          <Link to="/" className="sidebar-header-logo">
            <Logo size={collapsed ? 36 : 44} showText={!collapsed || mobileMenuOpen} />
          </Link>
          <button className="sidebar-toggle" onClick={onToggle}>
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>

      <nav className="sidebar-nav">
        <div className={`nav-group ${workExpanded ? 'expanded' : ''}`}>
          <button
            className={`nav-link nav-group-toggle ${isWorkActive ? 'active' : ''}`}
            onClick={() => setWorkExpanded(!workExpanded)}
          >
            <Briefcase size={20} strokeWidth={1.5} />
            {(!collapsed || mobileMenuOpen) && (
              <>
                <span>Работа</span>
                <ChevronDown size={16} className="nav-group-arrow" />
              </>
            )}
          </button>
          {(workExpanded || (collapsed && !mobileMenuOpen)) && (
            <div className="nav-group-items">
              {visibleWorkLinks.map(l => (
                <NavLink key={l.path} to={l.path} className="nav-link nav-sublink" end={l.path === '/tender'}>
                  <l.icon size={18} strokeWidth={1.5} />
                  {(!collapsed || mobileMenuOpen) && <span>{l.label}</span>}
                </NavLink>
              ))}
            </div>
          )}
        </div>

        <div className={`nav-group ${bodyExpanded ? 'expanded' : ''}`}>
          <button
            className={`nav-link nav-group-toggle ${isBodyActive ? 'active' : ''}`}
            onClick={() => setBodyExpanded(!bodyExpanded)}
          >
            <Activity size={20} strokeWidth={1.5} />
            {(!collapsed || mobileMenuOpen) && (
              <>
                <span>Тело</span>
                <ChevronDown size={16} className="nav-group-arrow" />
              </>
            )}
          </button>
          {(bodyExpanded || (collapsed && !mobileMenuOpen)) && (
            <div className="nav-group-items">
              {bodyLinks.map(l => (
                <NavLink key={l.path} to={l.path} className="nav-link nav-sublink">
                  <l.icon size={18} strokeWidth={1.5} />
                  {(!collapsed || mobileMenuOpen) && <span>{l.label}</span>}
                </NavLink>
              ))}
            </div>
          )}
        </div>

        {otherLinks.map(l => (
          <NavLink key={l.path} to={l.path} className="nav-link">
            <l.icon size={20} strokeWidth={1.5} />
            {(!collapsed || mobileMenuOpen) && <span>{l.label}</span>}
          </NavLink>
        ))}

        {isAdmin && (
          <NavLink to="/admin" className="nav-link">
            <Settings size={20} strokeWidth={1.5} />
            {(!collapsed || mobileMenuOpen) && <span>Настройки</span>}
          </NavLink>
        )}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-clock">
          <Clock size={16} strokeWidth={1.5} />
          {(!collapsed || mobileMenuOpen) && <span className="clock-text">{moscowDateTime.dateTime}</span>}
        </div>

        <button className="sidebar-theme-toggle" onClick={onThemeToggle} title="Изменить тему">
          {theme === 'light' ? <Sun size={20} strokeWidth={1.5} /> : <Moon size={20} strokeWidth={1.5} />}
          {(!collapsed || mobileMenuOpen) && <span>{theme === 'light' ? 'Светлая' : 'Тёмная'}</span>}
        </button>

        <button className="nav-link logout-btn" onClick={handleLogout}>
          <LogOut size={20} strokeWidth={1.5} />
          {(!collapsed || mobileMenuOpen) && <span>Выйти</span>}
        </button>
      </div>
    </aside>
    </>
  )
}

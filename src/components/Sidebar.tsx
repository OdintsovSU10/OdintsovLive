import { useState, useEffect } from 'react'
import { NavLink, Link, useLocation } from 'react-router-dom'
import { Calendar, Wallet, Umbrella, Home, LogOut, ChevronLeft, ChevronRight, ChevronDown, Briefcase, Activity, Scale, Ruler, Menu, X, StickyNote } from 'lucide-react'
import { supabase } from '../lib/supabase'
import Logo from './Logo'
import './Sidebar.css'

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

const workLinks = [
  { path: '/calendar', icon: Calendar, label: 'Календарь' },
  { path: '/salary', icon: Wallet, label: 'Зарплата' },
  { path: '/vacation-rate', icon: Umbrella, label: 'Отпускные' },
]

const bodyLinks = [
  { path: '/body/weight', icon: Scale, label: 'Мой вес' },
  { path: '/body/params', icon: Ruler, label: 'Параметры тела' },
]

const otherLinks = [
  { path: '/rent', icon: Home, label: 'Аренда' },
]

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const location = useLocation()
  const isWorkActive = workLinks.some(l => location.pathname.startsWith(l.path))
  const isBodyActive = bodyLinks.some(l => location.pathname.startsWith(l.path))
  const [workExpanded, setWorkExpanded] = useState(isWorkActive)
  const [bodyExpanded, setBodyExpanded] = useState(isBodyActive)
  const [mobileHidden, setMobileHidden] = useState(true)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 430)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

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
        <Link to="/" className="sidebar-header">
          <Logo size={collapsed ? 36 : 44} showText={!collapsed || mobileMenuOpen} />
        </Link>

      <nav className="sidebar-nav">
        <NavLink to="/notes" className="nav-link">
          <StickyNote size={20} strokeWidth={1.5} />
          {(!collapsed || mobileMenuOpen) && <span>Заметки</span>}
        </NavLink>

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
              {workLinks.map(l => (
                <NavLink key={l.path} to={l.path} className="nav-link nav-sublink">
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
      </nav>

      <div className="sidebar-footer">
        <button className="nav-link logout-btn" onClick={handleLogout}>
          <LogOut size={20} strokeWidth={1.5} />
          {(!collapsed || mobileMenuOpen) && <span>Выйти</span>}
        </button>
      </div>

      <button className="sidebar-toggle" onClick={onToggle}>
        {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
      </button>
    </aside>
    </>
  )
}

import { useState } from 'react'
import { NavLink, Link, useLocation } from 'react-router-dom'
import { Calendar, Wallet, Umbrella, Home, LogOut, ChevronLeft, ChevronRight, ChevronDown, Briefcase } from 'lucide-react'
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

const otherLinks = [
  { path: '/rent', icon: Home, label: 'Аренда' },
]

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const location = useLocation()
  const isWorkActive = workLinks.some(l => location.pathname.startsWith(l.path))
  const [workExpanded, setWorkExpanded] = useState(isWorkActive)

  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <Link to="/" className="sidebar-header">
        <Logo size={collapsed ? 36 : 44} showText={!collapsed} />
      </Link>

      <nav className="sidebar-nav">
        <div className={`nav-group ${workExpanded ? 'expanded' : ''}`}>
          <button
            className={`nav-link nav-group-toggle ${isWorkActive ? 'active' : ''}`}
            onClick={() => setWorkExpanded(!workExpanded)}
          >
            <Briefcase size={20} strokeWidth={1.5} />
            {!collapsed && (
              <>
                <span>Работа</span>
                <ChevronDown size={16} className="nav-group-arrow" />
              </>
            )}
          </button>
          {(workExpanded || collapsed) && (
            <div className="nav-group-items">
              {workLinks.map(l => (
                <NavLink key={l.path} to={l.path} className="nav-link nav-sublink">
                  <l.icon size={18} strokeWidth={1.5} />
                  {!collapsed && <span>{l.label}</span>}
                </NavLink>
              ))}
            </div>
          )}
        </div>

        {otherLinks.map(l => (
          <NavLink key={l.path} to={l.path} className="nav-link">
            <l.icon size={20} strokeWidth={1.5} />
            {!collapsed && <span>{l.label}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        <button className="nav-link logout-btn" onClick={handleLogout}>
          <LogOut size={20} strokeWidth={1.5} />
          {!collapsed && <span>Выйти</span>}
        </button>
      </div>

      <button className="sidebar-toggle" onClick={onToggle}>
        {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
      </button>
    </aside>
  )
}

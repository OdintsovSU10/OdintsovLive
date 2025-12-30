import { NavLink, Link } from 'react-router-dom'
import { Calendar, Wallet, Settings, LogOut, ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '../lib/supabase'
import Logo from './Logo'
import './Sidebar.css'

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
  isAdmin?: boolean
}

const links = [
  { path: '/calendar', icon: Calendar, label: 'Календарь' },
  { path: '/salary', icon: Wallet, label: 'Зарплата' },
]

export default function Sidebar({ collapsed, onToggle, isAdmin }: SidebarProps) {
  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <Link to="/" className="sidebar-header">
        <Logo size={collapsed ? 36 : 44} showText={!collapsed} />
      </Link>

      <nav className="sidebar-nav">
        {links.map(l => (
          <NavLink key={l.path} to={l.path} className="nav-link">
            <l.icon size={20} strokeWidth={1.5} />
            {!collapsed && <span>{l.label}</span>}
          </NavLink>
        ))}
        {isAdmin && (
          <NavLink to="/admin" className="nav-link">
            <Settings size={20} strokeWidth={1.5} />
            {!collapsed && <span>Админ</span>}
          </NavLink>
        )}
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

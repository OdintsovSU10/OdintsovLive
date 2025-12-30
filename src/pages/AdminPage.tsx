import { useState, useEffect } from 'react'
import { Check, X, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'
import './AdminPage.css'

interface UserProfile {
  id: string
  email: string
  approved: boolean
  is_admin: boolean
  created_at: string
}

export default function AdminPage() {
  const [users, setUsers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadUsers()
  }, [])

  const loadUsers = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })

    if (data) setUsers(data)
    setLoading(false)
  }

  const toggleApproval = async (userId: string, approved: boolean) => {
    await supabase
      .from('profiles')
      .update({ approved })
      .eq('id', userId)

    setUsers(prev => prev.map(u => u.id === userId ? { ...u, approved } : u))
  }

  const toggleAdmin = async (userId: string, isAdmin: boolean) => {
    await supabase
      .from('profiles')
      .update({ is_admin: isAdmin })
      .eq('id', userId)

    setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_admin: isAdmin } : u))
  }

  if (loading) {
    return <div className="admin-page"><p>Загрузка...</p></div>
  }

  return (
    <div className="admin-page">
      <div className="admin-header">
        <Users size={24} />
        <h1>Управление пользователями</h1>
      </div>

      <div className="users-list">
        {users.map(user => (
          <div key={user.id} className={`user-card ${user.approved ? '' : 'pending'}`}>
            <div className="user-info">
              <span className="user-email">{user.email}</span>
              <span className="user-date">
                {new Date(user.created_at).toLocaleDateString('ru-RU')}
              </span>
            </div>

            <div className="user-badges">
              {user.is_admin && <span className="badge admin">Админ</span>}
              {user.approved ? (
                <span className="badge approved">Одобрен</span>
              ) : (
                <span className="badge pending">Ожидает</span>
              )}
            </div>

            <div className="user-actions">
              {user.approved ? (
                <button
                  className="action-btn reject"
                  onClick={() => toggleApproval(user.id, false)}
                  title="Отозвать доступ"
                >
                  <X size={18} />
                </button>
              ) : (
                <button
                  className="action-btn approve"
                  onClick={() => toggleApproval(user.id, true)}
                  title="Одобрить"
                >
                  <Check size={18} />
                </button>
              )}
              <button
                className={`action-btn ${user.is_admin ? 'is-admin' : ''}`}
                onClick={() => toggleAdmin(user.id, !user.is_admin)}
                title={user.is_admin ? 'Убрать админа' : 'Сделать админом'}
              >
                A
              </button>
            </div>
          </div>
        ))}

        {users.length === 0 && (
          <p className="no-users">Нет пользователей</p>
        )}
      </div>
    </div>
  )
}

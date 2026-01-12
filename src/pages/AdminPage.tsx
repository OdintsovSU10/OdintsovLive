import { useState, useEffect, useRef } from 'react'
import { Check, X, Users, Palette, Type, Upload, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import './AdminPage.css'

interface UserProfile {
  id: string
  email: string
  approved: boolean
  is_admin: boolean
  created_at: string
}

interface VisualSettings {
  font_headline: string
  font_body: string
  font_mono: string
  font_size_base: number
  custom_fonts: CustomFont[]
}

interface CustomFont {
  name: string
  url: string
}

const FONT_OPTIONS = {
  headline: [
    { value: 'Cormorant Garamond', label: 'Cormorant Garamond' },
    { value: 'Playfair Display', label: 'Playfair Display' },
    { value: 'Merriweather', label: 'Merriweather' },
    { value: 'Lora', label: 'Lora' },
    { value: 'EB Garamond', label: 'EB Garamond' },
    { value: 'Crimson Text', label: 'Crimson Text' },
    { value: 'Georgia', label: 'Georgia' },
  ],
  body: [
    { value: 'DM Sans', label: 'DM Sans' },
    { value: 'Inter', label: 'Inter' },
    { value: 'Roboto', label: 'Roboto' },
    { value: 'Open Sans', label: 'Open Sans' },
    { value: 'Nunito', label: 'Nunito' },
    { value: 'Montserrat', label: 'Montserrat' },
    { value: 'Poppins', label: 'Poppins' },
  ],
  mono: [
    { value: 'DM Mono', label: 'DM Mono' },
    { value: 'JetBrains Mono', label: 'JetBrains Mono' },
    { value: 'Fira Code', label: 'Fira Code' },
    { value: 'Source Code Pro', label: 'Source Code Pro' },
    { value: 'IBM Plex Mono', label: 'IBM Plex Mono' },
    { value: 'Roboto Mono', label: 'Roboto Mono' },
    { value: 'Cormorant Garamond', label: 'Cormorant Garamond' },
  ]
}

const DEFAULT_SETTINGS: VisualSettings = {
  font_headline: 'Cormorant Garamond',
  font_body: 'DM Sans',
  font_mono: 'DM Mono',
  font_size_base: 16,
  custom_fonts: []
}

type Tab = 'users' | 'visual'

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<Tab>('users')
  const [users, setUsers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [settings, setSettings] = useState<VisualSettings>(DEFAULT_SETTINGS)
  const [saving, setSaving] = useState(false)
  const [customFontName, setCustomFontName] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadUsers()
    loadSettings()
  }, [])

  const loadUsers = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })

    if (data) setUsers(data)
    setLoading(false)
  }

  const loadSettings = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (data) {
      const loaded: VisualSettings = {
        font_headline: data.font_headline || DEFAULT_SETTINGS.font_headline,
        font_body: data.font_body || DEFAULT_SETTINGS.font_body,
        font_mono: data.font_mono || DEFAULT_SETTINGS.font_mono,
        font_size_base: data.font_size_base || DEFAULT_SETTINGS.font_size_base,
        custom_fonts: data.custom_fonts || []
      }
      setSettings(loaded)
      applySettings(loaded)
    }
  }

  const saveSettings = async () => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setSaving(false)
      return
    }

    await supabase
      .from('user_settings')
      .upsert({
        user_id: user.id,
        font_headline: settings.font_headline,
        font_body: settings.font_body,
        font_mono: settings.font_mono,
        font_size_base: settings.font_size_base,
        custom_fonts: settings.custom_fonts,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' })

    applySettings(settings)
    setSaving(false)
  }

  const applySettings = (s: VisualSettings) => {
    // Применяем шрифты
    document.documentElement.style.setProperty('--font-headline', `'${s.font_headline}', Georgia, serif`)
    document.documentElement.style.setProperty('--font-body', `'${s.font_body}', sans-serif`)
    document.documentElement.style.setProperty('--font-mono', `'${s.font_mono}', monospace`)

    // Применяем размер шрифта
    document.documentElement.style.setProperty('--font-size-base', `${s.font_size_base}px`)
    document.documentElement.style.fontSize = `${s.font_size_base}px`

    // Загружаем кастомные шрифты
    s.custom_fonts.forEach(font => {
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
    const googleFonts = [s.font_headline, s.font_body, s.font_mono]
      .filter(f => !s.custom_fonts.find(cf => cf.name === f))
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

  const handleFontUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !customFontName.trim()) return

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const fileName = `${user.id}/${Date.now()}-${file.name}`
    const { error } = await supabase.storage
      .from('fonts')
      .upload(fileName, file)

    if (error) {
      console.error('Upload error:', error)
      return
    }

    const { data: urlData } = supabase.storage
      .from('fonts')
      .getPublicUrl(fileName)

    const newFont: CustomFont = {
      name: customFontName.trim(),
      url: urlData.publicUrl
    }

    setSettings(prev => ({
      ...prev,
      custom_fonts: [...prev.custom_fonts, newFont]
    }))
    setCustomFontName('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removeCustomFont = async (fontName: string) => {
    const font = settings.custom_fonts.find(f => f.name === fontName)
    if (font) {
      // Удаляем style элемент
      const styleEl = document.getElementById(`custom-font-${fontName}`)
      if (styleEl) styleEl.remove()
    }

    setSettings(prev => ({
      ...prev,
      custom_fonts: prev.custom_fonts.filter(f => f.name !== fontName)
    }))
  }

  const resetSettings = () => {
    setSettings(DEFAULT_SETTINGS)
  }

  const getAllFontOptions = (category: 'headline' | 'body' | 'mono') => {
    const base = FONT_OPTIONS[category]
    const custom = settings.custom_fonts.map(f => ({ value: f.name, label: `${f.name} (свой)` }))
    return [...base, ...custom]
  }

  const toggleApproval = async (userId: string, approved: boolean) => {
    await supabase.from('profiles').update({ approved }).eq('id', userId)
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, approved } : u))
  }

  const toggleAdmin = async (userId: string, isAdmin: boolean) => {
    await supabase.from('profiles').update({ is_admin: isAdmin }).eq('id', userId)
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_admin: isAdmin } : u))
  }

  if (loading) {
    return <div className="admin-page"><p>Загрузка...</p></div>
  }

  return (
    <div className="admin-page">
      <div className="admin-tabs">
        <button
          className={`admin-tab ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          <Users size={18} />
          <span>Пользователи</span>
        </button>
        <button
          className={`admin-tab ${activeTab === 'visual' ? 'active' : ''}`}
          onClick={() => setActiveTab('visual')}
        >
          <Palette size={18} />
          <span>Оформление</span>
        </button>
      </div>

      {activeTab === 'users' && (
        <div className="tab-content">
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
                    <button className="action-btn reject" onClick={() => toggleApproval(user.id, false)} title="Отозвать">
                      <X size={18} />
                    </button>
                  ) : (
                    <button className="action-btn approve" onClick={() => toggleApproval(user.id, true)} title="Одобрить">
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
            {users.length === 0 && <p className="no-users">Нет пользователей</p>}
          </div>
        </div>
      )}

      {activeTab === 'visual' && (
        <div className="tab-content">
          <div className="visual-settings">
            <div className="settings-section">
              <h2><Type size={20} /> Шрифты</h2>

              <div className="font-setting">
                <label>Заголовки</label>
                <select
                  value={settings.font_headline}
                  onChange={e => setSettings({ ...settings, font_headline: e.target.value })}
                >
                  {getAllFontOptions('headline').map(f => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
                <span className="font-preview" style={{ fontFamily: `'${settings.font_headline}', serif` }}>
                  Пример заголовка
                </span>
              </div>

              <div className="font-setting">
                <label>Основной текст</label>
                <select
                  value={settings.font_body}
                  onChange={e => setSettings({ ...settings, font_body: e.target.value })}
                >
                  {getAllFontOptions('body').map(f => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
                <span className="font-preview" style={{ fontFamily: `'${settings.font_body}', sans-serif` }}>
                  Пример основного текста для чтения
                </span>
              </div>

              <div className="font-setting">
                <label>Моноширинный (даты, числа)</label>
                <select
                  value={settings.font_mono}
                  onChange={e => setSettings({ ...settings, font_mono: e.target.value })}
                >
                  {getAllFontOptions('mono').map(f => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
                <span className="font-preview mono" style={{ fontFamily: `'${settings.font_mono}', monospace` }}>
                  01.01.2025 — 123 456 ₽
                </span>
              </div>

              <div className="font-setting">
                <label>Базовый размер шрифта: {settings.font_size_base}px</label>
                <input
                  type="range"
                  min="12"
                  max="24"
                  step="1"
                  value={settings.font_size_base}
                  onChange={e => setSettings({ ...settings, font_size_base: parseInt(e.target.value) })}
                  className="font-size-slider"
                />
                <div className="font-size-labels">
                  <span>12px</span>
                  <span>18px</span>
                  <span>24px</span>
                </div>
              </div>
            </div>

            <div className="settings-section">
              <h2><Upload size={20} /> Свои шрифты</h2>

              <div className="custom-font-upload">
                <input
                  type="text"
                  placeholder="Название шрифта"
                  value={customFontName}
                  onChange={e => setCustomFontName(e.target.value)}
                  className="font-name-input"
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".woff2,.woff,.ttf,.otf"
                  onChange={handleFontUpload}
                  style={{ display: 'none' }}
                />
                <button
                  className="upload-btn"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={!customFontName.trim()}
                >
                  <Upload size={16} />
                  Загрузить
                </button>
              </div>

              {settings.custom_fonts.length > 0 && (
                <div className="custom-fonts-list">
                  {settings.custom_fonts.map(font => (
                    <div key={font.name} className="custom-font-item">
                      <span style={{ fontFamily: `'${font.name}'` }}>{font.name}</span>
                      <button onClick={() => removeCustomFont(font.name)} title="Удалить">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="settings-actions">
              <button className="btn-reset" onClick={resetSettings}>
                Сбросить
              </button>
              <button className="btn-save" onClick={saveSettings} disabled={saving}>
                {saving ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

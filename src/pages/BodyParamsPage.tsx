import { useState, useEffect } from 'react'
import { Plus, X, Pencil, Trash2, ChevronDown } from 'lucide-react'
import { supabase } from '../lib/supabase'
import './BodyParamsPage.css'

interface BodyParams {
  id: string
  date: string
  bicep_left: number | null
  bicep_right: number | null
  forearm_left: number | null
  forearm_right: number | null
  chest: number | null
  shoulders: number | null
  waist: number | null
  glutes: number | null
  calf_left: number | null
  calf_right: number | null
  thigh_left: number | null
  thigh_right: number | null
}

const PARAMS_CONFIG = [
  { key: 'bicep_left', label: 'Бицепс левый' },
  { key: 'bicep_right', label: 'Бицепс правый' },
  { key: 'forearm_left', label: 'Предплечье левое' },
  { key: 'forearm_right', label: 'Предплечье правое' },
  { key: 'chest', label: 'Грудь' },
  { key: 'shoulders', label: 'Плечи' },
  { key: 'waist', label: 'Талия' },
  { key: 'glutes', label: 'Ягодицы' },
  { key: 'calf_left', label: 'Икра левая' },
  { key: 'calf_right', label: 'Икра правая' },
  { key: 'thigh_left', label: 'Бедро левое' },
  { key: 'thigh_right', label: 'Бедро правое' },
] as const

type ParamKey = typeof PARAMS_CONFIG[number]['key']

const emptyForm: Record<ParamKey, string> = {
  bicep_left: '',
  bicep_right: '',
  forearm_left: '',
  forearm_right: '',
  chest: '',
  shoulders: '',
  waist: '',
  glutes: '',
  calf_left: '',
  calf_right: '',
  thigh_left: '',
  thigh_right: '',
}

export default function BodyParamsPage() {
  const [records, setRecords] = useState<BodyParams[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formDate, setFormDate] = useState(() => new Date().toISOString().split('T')[0])
  const [formData, setFormData] = useState<Record<ParamKey, string>>(emptyForm)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    loadRecords()
  }, [])

  const loadRecords = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('body_params')
      .select('*')
      .eq('user_id', user.id)
      .order('date', { ascending: false })

    if (data) {
      setRecords(data)
    }
    setLoading(false)
  }

  const openAddModal = () => {
    setEditingId(null)
    setFormDate(new Date().toISOString().split('T')[0])
    setFormData(emptyForm)
    setShowModal(true)
  }

  const openEditModal = (record: BodyParams) => {
    setEditingId(record.id)
    setFormDate(record.date)
    const data: Record<ParamKey, string> = { ...emptyForm }
    PARAMS_CONFIG.forEach(p => {
      const val = record[p.key as keyof BodyParams]
      data[p.key] = val !== null ? String(val) : ''
    })
    setFormData(data)
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingId(null)
  }

  const handleInputChange = (key: ParamKey, value: string) => {
    setFormData(prev => ({ ...prev, [key]: value }))
  }

  const handleSave = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const params: Partial<BodyParams> = { date: formDate }
    PARAMS_CONFIG.forEach(p => {
      const val = parseFloat(formData[p.key].replace(',', '.'))
      ;(params as Record<string, number | null>)[p.key] = isNaN(val) ? null : val
    })

    if (editingId) {
      await supabase
        .from('body_params')
        .update(params)
        .eq('id', editingId)
    } else {
      await supabase
        .from('body_params')
        .insert({ ...params, user_id: user.id })
    }

    closeModal()
    loadRecords()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Удалить запись?')) return

    await supabase.from('body_params').delete().eq('id', id)
    loadRecords()
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
  }

  const getDiff = (current: BodyParams, paramKey: ParamKey): string | null => {
    const currentIndex = records.findIndex(r => r.id === current.id)
    if (currentIndex === records.length - 1) return null

    const prev = records[currentIndex + 1]
    const currVal = current[paramKey as keyof BodyParams] as number | null
    const prevVal = prev[paramKey as keyof BodyParams] as number | null

    if (currVal === null || prevVal === null) return null
    const diff = currVal - prevVal
    if (diff === 0) return null

    return diff > 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1)
  }

  if (loading) {
    return <div className="body-params-page"><div className="loading">Загрузка...</div></div>
  }

  return (
    <div className="body-params-page">
      <div className="page-header">
        <h1>Параметры тела</h1>
        <button className="add-btn" onClick={openAddModal}>
          <Plus size={20} />
          <span>Новый замер</span>
        </button>
      </div>

      {records.length === 0 ? (
        <div className="empty-state">
          <p>Нет записей</p>
          <p>Добавьте первый замер параметров тела</p>
        </div>
      ) : (
        <div className="records-list">
          {records.map(record => {
            const isExpanded = expandedId === record.id
            const filledParams = PARAMS_CONFIG.filter(p => record[p.key as keyof BodyParams] !== null)
            return (
              <div key={record.id} className={`record-card ${isExpanded ? 'expanded' : ''}`}>
                <div
                  className="record-header"
                  onClick={() => setExpandedId(isExpanded ? null : record.id)}
                >
                  <div className="record-header-left">
                    <ChevronDown size={18} className="expand-icon" />
                    <span className="record-date">{formatDate(record.date)}</span>
                    <span className="record-count">{filledParams.length} параметров</span>
                  </div>
                  <div className="record-actions" onClick={e => e.stopPropagation()}>
                    <button onClick={() => openEditModal(record)} title="Редактировать">
                      <Pencil size={16} />
                    </button>
                    <button onClick={() => handleDelete(record.id)} title="Удалить">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                {isExpanded && (
                  <div className="record-params">
                    {PARAMS_CONFIG.map(p => {
                      const val = record[p.key as keyof BodyParams] as number | null
                      const diff = getDiff(record, p.key)
                      if (val === null) return null
                      return (
                        <div key={p.key} className="param-item">
                          <span className="param-label">{p.label}</span>
                          <span className="param-value">
                            {val} см
                            {diff && (
                              <span className={`param-diff ${parseFloat(diff) > 0 ? 'positive' : 'negative'}`}>
                                {diff}
                              </span>
                            )}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingId ? 'Редактировать замер' : 'Новый замер'}</h2>
              <button className="close-btn" onClick={closeModal}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group date-group">
                <label>Дата</label>
                <input
                  type="date"
                  value={formDate}
                  onChange={e => setFormDate(e.target.value)}
                />
              </div>
              <div className="params-grid">
                {PARAMS_CONFIG.map(p => (
                  <div key={p.key} className="form-group">
                    <label>{p.label}</label>
                    <div className="input-with-suffix">
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="—"
                        value={formData[p.key]}
                        onChange={e => handleInputChange(p.key, e.target.value)}
                      />
                      <span>см</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={closeModal}>Отмена</button>
              <button className="btn-primary" onClick={handleSave}>Сохранить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

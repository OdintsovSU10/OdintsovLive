import { useState, useEffect } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { supabase } from '../lib/supabase'
import './WeightPage.css'

interface WeightRecord {
  id: string
  date: string
  weight: number
  created_at: string
}

type Tab = 'chart' | 'history'

export default function WeightPage() {
  const [records, setRecords] = useState<WeightRecord[]>([])
  const [inputValue, setInputValue] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState<Tab>('chart')

  useEffect(() => {
    loadWeights()
  }, [])

  const loadWeights = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('body_weight')
      .select('id, date, weight, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })

    if (data) {
      setRecords(data.map(r => ({ ...r, weight: Number(r.weight) })))
    }
    setLoading(false)
  }

  const addWeight = async () => {
    const weight = parseFloat(inputValue.replace(',', '.'))
    if (isNaN(weight) || weight <= 0) return

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    setSaving(true)
    const today = new Date().toISOString().split('T')[0]

    await supabase.from('body_weight').insert({
      user_id: user.id,
      date: today,
      weight
    })

    setInputValue('')
    await loadWeights()
    setSaving(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') addWeight()
  }

  const deleteWeight = async (id: string) => {
    await supabase.from('body_weight').delete().eq('id', id)
    await loadWeights()
  }

  const todayFormatted = new Date().toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  })

  const todayDate = new Date().toISOString().split('T')[0]
  const todayRecords = records.filter(r => r.date === todayDate)
  const lastTodayRecord = todayRecords.length ? todayRecords[todayRecords.length - 1] : null

  const chartData = records.map(r => ({
    date: new Date(r.created_at).getTime(),
    weight: r.weight,
    label: new Date(r.created_at).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  }))

  const weights = records.map(r => r.weight)
  const minWeight = weights.length ? Math.min(...weights) : null
  const maxWeight = weights.length ? Math.max(...weights) : null
  const lastWeight = records.length ? records[records.length - 1].weight : null

  return (
    <div className="weight-page">
      <div className="weight-add-section">
        <div className="today-date">{todayFormatted}</div>

        {lastTodayRecord ? (
          <div className="today-weight">
            Сегодня: <strong>{lastTodayRecord.weight} кг</strong>
            {todayRecords.length > 1 && <span> ({todayRecords.length} записей)</span>}
          </div>
        ) : null}

        <div className="weight-input-row">
          <input
            type="text"
            inputMode="decimal"
            placeholder="Вес, кг"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={saving}
          />
          <button onClick={addWeight} disabled={saving || !inputValue}>
            <Plus size={20} />
          </button>
        </div>
      </div>

      {!loading && (
        <div className="weight-stats">
          <div className="weight-stat">
            <span className="stat-value">{lastWeight ?? '—'}</span>
            <span className="stat-label">Последний</span>
          </div>
          <div className="weight-stat">
            <span className="stat-value">{minWeight ?? '—'}</span>
            <span className="stat-label">Мин</span>
          </div>
          <div className="weight-stat">
            <span className="stat-value">{maxWeight ?? '—'}</span>
            <span className="stat-label">Макс</span>
          </div>
        </div>
      )}

      <div className="weight-tabs">
        <button
          className={`weight-tab ${tab === 'chart' ? 'active' : ''}`}
          onClick={() => setTab('chart')}
        >
          График
        </button>
        <button
          className={`weight-tab ${tab === 'history' ? 'active' : ''}`}
          onClick={() => setTab('history')}
        >
          История
        </button>
      </div>

      {tab === 'chart' ? (
        <div className="weight-chart-container">
          {loading ? (
            <div className="no-data">Загрузка...</div>
          ) : chartData.length > 1 ? (
            <ResponsiveContainer width="100%" height={350}>
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id="weightGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--primary)" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10 }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  domain={['dataMin - 2', 'dataMax + 2']}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip
                  formatter={(value) => [`${value} кг`, 'Вес']}
                  labelStyle={{ color: 'var(--text-primary)' }}
                  contentStyle={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)'
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="weight"
                  stroke="var(--primary)"
                  strokeWidth={2}
                  fill="url(#weightGradient)"
                  dot={{ r: 4, fill: 'var(--primary)' }}
                  activeDot={{ r: 6, fill: 'var(--primary)' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="no-data">
              {chartData.length === 1 ? 'Добавьте ещё записи для графика' : 'Нет данных'}
            </div>
          )}
        </div>
      ) : (
        <div className="weight-history">
          {loading ? (
            <div className="no-data">Загрузка...</div>
          ) : records.length === 0 ? (
            <div className="no-data">Нет записей</div>
          ) : (
            <div className="history-list">
              {[...records].reverse().map(r => (
                <div key={r.id} className="history-item">
                  <div className="history-date-time">
                    <span className="history-date">
                      {new Date(r.date).toLocaleDateString('ru-RU', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric'
                      })}
                    </span>
                    <span className="history-time">
                      {new Date(r.created_at).toLocaleTimeString('ru-RU', {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </div>
                  <span className="history-weight">{r.weight} кг</span>
                  <button
                    className="history-delete"
                    onClick={() => deleteWeight(r.id)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

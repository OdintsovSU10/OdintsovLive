import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, Trash2, Check } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { MONTHS } from '../lib/constants'
import './RentMonthPage.css'

interface ElectricityMeter {
  name: string
  value: number
}

interface RentRecord {
  rent_amount: number
  water_amount: number
  electricity_amount: number
  cold_water: number
  hot_water: number
  electricity: ElectricityMeter[]
  paid: boolean
  notes: string
}

interface PrevRecord {
  cold_water: number
  hot_water: number
  electricity: ElectricityMeter[]
}

export default function RentMonthPage() {
  const { year: yearParam, month: monthParam } = useParams()
  const navigate = useNavigate()
  const year = Number(yearParam)
  const month = Number(monthParam)

  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [record, setRecord] = useState<RentRecord>({
    rent_amount: 0,
    water_amount: 0,
    electricity_amount: 0,
    cold_water: 0,
    hot_water: 0,
    electricity: [],
    paid: false,
    notes: ''
  })
  const [prevRecord, setPrevRecord] = useState<PrevRecord | null>(null)
  const [inputs, setInputs] = useState({
    rent: '',
    water: '',
    electricity: '',
    coldWater: '',
    hotWater: '',
    notes: ''
  })
  const [newMeterName, setNewMeterName] = useState('')
  const [electricityInputs, setElectricityInputs] = useState<{ [key: string]: string }>({})

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUserId(user.id)
        loadData(user.id)
      }
    })
  }, [year, month])

  const loadData = async (uid: string) => {
    setLoading(true)

    const prevMonth = month === 0 ? 11 : month - 1
    const prevYear = month === 0 ? year - 1 : year

    const [currentResult, prevResult] = await Promise.all([
      supabase
        .from('rent_records')
        .select('*')
        .eq('user_id', uid)
        .eq('year', year)
        .eq('month', month)
        .maybeSingle(),
      supabase
        .from('rent_records')
        .select('cold_water, hot_water, electricity')
        .eq('user_id', uid)
        .eq('year', prevYear)
        .eq('month', prevMonth)
        .maybeSingle()
    ])

    const prevElectricity: ElectricityMeter[] = prevResult.data?.electricity || []

    if (prevResult.data) {
      setPrevRecord({
        cold_water: prevResult.data.cold_water || 0,
        hot_water: prevResult.data.hot_water || 0,
        electricity: prevElectricity
      })
    }

    if (currentResult.data) {
      const data = currentResult.data
      const electricity: ElectricityMeter[] = data.electricity || []

      setRecord({
        rent_amount: data.rent_amount || 0,
        water_amount: data.water_amount || 0,
        electricity_amount: data.electricity_amount || 0,
        cold_water: data.cold_water || 0,
        hot_water: data.hot_water || 0,
        electricity,
        paid: data.paid || false,
        notes: data.notes || ''
      })
      setInputs({
        rent: data.rent_amount > 0 ? Math.round(data.rent_amount).toLocaleString('ru-RU') : '',
        water: data.water_amount > 0 ? Math.round(data.water_amount).toLocaleString('ru-RU') : '',
        electricity: data.electricity_amount > 0 ? Math.round(data.electricity_amount).toLocaleString('ru-RU') : '',
        coldWater: data.cold_water > 0 ? String(data.cold_water) : '',
        hotWater: data.hot_water > 0 ? String(data.hot_water) : '',
        notes: data.notes || ''
      })
      // Инициализируем inputs для электричества
      const elInputs: { [key: string]: string } = {}
      electricity.forEach(m => {
        elInputs[m.name] = m.value > 0 ? String(m.value) : ''
      })
      setElectricityInputs(elInputs)
    } else if (prevElectricity.length > 0) {
      // Автокопирование счётчиков из предыдущего месяца
      const emptyMeters = prevElectricity.map(m => ({ name: m.name, value: 0 }))
      setRecord(prev => ({ ...prev, electricity: emptyMeters }))
      // Сохраняем пустые счётчики
      await supabase.from('rent_records').upsert(
        {
          user_id: uid,
          year,
          month,
          electricity: emptyMeters,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'user_id,year,month' }
      )
    }

    setLoading(false)
  }

  const parseNumber = (value: string): number => {
    const cleaned = value.replace(/\s/g, '').replace(',', '.')
    return parseFloat(cleaned) || 0
  }

  const saveField = async (field: string, value: number | boolean | string | ElectricityMeter[]) => {
    if (!userId) return

    await supabase.from('rent_records').upsert(
      {
        user_id: userId,
        year,
        month,
        [field]: value,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'user_id,year,month' }
    )
  }

  const handleRentBlur = () => {
    const value = parseNumber(inputs.rent)
    setRecord(prev => ({ ...prev, rent_amount: value }))
    setInputs(prev => ({ ...prev, rent: value > 0 ? Math.round(value).toLocaleString('ru-RU') : '' }))
    saveField('rent_amount', value)
  }

  const handleWaterAmountBlur = () => {
    const value = parseNumber(inputs.water)
    setRecord(prev => ({ ...prev, water_amount: value }))
    setInputs(prev => ({ ...prev, water: value > 0 ? Math.round(value).toLocaleString('ru-RU') : '' }))
    saveField('water_amount', value)
  }

  const handleElectricityAmountBlur = () => {
    const value = parseNumber(inputs.electricity)
    setRecord(prev => ({ ...prev, electricity_amount: value }))
    setInputs(prev => ({ ...prev, electricity: value > 0 ? Math.round(value).toLocaleString('ru-RU') : '' }))
    saveField('electricity_amount', value)
  }

  const handleColdWaterBlur = () => {
    const value = parseNumber(inputs.coldWater)
    setRecord(prev => ({ ...prev, cold_water: value }))
    setInputs(prev => ({ ...prev, coldWater: value > 0 ? String(value) : '' }))
    saveField('cold_water', value)
  }

  const handleHotWaterBlur = () => {
    const value = parseNumber(inputs.hotWater)
    setRecord(prev => ({ ...prev, hot_water: value }))
    setInputs(prev => ({ ...prev, hotWater: value > 0 ? String(value) : '' }))
    saveField('hot_water', value)
  }

  const handleNotesBlur = () => {
    setRecord(prev => ({ ...prev, notes: inputs.notes }))
    saveField('notes', inputs.notes)
  }

  const togglePaid = () => {
    const newPaid = !record.paid
    setRecord(prev => ({ ...prev, paid: newPaid }))
    saveField('paid', newPaid)
  }

  const addElectricityMeter = () => {
    if (!newMeterName.trim()) return
    const newMeter: ElectricityMeter = { name: newMeterName.trim(), value: 0 }
    const updated = [...record.electricity, newMeter]
    setRecord(prev => ({ ...prev, electricity: updated }))
    saveField('electricity', updated)
    setNewMeterName('')
  }

  const handleElectricityChange = (name: string, inputValue: string) => {
    setElectricityInputs(prev => ({ ...prev, [name]: inputValue }))
  }

  const handleElectricityBlur = (index: number, name: string) => {
    const value = parseNumber(electricityInputs[name] || '0')
    const updated = record.electricity.map((m, i) =>
      i === index ? { ...m, value } : m
    )
    setRecord(prev => ({ ...prev, electricity: updated }))
    setElectricityInputs(prev => ({ ...prev, [name]: value > 0 ? String(value) : '' }))
    saveField('electricity', updated)
  }

  const removeElectricityMeter = (index: number) => {
    const removed = record.electricity[index]
    const updated = record.electricity.filter((_, i) => i !== index)
    setRecord(prev => ({ ...prev, electricity: updated }))
    setElectricityInputs(prev => {
      const next = { ...prev }
      delete next[removed.name]
      return next
    })
    saveField('electricity', updated)
  }

  const getColdWaterUsage = () => {
    if (!prevRecord) return null
    return Math.max(0, record.cold_water - prevRecord.cold_water)
  }

  const getHotWaterUsage = () => {
    if (!prevRecord) return null
    return Math.max(0, record.hot_water - prevRecord.hot_water)
  }

  const getTotalWaterUsage = () => {
    const cold = getColdWaterUsage()
    const hot = getHotWaterUsage()
    if (cold === null && hot === null) return null
    return (cold || 0) + (hot || 0)
  }

  const getElectricityUsage = (meterName: string, currentValue: number) => {
    if (!prevRecord) return null
    const prevMeter = prevRecord.electricity.find(m => m.name === meterName)
    if (!prevMeter) return null
    return Math.max(0, currentValue - prevMeter.value)
  }

  const getTotalElectricityUsage = () => {
    if (!prevRecord || prevRecord.electricity.length === 0) return null
    let total = 0
    let hasAnyMatch = false
    for (const meter of record.electricity) {
      const prevMeter = prevRecord.electricity.find(m => m.name === meter.name)
      if (prevMeter) {
        total += Math.max(0, meter.value - prevMeter.value)
        hasAnyMatch = true
      }
    }
    return hasAnyMatch ? total : null
  }

  const total = record.rent_amount + record.water_amount + record.electricity_amount

  if (loading) {
    return (
      <div className="rent-month-page">
        <div className="month-header">
          <button className="back-btn" onClick={() => navigate(`/rent?year=${year}`)}>
            <ArrowLeft size={20} />
            <span>Назад</span>
          </button>
          <h1>{MONTHS[month]} {year}</h1>
        </div>
        <div className="loading">Загрузка...</div>
      </div>
    )
  }

  return (
    <div className="rent-month-page">
      <div className="month-header">
        <button className="back-btn" onClick={() => navigate(`/rent?year=${year}`)}>
          <ArrowLeft size={20} />
          <span>Назад</span>
        </button>
        <h1>{MONTHS[month]} {year}</h1>
      </div>

      <div className="month-content">
        <div className="content-section">
          <div className="section-title">Платежи</div>
          <div className="input-row">
            <span>Аренда</span>
            <div className="inline-input">
              <input
                type="text"
                inputMode="numeric"
                value={inputs.rent}
                placeholder="0"
                onChange={e => setInputs(prev => ({ ...prev, rent: e.target.value }))}
                onBlur={handleRentBlur}
              />
              <span>₽</span>
            </div>
          </div>
          <div className="input-row">
            <span>Вода</span>
            <div className="inline-input">
              <input
                type="text"
                inputMode="numeric"
                value={inputs.water}
                placeholder="0"
                onChange={e => setInputs(prev => ({ ...prev, water: e.target.value }))}
                onBlur={handleWaterAmountBlur}
              />
              <span>₽</span>
            </div>
          </div>
          <div className="input-row">
            <span>Электричество</span>
            <div className="inline-input">
              <input
                type="text"
                inputMode="numeric"
                value={inputs.electricity}
                placeholder="0"
                onChange={e => setInputs(prev => ({ ...prev, electricity: e.target.value }))}
                onBlur={handleElectricityAmountBlur}
              />
              <span>₽</span>
            </div>
          </div>
        </div>

        <div className="content-section">
          <div className="section-header">
            <div className="section-title">Счётчики воды</div>
            {getTotalWaterUsage() !== null && (
              <span className="total-usage">всего: {getTotalWaterUsage()?.toFixed(2)} м³</span>
            )}
          </div>
          <div className="input-row">
            <span>ГВС (горячая)</span>
            <div className="meter-input">
              <input
                type="text"
                inputMode="decimal"
                value={inputs.hotWater}
                placeholder="0"
                onChange={e => setInputs(prev => ({ ...prev, hotWater: e.target.value }))}
                onBlur={handleHotWaterBlur}
              />
              {getHotWaterUsage() !== null && (
                <span className="usage">расход: {getHotWaterUsage()?.toFixed(2)} м³</span>
              )}
            </div>
          </div>
          <div className="input-row">
            <span>ХВС (холодная)</span>
            <div className="meter-input">
              <input
                type="text"
                inputMode="decimal"
                value={inputs.coldWater}
                placeholder="0"
                onChange={e => setInputs(prev => ({ ...prev, coldWater: e.target.value }))}
                onBlur={handleColdWaterBlur}
              />
              {getColdWaterUsage() !== null && (
                <span className="usage">расход: {getColdWaterUsage()?.toFixed(2)} м³</span>
              )}
            </div>
          </div>
        </div>

        <div className="content-section">
          <div className="section-header">
            <div className="section-title">Электричество</div>
            {getTotalElectricityUsage() !== null && (
              <span className="total-usage">всего: {getTotalElectricityUsage()?.toFixed(2)} кВт</span>
            )}
          </div>
          {record.electricity.map((meter, index) => {
            const usage = getElectricityUsage(meter.name, meter.value)
            return (
              <div key={meter.name} className="input-row electricity-row">
                <span>{meter.name}</span>
                <div className="meter-input">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={electricityInputs[meter.name] ?? (meter.value > 0 ? String(meter.value) : '')}
                    placeholder="0"
                    onChange={e => handleElectricityChange(meter.name, e.target.value)}
                    onBlur={() => handleElectricityBlur(index, meter.name)}
                  />
                  {usage !== null && (
                    <span className="usage">расход: {usage.toFixed(2)} кВт</span>
                  )}
                  <button className="delete-btn" onClick={() => removeElectricityMeter(index)}>
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            )
          })}
          <div className="add-meter">
            <input
              type="text"
              placeholder="Название счётчика"
              value={newMeterName}
              onChange={e => setNewMeterName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addElectricityMeter()}
            />
            <button onClick={addElectricityMeter} disabled={!newMeterName.trim()}>
              <Plus size={18} />
            </button>
          </div>
        </div>

        <div className="content-section">
          <div className="section-title">Заметки</div>
          <textarea
            value={inputs.notes}
            placeholder="Комментарии..."
            onChange={e => setInputs(prev => ({ ...prev, notes: e.target.value }))}
            onBlur={handleNotesBlur}
          />
        </div>

        <div className="summary-section">
          <div className="summary-row">
            <span>Итого</span>
            <span className="total-amount">{Math.round(total).toLocaleString('ru-RU')} ₽</span>
          </div>
          <button className={`paid-btn ${record.paid ? 'is-paid' : ''}`} onClick={togglePaid}>
            <Check size={18} />
            <span>{record.paid ? 'Оплачено' : 'Отметить оплаченным'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}

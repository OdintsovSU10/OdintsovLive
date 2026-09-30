import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Check } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { MONTHS } from '../lib/constants'
import ElectricitySection from './rent/ElectricitySection'
import MeterPhotoUpload from './rent/MeterPhotoUpload'
import WaterBillSection from './rent/WaterBillSection'
import {
  applyElectricity,
  assignWaterReadings,
  buildRentMessage,
  calcWaterBill,
  hasAllTariffs,
  type ElectricityMeter,
  type RecognizedMeter,
  type WaterTariffs
} from './rent/rentUtils'
import './RentMonthPage.css'

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

type SaveValue = number | boolean | string | ElectricityMeter[]

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
  const [tariffs, setTariffs] = useState<WaterTariffs>({ cold: 0, hot: 0, drainage: 0 })
  const [inputs, setInputs] = useState({
    rent: '',
    water: '',
    electricity: '',
    coldWater: '',
    hotWater: '',
    notes: ''
  })

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
        .select('cold_water, hot_water, electricity, cold_water_tariff, hot_water_tariff, drainage_tariff')
        .eq('user_id', uid)
        .eq('year', prevYear)
        .eq('month', prevMonth)
        .maybeSingle()
    ])

    const prevElectricity: ElectricityMeter[] = prevResult.data?.electricity || []

    const ownTariffs: WaterTariffs = {
      cold: Number(currentResult.data?.cold_water_tariff) || 0,
      hot: Number(currentResult.data?.hot_water_tariff) || 0,
      drainage: Number(currentResult.data?.drainage_tariff) || 0
    }
    const prevTariffs: WaterTariffs = {
      cold: Number(prevResult.data?.cold_water_tariff) || 0,
      hot: Number(prevResult.data?.hot_water_tariff) || 0,
      drainage: Number(prevResult.data?.drainage_tariff) || 0
    }
    setTariffs(ownTariffs.cold || ownTariffs.hot || ownTariffs.drainage ? ownTariffs : prevTariffs)

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

  const saveFields = async (fields: Record<string, SaveValue>) => {
    if (!userId) return

    await supabase.from('rent_records').upsert(
      {
        user_id: userId,
        year,
        month,
        ...fields,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'user_id,year,month' }
    )
  }

  const saveField = (field: string, value: SaveValue) => saveFields({ [field]: value })

  const prevWater = prevRecord && { cold: prevRecord.cold_water, hot: prevRecord.hot_water }

  // Сумма «Вода» пересчитывается только по действию пользователя, чтобы не затирать старые месяцы.
  // Тарифы сохраняем вместе с суммой: подставленные из прошлого месяца тоже должны перейти дальше
  const waterAmountFields = (cold: number, hot: number, t: WaterTariffs): Record<string, number> => {
    const bill = calcWaterBill(prevWater, { cold, hot }, t)
    if (!bill || !hasAllTariffs(t)) return {}
    setRecord(prev => ({ ...prev, water_amount: bill.total }))
    setInputs(prev => ({ ...prev, water: Math.round(bill.total).toLocaleString('ru-RU') }))
    return {
      water_amount: bill.total,
      cold_water_tariff: t.cold,
      hot_water_tariff: t.hot,
      drainage_tariff: t.drainage
    }
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
    saveFields({ cold_water: value, ...waterAmountFields(value, record.hot_water, tariffs) })
  }

  const handleHotWaterBlur = () => {
    const value = parseNumber(inputs.hotWater)
    setRecord(prev => ({ ...prev, hot_water: value }))
    setInputs(prev => ({ ...prev, hotWater: value > 0 ? String(value) : '' }))
    saveFields({ hot_water: value, ...waterAmountFields(record.cold_water, value, tariffs) })
  }

  const handleTariffChange = (key: keyof WaterTariffs, value: number) => {
    const next = { ...tariffs, [key]: value }
    setTariffs(next)
    saveFields({
      cold_water_tariff: next.cold,
      hot_water_tariff: next.hot,
      drainage_tariff: next.drainage,
      ...waterAmountFields(record.cold_water, record.hot_water, next)
    })
  }

  const applyRecognized = async (meters: RecognizedMeter[]) => {
    const electricity = applyElectricity(record.electricity, meters)
    const water = assignWaterReadings(meters.filter(m => m.kind === 'water').map(m => m.value), prevWater)
    const cold = water.cold ?? record.cold_water
    const hot = water.hot ?? record.hot_water

    setRecord(prev => ({ ...prev, electricity, cold_water: cold, hot_water: hot }))
    setInputs(prev => ({ ...prev, coldWater: cold > 0 ? String(cold) : '', hotWater: hot > 0 ? String(hot) : '' }))
    await saveFields({
      electricity,
      cold_water: cold,
      hot_water: hot,
      ...waterAmountFields(cold, hot, tariffs)
    })
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

  const handleElectricityChange = (updated: ElectricityMeter[]) => {
    setRecord(prev => ({ ...prev, electricity: updated }))
    saveField('electricity', updated)
  }

  const getColdWaterUsage = () => {
    if (!prevRecord) return null
    return Math.max(0, Math.floor(record.cold_water) - Math.floor(prevRecord.cold_water))
  }

  const getHotWaterUsage = () => {
    if (!prevRecord) return null
    return Math.max(0, Math.floor(record.hot_water) - Math.floor(prevRecord.hot_water))
  }

  const getTotalWaterUsage = () => {
    const cold = getColdWaterUsage()
    const hot = getHotWaterUsage()
    if (cold === null && hot === null) return null
    return (cold || 0) + (hot || 0)
  }

  const total = record.rent_amount + record.water_amount + record.electricity_amount
  const waterBill = calcWaterBill(prevWater, { cold: record.cold_water, hot: record.hot_water }, tariffs)

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

        {userId && (
          <MeterPhotoUpload userId={userId} year={year} month={month} onRecognized={applyRecognized} />
        )}

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

        <ElectricitySection
          meters={record.electricity}
          prevMeters={prevRecord?.electricity ?? null}
          onChange={handleElectricityChange}
        />

        <WaterBillSection
          tariffs={tariffs}
          bill={waterBill}
          message={buildRentMessage(record.electricity, waterBill, tariffs)}
          onTariffChange={handleTariffChange}
        />

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

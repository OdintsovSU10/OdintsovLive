import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Check } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { MONTHS } from '../lib/constants'
import { parseNumber } from '../lib/formatUtils'
import ElectricitySection from './rent/ElectricitySection'
import MeterPhotoUpload from './rent/MeterPhotoUpload'
import PaymentsSection, { type AmountKey, type PaymentRow } from './rent/PaymentsSection'
import RentMessageSection from './rent/RentMessageSection'
import TariffsSection from './rent/TariffsSection'
import {
  applyElectricity,
  assignWaterReadings,
  buildRentMessage,
  calcElectricityTotal,
  calcWaterBill,
  hasAllTariffs,
  type ElectricityMeter,
  type ElectricityTariffs,
  type RecognizedMeter,
  type WaterTariffs
} from './rent/rentUtils'
import './RentMonthPage.css'

interface RentRecord {
  rent_amount: number
  water_amount: number
  electricity_amount: number
  rent_manual: boolean
  water_manual: boolean
  electricity_manual: boolean
  cold_water: number
  hot_water: number
  electricity: ElectricityMeter[]
  paid: boolean
  notes: string
}

interface PrevRecord {
  rent_amount: number
  cold_water: number
  hot_water: number
  electricity: ElectricityMeter[]
}

type SaveValue = number | boolean | string | ElectricityMeter[] | ElectricityTariffs

const AMOUNT_FIELDS = {
  rent: { label: 'Аренда', amount: 'rent_amount', manual: 'rent_manual' },
  water: { label: 'Вода', amount: 'water_amount', manual: 'water_manual' },
  electricity: { label: 'Электричество', amount: 'electricity_amount', manual: 'electricity_manual' }
} as const

const AMOUNT_KEYS: AmountKey[] = ['rent', 'water', 'electricity']

const EMPTY_RECORD: RentRecord = {
  rent_amount: 0,
  water_amount: 0,
  electricity_amount: 0,
  rent_manual: false,
  water_manual: false,
  electricity_manual: false,
  cold_water: 0,
  hot_water: 0,
  electricity: [],
  paid: false,
  notes: ''
}

const toWaterTariffs = (
  data: { cold_water_tariff?: unknown; hot_water_tariff?: unknown; drainage_tariff?: unknown } | null
): WaterTariffs => ({
  cold: Number(data?.cold_water_tariff) || 0,
  hot: Number(data?.hot_water_tariff) || 0,
  drainage: Number(data?.drainage_tariff) || 0
})

const waterTariffFields = (t: WaterTariffs) => ({
  cold_water_tariff: t.cold,
  hot_water_tariff: t.hot,
  drainage_tariff: t.drainage
})

const hasAnyValue = (values: object) => Object.values(values).some(v => Number(v) > 0)

export default function RentMonthPage() {
  const { year: yearParam, month: monthParam } = useParams()
  const navigate = useNavigate()
  const year = Number(yearParam)
  const month = Number(monthParam)

  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [record, setRecord] = useState<RentRecord>(EMPTY_RECORD)
  const [prevRecord, setPrevRecord] = useState<PrevRecord | null>(null)
  const [tariffs, setTariffs] = useState<WaterTariffs>({ cold: 0, hot: 0, drainage: 0 })
  const [electricityTariffs, setElectricityTariffs] = useState<ElectricityTariffs>({})
  const [inputs, setInputs] = useState({ coldWater: '', hotWater: '', notes: '' })

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUserId(user.id)
        loadData(user.id)
      }
    })
  }, [year, month])

  const upsertFields = (uid: string, fields: Record<string, SaveValue>) =>
    supabase.from('rent_records').upsert(
      {
        user_id: uid,
        year,
        month,
        ...fields,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'user_id,year,month' }
    )

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
        .select('rent_amount, cold_water, hot_water, electricity, cold_water_tariff, hot_water_tariff, drainage_tariff, electricity_tariffs')
        .eq('user_id', uid)
        .eq('year', prevYear)
        .eq('month', prevMonth)
        .maybeSingle()
    ])

    const data = currentResult.data
    const prev = prevResult.data
    const prevElectricity: ElectricityMeter[] = prev?.electricity || []

    setPrevRecord(prev
      ? {
          rent_amount: Number(prev.rent_amount) || 0,
          cold_water: prev.cold_water || 0,
          hot_water: prev.hot_water || 0,
          electricity: prevElectricity
        }
      : null)

    // Тарифы берём свои, иначе из прошлого месяца — и сразу сохраняем, чтобы шли дальше по цепочке
    const inherited: Record<string, SaveValue> = {}
    const ownWaterTariffs = toWaterTariffs(data)
    const prevWaterTariffs = toWaterTariffs(prev)
    if (hasAnyValue(ownWaterTariffs)) {
      setTariffs(ownWaterTariffs)
    } else {
      setTariffs(prevWaterTariffs)
      if (hasAnyValue(prevWaterTariffs)) Object.assign(inherited, waterTariffFields(prevWaterTariffs))
    }

    const ownElectricityTariffs: ElectricityTariffs = data?.electricity_tariffs || {}
    const prevElectricityTariffs: ElectricityTariffs = prev?.electricity_tariffs || {}
    if (hasAnyValue(ownElectricityTariffs)) {
      setElectricityTariffs(ownElectricityTariffs)
    } else {
      setElectricityTariffs(prevElectricityTariffs)
      if (hasAnyValue(prevElectricityTariffs)) inherited.electricity_tariffs = prevElectricityTariffs
    }

    if (data) {
      setRecord({
        rent_amount: Number(data.rent_amount) || 0,
        water_amount: Number(data.water_amount) || 0,
        electricity_amount: Number(data.electricity_amount) || 0,
        rent_manual: Boolean(data.rent_manual),
        water_manual: Boolean(data.water_manual),
        electricity_manual: Boolean(data.electricity_manual),
        cold_water: data.cold_water || 0,
        hot_water: data.hot_water || 0,
        electricity: data.electricity || [],
        paid: data.paid || false,
        notes: data.notes || ''
      })
      setInputs({
        coldWater: data.cold_water > 0 ? String(data.cold_water) : '',
        hotWater: data.hot_water > 0 ? String(data.hot_water) : '',
        notes: data.notes || ''
      })
    } else {
      // Автокопирование счётчиков из предыдущего месяца
      const emptyMeters = prevElectricity.map(m => ({ name: m.name, value: 0 }))
      setRecord({ ...EMPTY_RECORD, electricity: emptyMeters })
      setInputs({ coldWater: '', hotWater: '', notes: '' })
      if (emptyMeters.length > 0) inherited.electricity = emptyMeters
    }

    if (Object.keys(inherited).length > 0) await upsertFields(uid, inherited)
    setLoading(false)
  }

  const saveFields = async (fields: Record<string, SaveValue>) => {
    if (!userId) return
    await upsertFields(userId, fields)
  }

  const saveField = (field: string, value: SaveValue) => saveFields({ [field]: value })

  const prevWater = prevRecord && { cold: prevRecord.cold_water, hot: prevRecord.hot_water }
  const waterBill = calcWaterBill(prevWater, { cold: record.cold_water, hot: record.hot_water }, tariffs)

  const autoAmounts: Record<AmountKey, number | null> = {
    rent: prevRecord && prevRecord.rent_amount > 0 ? prevRecord.rent_amount : null,
    water: waterBill && hasAllTariffs(tariffs) ? waterBill.total : null,
    electricity: calcElectricityTotal(prevRecord?.electricity ?? null, record.electricity, electricityTariffs)
  }

  // Пока сумма не введена вручную, она равна авторасчёту (0, если данных не хватает)
  const amountOf = (key: AmountKey) => {
    const { amount, manual } = AMOUNT_FIELDS[key]
    return record[manual] ? record[amount] : autoAmounts[key] ?? 0
  }

  const amounts: Record<AmountKey, number> = {
    rent: amountOf('rent'),
    water: amountOf('water'),
    electricity: amountOf('electricity')
  }

  // Авторасчётные суммы сохраняем, чтобы список месяцев и итоги видели актуальные значения
  useEffect(() => {
    if (loading || !userId) return
    const changed: Record<string, number> = {}
    for (const key of AMOUNT_KEYS) {
      const { amount, manual } = AMOUNT_FIELDS[key]
      if (!record[manual] && amounts[key] !== record[amount]) changed[amount] = amounts[key]
    }
    if (Object.keys(changed).length === 0) return
    setRecord(prev => ({ ...prev, ...changed }))
    saveFields(changed)
  }, [
    loading,
    userId,
    amounts.rent,
    amounts.water,
    amounts.electricity,
    record.rent_amount,
    record.water_amount,
    record.electricity_amount,
    record.rent_manual,
    record.water_manual,
    record.electricity_manual
  ])

  const handleAmountChange = (key: AmountKey, value: number) => {
    const { amount, manual } = AMOUNT_FIELDS[key]
    setRecord(prev => ({ ...prev, [amount]: value, [manual]: true }))
    saveFields({ [amount]: value, [manual]: true })
  }

  const handleAmountReset = (key: AmountKey) => {
    const { manual } = AMOUNT_FIELDS[key]
    // саму сумму пересчитает и сохранит эффект синхронизации
    setRecord(prev => ({ ...prev, [manual]: false }))
    saveField(manual, false)
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

  const handleWaterTariffChange = (key: keyof WaterTariffs, value: number) => {
    const next = { ...tariffs, [key]: value }
    setTariffs(next)
    saveFields(waterTariffFields(next))
  }

  const handleElectricityTariffChange = (name: string, value: number) => {
    const next = { ...electricityTariffs, [name]: value }
    setElectricityTariffs(next)
    saveField('electricity_tariffs', next)
  }

  const applyRecognized = async (meters: RecognizedMeter[]) => {
    const electricity = applyElectricity(record.electricity, meters)
    const water = assignWaterReadings(meters.filter(m => m.kind === 'water').map(m => m.value), prevWater)
    const cold = water.cold ?? record.cold_water
    const hot = water.hot ?? record.hot_water

    setRecord(prev => ({ ...prev, electricity, cold_water: cold, hot_water: hot }))
    setInputs(prev => ({ ...prev, coldWater: cold > 0 ? String(cold) : '', hotWater: hot > 0 ? String(hot) : '' }))
    await saveFields({ electricity, cold_water: cold, hot_water: hot })
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

  const total = amounts.rent + amounts.water + amounts.electricity

  const paymentRows: PaymentRow[] = AMOUNT_KEYS.map(key => ({
    key,
    label: AMOUNT_FIELDS[key].label,
    amount: amounts[key],
    manual: record[AMOUNT_FIELDS[key].manual],
    hasAuto: autoAmounts[key] !== null
  }))

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
        <PaymentsSection rows={paymentRows} onManualChange={handleAmountChange} onReset={handleAmountReset} />

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

        <TariffsSection
          water={tariffs}
          electricity={electricityTariffs}
          meterNames={record.electricity.map(m => m.name)}
          onWaterChange={handleWaterTariffChange}
          onElectricityChange={handleElectricityTariffChange}
        />

        <RentMessageSection message={buildRentMessage(record.electricity, waterBill, tariffs)} />

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

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { isFutureMonth } from '../../lib/dateUtils'
import type { AmountKey } from './PaymentsSection'
import { buildReadingRows, findMissing, type MonthReadings } from './readings'
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
} from './rentUtils'

export interface RentRecord extends MonthReadings {
  rent_amount: number
  water_amount: number
  electricity_amount: number
  rent_manual: boolean
  water_manual: boolean
  electricity_manual: boolean
  paid: boolean
  notes: string
}

interface PrevRecord extends MonthReadings {
  rent_amount: number
}

type SaveValue = number | boolean | string | ElectricityMeter[] | ElectricityTariffs

export const AMOUNT_FIELDS = {
  rent: { label: 'Аренда', amount: 'rent_amount', manual: 'rent_manual' },
  water: { label: 'Вода', amount: 'water_amount', manual: 'water_manual' },
  electricity: { label: 'Электричество', amount: 'electricity_amount', manual: 'electricity_manual' }
} as const

export const AMOUNT_KEYS: AmountKey[] = ['rent', 'water', 'electricity']

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

const toReadings = (
  data: { cold_water?: unknown; hot_water?: unknown; electricity?: ElectricityMeter[] | null } | null
): MonthReadings | null => (data
  ? {
      cold_water: Number(data.cold_water) || 0,
      hot_water: Number(data.hot_water) || 0,
      electricity: data.electricity || []
    }
  : null)

const waterTariffFields = (t: WaterTariffs) => ({
  cold_water_tariff: t.cold,
  hot_water_tariff: t.hot,
  drainage_tariff: t.drainage
})

const hasAnyValue = (values: object) => Object.values(values).some(v => Number(v) > 0)

const shiftMonth = (year: number, month: number, delta: number) => {
  const date = new Date(year, month + delta, 1)
  return { year: date.getFullYear(), month: date.getMonth() }
}

export const useRentMonth = (year: number, month: number) => {
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [record, setRecord] = useState<RentRecord>(EMPTY_RECORD)
  const [prevRecord, setPrevRecord] = useState<PrevRecord | null>(null)
  const [prevPrevReadings, setPrevPrevReadings] = useState<MonthReadings | null>(null)
  const [tariffs, setTariffs] = useState<WaterTariffs>({ cold: 0, hot: 0, drainage: 0 })
  const [electricityTariffs, setElectricityTariffs] = useState<ElectricityTariffs>({})

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

    const prevPeriod = shiftMonth(year, month, -1)
    const prevPrevPeriod = shiftMonth(year, month, -2)

    const [currentResult, prevResult, prevPrevResult] = await Promise.all([
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
        .eq('year', prevPeriod.year)
        .eq('month', prevPeriod.month)
        .maybeSingle(),
      supabase
        .from('rent_records')
        .select('cold_water, hot_water, electricity')
        .eq('user_id', uid)
        .eq('year', prevPrevPeriod.year)
        .eq('month', prevPrevPeriod.month)
        .maybeSingle()
    ])

    const data = currentResult.data
    const prev = prevResult.data
    const prevReadings = toReadings(prev)

    setPrevRecord(prev && prevReadings ? { ...prevReadings, rent_amount: Number(prev.rent_amount) || 0 } : null)
    setPrevPrevReadings(toReadings(prevPrevResult.data))

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
        cold_water: Number(data.cold_water) || 0,
        hot_water: Number(data.hot_water) || 0,
        electricity: data.electricity || [],
        paid: data.paid || false,
        notes: data.notes || ''
      })
    } else {
      // Автокопирование счётчиков из предыдущего месяца
      const emptyMeters = (prevReadings?.electricity ?? []).map(m => ({ name: m.name, value: 0 }))
      setRecord({ ...EMPTY_RECORD, electricity: emptyMeters })
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
  const hasWaterTariffs = hasAllTariffs(tariffs)
  const hasElectricityTariffs = record.electricity.length > 0
    && record.electricity.every(m => (electricityTariffs[m.name] || 0) > 0)

  const autoAmounts: Record<AmountKey, number | null> = {
    rent: prevRecord && prevRecord.rent_amount > 0 ? prevRecord.rent_amount : null,
    water: waterBill && hasWaterTariffs ? waterBill.total : null,
    electricity: calcElectricityTotal(prevRecord?.electricity ?? null, record.electricity, electricityTariffs)
  }

  // Подпись к авторасчёту: откуда сумма или почему её нет
  const autoNotes: Record<AmountKey, string | null> = {
    rent: autoAmounts.rent !== null ? 'как в прошлом месяце' : null,
    water: autoAmounts.water !== null ? null : hasWaterTariffs ? 'нет показаний' : 'нет тарифов',
    electricity: autoAmounts.electricity !== null ? null : hasElectricityTariffs ? 'нет показаний' : 'нет тарифов'
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

  // Авторасчётные суммы сохраняем, чтобы список месяцев и итоги видели актуальные значения.
  // Будущие месяцы не трогаем: иначе простой просмотр октября завысит итог года
  useEffect(() => {
    if (loading || !userId || isFutureMonth(year, month)) return
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

  const setAmountManual = (key: AmountKey, value: number) => {
    const { amount, manual } = AMOUNT_FIELDS[key]
    setRecord(prev => ({ ...prev, [amount]: value, [manual]: true }))
    saveFields({ [amount]: value, [manual]: true })
  }

  const resetAmount = (key: AmountKey) => {
    const { manual } = AMOUNT_FIELDS[key]
    // саму сумму пересчитает и сохранит эффект синхронизации
    setRecord(prev => ({ ...prev, [manual]: false }))
    saveField(manual, false)
  }

  // id строки таблицы: 'cold' / 'hot' для воды, название счётчика для электричества
  const setReading = (id: string, value: number) => {
    if (id === 'cold' || id === 'hot') {
      const field = id === 'cold' ? 'cold_water' : 'hot_water'
      setRecord(prev => ({ ...prev, [field]: value }))
      saveField(field, value)
      return
    }
    const electricity = record.electricity.some(m => m.name === id)
      ? record.electricity.map(m => (m.name === id ? { ...m, value } : m))
      : [...record.electricity, { name: id, value }].sort((a, b) => a.name.localeCompare(b.name))
    setRecord(prev => ({ ...prev, electricity }))
    saveField('electricity', electricity)
  }

  const setWaterTariff = (key: keyof WaterTariffs, value: number) => {
    const next = { ...tariffs, [key]: value }
    setTariffs(next)
    saveFields(waterTariffFields(next))
  }

  const setElectricityTariff = (name: string, value: number) => {
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
    await saveFields({ electricity, cold_water: cold, hot_water: hot })
  }

  const saveNotes = (notes: string) => {
    if (notes === record.notes) return
    setRecord(prev => ({ ...prev, notes }))
    saveField('notes', notes)
  }

  const togglePaid = () => {
    const paid = !record.paid
    setRecord(prev => ({ ...prev, paid }))
    saveField('paid', paid)
  }

  const rows = buildReadingRows(record, prevRecord, prevPrevReadings)

  return {
    userId,
    loading,
    record,
    tariffs,
    electricityTariffs,
    hasWaterTariffs,
    autoAmounts,
    autoNotes,
    amounts,
    total: amounts.rent + amounts.water + amounts.electricity,
    rows,
    missing: findMissing(rows, hasWaterTariffs),
    message: buildRentMessage(record.electricity, waterBill, tariffs),
    setAmountManual,
    resetAmount,
    setReading,
    setWaterTariff,
    setElectricityTariff,
    applyRecognized,
    saveNotes,
    togglePaid
  }
}

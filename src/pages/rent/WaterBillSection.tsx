import { useEffect, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { parseNumber } from '../../lib/formatUtils'
import type { WaterBill, WaterTariffs } from './rentUtils'
import './WaterBillSection.css'

interface WaterBillSectionProps {
  tariffs: WaterTariffs
  bill: WaterBill | null
  message: string
  onTariffChange: (key: keyof WaterTariffs, value: number) => void
}

const TARIFF_ROWS: { key: keyof WaterTariffs; label: string }[] = [
  { key: 'cold', label: 'ХВС' },
  { key: 'hot', label: 'ГВС' },
  { key: 'drainage', label: 'Водоотведение' }
]

const toInputs = (tariffs: WaterTariffs): Record<keyof WaterTariffs, string> => ({
  cold: tariffs.cold > 0 ? String(tariffs.cold).replace('.', ',') : '',
  hot: tariffs.hot > 0 ? String(tariffs.hot).replace('.', ',') : '',
  drainage: tariffs.drainage > 0 ? String(tariffs.drainage).replace('.', ',') : ''
})

export default function WaterBillSection({ tariffs, bill, message, onTariffChange }: WaterBillSectionProps) {
  const [inputs, setInputs] = useState(() => toInputs(tariffs))
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setInputs(toInputs(tariffs))
  }, [tariffs])

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])

  const handleBlur = (key: keyof WaterTariffs) => {
    const value = parseNumber(inputs[key])
    if (value !== tariffs[key]) onTariffChange(key, value)
    else setInputs(toInputs(tariffs))
  }

  const copyMessage = async () => {
    await navigator.clipboard.writeText(message)
    setCopied(true)
  }

  return (
    <>
      <div className="content-section">
        <div className="section-header">
          <div className="section-title">Тарифы воды</div>
          {bill && <span className="total-usage">итого: {bill.total.toLocaleString('ru-RU')} ₽</span>}
        </div>
        {TARIFF_ROWS.map(({ key, label }) => (
          <div key={key} className="input-row">
            <span>{label}</span>
            <div className="inline-input">
              <input
                type="text"
                inputMode="decimal"
                value={inputs[key]}
                placeholder="0"
                onChange={e => setInputs(prev => ({ ...prev, [key]: e.target.value }))}
                onBlur={() => handleBlur(key)}
              />
              <span>₽/м³</span>
            </div>
          </div>
        ))}
      </div>

      <div className="content-section">
        <div className="section-title">Сообщение</div>
        <textarea className="water-message" value={message} readOnly rows={message.split('\n').length} />
        <button className="copy-btn" onClick={copyMessage}>
          {copied ? <Check size={18} /> : <Copy size={18} />}
          <span>{copied ? 'Скопировано' : 'Скопировать'}</span>
        </button>
      </div>
    </>
  )
}

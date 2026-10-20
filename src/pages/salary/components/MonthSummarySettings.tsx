import { useState } from 'react'
import { parseNumber } from '../../../lib/formatUtils'
import { ClearableInput } from '../../../components/ui/ClearableInput'
import type { IMonthRow } from './MonthsTable'

interface IMonthSummarySettingsProps {
  row: IMonthRow
  onSaveSettings: (patch: { bonus?: number; transport_base_cost?: number }) => Promise<boolean>
}

const formatInput = (value: number): string => (value > 0 ? Math.round(value).toLocaleString('ru-RU') : '')

export const MonthSummarySettings = ({ row, onSaveSettings }: IMonthSummarySettingsProps) => {
  const [bonusInput, setBonusInput] = useState(() => formatInput(row.bonus))
  const [transportInput, setTransportInput] = useState(() => formatInput(row.transport))
  const [error, setError] = useState('')
  const isTender = row.source === 'tender'

  const saveField = async (field: 'bonus' | 'transport_base_cost', raw: string) => {
    const value = Math.max(0, parseNumber(raw))
    const current = field === 'bonus' ? row.bonus : row.transport
    const setInput = field === 'bonus' ? setBonusInput : setTransportInput
    setInput(formatInput(value))
    if (value === current) return

    const ok = await onSaveSettings({ [field]: value })
    setError(ok ? '' : 'Не удалось сохранить')
  }

  return (
    <details className="ms-card ms-settings">
      <summary className="ms-settings-summary">Настройки месяца</summary>
      <div className="ms-settings-fields">
        <label className="sd-field">
          <span className="sd-field-label">Премия, ₽</span>
          <ClearableInput
            className="sd-input sd-input-num"
            inputMode="decimal"
            placeholder="0"
            autoComplete="off"
            value={bonusInput}
            onChange={e => setBonusInput(e.target.value)}
            onBlur={() => saveField('bonus', bonusInput)}
            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
            onClear={() => setBonusInput('')}
            clearLabel="Очистить премию"
          />
        </label>
        {!isTender && (
          <label className="sd-field">
            <span className="sd-field-label">Проезд за месяц, ₽</span>
            <ClearableInput
              className="sd-input sd-input-num"
              inputMode="decimal"
              placeholder="0"
              autoComplete="off"
              value={transportInput}
              onChange={e => setTransportInput(e.target.value)}
              onBlur={() => saveField('transport_base_cost', transportInput)}
              onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
              onClear={() => setTransportInput('')}
              clearLabel="Очистить проезд"
            />
          </label>
        )}
      </div>
      {error && <p className="ms-error" role="alert">{error}</p>}
    </details>
  )
}

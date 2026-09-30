import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { MONTHS } from '../lib/constants'
import Collapsible from './rent/Collapsible'
import OcrJobList from './rent/OcrJobList'
import PaymentsSection, { type PaymentRow } from './rent/PaymentsSection'
import ReadingsSection, { readingInputId, type ReadingsNotice } from './rent/ReadingsSection'
import RentActionBar from './rent/RentActionBar'
import RentMessageSection from './rent/RentMessageSection'
import RentTotals, { type TotalRow } from './rent/RentTotals'
import TariffsSection from './rent/TariffsSection'
import { getRentStage } from './rent/readings'
import { useMeterOcrJobs } from './rent/useMeterOcrJobs'
import { AMOUNT_FIELDS, AMOUNT_KEYS, useRentMonth } from './rent/useRentMonth'
import './RentMonthPage.css'

const PHOTO_INPUT_ID = 'meter-photo-input'
const PHOTO_HINT = 'Каждый тариф электросчётчика (T1, T2, T3) — отдельным фото, оба водомера — одним. Распознаёт домашний ПК, около 1,5 минуты на фото.'

export default function RentMonthPage() {
  const { year: yearParam, month: monthParam } = useParams()
  const navigate = useNavigate()
  const year = Number(yearParam)
  const month = Number(monthParam)

  const rent = useRentMonth(year, month)
  // Задания распознавания подключаем после загрузки месяца: результат применяется к загруженным данным
  const ocr = useMeterOcrJobs({
    userId: rent.loading ? null : rent.userId,
    year,
    month,
    onRecognized: rent.applyRecognized
  })

  const stage = getRentStage({
    paid: rent.record.paid,
    activeJobs: ocr.activeCount,
    rows: rent.rows,
    missing: rent.missing
  })

  const header = (
    <div className="month-header">
      <button className="back-btn" onClick={() => navigate(`/rent?year=${year}`)}>
        <ArrowLeft size={20} />
        <span>Назад</span>
      </button>
      <h1>{MONTHS[month]} {year}</h1>
    </div>
  )

  if (rent.loading) {
    return (
      <div className="rent-month-page">
        {header}
        <div className="loading">Загрузка...</div>
      </div>
    )
  }

  const handlePhotos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    ocr.upload(files)
  }

  const filled = rent.rows.filter(r => r.cur !== null).length
  const readingsStatus = ocr.uploading
    ? 'загрузка фото…'
    : ocr.activeCount > 0
      ? `распознаю, осталось ${ocr.activeCount}`
      : `${filled === rent.rows.length ? '✓ ' : ''}${filled} из ${rent.rows.length}`

  const notices: ReadingsNotice[] = []
  if (ocr.uploadError) notices.push({ level: 'warning', text: `Фото не загружено: ${ocr.uploadError}` })
  if (ocr.errorCount > 0) {
    notices.push({ level: 'warning', text: `Не распознано фото: ${ocr.errorCount} — добавьте ещё раз или введите вручную` })
  }
  if (ocr.stale) notices.push({ level: 'warning', text: 'Домашний ПК не отвечает — показания можно ввести вручную' })
  if (ocr.activeCount > 0) {
    notices.push({ level: 'info', text: 'Страницу можно закрыть: показания подставятся при следующем открытии' })
  }

  const errorRow = rent.rows.find(r => r.issue?.level === 'error')
  const warningRow = rent.rows.find(r => r.issue?.level === 'warning')

  const totalRows: TotalRow[] = AMOUNT_KEYS.map(key => {
    const manual = rent.record[AMOUNT_FIELDS[key].manual]
    return {
      key,
      label: AMOUNT_FIELDS[key].label,
      amount: rent.amounts[key],
      note: manual ? null : rent.autoNotes[key],
      manual,
      hasValue: manual || rent.autoAmounts[key] !== null
    }
  })

  const paymentRows: PaymentRow[] = totalRows.map(row => ({
    key: row.key,
    label: row.label,
    amount: row.amount,
    manual: row.manual,
    hasAuto: rent.autoAmounts[row.key] !== null
  }))

  const messageReady = stage === 'ready' || stage === 'paid'

  return (
    <div className="rent-month-page">
      {header}
      <input id={PHOTO_INPUT_ID} type="file" accept="image/*" multiple hidden onChange={handlePhotos} />

      <div className="month-content">
        <ReadingsSection
          rows={rent.rows}
          status={readingsStatus}
          hint={stage === 'photos' ? PHOTO_HINT : null}
          notices={notices}
          onChange={rent.setReading}
        >
          {ocr.jobs.length > 0 && <OcrJobList jobs={ocr.jobs} onRemove={ocr.removeJob} />}
        </ReadingsSection>

        <RentTotals rows={totalRows} total={rent.total} onReset={rent.resetAmount} />

        <Collapsible title="Текст сообщения" note={messageReady ? 'готов' : 'не хватает данных'}>
          <RentMessageSection message={rent.message} />
        </Collapsible>

        <Collapsible
          title="Тарифы"
          note={rent.hasWaterTariffs ? undefined : 'нужно заполнить'}
          defaultOpen={!rent.hasWaterTariffs && stage !== 'photos'}
        >
          <TariffsSection
            water={rent.tariffs}
            electricity={rent.electricityTariffs}
            meterNames={rent.rows.filter(r => r.kind === 'electricity').map(r => r.id)}
            onWaterChange={rent.setWaterTariff}
            onElectricityChange={rent.setElectricityTariff}
          />
        </Collapsible>

        <Collapsible title="Суммы вручную" note={totalRows.some(r => r.manual) ? 'есть ручные' : undefined}>
          <PaymentsSection rows={paymentRows} onManualChange={rent.setAmountManual} onReset={rent.resetAmount} />
        </Collapsible>

        <Collapsible title="Заметка" note={rent.record.notes.split('\n')[0] || undefined}>
          <textarea
            defaultValue={rent.record.notes}
            placeholder="Комментарии..."
            onBlur={e => rent.saveNotes(e.target.value)}
          />
        </Collapsible>

        <RentActionBar
          stage={stage}
          photoInputId={PHOTO_INPUT_ID}
          uploading={ocr.uploading}
          activeJobs={ocr.activeCount}
          etaSeconds={ocr.etaSeconds}
          missing={rent.missing}
          error={errorRow?.issue ? { text: errorRow.issue.text, inputId: readingInputId(errorRow.id) } : null}
          warning={warningRow?.issue?.text ?? null}
          total={rent.total}
          message={rent.message}
          onTogglePaid={rent.togglePaid}
        />
      </div>
    </div>
  )
}

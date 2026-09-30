import { useState } from 'react'
import type { ReactNode } from 'react'
import { BarChart3, Car, ChevronDown, Info, ListOrdered, Plus } from 'lucide-react'
import { Toast } from '../../components/ui/Toast'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { useToast } from '../../hooks/useToast'
import { calcAge } from '../../lib/dateUtils'
import { CarSheets } from './components/sheets/CarSheets'
import type { SheetState } from './components/sheets/CarSheets'
import { DataTab } from './components/data/DataTab'
import { JournalTab } from './components/journal/JournalTab'
import { CarCover } from './components/overview/CarCover'
import { OverviewTab } from './components/overview/OverviewTab'
import { EMPTY_JOURNAL_FILTER, UNDO_DURATION_MS } from './constants'
import { useCarPhoto } from './hooks/useCarPhoto'
import { useCarRecords } from './hooks/useCarRecords'
import { useCarStats } from './hooks/useCarStats'
import { useCars } from './hooks/useCars'
import { useJournalEntries } from './hooks/useJournalEntries'
import type {
  CarRecord, CarTab, CarType, JournalFilter, PartType, PeriodPreset, PhotoFrame, RecordKind, RecordPayload
} from './types'
import { consumptionForFill } from './utils/consumption'
import { formatL100 } from './utils/format'
import './styles/car.css'
import './styles/overview.css'
import './styles/journal.css'
import './styles/forms.css'
import './styles/data.css'

const TAB_OPTIONS: { value: CarTab; label: string; icon: ReactNode }[] = [
  { value: 'overview', label: 'Обзор', icon: <BarChart3 size={18} /> },
  { value: 'journal', label: 'Журнал', icon: <ListOrdered size={18} /> },
  { value: 'data', label: 'Данные', icon: <Info size={18} /> }
]

export default function CarPage() {
  const { cars, selectedCar: car, selectCar, loading, loadCars, saveCar, deleteCar } = useCars()
  const records = useCarRecords(car, loadCars)
  const { entries, intervals } = useJournalEntries(records.maintenance, records.fuel, records.expenses)
  const photo = useCarPhoto(car?.id ?? null)

  const [tab, setTab] = useState<CarTab>('overview')
  const [period, setPeriod] = useState<PeriodPreset>('6m')
  const [filter, setFilter] = useState<JournalFilter>(EMPTY_JOURNAL_FILTER)
  const [sheet, setSheet] = useState<SheetState>(null)
  const [saving, setSaving] = useState(false)
  const { toast, showToast, hideToast } = useToast()

  const stats = useCarStats({
    car, entries, maintenance: records.maintenance, fuel: records.fuel, intervals, period
  })

  const failToast = (message = 'Не удалось сохранить') => showToast({ message, tone: 'error' })

  // Сохранение с блокировкой кнопки: двойной тап не создаст дубль
  const runSaving = async (action: () => Promise<boolean>): Promise<boolean> => {
    setSaving(true)
    const ok = await action()
    setSaving(false)
    return ok
  }

  const openAdd = (kind?: RecordKind) => setSheet(kind ? { type: 'record', kind, record: null } : { type: 'add' })

  const openJournal = (next: Pick<JournalFilter, 'range' | 'group'>) => {
    setFilter({ ...EMPTY_JOURNAL_FILTER, ...next })
    setTab('journal')
    window.scrollTo({ top: 0 })
  }

  const handleSaveRecord = async (payload: RecordPayload, editingId?: string) => {
    const l100 = payload.kind === 'fuel'
      ? consumptionForFill(records.fuel, payload.data.mileage, payload.data.liters, editingId)
      : null
    const ok = await runSaving(() => records.saveRecord(payload, editingId))
    if (!ok) return failToast()
    setSheet(null)
    showToast({ message: l100 ? `Сохранено · расход ${formatL100(l100)}` : 'Сохранено' })
  }

  // Удаление сразу, «Вернуть» вставляет ту же строку обратно
  const handleDeleteRecord = async (record: CarRecord) => {
    setSheet(null)
    const ok = await records.deleteRecord(record)
    if (!ok) return failToast('Не удалось удалить')
    showToast({
      message: 'Запись удалена',
      actionLabel: 'Вернуть',
      duration: UNDO_DURATION_MS,
      onAction: () => {
        void records.restoreRecord(record).then(restored => { if (!restored) failToast('Не удалось вернуть') })
      }
    })
  }

  const handleSaveCar = async (data: Partial<CarType>, editingId?: string) => {
    const ok = await runSaving(() => saveCar(data, editingId))
    if (!ok) return failToast()
    setSheet(null)
  }

  const handleDeleteCar = async (target: CarType) => {
    const ok = await runSaving(() => deleteCar(target.id))
    if (!ok) return failToast('Не удалось удалить авто')
    setSheet(null)
    setTab('overview')
    showToast({ message: `${target.brand} ${target.model} удалена` })
  }

  const handleUploadPhoto = async (file: File) => {
    const ok = await photo.savePhoto(file)
    if (!ok) return failToast('Не удалось загрузить фото')
    showToast({ message: 'Фото обновлено' })
  }

  const handleSaveFrame = async (frame: PhotoFrame): Promise<boolean> => {
    const ok = await photo.saveFrame(frame)
    if (ok) showToast({ message: 'Кадр сохранён' })
    else failToast('Не удалось сохранить кадр')
    return ok
  }

  const handleRemovePhoto = async () => {
    const ok = await photo.removePhoto()
    if (!ok) return failToast('Не удалось удалить фото')
    showToast({ message: 'Фото удалено' })
  }

  const handleSavePart = async (data: Omit<PartType, 'id' | 'car_id'>, editingId?: string) => {
    const ok = await runSaving(() => records.savePart(data, editingId))
    if (!ok) return failToast()
    setSheet(null)
  }

  const handleDeletePart = async (part: PartType) => {
    const ok = await records.deletePart(part)
    if (!ok) return failToast('Не удалось удалить')
    showToast({
      message: `${part.name} удалена`,
      actionLabel: 'Вернуть',
      duration: UNDO_DURATION_MS,
      onAction: () => { void records.restorePart(part) }
    })
  }

  const handleImportParts = async (rows: Omit<PartType, 'id' | 'car_id'>[]) => {
    if (rows.length === 0) return failToast('В файле нет строк: категория, название, артикул')
    const ok = await records.importParts(rows)
    if (!ok) return failToast('Не удалось импортировать')
    showToast({ message: `Импортировано: ${rows.length}` })
  }

  return (
    <div className="car-page">
      <header className="car-header">
        <div className="car-header-top">
          <div className="car-title">
            <h1>Машина</h1>
            {car && (
              <button type="button" className="car-switch" onClick={() => setSheet({ type: 'cars' })} aria-haspopup="dialog">
                <Car size={18} aria-hidden="true" />
                <span className="car-switch-name">{car.brand} {car.model}</span>
                <span className="car-switch-age">{calcAge(car.manufacture_year, car.manufacture_month)}</span>
                <ChevronDown size={16} aria-hidden="true" />
              </button>
            )}
          </div>
          {car && (
            <button type="button" className="car-btn primary car-add-desktop" onClick={() => openAdd()}>
              <Plus size={18} />
              <span>Запись</span>
            </button>
          )}
        </div>
        {car && <SegmentedControl options={TAB_OPTIONS} value={tab} onChange={setTab} ariaLabel="Разделы" stretch />}
      </header>

      {loading ? (
        <div className="car-skeleton" aria-busy="true" />
      ) : !car ? (
        <div className="car-empty">
          <Car size={48} strokeWidth={1} />
          <p>Добавьте автомобиль — и ведите заправки, ТО и расходы в одном месте</p>
          <button type="button" className="car-btn primary" onClick={() => setSheet({ type: 'car', car: null })}>
            Добавить автомобиль
          </button>
        </div>
      ) : (
        <section key={tab} className="car-panel">
          {tab === 'overview' && (
            <>
              <CarCover
                car={car}
                photo={photo.photo}
                loading={photo.loading}
                uploading={photo.uploading}
                onUpload={file => void handleUploadPhoto(file)}
                onSaveFrame={handleSaveFrame}
              />
              {records.loading || !stats ? (
                <div className="car-skeleton" aria-busy="true" />
              ) : (
                <OverviewTab
                  stats={stats}
                  entries={entries}
                  period={period}
                  onPeriodChange={setPeriod}
                  onOpenJournal={openJournal}
                  onAdd={openAdd}
                />
              )}
            </>
          )}
          {tab === 'journal' && (
            <JournalTab
              entries={entries}
              intervals={intervals}
              loading={records.loading}
              filter={filter}
              onFilterChange={setFilter}
              onOpen={entry => setSheet({ type: 'record', kind: entry.kind, record: entry.record })}
              onAdd={() => openAdd()}
            />
          )}
          {tab === 'data' && (
            <DataTab
              car={car}
              entries={entries}
              parts={records.parts}
              photo={photo.photo}
              photoUploading={photo.uploading}
              onUploadPhoto={file => void handleUploadPhoto(file)}
              onRemovePhoto={() => void handleRemovePhoto()}
              onEditCar={() => setSheet({ type: 'car', car })}
              onDeleteCar={() => setSheet({ type: 'delete-car', car })}
              onAddPart={() => setSheet({ type: 'part', part: null })}
              onEditPart={part => setSheet({ type: 'part', part })}
              onDeletePart={part => void handleDeletePart(part)}
              onImportParts={rows => void handleImportParts(rows)}
            />
          )}
        </section>
      )}

      {car && (
        <button type="button" className="car-fab" onClick={() => openAdd()} aria-label="Добавить запись">
          <Plus size={26} />
        </button>
      )}

      <CarSheets
        sheet={sheet}
        saving={saving}
        cars={cars}
        car={car}
        fuel={records.fuel}
        expenses={records.expenses}
        onChange={setSheet}
        onSelectCar={selectCar}
        onSaveRecord={(payload, editingId) => void handleSaveRecord(payload, editingId)}
        onDeleteRecord={record => void handleDeleteRecord(record)}
        onSaveCar={(data, editingId) => void handleSaveCar(data, editingId)}
        onDeleteCar={target => void handleDeleteCar(target)}
        onSavePart={(data, editingId) => void handleSavePart(data, editingId)}
      />

      <Toast toast={toast} onClose={hideToast} />
    </div>
  )
}

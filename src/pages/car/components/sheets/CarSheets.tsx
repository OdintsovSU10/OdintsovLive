import type { CarRecord, CarType, ExpenseType, FuelType, PartType, RecordKind, RecordPayload } from '../../types'
import { CarForm } from '../forms/CarForm'
import { FormSheet } from '../forms/FormSheet'
import { PartForm } from '../forms/PartForm'
import { RecordSheet } from '../forms/RecordSheet'
import { AddMenuSheet } from './AddMenuSheet'
import { CarListSheet } from './CarListSheet'
import { ConfirmSheet } from './ConfirmSheet'

export type SheetState =
  | { type: 'add' }
  | { type: 'record'; kind: RecordKind; record: CarRecord | null }
  | { type: 'cars' }
  | { type: 'car'; car: CarType | null }
  | { type: 'delete-car'; car: CarType }
  | { type: 'part'; part: PartType | null }
  | null

interface Props {
  sheet: SheetState
  saving: boolean
  cars: CarType[]
  car: CarType | null
  fuel: FuelType[]
  expenses: ExpenseType[]
  onChange: (sheet: SheetState) => void
  onSelectCar: (id: string) => void
  onSaveRecord: (payload: RecordPayload, editingId?: string) => void
  onDeleteRecord: (record: CarRecord) => void
  onSaveCar: (data: Partial<CarType>, editingId?: string) => void
  onDeleteCar: (car: CarType) => void
  onSavePart: (data: Omit<PartType, 'id' | 'car_id'>, editingId?: string) => void
}

// Один лист за раз: какой — решает состояние страницы
export function CarSheets({
  sheet, saving, cars, car, fuel, expenses, onChange, onSelectCar,
  onSaveRecord, onDeleteRecord, onSaveCar, onDeleteCar, onSavePart
}: Props) {
  if (!sheet) return null
  const close = () => onChange(null)

  switch (sheet.type) {
    case 'add':
      return <AddMenuSheet onPick={kind => onChange({ type: 'record', kind, record: null })} onClose={close} />

    case 'record':
      return car ? (
        <RecordSheet
          key={sheet.record?.row.id ?? sheet.kind}
          kind={sheet.kind}
          record={sheet.record}
          car={car}
          fuel={fuel}
          expenses={expenses}
          saving={saving}
          onSubmit={onSaveRecord}
          onDelete={onDeleteRecord}
          onClose={close}
        />
      ) : null

    case 'cars':
      return (
        <CarListSheet
          cars={cars}
          selectedId={car?.id ?? null}
          onSelect={id => { onSelectCar(id); close() }}
          onAdd={() => onChange({ type: 'car', car: null })}
          onClose={close}
        />
      )

    case 'car':
      return (
        <FormSheet
          title={sheet.car ? 'Изменить авто' : 'Новое авто'}
          formId="car-form"
          submitLabel={sheet.car ? 'Сохранить' : 'Добавить'}
          saving={saving}
          onClose={close}
        >
          <CarForm formId="car-form" editing={sheet.car} onSubmit={data => onSaveCar(data, sheet.car?.id)} />
        </FormSheet>
      )

    case 'delete-car':
      return (
        <ConfirmSheet
          title={`Удалить ${sheet.car.brand} ${sheet.car.model}?`}
          text="Удалятся все заправки, ТО, расходы и запчасти этого авто. Отменить будет нельзя."
          confirmLabel="Удалить авто"
          busy={saving}
          onConfirm={() => onDeleteCar(sheet.car)}
          onClose={close}
        />
      )

    case 'part':
      return (
        <FormSheet
          title={sheet.part ? 'Изменить запчасть' : 'Новая запчасть'}
          formId="part-form"
          submitLabel={sheet.part ? 'Сохранить' : 'Добавить'}
          saving={saving}
          onClose={close}
        >
          <PartForm formId="part-form" editing={sheet.part} onSubmit={data => onSavePart(data, sheet.part?.id)} />
        </FormSheet>
      )
  }
}

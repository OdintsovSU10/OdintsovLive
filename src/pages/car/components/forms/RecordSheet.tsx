import { KIND_META } from '../../constants'
import type { CarRecord, CarType, ExpenseType, FuelType, RecordKind, RecordPayload } from '../../types'
import { formatDayShort } from '../../utils/dates'
import { ExpenseForm } from './ExpenseForm'
import { FormSheet } from './FormSheet'
import { FuelForm } from './FuelForm'
import { MaintenanceForm } from './MaintenanceForm'

const FORM_ID = 'car-record-form'

const NEW_TITLES: Record<RecordKind, string> = {
  fuel: 'Заправка',
  maintenance: 'ТО и ремонт',
  expense: 'Расход'
}

interface Props {
  kind: RecordKind
  record: CarRecord | null
  car: CarType
  fuel: FuelType[]
  expenses: ExpenseType[]
  saving: boolean
  onSubmit: (payload: RecordPayload, editingId?: string) => void
  onDelete: (record: CarRecord) => void
  onClose: () => void
}

export function RecordSheet({ kind, record, car, fuel, expenses, saving, onSubmit, onDelete, onClose }: Props) {
  const title = record
    ? `${KIND_META[kind].label} · ${formatDayShort(record.row.date, true)}`
    : NEW_TITLES[kind]
  const submit = (payload: RecordPayload) => onSubmit(payload, record?.row.id)

  return (
    <FormSheet
      title={title}
      formId={FORM_ID}
      submitLabel={record ? 'Сохранить' : 'Добавить'}
      saving={saving}
      onClose={onClose}
      onDelete={record ? () => onDelete(record) : undefined}
    >
      {kind === 'fuel' && (
        <FuelForm
          formId={FORM_ID}
          editing={record?.kind === 'fuel' ? record.row : null}
          fuel={fuel}
          currentMileage={car.current_mileage}
          onSubmit={submit}
        />
      )}
      {kind === 'maintenance' && (
        <MaintenanceForm
          formId={FORM_ID}
          editing={record?.kind === 'maintenance' ? record.row : null}
          currentMileage={car.current_mileage}
          onSubmit={submit}
        />
      )}
      {kind === 'expense' && (
        <ExpenseForm
          formId={FORM_ID}
          editing={record?.kind === 'expense' ? record.row : null}
          expenses={expenses}
          onSubmit={submit}
        />
      )}
    </FormSheet>
  )
}

import type { CarPhoto, CarType, JournalEntry, PartType, ServiceUnitType } from '../../types'
import type { UnitCounter } from '../../utils/serviceDue'
import { CarCard } from './CarCard'
import { PartsCatalog } from './PartsCatalog'
import { UnitCounters } from './UnitCounters'

interface Props {
  car: CarType
  entries: JournalEntry[]
  parts: PartType[]
  unitCounters: UnitCounter[]
  photo: CarPhoto | null
  photoUploading: boolean
  onUploadPhoto: (file: File) => void
  onRemovePhoto: () => void
  onEditCar: () => void
  onDeleteCar: () => void
  onAddPart: () => void
  onEditPart: (part: PartType) => void
  onDeletePart: (part: PartType) => void
  onImportParts: (rows: Omit<PartType, 'id' | 'car_id'>[]) => void
  onAddUnit: () => void
  onEditUnit: (unit: ServiceUnitType) => void
  onDeleteUnit: (unit: ServiceUnitType) => void
}

export function DataTab({
  car, entries, parts, unitCounters, photo, photoUploading, onUploadPhoto, onRemovePhoto, onEditCar, onDeleteCar,
  onAddPart, onEditPart, onDeletePart, onImportParts, onAddUnit, onEditUnit, onDeleteUnit
}: Props) {
  const spentTotal = entries.reduce((acc, entry) => acc + entry.amount, 0)

  return (
    <div className="car-data">
      <div className="car-data-main">
        <CarCard
          car={car}
          spentTotal={spentTotal}
          photo={photo}
          photoUploading={photoUploading}
          onUploadPhoto={onUploadPhoto}
          onRemovePhoto={onRemovePhoto}
          onEdit={onEditCar}
          onDelete={onDeleteCar}
        />
        <UnitCounters counters={unitCounters} onAdd={onAddUnit} onEdit={onEditUnit} onDelete={onDeleteUnit} />
      </div>
      <PartsCatalog parts={parts} onAdd={onAddPart} onEdit={onEditPart} onDelete={onDeletePart} onImport={onImportParts} />
    </div>
  )
}

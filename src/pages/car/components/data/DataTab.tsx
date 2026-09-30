import type { CarPhoto, CarType, JournalEntry, PartType } from '../../types'
import { CarCard } from './CarCard'
import { PartsCatalog } from './PartsCatalog'

interface Props {
  car: CarType
  entries: JournalEntry[]
  parts: PartType[]
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
}

export function DataTab({
  car, entries, parts, photo, photoUploading, onUploadPhoto, onRemovePhoto, onEditCar, onDeleteCar, onAddPart, onEditPart, onDeletePart, onImportParts
}: Props) {
  const spentTotal = entries.reduce((acc, entry) => acc + entry.amount, 0)

  return (
    <div className="car-data">
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
      <PartsCatalog parts={parts} onAdd={onAddPart} onEdit={onEditPart} onDelete={onDeletePart} onImport={onImportParts} />
    </div>
  )
}

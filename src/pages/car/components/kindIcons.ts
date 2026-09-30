import { Fuel, Receipt, Wrench } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { RecordKind } from '../types'

export const KIND_ICONS: Record<RecordKind, LucideIcon> = {
  maintenance: Wrench,
  fuel: Fuel,
  expense: Receipt
}

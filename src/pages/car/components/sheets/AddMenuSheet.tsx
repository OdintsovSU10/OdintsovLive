import type { CSSProperties } from 'react'
import { BottomSheet } from '../../../../components/ui/BottomSheet'
import { KIND_META, RECORD_KINDS } from '../../constants'
import type { RecordKind } from '../../types'
import { KIND_ICONS } from '../kindIcons'

const DESCRIPTIONS: Record<RecordKind, { title: string; hint: string }> = {
  fuel: { title: 'Заправка', hint: 'литры, цена, пробег' },
  maintenance: { title: 'ТО и ремонт', hint: 'работы, стоимость, пробег' },
  expense: { title: 'Расход', hint: 'мойка, страховка, штраф…' }
}

interface Props {
  onPick: (kind: RecordKind) => void
  onClose: () => void
}

export function AddMenuSheet({ onPick, onClose }: Props) {
  return (
    <BottomSheet title="Новая запись" onClose={onClose}>
      <ul className="car-menu-list">
        {RECORD_KINDS.map(kind => {
          const Icon = KIND_ICONS[kind]
          return (
            <li key={kind}>
              <button
                type="button"
                className="car-menu-item"
                style={{ '--kind-color': KIND_META[kind].color } as CSSProperties}
                onClick={() => onPick(kind)}
              >
                <span className="car-row-icon" aria-hidden="true"><Icon size={20} /></span>
                <span className="car-menu-text">
                  <strong>{DESCRIPTIONS[kind].title}</strong>
                  <span className="car-muted">{DESCRIPTIONS[kind].hint}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </BottomSheet>
  )
}

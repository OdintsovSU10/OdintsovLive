import { Quote } from 'lucide-react'

interface Props {
  x: number
  y: number
  onApplyQuote: () => void
}

export default function SelectionMenu({ x, y, onApplyQuote }: Props) {
  return (
    <div
      className="selection-menu"
      style={{ left: x, top: y, transform: 'translate(-50%, -100%)' }}
      onMouseDown={e => e.preventDefault()}
    >
      <button onClick={onApplyQuote} title="Цитата">
        <Quote size={16} />
        <span>Цитата</span>
      </button>
    </div>
  )
}

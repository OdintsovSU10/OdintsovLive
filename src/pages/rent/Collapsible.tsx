import type { ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import './Collapsible.css'

interface CollapsibleProps {
  title: string
  note?: string
  defaultOpen?: boolean
  children: ReactNode
}

// Свёрнутый блок для редких действий: тарифы, ручные суммы, текст сообщения, заметка
export default function Collapsible({ title, note, defaultOpen = false, children }: CollapsibleProps) {
  return (
    <details className="content-section collapsible" open={defaultOpen}>
      <summary>
        <span className="collapsible-title">{title}</span>
        {note && <span className="collapsible-note">{note}</span>}
        <ChevronDown size={18} className="collapsible-chevron" />
      </summary>
      <div className="collapsible-body">{children}</div>
    </details>
  )
}

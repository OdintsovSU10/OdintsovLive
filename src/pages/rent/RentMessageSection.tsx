import { useEffect, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import './RentMessageSection.css'

interface RentMessageSectionProps {
  message: string
}

export default function RentMessageSection({ message }: RentMessageSectionProps) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])

  const copyMessage = async () => {
    await navigator.clipboard.writeText(message)
    setCopied(true)
  }

  return (
    <>
      <pre className="rent-message">{message}</pre>
      <button className="copy-btn" onClick={copyMessage}>
        {copied ? <Check size={18} /> : <Copy size={18} />}
        <span>{copied ? 'Скопировано' : 'Скопировать'}</span>
      </button>
    </>
  )
}

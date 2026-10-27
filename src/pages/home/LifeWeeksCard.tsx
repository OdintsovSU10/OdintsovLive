import { useState } from 'react'
import { Hourglass } from 'lucide-react'
import { BottomSheet } from '../../components/ui/BottomSheet'
import { gradientCss } from './lifeWeeks'
import { LifeWeeksGrid } from './LifeWeeksGrid'
import { LifeWeeksInfo } from './LifeWeeksInfo'
import { useLifeWeeks } from './useLifeWeeks'
import './LifeWeeks.css'

const GRADIENT = gradientCss()

// Компактная карточка «Жизнь в неделях»; тап открывает лист с полной сеткой. Не админу (или без даты рождения) — не показывается
export const LifeWeeksCard = () => {
  const model = useLifeWeeks()
  const [open, setOpen] = useState(false)

  if (!model) return null

  const { stats } = model
  const share = Math.min(1, stats.weeksLived / stats.total) * 100

  return (
    <>
      <button
        type="button"
        className="home-card life-card"
        onClick={() => setOpen(true)}
        aria-label={`Жизнь в неделях: прожито ${stats.percent}%. Открыть сетку`}
      >
        <div className="home-card-head">
          <span className="home-card-icon"><Hourglass size={18} strokeWidth={1.5} /></span>
          <span className="home-card-title">Жизнь в неделях</span>
          <span className="home-card-aside">{stats.percent}%</span>
        </div>
        <div className="life-bar" aria-hidden="true">
          <div className="life-bar-track" style={{ backgroundImage: GRADIENT }} />
          <div className="life-bar-lived" style={{ backgroundImage: GRADIENT, clipPath: `inset(0 ${100 - share}% 0 0)` }} />
          <div className="life-bar-marker" style={{ left: `${share}%` }} />
        </div>
        <LifeWeeksInfo model={model} />
      </button>
      {open && (
        <BottomSheet title="Жизнь в неделях" onClose={() => setOpen(false)} variant="modal">
          <LifeWeeksGrid model={model} />
          <LifeWeeksInfo model={model} />
        </BottomSheet>
      )}
    </>
  )
}

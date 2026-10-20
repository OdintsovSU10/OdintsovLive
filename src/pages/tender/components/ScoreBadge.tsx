import { AlertTriangle, Coffee, Scale, TrendingUp, type LucideIcon } from 'lucide-react'
import { SCORE_SIGNAL_LABELS, type ScoreSignalKey } from '../utils/employeeScore'
import type { IListScore } from '../hooks/useEmployeeScores'
import './ScoreBadge.css'

interface Props {
  score: IListScore | undefined
  loading: boolean
  // Иконки сигналов справа от плашки
  showSignals?: boolean
}

const SIGNAL_ICONS: Record<ScoreSignalKey, LucideIcon> = {
  promotion: TrendingUp,
  attention: AlertTriangle,
  overpaid: Scale,
  breaks: Coffee
}

const SIGNAL_ICON_SIZE = 14

export const formatScoreTitle = (score: IListScore): string => {
  if (score.total === null) return 'Оценка: мало данных'
  const parts = [`Оценка ${score.total}`]
  if (score.grade) parts.push(score.grade.label)
  if (score.rank !== null) parts.push(`${score.rank}-е из ${score.rankOf} в отделе`)
  return parts.join(' · ')
}

export const ScoreBadge = ({ score, loading, showSignals = true }: Props) => {
  if (loading) {
    return <span className="score-badge-wrap"><span className="score-badge is-loading" aria-hidden="true" /></span>
  }

  const total = score?.total ?? null
  const tone = score?.grade ? `tone-${score.grade.key}` : 'is-empty'
  const title = score ? formatScoreTitle(score) : 'Оценка: мало данных'

  return (
    <span className="score-badge-wrap">
      <span className={`score-badge ${tone}`} title={title} aria-label={title}>
        {total ?? '—'}
      </span>
      {showSignals && score?.signals.map(signal => {
        const Icon = SIGNAL_ICONS[signal]
        const label = SCORE_SIGNAL_LABELS[signal]
        return (
          <span key={signal} className={`score-signal signal-${signal}`} title={label} aria-label={label} role="img">
            <Icon size={SIGNAL_ICON_SIZE} strokeWidth={1.75} />
          </span>
        )
      })}
    </span>
  )
}

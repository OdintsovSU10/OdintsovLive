import { AlertTriangle, Coffee, Scale, TrendingUp, type LucideIcon } from 'lucide-react'
import type { ScoreSignalKey } from '../../utils/employeeScore'

// Иконки сигналов оценки (как в плашке ScoreBadge в списках)
export const SIGNAL_ICONS: Record<ScoreSignalKey, LucideIcon> = {
  promotion: TrendingUp,
  attention: AlertTriangle,
  overpaid: Scale,
  breaks: Coffee
}

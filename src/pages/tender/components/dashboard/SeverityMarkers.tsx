import type { FC } from 'react'
import type { Tone } from './dashboardMetrics'

const SEVERITY_LABELS: Record<Tone, string> = {
  ok: 'Хорошо',
  warn: 'Есть замечания',
  bad: 'Есть критичные замечания'
}

interface ISeverityDotProps {
  severity: Tone | null
}

// Цветной маркер тяжести: без замечаний — нейтральная точка
export const SeverityDot: FC<ISeverityDotProps> = ({ severity }) => (
  severity
    ? <span className={`sev-dot is-${severity}`} role="img" aria-label={SEVERITY_LABELS[severity]} title={SEVERITY_LABELS[severity]} />
    : <span className="sev-dot" aria-hidden="true" />
)

interface IAttentionBadgeProps {
  count: number
  severity: Tone | null
}

// Бейдж числа пунктов внимания подразделения
export const AttentionBadge: FC<IAttentionBadgeProps> = ({ count, severity }) => (
  count > 0
    ? (
      <span className={`sub-badge${severity ? ` is-${severity}` : ''}`} title="Пунктов внимания" aria-label={`Пунктов внимания: ${count}`}>
        {count}
      </span>
    )
    : null
)

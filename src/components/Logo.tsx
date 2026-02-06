interface LogoProps {
  size?: number
  showText?: boolean
}

export default function Logo({ size = 80, showText = true }: LogoProps) {
  return (
    <div className="logo" style={{ display: 'flex', alignItems: 'center', gap: 16, width: '100%' }}>
      <svg width={size} height={size} viewBox="0 0 80 80" fill="none" style={{ flexShrink: 0 }}>
        <circle cx="40" cy="40" r="38" stroke="var(--primary)" strokeWidth="2" fill="none" />
        <path
          d="M28 24V56H52"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <circle cx="52" cy="56" r="4" fill="var(--primary)" />
      </svg>
      {showText && (
        <div className="logo-text" style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          <span style={{
            fontFamily: 'var(--font-headline)',
            fontSize: '1.75rem',
            fontWeight: 600,
            letterSpacing: '-0.02em',
            lineHeight: 1
          }}>
            Odintsov
          </span>
          <span style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.875rem',
            fontWeight: 400,
            letterSpacing: '0.3em',
            textTransform: 'uppercase' as const,
            color: 'var(--primary)',
            marginTop: 4
          }}>
            Live
          </span>
        </div>
      )}
    </div>
  )
}

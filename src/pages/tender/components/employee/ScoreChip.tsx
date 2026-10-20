import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { BottomSheet } from '../../../../components/ui/BottomSheet'
import {
  getScoreSignals,
  SCORE_SIGNAL_LABELS,
  type EmployeeScoreView
} from '../../utils/employeeScore'
import { ScoreBreakdown } from './ScoreBreakdown'
import { ScoreRing } from './ScoreRing'
import { SIGNAL_ICONS } from './scoreSignalIcons'

// Ниже этой ширины страницы подсказка открывается шторкой, а не выпадающей панелью
const COMPACT_MAX_WIDTH = 620
const POPOVER_WIDTH = 360
const POPOVER_MARGIN = 8
const ARROW_SIZE = 12
const ARROW_MIN_OFFSET = 12
const HOVER_CLOSE_MS = 150
const FINE_POINTER_QUERY = '(pointer: fine)'
const SIGNAL_ICON_SIZE = 12
const ERROR_LABEL_PREFIX = 'Оценка недоступна'

interface Props {
  view: EmployeeScoreView | null
  loading: boolean
  error: string | null
  noRaiseMonths: number
  onRetry: () => void
  onShowMonthly: () => void
}

interface PopoverPosition {
  width: number
  // Сдвиг панели относительно правого края чипа (px, вправо положительный)
  shift: number
  // Отступ стрелки от правого края панели
  arrowRight: number
}

// Чип оценки в шапке сотрудника: число и грейд, по клику/наведению — «Как складывается оценка»
export function ScoreChip({ view, loading, error, noRaiseMonths, onRetry, onShowMonthly }: Props) {
  const popoverId = useId()
  const wrapRef = useRef<HTMLDivElement>(null)
  const chipRef = useRef<HTMLButtonElement>(null)
  const hoverTimerRef = useRef<number | null>(null)
  // Панель закреплена кликом: уход курсора её не закрывает
  const pinnedRef = useRef(false)
  const [open, setOpen] = useState(false)
  const [compact, setCompact] = useState(false)
  const [position, setPosition] = useState<PopoverPosition | null>(null)

  const score = view?.current ?? null
  const showChip = !loading && (error !== null || score !== null)

  const clearHoverTimer = useCallback(() => {
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current)
      hoverTimerRef.current = null
    }
  }, [])

  const close = useCallback(() => {
    clearHoverTimer()
    pinnedRef.current = false
    setOpen(false)
  }, [clearHoverTimer])

  const measure = useCallback(() => {
    const wrap = wrapRef.current
    const main = wrap?.closest('.emp-main')
    if (!wrap || !main) return
    const chip = wrap.getBoundingClientRect()
    const area = main.getBoundingClientRect()
    setCompact(area.width < COMPACT_MAX_WIDTH)

    // Правый край панели — по правому краю чипа, но внутри .emp-main
    const width = Math.min(POPOVER_WIDTH, area.width - POPOVER_MARGIN * 2)
    const minRight = area.left + POPOVER_MARGIN + width
    const maxRight = area.right - POPOVER_MARGIN
    const right = Math.min(Math.max(chip.right, minRight), Math.max(minRight, maxRight))
    const shift = right - chip.right
    const arrowRight = Math.max(ARROW_MIN_OFFSET, chip.width / 2 + shift - ARROW_SIZE / 2)
    setPosition(prev => (
      prev && prev.width === width && prev.shift === shift && prev.arrowRight === arrowRight
        ? prev
        : { width, shift, arrowRight }
    ))
  }, [])

  // Ширина страницы и положение чипа: пересчитываем при изменении размеров
  useLayoutEffect(() => {
    measure()
    const main = wrapRef.current?.closest('.emp-main')
    if (!main) return undefined
    const observer = new ResizeObserver(measure)
    observer.observe(main)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [measure, showChip])

  useLayoutEffect(() => {
    if (open) measure()
  }, [open, measure])

  useEffect(() => clearHoverTimer, [clearHoverTimer])

  // Панель: Esc возвращает фокус на чип, клик вне панели закрывает
  useEffect(() => {
    if (!open || compact) return undefined

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      close()
      chipRef.current?.focus()
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (wrapRef.current && event.target instanceof Node && !wrapRef.current.contains(event.target)) close()
    }
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('pointerdown', handlePointerDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [open, compact, close])

  const handleClick = () => {
    clearHoverTimer()
    if (!open) {
      pinnedRef.current = true
      setOpen(true)
    } else if (!pinnedRef.current && !compact) {
      // Открыта наведением: клик закрепляет, следующий — закрывает
      pinnedRef.current = true
    } else {
      close()
    }
  }

  const handleMouseEnter = () => {
    if (compact || !showChip || !window.matchMedia(FINE_POINTER_QUERY).matches) return
    clearHoverTimer()
    setOpen(true)
  }

  const handleMouseLeave = () => {
    if (!open || pinnedRef.current) return
    clearHoverTimer()
    hoverTimerRef.current = window.setTimeout(close, HOVER_CLOSE_MS)
  }

  const handleShowMonthly = () => {
    close()
    onShowMonthly()
  }

  if (!showChip) {
    return (
      <div className="emp-stat emp-score-chip is-loading" aria-busy="true" aria-label="Оценка загружается">
        <span className="emp-score-chip-skeleton ring" />
        <span className="emp-score-chip-skeleton text" />
      </div>
    )
  }

  const insufficient = error !== null || score === null || score.state === 'insufficient'
  const tone = !insufficient && score.grade ? `score-${score.grade.key}` : 'score-none'
  const signals = !insufficient ? getScoreSignals(score, noRaiseMonths) : []
  let ariaLabel = `${ERROR_LABEL_PREFIX}: ${error}. Подробнее`
  if (error === null) {
    ariaLabel = insufficient || score.total === null
      ? 'Оценка: мало данных. Как складывается'
      : `Оценка ${score.total}, ${score.grade?.label}. Как складывается`
  }

  const breakdown = (
    <ScoreBreakdown
      view={view}
      error={error}
      noRaiseMonths={noRaiseMonths}
      onRetry={onRetry}
      onShowMonthly={handleShowMonthly}
    />
  )

  return (
    <div
      ref={wrapRef}
      className="emp-score-chip-wrap"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        ref={chipRef}
        type="button"
        className={`emp-stat emp-score-chip ${tone}`}
        title={error ?? undefined}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open && !compact ? popoverId : undefined}
        aria-label={ariaLabel}
        onClick={handleClick}
      >
        <ScoreRing total={insufficient ? null : score.total} className={tone} />
        <span className="emp-score-chip-text">
          <strong>{insufficient ? '—' : score.grade?.label}</strong>
          <span className="emp-score-chip-sub">
            оценка
            {signals.map(signal => {
              const Icon = SIGNAL_ICONS[signal]
              return (
                <span key={signal} className={`emp-score-chip-signal signal-${signal}`} title={SCORE_SIGNAL_LABELS[signal]}>
                  <Icon size={SIGNAL_ICON_SIZE} strokeWidth={1.75} aria-hidden="true" />
                </span>
              )
            })}
          </span>
        </span>
      </button>

      {open && !compact && position && (
        <div
          id={popoverId}
          className="emp-score-pop"
          role="dialog"
          aria-label="Как складывается оценка"
          style={{
            width: position.width,
            right: -position.shift,
            ['--arrow-right' as string]: `${position.arrowRight}px`
          } as CSSProperties}
        >
          <div className="emp-score-pop-scroll">{breakdown}</div>
        </div>
      )}

      {open && compact && (
        <BottomSheet variant="modal" title="Оценка сотрудника" onClose={close}>
          {breakdown}
        </BottomSheet>
      )}
    </div>
  )
}

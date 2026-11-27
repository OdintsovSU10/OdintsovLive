import { useCallback, useEffect, useMemo, useRef, type FC } from 'react'
import { RotateCcw } from 'lucide-react'
import { useReducedMotion } from '../../../../hooks/useReducedMotion'
import type { IOfficeSeatState } from './officeModel'
import { TONE_CLASS } from './officeTones'
import { createOfficeScene, type IOfficeScene } from './office3dScene'
import type { ILabelClasses, IOfficeSeatView } from './office3dSeat'
import styles from './Office3D.module.css'

const LOADING_STATUS = 'загрузка'

const LABEL_CLASSES: ILabelClasses = {
  canvas: styles.canvas,
  layer: styles.layer,
  label: styles.label,
  dot: styles.dot,
  text: styles.text,
  tones: TONE_CLASS
}

export interface IOffice3DProps {
  states: readonly IOfficeSeatState[]
  // Данные недоступны: сцена серая и неподвижная
  frozen: boolean
  // WebGL недоступен или потерян: родитель покажет 2D-план
  onUnsupported: () => void
}

const toViews = (states: readonly IOfficeSeatState[]): IOfficeSeatView[] =>
  states.map(state => ({
    no: state.seat.no,
    name: state.name,
    title: `${state.fullName}, ${state.subdivision}: ${state.status || LOADING_STATUS}`,
    pose: state.pose,
    tone: state.tone
  }))

export const Office3D: FC<IOffice3DProps> = ({ states, frozen, onUnsupported }) => {
  const hostRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<IOfficeScene | null>(null)
  const reducedMotion = useReducedMotion()
  const views = useMemo(() => toViews(states), [states])

  // Родитель может передать новую функцию на каждом рендере — сцену из-за этого не пересоздаём
  const unsupportedRef = useRef(onUnsupported)
  unsupportedRef.current = onUnsupported
  const handleUnsupported = useCallback(() => unsupportedRef.current(), [])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let scene: IOfficeScene
    try {
      scene = createOfficeScene({ host, classes: LABEL_CLASSES, onContextLost: handleUnsupported })
    } catch {
      handleUnsupported()
      return
    }
    sceneRef.current = scene
    return () => {
      scene.dispose()
      sceneRef.current = null
    }
  }, [handleUnsupported])

  useEffect(() => { sceneRef.current?.setReducedMotion(reducedMotion) }, [reducedMotion])
  useEffect(() => { sceneRef.current?.setFrozen(frozen) }, [frozen])
  useEffect(() => { sceneRef.current?.setSeats(views) }, [views])

  return (
    <div className={frozen ? `${styles.frame} ${styles.frozen}` : styles.frame}>
      <div ref={hostRef} className={styles.host} role="group" aria-label="Офис в 3D" />
      <button type="button" className={styles.reset} onClick={() => sceneRef.current?.resetView()} aria-label="Сбросить вид" title="Сбросить вид">
        <RotateCcw size={20} strokeWidth={1.5} aria-hidden="true" />
      </button>
    </div>
  )
}

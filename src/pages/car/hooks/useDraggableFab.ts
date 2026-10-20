import { useCallback, useEffect, useRef } from 'react'
import type { PointerEvent } from 'react'

const OFFSET_KEY = 'car:fab-offset'
// Сдвиг пальца, после которого касание — перетаскивание, а не тап
const DRAG_THRESHOLD_PX = 8
// После перетаскивания браузер может прислать click — его не считаем тапом
const CLICK_GUARD_MS = 400

interface FabOffset {
  x: number
  y: number
}

interface DragState {
  pointerId: number
  startX: number
  startY: number
  origin: FabOffset
  moved: boolean
}

function readOffset(): FabOffset {
  try {
    const parsed = JSON.parse(localStorage.getItem(OFFSET_KEY) ?? 'null') as Partial<FabOffset> | null
    if (typeof parsed?.x === 'number' && typeof parsed.y === 'number') return { x: parsed.x, y: parsed.y }
  } catch {
    // битое значение или приватный режим — кнопка на месте по умолчанию
  }
  return { x: 0, y: 0 }
}

function storeOffset(offset: FabOffset) {
  try {
    localStorage.setItem(OFFSET_KEY, JSON.stringify(offset))
  } catch {
    // приватный режим — позиция просто не запомнится
  }
}

// Сдвиг — от места по умолчанию (правый нижний угол): правее и ниже не уводим,
// слева тот же отступ, что справа, сверху — граница из scroll-margin-top (под мобильной шапкой)
function clampOffset(el: HTMLElement, applied: FabOffset, next: FabOffset): FabOffset {
  const rect = el.getBoundingClientRect()
  const width = el.offsetWidth
  const height = el.offsetHeight
  // По центру: scale() при нажатии центр не сдвигает
  const baseLeft = (rect.left + rect.right - width) / 2 - applied.x
  const baseTop = (rect.top + rect.bottom - height) / 2 - applied.y
  const rightGap = document.documentElement.clientWidth - baseLeft - width
  const minTop = parseFloat(getComputedStyle(el).scrollMarginTop) || 0
  return {
    x: Math.round(Math.min(0, Math.max(rightGap - baseLeft, next.x))),
    y: Math.round(Math.min(0, Math.max(minTop - baseTop, next.y)))
  }
}

// Плавающая кнопка, которую можно перетащить пальцем; позиция запоминается
export function useDraggableFab(onTap: () => void) {
  const elRef = useRef<HTMLButtonElement | null>(null)
  const wantedRef = useRef<FabOffset>(readOffset())
  const appliedRef = useRef<FabOffset>({ x: 0, y: 0 })
  const dragRef = useRef<DragState | null>(null)
  const clickGuardUntilRef = useRef(0)

  const apply = useCallback((next: FabOffset) => {
    const el = elRef.current
    // С 768px кнопка скрыта — мерить нечего
    if (!el || el.offsetWidth === 0) return
    const clamped = clampOffset(el, appliedRef.current, next)
    appliedRef.current = clamped
    el.style.translate = `${clamped.x}px ${clamped.y}px`
  }, [])

  const ref = useCallback((el: HTMLButtonElement | null) => {
    elRef.current = el
    appliedRef.current = { x: 0, y: 0 }
    if (el) apply(wantedRef.current)
  }, [apply])

  // Поворот экрана и смена ширины: возвращаем кнопку в границы, запомненное место не теряем
  useEffect(() => {
    const onResize = () => apply(wantedRef.current)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [apply])

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origin: appliedRef.current,
      moved: false
    }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    const dx = e.clientX - drag.startX
    const dy = e.clientY - drag.startY
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return
    drag.moved = true
    apply({ x: drag.origin.x + dx, y: drag.origin.y + dy })
  }

  const onPointerEnd = (e: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    dragRef.current = null
    if (!drag.moved) return
    clickGuardUntilRef.current = Date.now() + CLICK_GUARD_MS
    wantedRef.current = appliedRef.current
    storeOffset(appliedRef.current)
  }

  const onClick = () => {
    if (Date.now() < clickGuardUntilRef.current) return
    onTap()
  }

  return { ref, onPointerDown, onPointerMove, onPointerUp: onPointerEnd, onPointerCancel: onPointerEnd, onClick }
}

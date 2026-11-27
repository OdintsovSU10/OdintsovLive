import type { FC } from 'react'
import {
  DOORS,
  OFFICE_DESKS,
  PLANT,
  PLAN_VIEW,
  PX_PER_M,
  ROOM_RECT,
  SPRITE_HEIGHT,
  SPRITE_WIDTH,
  WALLS,
  WINDOWS,
  COLUMNS,
  NORTH_WALL,
  WARDROBES,
  type IOfficeDesk,
  type TChairSide
} from './officeLayout'
import type { IOfficeSeatState } from './officeModel'
import { TONE_CLASS } from './officeTones'
import { OfficeSprite } from './OfficeSprite'
import styles from './Office.module.css'

const CHAIR_CENTER_PX = 0.45 * PX_PER_M
const CHAIR_SIZE_PX = 38
const SPRITE_PLAN_WIDTH = 64
const SPRITE_PLAN_HEIGHT = (SPRITE_PLAN_WIDTH * SPRITE_HEIGHT) / SPRITE_WIDTH
const MONITOR_LENGTH_PX = 30
const MONITOR_THICKNESS_PX = 5
const MONITOR_INSET_PX = 10
const TEXT_TOP_PX = 31
const TEXT_BOTTOM_PX = 17
const STATUS_GAP_PX = 13

const joinClasses = (...names: Array<string | undefined>): string => names.filter(Boolean).join(' ')

// Центр стула в плоскости плана
const chairCenter = (desk: IOfficeDesk): { x: number; y: number } => {
  const { x0, y0, x1, y1 } = desk.rect
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  const centers: Record<TChairSide, { x: number; y: number }> = {
    N: { x: cx, y: y0 - CHAIR_CENTER_PX },
    S: { x: cx, y: y1 + CHAIR_CENTER_PX },
    E: { x: x1 + CHAIR_CENTER_PX, y: cy },
    W: { x: x0 - CHAIR_CENTER_PX, y: cy }
  }
  return centers[desk.chair]
}

interface IDeskProps {
  desk: IOfficeDesk
  state: IOfficeSeatState | undefined
}

// Стол в повёрнутых осях: стул всегда сверху (N, W) или снизу (S, E); E и W повёрнуты на -90°
const PlanDesk: FC<IDeskProps> = ({ desk, state }) => {
  const { x0, y0, x1, y1 } = desk.rect
  const sideways = desk.chair === 'E' || desk.chair === 'W'
  const width = sideways ? y1 - y0 : x1 - x0
  const height = sideways ? x1 - x0 : y1 - y0
  const chairOnTop = desk.chair === 'N' || desk.chair === 'W'
  const transform = `translate(${(x0 + x1) / 2} ${(y0 + y1) / 2})${sideways ? ' rotate(-90)' : ''}`
  const chairY = chairOnTop ? -height / 2 - CHAIR_CENTER_PX : height / 2 + CHAIR_CENTER_PX
  const monitorY = chairOnTop ? -height / 2 + MONITOR_INSET_PX : height / 2 - MONITOR_INSET_PX - MONITOR_THICKNESS_PX
  const nameY = chairOnTop ? -height / 2 + TEXT_TOP_PX : -height / 2 + TEXT_BOTTOM_PX
  return (
    <g transform={transform}>
      <rect className={styles.planChair} x={-CHAIR_SIZE_PX / 2} y={chairY - CHAIR_SIZE_PX / 2} width={CHAIR_SIZE_PX} height={CHAIR_SIZE_PX} rx="10" />
      <rect className={styles.planDesk} x={-width / 2} y={-height / 2} width={width} height={height} />
      <rect className={styles.planMonitor} x={-MONITOR_LENGTH_PX / 2} y={monitorY} width={MONITOR_LENGTH_PX} height={MONITOR_THICKNESS_PX} />
      {state && (
        <>
          <text className={styles.seatName} x="0" y={nameY}>{state.name}</text>
          <text className={joinClasses(styles.seatStatus, TONE_CLASS[state.tone])} x="0" y={nameY + STATUS_GAP_PX}>{state.status}</text>
        </>
      )}
    </g>
  )
}

interface IOfficePlanProps {
  states: readonly IOfficeSeatState[]
}

// План офиса сверху: стены, столы со стульями и люди на занятых местах. Всё из officeLayout.
export const OfficePlan: FC<IOfficePlanProps> = ({ states }) => {
  const byNo = new Map(states.map(state => [state.seat.no, state] as const))
  return (
    <div className={styles.planWrap}>
      <svg
        className={styles.plan}
        viewBox={`${PLAN_VIEW.x} ${PLAN_VIEW.y} ${PLAN_VIEW.width} ${PLAN_VIEW.height}`}
        role="img"
        aria-label="План офиса"
      >
        <rect className={styles.room} x={ROOM_RECT.x0} y={ROOM_RECT.y0} width={ROOM_RECT.x1 - ROOM_RECT.x0} height={ROOM_RECT.y1 - ROOM_RECT.y0} />
        {WALLS.map(({ rect }) => (
          <rect key={`${rect.x0}-${rect.y0}-${rect.x1}-${rect.y1}`} className={styles.wallFill} x={rect.x0} y={rect.y0} width={rect.x1 - rect.x0} height={rect.y1 - rect.y0} />
        ))}
        {WINDOWS.map(win => (
          <rect key={`win-${win.x0}`} className={styles.planWindow} x={win.x0} y={NORTH_WALL.rect.y0 + 4} width={win.x1 - win.x0} height={NORTH_WALL.rect.y1 - NORTH_WALL.rect.y0 - 8} />
        ))}
        {COLUMNS.map(c => (
          <rect key={`col-${c.x0}-${c.y0}`} className={styles.wallFill} x={c.x0} y={c.y0} width={c.x1 - c.x0} height={c.y1 - c.y0} />
        ))}
        {DOORS.map(door => (
          <line
            key={`${door.x}-${door.y}`}
            className={styles.planDoor}
            x1={door.x}
            y1={door.y}
            x2={door.x + door.dx * door.lengthPx}
            y2={door.y + door.dy * door.lengthPx}
          />
        ))}
        {WARDROBES.map(w => (
          <rect key={`${w.x0}-${w.y0}`} className={styles.planDesk} x={w.x0} y={w.y0} width={w.x1 - w.x0} height={w.y1 - w.y0} />
        ))}
        <rect className={styles.planPlant} x={PLANT.x0} y={PLANT.y0} width={PLANT.x1 - PLANT.x0} height={PLANT.y1 - PLANT.y0} rx="8" />
        {OFFICE_DESKS.map(desk => (
          <PlanDesk key={desk.id} desk={desk} state={desk.seatNo === undefined ? undefined : byNo.get(desk.seatNo)} />
        ))}
        {OFFICE_DESKS.map(desk => {
          const state = desk.seatNo === undefined ? undefined : byNo.get(desk.seatNo)
          if (!state) return null
          const chair = chairCenter(desk)
          return (
            <g key={desk.id}>
              <title>{`${state.fullName}, ${state.subdivision}: ${state.status || 'загрузка'}`}</title>
              <OfficeSprite
                pose={state.pose}
                shirt={state.index}
                x={chair.x - SPRITE_PLAN_WIDTH / 2}
                y={chair.y - SPRITE_PLAN_HEIGHT / 2}
                width={SPRITE_PLAN_WIDTH}
                height={SPRITE_PLAN_HEIGHT}
              />
            </g>
          )
        })}
      </svg>
    </div>
  )
}

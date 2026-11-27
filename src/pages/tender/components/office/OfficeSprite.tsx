import type { FC } from 'react'
import type { TOfficePose } from './officeModel'
import styles from './Sprite.module.css'

const POSE_CLASS: Record<TOfficePose, string | undefined> = {
  edit: styles.poseEdit,
  read: styles.poseRead,
  web: styles.poseWeb,
  think: styles.poseThink,
  empty: styles.poseEmpty
}

const SHIRT_CLASSES = [styles.shirt0, styles.shirt1, styles.shirt2, styles.shirt3, styles.shirt4, styles.shirt5]

const joinClasses = (...names: Array<string | undefined>): string => names.filter(Boolean).join(' ')

interface IPoseProps {
  pose: TOfficePose
}

// Экран монитора: что на нём — зависит от позы. Клетки 11×9 внутри вложенного svg (он сам обрезает по краю).
// У позы «empty» экран выключен: на нём ничего нет.
const Screen: FC<IPoseProps> = ({ pose }) => {
  switch (pose) {
    case 'edit':
      return (
        <g className={styles.lines}>
          <rect x="1" y="1" width="7" height="1" />
          <rect x="2" y="3" width="8" height="1" />
          <rect x="1" y="5" width="5" height="1" />
          <rect x="2" y="7" width="7" height="1" />
        </g>
      )
    case 'read':
      return (
        <g className={styles.scroll}>
          <rect x="1" y="0" width="8" height="1" />
          <rect x="1" y="2" width="5" height="1" />
          <rect x="1" y="4" width="7" height="1" />
          <rect x="1" y="6" width="4" height="1" />
          <rect x="1" y="8" width="8" height="1" />
          <rect x="1" y="10" width="5" height="1" />
          <rect x="1" y="12" width="7" height="1" />
          <rect x="1" y="14" width="4" height="1" />
        </g>
      )
    case 'web':
      return (
        <g className={styles.globe}>
          <rect x="4" y="1" width="3" height="1" />
          <rect x="2" y="2" width="7" height="1" />
          <rect x="2" y="3" width="1" height="3" />
          <rect x="5" y="3" width="1" height="3" />
          <rect x="8" y="3" width="1" height="3" />
          <rect x="2" y="4" width="7" height="1" />
          <rect x="2" y="6" width="7" height="1" />
          <rect x="4" y="7" width="3" height="1" />
        </g>
      )
    case 'think':
      return (
        <g className={styles.dimInk}>
          <rect x="1" y="1" width="7" height="1" />
          <rect x="2" y="3" width="6" height="1" />
          <rect x="1" y="5" width="5" height="1" />
        </g>
      )
    case 'empty':
      return null
  }
}

// Облачко над головой — только у позы «think»
const Bubble: FC<IPoseProps> = ({ pose }) => {
  if (pose !== 'think') return null
  return (
    <g className={styles.bubble}>
      <rect className={styles.bubbleBg} x="3" y="-7" width="10" height="6" />
      <rect className={styles.bubbleBg} x="7" y="-1" width="2" height="1" />
      <rect className={styles.bubbleBg} x="6" y="0" width="1" height="1" />
      <g className={styles.bubbleInk}>
        <rect className={styles.dot} x="5" y="-5" width="1" height="1" />
        <rect className={joinClasses(styles.dot, styles.dot2)} x="8" y="-5" width="1" height="1" />
        <rect className={joinClasses(styles.dot, styles.dot3)} x="11" y="-5" width="1" height="1" />
      </g>
    </g>
  )
}

interface IOfficeSpriteProps extends IPoseProps {
  // Индекс места: цвет рубашки (--office-shirt-0…5)
  shirt: number
  x: number
  y: number
  width: number
  height: number
}

// Человечек за столом, нарисованный клетками (viewBox в «пикселях», без сглаживания). Цвета — токены `--office-*`.
// Поза — класс на корне: анимации живут в CSS и гасятся при `prefers-reduced-motion` и на недоступных данных.
// Рисунок декоративный: смысл читается из подписи места.
export const OfficeSprite: FC<IOfficeSpriteProps> = ({ pose, shirt, x, y, width, height }) => (
  <svg
    className={joinClasses(styles.sprite, POSE_CLASS[pose], SHIRT_CLASSES[shirt % SHIRT_CLASSES.length])}
    x={x}
    y={y}
    width={width}
    height={height}
    viewBox="0 -7 32 31"
    shapeRendering="crispEdges"
    aria-hidden="true"
    focusable="false"
  >
    {/* Стол и монитор */}
    <rect className={styles.deskTop} x="1" y="15" width="30" height="2" />
    <rect className={styles.deskTop} x="3" y="17" width="2" height="7" />
    <rect className={styles.deskTop} x="27" y="17" width="2" height="7" />
    <rect className={styles.monitor} x="17" y="2" width="13" height="11" />
    <rect className={styles.monitor} x="22" y="13" width="3" height="1" />
    <rect className={styles.monitor} x="21" y="14" width="5" height="1" />
    <rect className={styles.screen} x="18" y="3" width="11" height="9" />
    <svg className={styles.screenInk} x="18" y="3" width="11" height="9" viewBox="0 0 11 9">
      <Screen pose={pose} />
    </svg>
    <rect className={styles.keyboard} x="12" y="14" width="5" height="1" />

    {/* Стул */}
    <g className={styles.chair}>
      <rect x="2" y="7" width="2" height="8" />
      <rect x="3" y="14" width="7" height="1" />
      <rect x="5" y="15" width="2" height="3" />
      <rect x="3" y="18" width="6" height="1" />
    </g>

    {/* Человек (у позы «empty» скрыт) */}
    <g className={styles.person}>
      <rect className={styles.shirt} x="4" y="7" width="6" height="7" />
      <g className={styles.head}>
        <rect className={styles.skin} x="5" y="3" width="4" height="4" />
        <rect className={styles.hair} x="5" y="3" width="4" height="2" />
        <rect className={styles.hair} x="4" y="3" width="1" height="3" />
        <rect className={styles.hair} x="8" y="5" width="1" height="1" />
      </g>
      <g className={joinClasses(styles.arm, styles.armB)}>
        <rect className={styles.shirt} x="9" y="10" width="3" height="2" />
        <rect className={styles.skin} x="12" y="12" width="2" height="2" />
      </g>
      <g className={styles.arm}>
        <rect className={styles.shirt} x="10" y="9" width="4" height="2" />
        <rect className={styles.skin} x="14" y="11" width="2" height="2" />
      </g>
    </g>

    <Bubble pose={pose} />
  </svg>
)

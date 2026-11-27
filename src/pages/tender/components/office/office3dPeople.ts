// Фигурка человека из боксов («воксели») и её анимация. Чистые функции three, без React.
// Локальные оси: начало — на полу под бёдрами, человек смотрит на +Z (к столу), стол впереди.
import * as THREE from 'three'
import type { TWorkPose } from './officeModel'
import { makeBox, type IMaterials, type IRegistry } from './office3dKit'

const HIP_Y = 0.52
const TORSO_HEIGHT = 0.46
const SHOULDER_Y = 0.4
const SHOULDER_X = 0.225
const UPPER_ARM = 0.3
const FOREARM = 0.28
const HAND_TARGET_Y = 0.79
// Высота центра головы над шеей и шея над бёдрами
const NECK_Y = HIP_Y + 0.5

const POSE_TAU_S = 0.1
const APPEAR_S = 0.25
const MIN_SCALE = 0.001
const BREATH_AMPLITUDE = 0.01
const TYPING_HZ = 6.5

// Куда стремятся плавные параметры позы
interface IPoseParams {
  // Наклон корпуса вперёд, рад
  lean: number
  // Наклон головы вниз, рад
  pitch: number
  // Амплитуда поворота головы, рад
  sway: number
  // Печать обеими руками: амплитуда дрожи кистей, м
  typing: number
  // Мышь правой рукой: амплитуда хода кисти, м
  mouse: number
  // Правая рука у подбородка: 0…1
  think: number
}

const POSES: Record<TWorkPose, IPoseParams> = {
  edit: { lean: 0.08, pitch: 0.1, sway: 0, typing: 0.014, mouse: 0, think: 0 },
  web: { lean: 0.1, pitch: 0.08, sway: 0.12, typing: 0.004, mouse: 0.05, think: 0 },
  read: { lean: 0.22, pitch: 0.05, sway: 0, typing: 0, mouse: 0, think: 0 },
  think: { lean: -0.04, pitch: -0.04, sway: 0.35, typing: 0, mouse: 0, think: 1 }
}

const PARAM_KEYS: ReadonlyArray<keyof IPoseParams> = ['lean', 'pitch', 'sway', 'typing', 'mouse', 'think']

// Кисть у подбородка в осях корпуса, относительно плеча (вперёд, вверх)
const CHIN_Z = 0.26
const CHIN_Y = 0.02
const CHIN_SWING = 0.75

export interface IPerson {
  group: THREE.Group
  setPose: (pose: TWorkPose, snap: boolean) => void
  // Появление/исчезновение: при появлении фигурка за 250 мс вырастает из нуля
  setPresent: (present: boolean, animate: boolean) => void
  // animated=false — позу ставим сразу, без дыхания и печати (reduced motion)
  update: (timeS: number, deltaS: number, animated: boolean) => void
}

interface IArm {
  side: number
  shoulder: THREE.Group
  elbow: THREE.Group
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))

// Поворот точки (z, y) в плоскости YZ на угол вокруг оси X
const rotateYz = (z: number, y: number, angle: number): { z: number; y: number } => ({
  y: y * Math.cos(angle) - z * Math.sin(angle),
  z: y * Math.sin(angle) + z * Math.cos(angle)
})

// Двузвенная рука: куда довести кисть (вперёд tz, вверх ty от плеча), локоть — вниз. Углы — от направления «вниз».
const solveArm = (tz: number, ty: number): { shoulder: number; bend: number } => {
  const distance = clamp(Math.hypot(tz, ty), Math.abs(UPPER_ARM - FOREARM) + 0.01, UPPER_ARM + FOREARM - 0.005)
  const toTarget = Math.atan2(tz, -ty)
  const alpha = Math.acos(clamp((UPPER_ARM ** 2 + distance ** 2 - FOREARM ** 2) / (2 * UPPER_ARM * distance), -1, 1))
  const gamma = Math.acos(clamp((UPPER_ARM ** 2 + FOREARM ** 2 - distance ** 2) / (2 * UPPER_ARM * FOREARM), -1, 1))
  return { shoulder: toTarget - alpha, bend: Math.PI - gamma }
}

const easeOut = (x: number): number => 1 - (1 - x) ** 2

const buildArm = (reg: IRegistry, mats: IMaterials, shirt: THREE.Material, side: number): IArm => {
  const shoulder = new THREE.Group()
  shoulder.position.set(side * SHOULDER_X, SHOULDER_Y, 0)
  shoulder.rotation.order = 'YXZ'
  shoulder.add(makeBox(reg, shirt, [0.09, UPPER_ARM, 0.09], [0, -UPPER_ARM / 2, 0]))
  const elbow = new THREE.Group()
  elbow.position.set(0, -UPPER_ARM, 0)
  elbow.add(makeBox(reg, mats.skin, [0.08, FOREARM, 0.08], [0, -FOREARM / 2, 0]))
  elbow.add(makeBox(reg, mats.skin, [0.085, 0.08, 0.1], [0, -FOREARM - 0.02, 0.01]))
  shoulder.add(elbow)
  return { side, shoulder, elbow }
}

export interface IPersonOptions {
  shirtIndex: number
  // Сдвиг фаз дыхания/печати между людьми
  phase: number
  // Расстояние от бёдер до центра клавиатуры по горизонтали, м
  reach: number
}

export const createPerson = (reg: IRegistry, mats: IMaterials, options: IPersonOptions): IPerson => {
  const { shirtIndex, phase, reach } = options
  const shirt = mats.shirts[shirtIndex % mats.shirts.length]
  const root = new THREE.Group()
  root.visible = false

  // Ноги: бёдра вперёд под стол, голени вниз, ступни
  ;[-1, 1].forEach(side => {
    root.add(makeBox(reg, mats.pants, [0.13, 0.14, 0.42], [side * 0.09, HIP_Y - 0.07, 0.19]))
    root.add(makeBox(reg, mats.pants, [0.12, 0.4, 0.12], [side * 0.09, 0.23, 0.38]))
    root.add(makeBox(reg, mats.pants, [0.12, 0.05, 0.2], [side * 0.09, 0.025, 0.43]))
  })

  const torsoPivot = new THREE.Group()
  torsoPivot.position.set(0, HIP_Y, 0)
  const torso = makeBox(reg, shirt, [0.36, TORSO_HEIGHT, 0.2], [0, TORSO_HEIGHT / 2, 0])
  torsoPivot.add(torso)

  const arms = [-1, 1].map(side => buildArm(reg, mats, shirt, side))
  arms.forEach(arm => torsoPivot.add(arm.shoulder))

  const head = new THREE.Group()
  head.position.set(0, NECK_Y - HIP_Y, 0)
  head.add(makeBox(reg, mats.skin, [0.2, 0.2, 0.2], [0, 0.11, 0]))
  head.add(makeBox(reg, mats.hair, [0.22, 0.06, 0.22], [0, 0.22, 0]))
  head.add(makeBox(reg, mats.hair, [0.22, 0.16, 0.05], [0, 0.14, -0.085]))
  ;[-1, 1].forEach(side => head.add(makeBox(reg, mats.hair, [0.03, 0.03, 0.01], [side * 0.045, 0.13, 0.1025], { cast: false })))
  torsoPivot.add(head)
  root.add(torsoPivot)

  const current: IPoseParams = { ...POSES.edit }
  let target: IPoseParams = POSES.edit
  let present = false
  let appear = 1

  const applyScale = (): void => {
    root.scale.setScalar(Math.max(MIN_SCALE, easeOut(appear)))
  }

  const pose = (timeS: number, animated: boolean): void => {
    const breath = animated ? 1 + BREATH_AMPLITUDE * Math.sin(timeS * 1.6 + phase) : 1
    torso.scale.y = breath
    torsoPivot.rotation.x = current.lean
    head.rotation.x = current.pitch - current.lean * 0.6
    head.rotation.y = animated ? current.sway * Math.sin(timeS * 0.6 + phase) : 0

    const shoulderHip = rotateYz(0, SHOULDER_Y, current.lean)
    arms.forEach(arm => {
      const isThinking = arm.side > 0 && current.think > 0
      const wave = animated ? timeS * TYPING_HZ * Math.PI * 2 + phase + arm.side * 1.9 : 0
      const typingY = animated ? current.typing * Math.sin(wave) : 0
      const typingZ = animated ? current.typing * 0.6 * Math.cos(wave) : 0
      const mouseZ = animated && arm.side > 0 ? current.mouse * Math.sin(timeS * 0.9 + phase) : 0
      // Цель на столе: из осей бёдер в оси корпуса
      const desk = rotateYz(
        reach + typingZ + mouseZ - shoulderHip.z,
        HAND_TARGET_Y - HIP_Y + typingY - shoulderHip.y,
        -current.lean
      )
      const blend = isThinking ? current.think : 0
      const tz = desk.z + (CHIN_Z - desk.z) * blend
      const ty = desk.y + (CHIN_Y - desk.y) * blend
      const angles = solveArm(tz, ty)
      arm.shoulder.rotation.x = -angles.shoulder
      arm.shoulder.rotation.y = -CHIN_SWING * blend * arm.side
      arm.elbow.rotation.x = -angles.bend
    })
  }

  return {
    group: root,
    setPose: (next, snap) => {
      target = POSES[next]
      if (snap) PARAM_KEYS.forEach(key => { current[key] = target[key] })
    },
    setPresent: (next, animate) => {
      if (next === present) return
      present = next
      root.visible = next
      if (next) PARAM_KEYS.forEach(key => { current[key] = target[key] })
      appear = next && animate ? 0 : 1
      applyScale()
    },
    update: (timeS, deltaS, animated) => {
      if (!present) return
      if (animated) {
        const k = 1 - Math.exp(-deltaS / POSE_TAU_S)
        PARAM_KEYS.forEach(key => { current[key] += (target[key] - current[key]) * k })
        if (appear < 1) {
          appear = Math.min(1, appear + deltaS / APPEAR_S)
          applyScale()
        }
      } else {
        PARAM_KEYS.forEach(key => { current[key] = target[key] })
        appear = 1
        applyScale()
      }
      pose(timeS, animated)
    }
  }
}

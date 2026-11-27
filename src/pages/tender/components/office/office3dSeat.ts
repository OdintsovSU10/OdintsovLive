// Рабочее место в сцене: стол с монитором, стул, человек и подпись над ним. Состояние места приходит из React через apply().
import * as THREE from 'three'
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js'
import type { IOfficeDesk, IOfficeSeat, TChairSide } from './officeLayout'
import type { TOfficePose, TSeatTone } from './officeModel'
import {
  CHAIR_GAP,
  KEYBOARD_FROM_EDGE,
  SIT_OFFSET,
  createChair,
  createDeskSet
} from './office3dFurniture'
import { createPerson, type IPerson } from './office3dPeople'
import { toMetricRect, type IMaterials, type IRegistry } from './office3dKit'

export interface IOfficeSeatView {
  no: number
  name: string
  // Полная подпись статуса для title
  title: string
  pose: TOfficePose
  tone: TSeatTone
}

// CSS-классы слоёв сцены и подписей (из CSS-модулей)
export interface ILabelClasses {
  canvas: string
  layer: string
  label: string
  dot: string
  text: string
  tones: Record<TSeatTone, string>
}

export interface IOfficeSeatRig {
  group: THREE.Group
  seatNo: number | undefined
  apply: (view: IOfficeSeatView, animate: boolean) => void
  update: (timeS: number, deltaS: number, animated: boolean) => void
}

const SIDE_ANGLE: Record<TChairSide, number> = {
  N: 0,
  S: Math.PI,
  E: -Math.PI / 2,
  W: Math.PI / 2
}

// Пустой стул отодвинут от стола и слегка повёрнут
const EMPTY_PUSH = 0.06
const EMPTY_YAW = 0.3
const PUSH_TAU_S = 0.1
const LABEL_HEIGHT = 1.75
// Зазор между столами «спина к спине», чтобы грани не мерцали
const DESK_GAP = 0.004

interface ILabel {
  object: CSS2DObject
  update: (view: IOfficeSeatView) => void
}

const createLabel = (classes: ILabelClasses, hipZ: number): ILabel => {
  const element = document.createElement('div')
  const dot = document.createElement('span')
  dot.className = classes.dot
  const text = document.createElement('span')
  text.className = classes.text
  element.append(dot, text)
  const object = new CSS2DObject(element)
  object.position.set(0, LABEL_HEIGHT, hipZ)
  return {
    object,
    update: view => {
      element.className = `${classes.label} ${classes.tones[view.tone]}`
      element.title = view.title
      text.textContent = view.name
    }
  }
}

export const createSeatRig = (
  reg: IRegistry,
  mats: IMaterials,
  desk: IOfficeDesk,
  seat: IOfficeSeat | undefined,
  classes: ILabelClasses,
  parity: number
): IOfficeSeatRig => {
  const rect = toMetricRect(desk.rect)
  const sideways = desk.chair === 'E' || desk.chair === 'W'
  const width = sideways ? rect.depth : rect.width
  const depth = (sideways ? rect.width : rect.depth) - DESK_GAP

  const group = new THREE.Group()
  group.position.set(rect.cx, 0, rect.cz)
  group.rotation.y = SIDE_ANGLE[desk.chair]

  const deskSet = createDeskSet(reg, mats, width, depth)
  group.add(deskSet.group)

  const chairZ = -(depth / 2 + CHAIR_GAP)
  const chair = createChair(reg, mats)
  chair.position.z = chairZ
  group.add(chair)
  const yawSign = parity % 2 === 0 ? 1 : -1

  let person: IPerson | null = null
  let label: ILabel | null = null
  if (seat) {
    person = createPerson(reg, mats, {
      shirtIndex: seat.no - 1,
      phase: seat.no * 1.7,
      reach: CHAIR_GAP - SIT_OFFSET + KEYBOARD_FROM_EDGE
    })
    person.group.position.z = chairZ + SIT_OFFSET
    group.add(person.group)
    label = createLabel(classes, chairZ + SIT_OFFSET)
    label.object.visible = false
    group.add(label.object)
  }

  // push: 0 — стул у стола (место занято), 1 — отодвинут (пусто)
  let push = 1
  let pushTarget = 1
  const placeChair = (): void => {
    chair.position.z = chairZ - EMPTY_PUSH * push
    chair.rotation.y = EMPTY_YAW * push * yawSign
  }
  placeChair()

  return {
    group,
    seatNo: seat?.no,
    apply: (view, animate) => {
      if (!person || !label) return
      const present = view.pose !== 'empty'
      if (view.pose !== 'empty') person.setPose(view.pose, !animate)
      person.setPresent(present, animate)
      deskSet.screens.forEach(screen => {
        screen.material = present ? mats.screenOn : mats.screenOff
      })
      pushTarget = present ? 0 : 1
      if (!animate) {
        push = pushTarget
        placeChair()
      }
      label.update(view)
      label.object.visible = true
    },
    update: (timeS, deltaS, animated) => {
      person?.update(timeS, deltaS, animated)
      if (push !== pushTarget && !animated) {
        push = pushTarget
        placeChair()
      } else if (push !== pushTarget) {
        push += (pushTarget - push) * (1 - Math.exp(-deltaS / PUSH_TAU_S))
        if (Math.abs(push - pushTarget) < 0.01) push = pushTarget
        placeChair()
      }
    }
  }
}

// Неподвижные части сцены: пол, стены, двери, шкафы, колонны, а также стол с монитором и стул. Чистые функции three.
import * as THREE from 'three'
import { COLUMNS, DOORS, ENTRANCE, NORTH_WALL, ROOM_RECT, WALLS, TUMBAS, WARDROBES, WINDOWS, PX_PER_M, type TWallKind } from './officeLayout'
import {
  DESK_TOP_Y,
  LOW_WALL_HEIGHT,
  RAIL_HEIGHT,
  WALL_HEIGHT,
  makeBox,
  makeMesh,
  pxToX,
  pxToZ,
  toMetricRect,
  type IMaterials,
  type IRegistry
} from './office3dKit'

// Стул стоит в 0.45 м от кромки стола (по центру), человек сидит на передней части сиденья
export const CHAIR_GAP = 0.45
export const SIT_OFFSET = 0.12
export const SEAT_HEIGHT = 0.46
// Клавиатура и монитор отсчитываются от кромки стола со стороны человека
export const KEYBOARD_FROM_EDGE = 0.15
const MONITOR_FROM_EDGE = 0.5
// Два монитора рядом: зазор между панелями и разворот каждого к человеку внутрь
const MONITOR_WIDTH = 0.5
const MONITOR_GAP = 0.06
const MONITOR_YAW = (10 * Math.PI) / 180
const TUMBA_HEIGHT = 0.72
const TUMBA_SLOT_THICKNESS = 0.004
const DESK_THICKNESS = 0.04
const WARDROBE_HEIGHT = 1.9
const DOOR_HEIGHT = 2.0
const DOOR_THICKNESS = 0.04
const ENTRANCE_HEIGHT = 2.1
const GRID_STEP = 1
const SILL_HEIGHT = 0.9
const WINDOW_TOP = 2.4
const GLASS_THICKNESS = 0.02

const WALL_HEIGHTS: Record<TWallKind, number> = {
  tall: WALL_HEIGHT,
  rail: RAIL_HEIGHT,
  low: LOW_WALL_HEIGHT
}

const buildGrid = (reg: IRegistry, mats: IMaterials, width: number, depth: number): THREE.LineSegments => {
  const points: number[] = []
  for (let x = 0; x <= width; x += GRID_STEP) points.push(x, 0, 0, x, 0, depth)
  for (let z = 0; z <= depth; z += GRID_STEP) points.push(0, 0, z, width, 0, z)
  const geometry = reg.add(new THREE.BufferGeometry())
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3))
  const grid = new THREE.LineSegments(geometry, mats.gridLine)
  grid.position.y = 0.004
  return grid
}

// Северная стена: простенки во всю высоту, под окнами подоконная часть, над ними перемычка, в проёмах стекло
const buildNorthWall = (reg: IRegistry, mats: IMaterials): THREE.Group => {
  const group = new THREE.Group()
  const wall = toMetricRect(NORTH_WALL.rect)
  const addPart = (x0: number, x1: number, y0: number, y1: number, material: THREE.Material, depth = wall.depth): void => {
    group.add(makeBox(reg, material, [x1 - x0, y1 - y0, depth], [(x0 + x1) / 2, (y0 + y1) / 2, wall.cz]))
  }
  const left = pxToX(NORTH_WALL.rect.x0)
  const right = pxToX(NORTH_WALL.rect.x1)
  let cursor = left
  WINDOWS.forEach(win => {
    const x0 = pxToX(win.x0)
    const x1 = pxToX(win.x1)
    addPart(cursor, x0, 0, WALL_HEIGHT, mats.wall)
    addPart(x0, x1, 0, SILL_HEIGHT, mats.wall)
    addPart(x0, x1, WINDOW_TOP, WALL_HEIGHT, mats.wall)
    addPart(x0, x1, SILL_HEIGHT, WINDOW_TOP, mats.glass, GLASS_THICKNESS)
    // Импост посередине окна
    const mid = (x0 + x1) / 2
    addPart(mid - 0.03, mid + 0.03, SILL_HEIGHT, WINDOW_TOP, mats.glassFrame, wall.depth * 0.6)
    cursor = x1
  })
  addPart(cursor, right, 0, WALL_HEIGHT, mats.wall)
  return group
}

// Пол (плита с лёгкой сеткой) и все стены, двери, входная коробка
export const buildShell = (reg: IRegistry, mats: IMaterials): THREE.Group => {
  const shell = new THREE.Group()
  const room = toMetricRect(ROOM_RECT)
  shell.add(makeBox(reg, mats.floor, [room.width, 0.1, room.depth], [room.cx, -0.05, room.cz], { receive: true }))
  const grid = buildGrid(reg, mats, room.width, room.depth)
  grid.position.x = room.cx - room.width / 2
  grid.position.z = room.cz - room.depth / 2
  shell.add(grid)

  WALLS.forEach(wallItem => {
    if (wallItem === NORTH_WALL) return
    const { rect, kind } = wallItem
    const wall = toMetricRect(rect)
    const height = WALL_HEIGHTS[kind]
    shell.add(makeBox(reg, mats.wall, [wall.width, height, wall.depth], [wall.cx, height / 2, wall.cz]))
  })

  shell.add(buildNorthWall(reg, mats))
  COLUMNS.forEach(rect => {
    const column = toMetricRect(rect)
    shell.add(makeBox(reg, mats.wall, [column.width, WALL_HEIGHT, column.depth], [column.cx, WALL_HEIGHT / 2, column.cz]))
  })

  // Вход: порог и дверная коробка в проёме южной стены
  const gate = toMetricRect(ENTRANCE)
  const post = 0.08
  shell.add(makeBox(reg, mats.wall, [gate.width, 0.02, gate.depth], [gate.cx, 0.01, gate.cz], { receive: true }))
  ;[-1, 1].forEach(side => {
    shell.add(makeBox(reg, mats.monitor, [post, ENTRANCE_HEIGHT, gate.depth], [gate.cx + side * (gate.width / 2 - post / 2), ENTRANCE_HEIGHT / 2, gate.cz]))
  })
  shell.add(makeBox(reg, mats.monitor, [gate.width, post, gate.depth], [gate.cx, ENTRANCE_HEIGHT - post / 2, gate.cz]))

  // Открытые двери кабинетов: створка на петле, повёрнута в коридор
  DOORS.forEach(door => {
    const length = door.lengthPx / PX_PER_M
    const pivot = new THREE.Group()
    pivot.position.set(pxToX(door.x), 0, pxToZ(door.y))
    pivot.rotation.y = Math.atan2(door.dx, door.dy)
    pivot.add(makeBox(reg, mats.desk, [DOOR_THICKNESS, DOOR_HEIGHT, length], [0, DOOR_HEIGHT / 2, length / 2]))
    shell.add(pivot)
  })
  return shell
}

// Шкафы и тумбы (короб материалом стола, сверху тёмная щель ящика вдоль длинной стороны)
export const buildDecor = (reg: IRegistry, mats: IMaterials): THREE.Group => {
  const decor = new THREE.Group()
  WARDROBES.forEach(rect => {
    const wardrobe = toMetricRect(rect)
    decor.add(makeBox(reg, mats.desk, [wardrobe.width, WARDROBE_HEIGHT, wardrobe.depth], [wardrobe.cx, WARDROBE_HEIGHT / 2, wardrobe.cz]))
  })
  TUMBAS.forEach(rect => {
    const tumba = toMetricRect(rect)
    decor.add(makeBox(reg, mats.desk, [tumba.width, TUMBA_HEIGHT, tumba.depth], [tumba.cx, TUMBA_HEIGHT / 2, tumba.cz]))
    const alongX = tumba.width >= tumba.depth
    const slot: [number, number, number] = alongX ? [tumba.width * 0.8, TUMBA_SLOT_THICKNESS, 0.02] : [0.02, TUMBA_SLOT_THICKNESS, tumba.depth * 0.8]
    decor.add(makeBox(reg, mats.monitor, slot, [tumba.cx, TUMBA_HEIGHT + TUMBA_SLOT_THICKNESS / 2, tumba.cz]))
  })
  return decor
}

export interface IDeskSet {
  group: THREE.Group
  // Экраны двух мониторов: материал подменяется по занятости места
  screens: THREE.Mesh[]
}

const LEG_SIZE = 0.05

// Стол с клавиатурой и двумя мониторами в локальных осях: центр стола в нуле, человек — на -Z, экран смотрит на него
export const createDeskSet = (reg: IRegistry, mats: IMaterials, width: number, depth: number): IDeskSet => {
  const group = new THREE.Group()
  const topY = DESK_TOP_Y - DESK_THICKNESS / 2
  group.add(makeBox(reg, mats.desk, [width, DESK_THICKNESS, depth], [0, topY, 0]))
  const legHeight = DESK_TOP_Y - DESK_THICKNESS
  const legX = width / 2 - LEG_SIZE
  const legZ = depth / 2 - LEG_SIZE
  ;[-1, 1].forEach(sx => {
    ;[-1, 1].forEach(sz => {
      group.add(makeBox(reg, mats.monitor, [LEG_SIZE, legHeight, LEG_SIZE], [sx * legX, legHeight / 2, sz * legZ]))
    })
  })

  const edge = -depth / 2
  group.add(makeBox(reg, mats.keyboard, [0.38, 0.015, 0.13], [0, DESK_TOP_Y + 0.0075, edge + KEYBOARD_FROM_EDGE]))
  const monitorZ = edge + MONITOR_FROM_EDGE
  const panelY = DESK_TOP_Y + 0.2
  const screens: THREE.Mesh[] = []
  ;[-1, 1].forEach(side => {
    // Монитор в своих осях: центр основания в нуле, экран на -Z; разворот внутрь — экран смотрит на ось стола
    const monitor = new THREE.Group()
    monitor.position.set(side * (MONITOR_WIDTH + MONITOR_GAP) / 2, 0, monitorZ)
    monitor.rotation.y = side * MONITOR_YAW
    monitor.add(makeBox(reg, mats.monitor, [0.2, 0.015, 0.14], [0, DESK_TOP_Y + 0.0075, 0]))
    monitor.add(makeBox(reg, mats.monitor, [0.05, 0.1, 0.03], [0, DESK_TOP_Y + 0.065, 0]))
    monitor.add(makeBox(reg, mats.monitor, [MONITOR_WIDTH, 0.3, 0.03], [0, panelY, 0]))
    const screen = makeMesh(reg.box(MONITOR_WIDTH - 0.04, 0.26, 0.006), mats.screenOff, [0, panelY, -0.0165], { cast: false, receive: false })
    monitor.add(screen)
    screens.push(screen)
    group.add(monitor)
  })
  return { group, screens }
}

const CHAIR_SIZE = 0.4

// Офисный стул в локальных осях: спинка на -Z, смотрит на +Z (к столу)
export const createChair = (reg: IRegistry, mats: IMaterials): THREE.Group => {
  const chair = new THREE.Group()
  chair.add(makeBox(reg, mats.chair, [CHAIR_SIZE, 0.05, CHAIR_SIZE], [0, SEAT_HEIGHT - 0.025, 0]))
  chair.add(makeBox(reg, mats.chair, [CHAIR_SIZE, 0.42, 0.04], [0, SEAT_HEIGHT + 0.21, -CHAIR_SIZE / 2 + 0.02]))
  chair.add(makeMesh(reg.cylinder(0.025, SEAT_HEIGHT - 0.07), mats.monitor, [0, (SEAT_HEIGHT - 0.07) / 2 + 0.03, 0], { cast: true }))
  chair.add(makeMesh(reg.cylinder(0.22, 0.03), mats.monitor, [0, 0.015, 0], { cast: true }))
  return chair
}

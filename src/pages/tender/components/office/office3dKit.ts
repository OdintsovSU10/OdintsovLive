// Общие кирпичики 3D-сцены офиса: палитра из CSS-токенов, материалы, реестр на dispose, геометрии. Без React.
import * as THREE from 'three'
import { ORIGIN, PX_PER_M, type IPxRect } from './officeLayout'

export const SHIRT_COUNT = 6

// Высоты, м
export const DESK_TOP_Y = 0.75
export const WALL_HEIGHT = 2.8
export const LOW_WALL_HEIGHT = 1.2
export const RAIL_HEIGHT = 0.15

export const pxToX = (x: number): number => (x - ORIGIN.x) / PX_PER_M
export const pxToZ = (y: number): number => (y - ORIGIN.y) / PX_PER_M

export interface IMetricRect {
  cx: number
  cz: number
  width: number
  depth: number
}

export const toMetricRect = (rect: IPxRect): IMetricRect => ({
  cx: pxToX((rect.x0 + rect.x1) / 2),
  cz: pxToZ((rect.y0 + rect.y1) / 2),
  width: (rect.x1 - rect.x0) / PX_PER_M,
  depth: (rect.y1 - rect.y0) / PX_PER_M
})

// Реестр всего, что надо освободить при размонтировании, и кэш общих геометрий
export interface IRegistry {
  add: <T extends { dispose: () => void }>(item: T) => T
  box: (width: number, height: number, depth: number) => THREE.BoxGeometry
  cylinder: (radius: number, height: number, segments?: number) => THREE.CylinderGeometry
  disposeAll: () => void
}

export const createRegistry = (): IRegistry => {
  const items = new Set<{ dispose: () => void }>()
  const geometries = new Map<string, THREE.BufferGeometry>()
  const add = <T extends { dispose: () => void }>(item: T): T => {
    items.add(item)
    return item
  }
  const cached = <T extends THREE.BufferGeometry>(key: string, make: () => T): T => {
    const found = geometries.get(key)
    if (found) return found as T
    const created = add(make())
    geometries.set(key, created)
    return created
  }
  return {
    add,
    box: (width, height, depth) => cached(`b${width}/${height}/${depth}`, () => new THREE.BoxGeometry(width, height, depth)),
    cylinder: (radius, height, segments = 16) =>
      cached(`c${radius}/${height}/${segments}`, () => new THREE.CylinderGeometry(radius, radius, height, segments)),
    disposeAll: () => {
      items.forEach(item => item.dispose())
      items.clear()
      geometries.clear()
    }
  }
}

export interface IPalette {
  bg: THREE.Color
  floor: THREE.Color
  floorLine: THREE.Color
  wall: THREE.Color
  glass: THREE.Color
  glassFrame: THREE.Color
  desk: THREE.Color
  monitor: THREE.Color
  screen: THREE.Color
  screenGlow: THREE.Color
  chair: THREE.Color
  keyboard: THREE.Color
  skin: THREE.Color
  hair: THREE.Color
  pants: THREE.Color
  plant: THREE.Color
  shirts: THREE.Color[]
}

// Серый на случай, если токен не распарсился (тема не загружена)
const fallbackColor = (): THREE.Color => new THREE.Color().setRGB(0.5, 0.5, 0.5)

const readColor = (style: CSSStyleDeclaration, token: string): THREE.Color => {
  const value = style.getPropertyValue(token).trim()
  if (!value) return fallbackColor()
  try {
    return new THREE.Color(value)
  } catch {
    return fallbackColor()
  }
}

export const readPalette = (): IPalette => {
  const style = getComputedStyle(document.documentElement)
  const read = (token: string): THREE.Color => readColor(style, token)
  return {
    bg: read('--bg-secondary'),
    floor: read('--office-floor'),
    floorLine: read('--office-floor-line'),
    wall: read('--office-wall'),
    glass: read('--office-glass'),
    glassFrame: read('--office-glass-frame'),
    desk: read('--office-desk'),
    monitor: read('--office-monitor'),
    screen: read('--office-screen'),
    screenGlow: read('--office-screen-glow'),
    chair: read('--office-chair'),
    keyboard: read('--office-keyboard'),
    skin: read('--office-skin'),
    hair: read('--office-hair'),
    pants: read('--office-pants'),
    plant: read('--office-plant'),
    shirts: Array.from({ length: SHIRT_COUNT }, (_, i) => read(`--office-shirt-${i}`))
  }
}

export interface IMaterials {
  floor: THREE.MeshStandardMaterial
  gridLine: THREE.LineBasicMaterial
  wall: THREE.MeshStandardMaterial
  glass: THREE.MeshStandardMaterial
  glassFrame: THREE.MeshStandardMaterial
  desk: THREE.MeshStandardMaterial
  monitor: THREE.MeshStandardMaterial
  screenOn: THREE.MeshStandardMaterial
  screenOff: THREE.MeshStandardMaterial
  chair: THREE.MeshStandardMaterial
  keyboard: THREE.MeshStandardMaterial
  skin: THREE.MeshStandardMaterial
  hair: THREE.MeshStandardMaterial
  pants: THREE.MeshStandardMaterial
  plant: THREE.MeshStandardMaterial
  shirts: THREE.MeshStandardMaterial[]
}

const GLASS_OPACITY = 0.25
const SCREEN_OFF_DIM = 0.35
const SCREEN_GLOW_INTENSITY = 0.7

const standard = (reg: IRegistry, roughness = 0.85): THREE.MeshStandardMaterial =>
  reg.add(new THREE.MeshStandardMaterial({ roughness, metalness: 0 }))

export const createMaterials = (reg: IRegistry): IMaterials => {
  const glass = reg.add(new THREE.MeshStandardMaterial({
    roughness: 0.1,
    metalness: 0,
    transparent: true,
    opacity: GLASS_OPACITY,
    depthWrite: false
  }))
  const screenOn = standard(reg, 0.4)
  screenOn.emissiveIntensity = SCREEN_GLOW_INTENSITY
  return {
    floor: standard(reg, 0.95),
    gridLine: reg.add(new THREE.LineBasicMaterial()),
    wall: standard(reg),
    glass,
    glassFrame: standard(reg, 0.5),
    desk: standard(reg, 0.7),
    monitor: standard(reg, 0.5),
    screenOn,
    screenOff: standard(reg, 0.3),
    chair: standard(reg),
    keyboard: standard(reg, 0.6),
    skin: standard(reg),
    hair: standard(reg),
    pants: standard(reg),
    plant: standard(reg),
    shirts: Array.from({ length: SHIRT_COUNT }, () => standard(reg))
  }
}

// Перекраска материалов под текущую тему: сцена не пересоздаётся
export const applyPalette = (materials: IMaterials, palette: IPalette): void => {
  materials.floor.color.copy(palette.floor)
  materials.gridLine.color.copy(palette.floorLine)
  materials.wall.color.copy(palette.wall)
  materials.glass.color.copy(palette.glass)
  materials.glassFrame.color.copy(palette.glassFrame)
  materials.desk.color.copy(palette.desk)
  materials.monitor.color.copy(palette.monitor)
  materials.screenOn.color.copy(palette.screen)
  materials.screenOn.emissive.copy(palette.screenGlow)
  materials.screenOff.color.copy(palette.screen).multiplyScalar(SCREEN_OFF_DIM)
  materials.chair.color.copy(palette.chair)
  materials.keyboard.color.copy(palette.keyboard)
  materials.skin.color.copy(palette.skin)
  materials.hair.color.copy(palette.hair)
  materials.pants.color.copy(palette.pants)
  materials.plant.color.copy(palette.plant)
  materials.shirts.forEach((material, i) => material.color.copy(palette.shirts[i] ?? palette.shirts[0]))
}

export type TVec3 = readonly [number, number, number]

export interface IMeshFlags {
  cast?: boolean
  receive?: boolean
}

export const makeMesh = (
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  position: TVec3,
  flags: IMeshFlags = { cast: true, receive: true }
): THREE.Mesh => {
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.set(position[0], position[1], position[2])
  mesh.castShadow = flags.cast ?? false
  mesh.receiveShadow = flags.receive ?? false
  return mesh
}

// Коробка с центром в точке (размеры — ширина X, высота Y, глубина Z)
export const makeBox = (
  reg: IRegistry,
  material: THREE.Material,
  size: TVec3,
  position: TVec3,
  flags?: IMeshFlags
): THREE.Mesh => makeMesh(reg.box(size[0], size[1], size[2]), material, position, flags)

// Сцена 3D-офиса: рендерер, камера, свет, управление, цикл отрисовки. Чистый three, без React.
import * as THREE from 'three'
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { OFFICE_DESKS, OFFICE_SEATS, ROOM_RECT } from './officeLayout'
import {
  applyPalette,
  createMaterials,
  createRegistry,
  readPalette,
  toMetricRect
} from './office3dKit'
import { buildDecor, buildShell } from './office3dFurniture'
import { createSeatRig, type ILabelClasses, type IOfficeSeatRig, type IOfficeSeatView } from './office3dSeat'

export interface IOfficeSceneOptions {
  host: HTMLElement
  classes: ILabelClasses
  // WebGL-контекст потерян: вызывающий переключается на 2D
  onContextLost: () => void
}

export interface IOfficeScene {
  setSeats: (views: readonly IOfficeSeatView[]) => void
  setFrozen: (frozen: boolean) => void
  setReducedMotion: (reduced: boolean) => void
  resetView: () => void
  dispose: () => void
}

const CAMERA_FOV = 40
// Направление от центра комнаты к камере: юго-восток сверху; на узком (портретном) экране — почти с юга,
// чтобы вытянутая с севера на юг комната заполняла кадр
const CAMERA_DIRECTION_WIDE = new THREE.Vector3(5, 14, 9).normalize()
const CAMERA_DIRECTION_NARROW = new THREE.Vector3(2, 14, 9).normalize()
const MIN_DISTANCE = 8
const MAX_DISTANCE = 35
const MAX_POLAR_ANGLE = 1.35
const FIT_MARGIN = 0.97
// Подгон по полу и низу стен: верх задних стен может уходить за кадр, зато помещение крупнее
const FIT_HEIGHT = 1
const SHADOW_MIN_WIDTH = 768
const MAX_FRAME_S = 0.1
const DAMPING = 0.08
const SHADOW_MAP_SIZE = 2048
const SHADOW_EXTENT = 10
const MAX_PIXEL_RATIO = 2

export const createOfficeScene = (options: IOfficeSceneOptions): IOfficeScene => {
  const { host, classes, onContextLost } = options
  const reg = createRegistry()
  const materials = createMaterials(reg)
  const room = toMetricRect(ROOM_RECT)
  const center = new THREE.Vector3(room.cx, 0, room.cz)

  // Бросает, если WebGL недоступен — вызывающий покажет 2D-план
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  renderer.domElement.className = classes.canvas
  host.append(renderer.domElement)

  const labelRenderer = new CSS2DRenderer()
  labelRenderer.domElement.className = classes.layer
  host.append(labelRenderer.domElement)

  const scene = new THREE.Scene()
  const background = new THREE.Color()
  scene.background = background

  const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.5, 120)

  const hemisphere = new THREE.HemisphereLight(
    new THREE.Color().setRGB(1, 1, 1),
    new THREE.Color().setRGB(0.55, 0.55, 0.6),
    1.6
  )
  scene.add(hemisphere)
  const sun = new THREE.DirectionalLight(new THREE.Color().setRGB(1, 1, 1), 1.8)
  sun.position.set(center.x + 6, 14, center.z + 8)
  sun.target.position.copy(center)
  sun.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE)
  sun.shadow.camera.left = -SHADOW_EXTENT
  sun.shadow.camera.right = SHADOW_EXTENT
  sun.shadow.camera.top = SHADOW_EXTENT
  sun.shadow.camera.bottom = -SHADOW_EXTENT
  sun.shadow.camera.near = 1
  sun.shadow.camera.far = 45
  sun.shadow.bias = -0.0005
  sun.shadow.normalBias = 0.02
  scene.add(sun, sun.target)

  scene.add(buildShell(reg, materials), buildDecor(reg, materials))
  const rigs: IOfficeSeatRig[] = OFFICE_DESKS.map((desk, index) => {
    const seat = OFFICE_SEATS.find(item => item.no === desk.seatNo)
    const rig = createSeatRig(reg, materials, desk, seat, classes, index)
    scene.add(rig.group)
    return rig
  })
  const rigBySeat = new Map(rigs.flatMap(rig => (rig.seatNo === undefined ? [] : [[rig.seatNo, rig] as const])))

  const controls = new OrbitControls(camera, host)
  controls.enableDamping = true
  controls.dampingFactor = DAMPING
  controls.maxPolarAngle = MAX_POLAR_ANGLE
  controls.minDistance = MIN_DISTANCE
  controls.maxDistance = MAX_DISTANCE
  controls.screenSpacePanning = false

  const applyTheme = (): void => {
    const palette = readPalette()
    applyPalette(materials, palette)
    background.copy(palette.bg)
  }
  applyTheme()

  let disposed = false
  let docVisible = !document.hidden
  let inView = true
  let frozen = false
  let reduced = false
  let viewTouched = false
  let rafId = 0
  let renderQueued = false
  let lastMs = 0
  let elapsedS = 0

  const isActive = (): boolean => !disposed && docVisible && inView
  const isContinuous = (): boolean => isActive() && !reduced && !frozen

  const draw = (): void => {
    renderer.render(scene, camera)
    labelRenderer.render(scene, camera)
  }

  const requestRender = (): void => {
    if (renderQueued || rafId !== 0 || !isActive()) return
    renderQueued = true
    requestAnimationFrame(() => {
      renderQueued = false
      if (isActive() && rafId === 0) draw()
    })
  }

  const frame = (nowMs: number): void => {
    rafId = 0
    if (!isContinuous()) return
    // После паузы дельта обрезается, иначе позы «прыгнут»
    const deltaS = Math.min(MAX_FRAME_S, Math.max(0, (nowMs - lastMs) / 1000))
    lastMs = nowMs
    elapsedS += deltaS
    rigs.forEach(rig => rig.update(elapsedS, deltaS, true))
    controls.update()
    draw()
    rafId = requestAnimationFrame(frame)
  }

  const syncLoop = (): void => {
    controls.enableDamping = !reduced
    if (isContinuous()) {
      if (rafId === 0) {
        lastMs = performance.now()
        rafId = requestAnimationFrame(frame)
      }
      return
    }
    if (rafId !== 0) {
      cancelAnimationFrame(rafId)
      rafId = 0
    }
    rigs.forEach(rig => rig.update(elapsedS, 0, false))
    requestRender()
  }

  // Подгон дистанции: вся комната (с высотой стен) в кадре при любом соотношении сторон
  const cameraDirection = (): THREE.Vector3 => (camera.aspect < 1 ? CAMERA_DIRECTION_NARROW : CAMERA_DIRECTION_WIDE)

  const fitDistance = (direction: THREE.Vector3): number => {
    const corners: THREE.Vector3[] = []
    ;[0, room.width].forEach(x => [0, FIT_HEIGHT].forEach(y => [0, room.depth].forEach(z => corners.push(new THREE.Vector3(x, y, z)))))
    const fits = (distance: number): boolean => {
      camera.position.copy(center).addScaledVector(direction, distance)
      camera.lookAt(center)
      camera.updateMatrixWorld()
      return corners.every(corner => {
        const ndc = corner.clone().project(camera)
        return Math.abs(ndc.x) <= FIT_MARGIN && Math.abs(ndc.y) <= FIT_MARGIN
      })
    }
    let low = MIN_DISTANCE
    let high = MAX_DISTANCE
    if (fits(low)) return low
    for (let i = 0; i < 24; i += 1) {
      const mid = (low + high) / 2
      if (fits(mid)) high = mid
      else low = mid
    }
    return high
  }

  const resetView = (): void => {
    viewTouched = false
    const direction = cameraDirection()
    const distance = fitDistance(direction)
    camera.position.copy(center).addScaledVector(direction, distance)
    controls.target.copy(center)
    camera.lookAt(center)
    controls.update()
    requestRender()
  }

  // Пан не уводит цель за пределы помещения; камера сдвигается на ту же дельту. controls.update() не зовём (рекурсия).
  const clampTarget = (): void => {
    const target = controls.target
    const x = Math.min(room.width, Math.max(0, target.x))
    const y = Math.min(1.5, Math.max(0, target.y))
    const z = Math.min(room.depth, Math.max(0, target.z))
    if (x === target.x && y === target.y && z === target.z) return
    camera.position.add(new THREE.Vector3(x - target.x, y - target.y, z - target.z))
    target.set(x, y, z)
  }
  controls.addEventListener('change', () => {
    clampTarget()
    requestRender()
  })
  controls.addEventListener('start', () => { viewTouched = true })

  const resize = (): void => {
    const width = host.clientWidth
    const height = host.clientHeight
    if (width === 0 || height === 0) return
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO))
    renderer.setSize(width, height, false)
    labelRenderer.setSize(width, height)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    // Тени дороги для телефонов: выключаем на узком экране
    sun.castShadow = width >= SHADOW_MIN_WIDTH
    if (!viewTouched) resetView()
    else requestRender()
  }

  const resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(host)
  const intersectionObserver = new IntersectionObserver(entries => {
    const last = entries[entries.length - 1]
    if (!last) return
    inView = last.isIntersecting
    syncLoop()
  })
  intersectionObserver.observe(host)
  const onVisibility = (): void => {
    docVisible = !document.hidden
    syncLoop()
  }
  document.addEventListener('visibilitychange', onVisibility)
  const themeObserver = new MutationObserver(() => {
    applyTheme()
    requestRender()
  })
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  const onLost = (event: Event): void => {
    event.preventDefault()
    onContextLost()
  }
  renderer.domElement.addEventListener('webglcontextlost', onLost)

  resize()
  syncLoop()

  return {
    setSeats: views => {
      const animate = isContinuous()
      views.forEach(view => rigBySeat.get(view.no)?.apply(view, animate))
      if (!animate) {
        rigs.forEach(rig => rig.update(elapsedS, 0, false))
        requestRender()
      }
    },
    setFrozen: next => {
      frozen = next
      syncLoop()
    },
    setReducedMotion: next => {
      reduced = next
      syncLoop()
    },
    resetView,
    dispose: () => {
      disposed = true
      if (rafId !== 0) cancelAnimationFrame(rafId)
      resizeObserver.disconnect()
      intersectionObserver.disconnect()
      themeObserver.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      renderer.domElement.removeEventListener('webglcontextlost', onLost)
      controls.dispose()
      reg.disposeAll()
      sun.shadow.map?.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
      renderer.domElement.remove()
      labelRenderer.domElement.remove()
    }
  }
}

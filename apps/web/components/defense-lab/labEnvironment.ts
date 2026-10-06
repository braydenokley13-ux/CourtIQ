import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/** Presentation units are metres; the analytical world is never derived from this geometry. */
export const COURT = { width: 15.24, length: 14.326, basketZ: 1.575, rimHeight: 3.048 }

export type LabEnvironmentQuality = 'high' | 'low'
export type LabAnalyticalStyle = 'porcelain' | 'spectral' | 'night'
export interface LabEnvironmentOptions { quality?: LabEnvironmentQuality }

// Floor footprint of the whole room (court sits inside, baseline at z = 0).
const ROOM = { x0: -11.3, x1: 11.3, z0: -4.0, z1: 21 }
const POOL = { x: 0, z: 4.4 } // centre of the baked light pool on the half court

function material(color: string, roughness = 0.75, metalness = 0.02) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness })
}
function box(parent: THREE.Object3D, size: [number, number, number], at: [number, number, number], mat: THREE.Material, shadows = false) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), mat)
  mesh.position.set(...at); mesh.castShadow = shadows; mesh.receiveShadow = true
  parent.add(mesh)
  return mesh
}
function tube(parent: THREE.Object3D, points: THREE.Vector3[], radius: number, mat: THREE.Material) {
  const curve = new THREE.CatmullRomCurve3(points)
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(2, points.length * 4), radius, 8, false), mat)
  parent.add(mesh)
  return mesh
}
function seeded(seed = 847) {
  return () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296 }
}

/** Collects boxes per material and emits one merged mesh per material (draw-call diet). */
class Batch {
  private groups = new Map<THREE.Material, THREE.BufferGeometry[]>()
  constructor(private cast = false) {}
  box(size: [number, number, number], at: [number, number, number], mat: THREE.Material, rotY = 0) {
    const g = new THREE.BoxGeometry(...size)
    if (rotY) g.rotateY(rotY)
    g.translate(...at)
    const list = this.groups.get(mat) ?? []; list.push(g); this.groups.set(mat, list)
    return this
  }
  flush(parent: THREE.Object3D, name: string) {
    const out: THREE.Mesh[] = []
    for (const [mat, list] of this.groups) {
      const mesh = new THREE.Mesh(mergeGeometries(list)!, mat)
      mesh.name = `${name}-${out.length}`; mesh.castShadow = this.cast; mesh.receiveShadow = true
      parent.add(mesh); out.push(mesh)
      for (const g of list) g.dispose()
    }
    this.groups.clear()
    return out
  }
}

/* ------------------------------------------------------------------------- *
 * Textures
 * ------------------------------------------------------------------------- */

const rgb = (r: number, g: number, b: number, a = 1) => `rgba(${r | 0},${g | 0},${b | 0},${a})`

/** Maple boards run baseline-to-baseline (canvas y). Board width is the real 2.25 in. */
function paintBoards(ctx: CanvasRenderingContext2D, W: number, H: number, ppm: number, tone: [number, number, number], contrast: number, rnd: () => number) {
  const bw = Math.max(3.2, 0.0572 * ppm)
  ctx.fillStyle = rgb(...tone); ctx.fillRect(0, 0, W, H)
  for (let x = 0; x < W; x += bw) {
    let y = -rnd() * ppm * 2.6
    while (y < H) {
      const len = ppm * (0.9 + rnd() * 1.7)
      const t = (rnd() - 0.5) * contrast, warm = (rnd() - 0.5) * 9
      ctx.fillStyle = rgb(tone[0] + t + warm, tone[1] + t, tone[2] + t - warm * 0.7)
      ctx.fillRect(x, y, bw, len + 0.5)
      // flat-sawn grain: a few wavering fibres per board
      const fibres = bw > 6 ? 3 : 2
      for (let k = 0; k < fibres; k++) {
        const gx = x + 0.7 + rnd() * (bw - 1.4)
        ctx.strokeStyle = rgb(78, 42, 16, 0.05 + rnd() * 0.09); ctx.lineWidth = 0.5 + rnd() * 0.5
        ctx.beginPath(); ctx.moveTo(gx, y)
        ctx.bezierCurveTo(gx + (rnd() - 0.5) * 1.4, y + len * 0.3, gx + (rnd() - 0.5) * 1.4, y + len * 0.7, gx + (rnd() - 0.5) * 0.8, y + len)
        ctx.stroke()
      }
      ctx.fillStyle = 'rgba(48,26,10,.34)'; ctx.fillRect(x, y, bw, 1.1) // butt joint
      y += len
    }
    ctx.fillStyle = 'rgba(58,32,14,.30)'; ctx.fillRect(x, 0, 1, H) // board seam
  }
}

/** Absolute-radius light pool so the court and apron textures meet seamlessly. */
function bakePool(ctx: CanvasRenderingContext2D, ppm: number, cx: number, cy: number, strength: number, tint = '2,3,7') {
  const stops: [number, number][] = [[0, 0], [3, 0.02], [6, 0.2], [9, 0.46], [13, 0.72], [19, 0.92]]
  const R = stops[stops.length - 1][0]
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * ppm)
  for (const [r, a] of stops) g.addColorStop(r / R, `rgba(${tint},${a * strength})`)
  ctx.fillStyle = g; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height)
}

interface MarkStyle { lane: string; line: string; lineW: number; laneAlpha: number; logo: string; hash: string }

function paintMarkings(ctx: CanvasRenderingContext2D, W: number, H: number, st: MarkStyle, logo: boolean) {
  const X = (x: number) => (x + COURT.width / 2) / COURT.width * W
  const Z = (z: number) => z / COURT.length * H
  ctx.save()
  ctx.globalAlpha = st.laneAlpha; ctx.fillStyle = st.lane
  ctx.fillRect(X(-1.8288), Z(0), X(1.8288) - X(-1.8288), Z(5.7912))
  ctx.beginPath(); ctx.arc(X(0), Z(5.7912), X(1.8288) - X(0), 0, Math.PI * 2); ctx.fill()
  ctx.globalAlpha = 1
  ctx.lineCap = 'butt'; ctx.lineJoin = 'miter'
  ctx.strokeStyle = st.line; ctx.lineWidth = st.lineW
  const line = (points: number[][]) => { ctx.beginPath(); points.forEach(([x, z], i) => i ? ctx.lineTo(X(x), Z(z)) : ctx.moveTo(X(x), Z(z))); ctx.stroke() }
  const arc = (x: number, z: number, r: number, start: number, end: number) => {
    ctx.beginPath()
    for (let i = 0; i <= 160; i++) {
      const a = start + (end - start) * i / 160
      if (i) ctx.lineTo(X(x + Math.cos(a) * r), Z(z + Math.sin(a) * r))
      else ctx.moveTo(X(x + Math.cos(a) * r), Z(z + Math.sin(a) * r))
    }
    ctx.stroke()
  }
  line([[-7.59, 0.03], [7.59, 0.03], [7.59, 14.296], [-7.59, 14.296], [-7.59, 0.03]])
  line([[-1.8288, 0], [-1.8288, 5.7912], [1.8288, 5.7912], [1.8288, 0]])
  arc(0, 5.7912, 1.8288, 0, Math.PI)
  ctx.setLineDash([st.lineW * 3, st.lineW * 2.4]); arc(0, 5.7912, 1.8288, Math.PI, Math.PI * 2); ctx.setLineDash([])
  arc(0, COURT.basketZ, 6.0198, 0, Math.PI)
  line([[-6.0198, 0], [-6.0198, COURT.basketZ]])
  line([[6.0198, 0], [6.0198, COURT.basketZ]])
  arc(0, COURT.basketZ, 1.25, 0, Math.PI) // restricted area
  line([[-0.9, 1.18 - 0.0], [0.9, 1.18]]) // backboard shadow line
  arc(0, COURT.length, 1.8288, Math.PI, Math.PI * 2)
  ctx.lineWidth = st.lineW * 0.55; ctx.strokeStyle = st.hash
  for (const x of [-1.8288, 1.8288]) for (const z of [2.15, 2.98, 3.81, 4.65]) line([[x, z], [x + (x < 0 ? -0.2 : 0.2), z]])
  if (logo) {
    // Subtle painted mark: ring + wordmark, no heavy centre logo to compete with players.
    ctx.strokeStyle = st.logo; ctx.lineWidth = st.lineW * 0.8
    ctx.beginPath(); ctx.arc(X(0), Z(5.7912), X(0.35) - X(0), 0, Math.PI * 2); ctx.stroke()
    ctx.save(); ctx.translate(X(0), Z(11.4)); ctx.fillStyle = st.logo; ctx.textAlign = 'center'
    ctx.font = `700 ${Math.round(W * 0.05)}px Arial`; ctx.fillText('COURTIQ', 0, 0)
    ctx.font = `500 ${Math.round(W * 0.01)}px Arial`; ctx.fillText('D E F E N S E   L A B', 0, W * 0.022); ctx.restore()
  }
  ctx.restore()
}

export interface CourtTextureOptions { /** 1 = 2048 px court, 0.5 = 1024 px (low quality). */ scale?: number; roughness?: boolean }

export function makeCourtTexture(markings = true, analytical = false, opts: CourtTextureOptions = {}): THREE.CanvasTexture {
  const s = opts.scale ?? 1
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(2048 * s); canvas.height = Math.round(1920 * s)
  const ctx = canvas.getContext('2d')!
  const rnd = seeded()
  const W = canvas.width, H = canvas.height, ppm = W / COURT.width
  if (analytical) {
    // Night analytical court: calm slate, crisp pale lines, gentle central lift so overlays read.
    ctx.fillStyle = '#0c1519'; ctx.fillRect(0, 0, W, H)
    const lift = ctx.createRadialGradient(W / 2, POOL.z * ppm, 0, W / 2, POOL.z * ppm, 11 * ppm)
    lift.addColorStop(0, 'rgba(70,110,112,.30)'); lift.addColorStop(0.6, 'rgba(40,70,76,.12)'); lift.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = lift; ctx.fillRect(0, 0, W, H)
    paintMarkings(ctx, W, H, { lane: '#1b3338', laneAlpha: 0.85, line: '#cfe0dc', lineW: Math.max(5, ppm * 0.055), logo: 'rgba(150,185,182,.10)', hash: '#9fb6b3' }, false)
    const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8
    return t
  }
  paintBoards(ctx, W, H, ppm, [192, 140, 84], 20, rnd)
  if (!opts.roughness) {
    if (markings) {
      paintMarkings(ctx, W, H, { lane: '#2e5558', laneAlpha: 0.9, line: '#f3ecd9', lineW: Math.max(5, ppm * 0.052), logo: 'rgba(243,236,217,.13)', hash: '#e8e0cb' }, true)
    }
    bakePool(ctx, ppm, W / 2 + POOL.x * ppm, POOL.z * ppm, 1)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8
  if (!markings) { texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(27 / COURT.width, 29 / COURT.length) }
  return texture
}

/** Roughness map (G channel): varnished wood is glossy, painted areas a touch duller. */
function makeCourtRoughness(scale: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas'); canvas.width = Math.round(1024 * scale); canvas.height = Math.round(960 * scale)
  const ctx = canvas.getContext('2d')!, rnd = seeded(5)
  const W = canvas.width, H = canvas.height
  ctx.fillStyle = '#707070'; ctx.fillRect(0, 0, W, H)
  for (let i = 0; i < 90; i++) { // faint wear/buff streaks following the boards
    ctx.fillStyle = `rgba(${rnd() > 0.5 ? 255 : 0},${rnd() > 0.5 ? 255 : 0},255,0.018)`
    ctx.fillRect(rnd() * W, 0, 2 + rnd() * 10, H)
  }
  paintMarkings(ctx, W, H, { lane: '#aaaaaa', laneAlpha: 1, line: '#b4b4b4', lineW: Math.max(3, W / COURT.width * 0.052), logo: '#9a9a9a', hash: '#a8a8a8' }, true)
  const t = new THREE.CanvasTexture(canvas); t.anisotropy = 4
  return t
}

function makeApronTexture(scale: number): THREE.CanvasTexture {
  const size = Math.round(2048 * scale)
  const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size
  const ctx = canvas.getContext('2d')!, rnd = seeded(91)
  const spanX = ROOM.x1 - ROOM.x0, spanZ = ROOM.z1 - ROOM.z0
  const ppmX = size / spanX, ppmZ = size / spanZ, ppm = (ppmX + ppmZ) / 2
  paintBoards(ctx, size, size, ppm, [138, 94, 56], 18, rnd)
  // dark out-of-bounds stain, then the shared light pool
  ctx.fillStyle = 'rgba(10,7,6,.5)'; ctx.fillRect(0, 0, size, size)
  ctx.save(); ctx.translate((POOL.x - ROOM.x0) * ppmX, (POOL.z - ROOM.z0) * ppmZ)
  ctx.scale(ppmX / ppm, ppmZ / ppm)
  const stops: [number, number][] = [[0, 0], [3, 0.02], [6, 0.2], [9, 0.46], [13, 0.72], [19, 0.92]]
  const R = stops[stops.length - 1][0]
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R * ppm)
  for (const [r, a] of stops) g.addColorStop(r / R, `rgba(2,3,7,${a})`)
  ctx.fillStyle = g; ctx.fillRect(-size * 2, -size * 2, size * 4, size * 4); ctx.restore()
  const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8
  return t
}

function makeBannerTexture(top: string, bottom: string, text: string, sub: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 512
  const ctx = canvas.getContext('2d')!
  const g = ctx.createLinearGradient(0, 0, 0, 512); g.addColorStop(0, top); g.addColorStop(1, bottom)
  ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 512)
  ctx.strokeStyle = 'rgba(243,236,217,.7)'; ctx.lineWidth = 6; ctx.strokeRect(14, 14, 228, 484)
  ctx.fillStyle = '#f3ecd9'; ctx.textAlign = 'center'
  ctx.font = '800 46px Arial'; ctx.fillText(text, 128, 250)
  ctx.font = '600 22px Arial'; ctx.fillText(sub, 128, 296)
  ctx.beginPath(); ctx.arc(128, 150, 44, 0, Math.PI * 2); ctx.lineWidth = 5; ctx.stroke()
  ctx.beginPath(); ctx.moveTo(84, 150); ctx.lineTo(172, 150); ctx.moveTo(128, 106); ctx.lineTo(128, 194); ctx.stroke()
  const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4
  return t
}

function makeGlowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 64
  const ctx = c.getContext('2d')!, g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  g.addColorStop(0, 'rgba(255,240,205,1)'); g.addColorStop(0.25, 'rgba(255,226,170,.45)'); g.addColorStop(1, 'rgba(255,220,160,0)')
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(c)
}

/* ------------------------------------------------------------------------- *
 * Image based lighting: a simple gym interior rendered once into a PMREM.
 * Bright ceiling banks (reflected by the floor clearcoat), dark walls, warm floor bounce.
 * ------------------------------------------------------------------------- */
function buildGymEnvScene(): THREE.Scene {
  const s = new THREE.Scene()
  const basic = (r: number, g: number, b: number, side: THREE.Side = THREE.FrontSide) => { const m = new THREE.MeshBasicMaterial({ side }); m.color.setRGB(r, g, b); return m }
  const shell = new THREE.Mesh(new THREE.BoxGeometry(70, 24, 70), basic(0.018, 0.02, 0.028, THREE.BackSide)); shell.position.y = 8; s.add(shell)
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(70, 70), basic(0.30, 0.17, 0.085)); floor.rotation.x = -Math.PI / 2; floor.position.y = -3; s.add(floor)
  const bank = basic(20, 18, 14)
  for (const z of [-30, -17, -4, 9, 22]) for (const x of [-13, 0, 13]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 1.0), bank); p.rotation.x = Math.PI / 2; p.position.set(x, 12, z); s.add(p)
  }
  const window_ = basic(0.9, 1.25, 1.7)
  for (const x of [-18, -6, 6, 18]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.4), window_); w.position.set(x, 6.5, -34.5); s.add(w) }
  for (const z of [-20, -5, 10, 25]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.4), window_); w.rotation.y = Math.PI / 2; w.position.set(-34.5, 6.5, z); s.add(w) }
  const warmWall = new THREE.Mesh(new THREE.PlaneGeometry(40, 6), basic(0.11, 0.07, 0.04)); warmWall.position.set(0, 1, 34.5); warmWall.rotation.y = Math.PI; s.add(warmWall)
  return s
}

/* ------------------------------------------------------------------------- *
 * The room
 * ------------------------------------------------------------------------- */

interface Tintable { material: THREE.Material; color: THREE.Color; emissive?: THREE.Color; emissiveIntensity?: number; opacity?: number }
interface AnalysisState {
  tintables: Tintable[]
  analyticalFloor: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
  key: THREE.SpotLight; hemi: THREE.HemisphereLight; rimA: THREE.DirectionalLight; rimB: THREE.DirectionalLight; fill: THREE.DirectionalLight
  base: { key: number; hemi: number; rimA: number; rimB: number; fill: number; envIntensity: number; background: THREE.Color; shadow: boolean }
  quality: LabEnvironmentQuality
}

export function buildLabEnvironment(scene: THREE.Scene, renderer: THREE.WebGLRenderer, software = false, onReady?: () => void, options: LabEnvironmentOptions = {}): THREE.Group {
  const quality: LabEnvironmentQuality = options.quality ?? (software ? 'low' : 'high')
  const hi = quality === 'high', texScale = hi ? 1 : 0.5
  const aniso = hi ? Math.min(16, renderer.capabilities.getMaxAnisotropy()) : Math.min(4, renderer.capabilities.getMaxAnisotropy())
  const env = new THREE.Group(); env.name = 'presentation-gym'; scene.add(env)
  const base = new THREE.Color('#07090d')
  scene.background = base.clone()
  scene.fog = new THREE.Fog('#07090d', 36, 78)

  // IBL from the custom gym interior
  const pmrem = new THREE.PMREMGenerator(renderer)
  const envScene = buildGymEnvScene()
  const envMap = pmrem.fromScene(envScene, 0.03)
  scene.environment = envMap.texture; scene.environmentIntensity = hi ? 0.75 : 0.7
  env.userData.environmentTarget = envMap
  envScene.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose() } })
  pmrem.dispose()

  const textures: THREE.Texture[] = []
  const track = <T extends THREE.Texture>(t: T, a = aniso) => { t.anisotropy = a; textures.push(t); return t }

  // Floors: apron (dark stained, extends to the walls) and the playing surface.
  const apronMap = track(makeApronTexture(texScale))
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.x1 - ROOM.x0, ROOM.z1 - ROOM.z0),
    hi ? new THREE.MeshPhysicalMaterial({ map: apronMap, roughness: 0.5, clearcoat: 0.5, clearcoatRoughness: 0.28 }) : new THREE.MeshStandardMaterial({ map: apronMap, roughness: 0.45, metalness: 0 }))
  apron.name = 'apron-floor'; apron.rotation.x = -Math.PI / 2; apron.position.set((ROOM.x0 + ROOM.x1) / 2, -0.004, (ROOM.z0 + ROOM.z1) / 2); apron.receiveShadow = true; env.add(apron)
  const courtMap = track(makeCourtTexture(true, false, { scale: texScale }))
  const courtRough = track(makeCourtRoughness(texScale), 4)
  const floorMat = hi
    ? new THREE.MeshPhysicalMaterial({ map: courtMap, roughnessMap: courtRough, roughness: 1, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.22, envMapIntensity: 0.85 })
    : new THREE.MeshStandardMaterial({ map: courtMap, roughnessMap: courtRough, roughness: 0.62, metalness: 0, envMapIntensity: 1.1 })
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(COURT.width, COURT.length), floorMat)
  floor.name = 'normal-court-floor'
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0.002, COURT.length / 2); floor.receiveShadow = true; env.add(floor)
  const analyticalMap = track(makeCourtTexture(true, true, { scale: texScale }))
  const analyticalFloor = new THREE.Mesh(new THREE.PlaneGeometry(COURT.width, COURT.length), new THREE.MeshBasicMaterial({ map: analyticalMap, toneMapped: false, transparent: true, opacity: 0, depthWrite: false }))
  analyticalFloor.name = 'analytical-court-floor'; analyticalFloor.rotation.x = -Math.PI / 2; analyticalFloor.position.set(0, .018, COURT.length / 2); analyticalFloor.visible = false; env.add(analyticalFloor)

  // Room shell, deliberately dark so the court and players pop.
  const wall = material('#2a2f38', 0.93), steel = material('#2b3236', 0.5, 0.5), trim = material('#171b21', 0.9)
  const shell = new Batch()
  shell.box([25, 6.1, 0.24], [0, 2.9, -4.2], wall)
  shell.box([0.24, 6.1, 27], [-11.4, 2.9, 7.0], wall)
  shell.box([0.24, 6.1, 27], [11.4, 2.9, 7.0], wall)
  for (const x of [-10.4, -4.5, 4.5, 10.4]) shell.box([0.18, 6, 0.3], [x, 3, -3.91], wall) // pilasters
  shell.box([25, 0.16, 0.2], [0, 6.0, -4.0], trim)
  shell.flush(env, 'shell')

  const padFallback = new THREE.Group(); env.add(padFallback)
  const pad = material('#17333a', 0.9)
  box(padFallback, [25, 1.4, 0.16], [0, 0.7, -4.02], pad)
  box(padFallback, [0.16, 1.4, 27], [-11.23, 0.7, 7.0], pad)
  box(padFallback, [0.16, 1.4, 27], [11.23, 0.7, 7.0], pad)

  // High clerestory windows (dim dusk-blue) and hanging banners fade into the dark.
  const glass = new THREE.MeshStandardMaterial({ color: '#1b2630', emissive: '#6f93b3', emissiveIntensity: 0.1, roughness: 0.3 })
  const windows = new Batch()
  for (let x = -9; x <= 9; x += 3) { windows.box([2.2, 1.1, 0.06], [x, 4.95, -4.06], glass); windows.box([0.05, 1.2, 0.1], [x + 1.5, 4.95, -4.0], steel) }
  windows.flush(env, 'windows')
  const bannerSpecs: [number, string, string, string, string][] = [
    [-6.2, '#1b4a50', '#0e2a30', 'DEFENSE', 'WINS GAMES'], [-0.6, '#4a2a22', '#26140f', 'HOME', 'COURT'], [5.0, '#1b4a50', '#0e2a30', 'STATE', 'READY']]
  const bannerMats: THREE.MeshStandardMaterial[] = []
  for (const [x, a, b, t, sub] of bannerSpecs) {
    const map = track(makeBannerTexture(a, b, t, sub), 4)
    const mat = new THREE.MeshStandardMaterial({ map, emissiveMap: map, emissive: '#ffffff', emissiveIntensity: 0.1, roughness: 0.9 })
    bannerMats.push(mat)
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 3), mat); m.position.set(x, 3.55, -4.04); env.add(m)
  }

  // Overhead light banks + trusses live in `overhead`, hidden by updateEnvironmentForCamera when the
  // camera is above them. Trusses stay outside the court footprint; no ceiling plane.
  const overhead = new THREE.Group(); overhead.name = 'overhead-fixtures'; env.add(overhead)
  const frame = new Batch()
  for (const z of [-3.5, 17.5]) frame.box([25, 0.16, 0.2], [0, 8.4, z], steel)
  for (const x of [-10, 10]) frame.box([0.14, 0.18, 22], [x, 8.55, 6.5], steel)
  const housing = material('#14181c', 0.55, 0.4)
  const lampMat = new THREE.MeshBasicMaterial({ toneMapped: false }); lampMat.color.setRGB(2.6, 2.4, 2.0)
  const lamps = new Batch(), glowTex = track(makeGlowTexture(), 1)
  const glowMat = new THREE.MeshBasicMaterial({ map: glowTex, color: '#ffe6b0', transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide })
  const glowGeos: THREE.BufferGeometry[] = []
  for (const z of [2.2, 8.6, 14.6]) for (const x of [-4.8, 0, 4.8]) {
    frame.box([2.5, 0.2, 0.62], [x, 7.75, z], housing)
    for (const dx of [-0.9, 0.9]) frame.box([0.03, 0.65, 0.03], [x + dx, 8.1, z], steel)
    lamps.box([2.3, 0.02, 0.48], [x, 7.64, z], lampMat)
    const g = new THREE.PlaneGeometry(6.5, 2.6); g.rotateX(Math.PI / 2); g.translate(x, 7.5, z); glowGeos.push(g)
  }
  const glow = new THREE.Mesh(mergeGeometries(glowGeos)!, glowMat); glow.renderOrder = 3; overhead.add(glow)
  for (const g of glowGeos) g.dispose()
  frame.flush(overhead, 'frame'); lamps.flush(overhead, 'lamps')
  env.userData.overhead = overhead

  // Bleachers (retracted) on both sidelines: dark stepped mass for depth.
  const bleachMat = material('#2c241d', 0.78), riser = material('#1a1f24', 0.6, 0.35)
  const bleach = new Batch()
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
    const h = 0.42 + i * 0.4, x = s * (9.75 + i * 0.5)
    bleach.box([0.5, h, 12.5], [x, h / 2, 6.6], bleachMat)
    bleach.box([0.04, h * 0.96, 12.5], [x - s * 0.24, h / 2, 6.6], riser)
  }
  bleach.flush(env, 'bleachers')

  const benchFallback = new THREE.Group(); env.add(benchFallback)
  const bench = material('#7d6648', 0.68)
  for (let i = 0; i < 3; i++) box(benchFallback, [8.5, 0.2, 0.72], [7.0, 0.37 + i * 0.34, -2.6 - i * 0.75], bench)
  for (const x of [3.4, 6, 8.7, 10.5]) box(benchFallback, [0.065, 1.02, 1.9], [x, 0.5, -3.1], steel)
  const basketFallback = new THREE.Group(); env.add(basketFallback); buildBasket(basketFallback, steel)

  // Lighting rig: one shadowed spot (hot spot + falloff), cheap sky/ground bounce, two rim lights.
  const hemi = new THREE.HemisphereLight('#8f9fc0', '#4a3626', hi ? 0.26 : 0.32); env.add(hemi)
  const key = new THREE.SpotLight('#fff0d4', 2.7, 0, 0.62, 1, 0)
  key.position.set(-2.5, 14, 4.5); key.target.position.set(0, 0, 5.4)
  const shadowOn = hi
  key.castShadow = shadowOn
  const shadowSize = software ? 1024 : 2048
  key.shadow.mapSize.set(shadowSize, shadowSize)
  key.shadow.camera.near = 6; key.shadow.camera.far = 30; key.shadow.bias = -0.00025; key.shadow.normalBias = 0.03; key.shadow.radius = 3
  env.add(key, key.target)
  const rimA = new THREE.DirectionalLight('#9ec3ff', hi ? 0.95 : 0.8); rimA.position.set(7, 11, -9); rimA.target.position.set(0, 1, 6)
  const rimB = new THREE.DirectionalLight('#ffb987', hi ? 0.55 : 0.5); rimB.position.set(-9, 11, -8); rimB.target.position.set(0, 1, 6)
  const fill = new THREE.DirectionalLight('#c9d6ee', hi ? 0.28 : 0.3); fill.position.set(8, 9, 16); fill.target.position.set(0, 0.5, 5)
  env.add(rimA, rimA.target, rimB, rimB.target, fill, fill.target)

  const tintables: Tintable[] = []
  const register = (mat: THREE.Material) => {
    if (tintables.some(t => t.material === mat)) return
    const m = mat as THREE.MeshStandardMaterial & THREE.SpriteMaterial
    if (!m.color) return
    tintables.push({ material: mat, color: m.color.clone(), emissive: (m as THREE.MeshStandardMaterial).emissive?.clone(), emissiveIntensity: (m as THREE.MeshStandardMaterial).emissiveIntensity, opacity: (mat as THREE.SpriteMaterial).isSpriteMaterial ? mat.opacity : undefined })
  }
  const registerTree = (root: THREE.Object3D) => root.traverse(o => { const m = (o as THREE.Mesh).material; for (const mat of Array.isArray(m) ? m : m ? [m] : []) if ((mat as THREE.MeshStandardMaterial).isMeshStandardMaterial || (mat as THREE.MeshBasicMaterial).isMeshBasicMaterial || (mat as THREE.SpriteMaterial).isSpriteMaterial) { if (mat !== analyticalFloor.material && mat !== apron.material && mat !== floorMat) register(mat) } })
  registerTree(env)
  // Floors keep their (baked) albedo but darken in analytical mode through colour multiply.
  for (const m of [apron.material, floorMat]) register(m)
  const state: AnalysisState = { tintables, analyticalFloor, key, hemi, rimA, rimB, fill, quality,
    base: { key: key.intensity, hemi: hemi.intensity, rimA: rimA.intensity, rimB: rimB.intensity, fill: fill.intensity, envIntensity: scene.environmentIntensity, background: base.clone(), shadow: shadowOn } }
  env.userData.analysisState = state
  env.userData.quality = quality
  env.userData.textures = textures

  const tuneAuthored = (mesh: THREE.Mesh) => {
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const m of mats) {
      const std = m as THREE.MeshStandardMaterial
      if (!std.isMeshStandardMaterial) continue
      if (/tempered glass/i.test(std.name)) { std.color.set('#d4eaf2'); std.opacity = 0.3; std.roughness = 0.06; std.metalness = 0; std.envMapIntensity = 3.2 }
      else if (/graphite/i.test(std.name)) { std.color.multiplyScalar(2.6); std.roughness = 0.42; std.metalness = 0.25 }
      else if (/petrol/i.test(std.name)) { std.color.multiplyScalar(2.2) }
      else if (/ivory/i.test(std.name)) { std.emissive.set('#fff7e0'); std.emissiveIntensity = 0.06 }
    }
  }
  const addAuthored = (url: string, fallback: THREE.Group, placements: { x: number; z: number; yaw?: number }[]) => {
    void loadEnvironmentAsset(url).then(source => {
      if (env.userData.disposed) return
      for (const placement of placements) {
        const asset = source.clone(true)
        asset.position.set(placement.x, 0, placement.z); asset.rotation.y = placement.yaw ?? 0
        asset.traverse(o => {
          const mesh = o as THREE.Mesh; if (!mesh.isMesh) return
          mesh.geometry = mesh.geometry.clone(); mesh.castShadow = !(Array.isArray(mesh.material) ? mesh.material : [mesh.material]).some(m => m.transparent || /tempered glass/i.test(m.name)); mesh.receiveShadow = true
          const own = (m: THREE.Material) => m.clone()
          mesh.material = Array.isArray(mesh.material) ? mesh.material.map(own) : own(mesh.material)
          tuneAuthored(mesh)
        })
        env.add(asset); registerTree(asset)
      }
      fallback.visible = false; onReady?.()
    }).catch(() => { /* The cold/offline fallback stays basketball-legible. */ })
  }
  addAuthored('/environment/courtiq-hoop.glb', basketFallback, [{ x: 0, z: 0 }])
  addAuthored('/environment/courtiq-bench.glb', benchFallback, [{ x: 5.2, z: -2.8 }, { x: 8.7, z: -2.8 }])
  void loadEnvironmentAsset('/environment/courtiq-wall-pad.glb').then(source => {
    if (env.userData.disposed) return
    source.updateMatrixWorld(true)
    let original: THREE.Mesh | undefined; source.traverse(o => { if (!original && (o as THREE.Mesh).isMesh) original = o as THREE.Mesh })
    if (!original) return
    const geometry = original.geometry.clone().applyMatrix4(original.matrixWorld), material = (Array.isArray(original.material) ? original.material[0] : original.material).clone() as THREE.MeshStandardMaterial
    material.color.multiplyScalar(1.15); register(material)
    const placements: { x: number; z: number; yaw: number }[] = []
    for (let x = -12; x <= 12; x += .95) placements.push({ x, z: -3.94, yaw: 0 })
    for (let z = -3.5; z < 20; z += .95) placements.push({ x: -11.23, z, yaw: Math.PI / 2 })
    for (let z = -3.5; z < 20; z += .95) placements.push({ x: 11.23, z, yaw: -Math.PI / 2 })
    const pads = new THREE.InstancedMesh(geometry, material, placements.length), transform = new THREE.Object3D()
    for (let i = 0; i < placements.length; i++) { const p = placements[i]; transform.position.set(p.x, 0, p.z); transform.rotation.y = p.yaw; transform.updateMatrix(); pads.setMatrixAt(i, transform.matrix) }
    pads.receiveShadow = true; env.add(pads); padFallback.visible = false; onReady?.()
  }).catch(() => {})
  void bannerMats
  return env
}

const environmentAssets = new Map<string, Promise<THREE.Group>>()
function loadEnvironmentAsset(url: string) {
  let load = environmentAssets.get(url)
  if (!load) { load = new GLTFLoader().loadAsync(url).then(gltf => gltf.scene); environmentAssets.set(url, load) }
  return load
}

/**
 * Reversible art-direction state. No positions or analytics are changed.
 * 'porcelain' and 'night' are the same dark, calm look (the default analytical style);
 * 'spectral' is a cooler teal-black variant.
 */
export function setLabEnvironmentAnalytical(env: THREE.Group, amount: number, style: LabAnalyticalStyle) {
  const state = env.userData.analysisState as AnalysisState | undefined
  if (!state) return
  amount = Math.min(1, Math.max(0, amount))
  const scene = env.parent as THREE.Scene
  const spectral = style === 'spectral'
  const bg = new THREE.Color(spectral ? '#041318' : '#05080b')
  if (scene.background instanceof THREE.Color) scene.background.copy(state.base.background).lerp(bg, amount)
  if (scene.fog instanceof THREE.Fog) scene.fog.color.copy(scene.background as THREE.Color)
  scene.environmentIntensity = state.base.envIntensity * (1 - amount * 0.5) // keeps athletes shaded for overlays
  const dark = new THREE.Color(spectral ? '#0a1a1f' : '#090e12')
  for (const t of state.tintables) {
    const m = t.material as THREE.MeshStandardMaterial
    m.color.copy(t.color).lerp(dark, amount * 0.97)
    if (t.emissive && m.emissive) m.emissiveIntensity = (t.emissiveIntensity ?? 0) * (1 - amount * 0.92)
    if (t.opacity !== undefined) m.opacity = t.opacity * (1 - amount)
  }
  state.analyticalFloor.visible = amount > .001; state.analyticalFloor.material.opacity = amount
  state.analyticalFloor.material.color.set(spectral ? '#bfeaf0' : '#ffffff')
  state.key.intensity = state.base.key * (1 - amount * 0.88)
  state.hemi.intensity = state.base.hemi * (1 + amount * 1.2)
  state.rimA.intensity = state.base.rimA * (1 + amount * 0.4) // rim keeps silhouettes crisp on the dark slate
  state.rimB.intensity = state.base.rimB * (1 - amount * 0.3)
  state.fill.intensity = state.base.fill * (1 + amount * 0.8)
}


function buildBasket(env: THREE.Group, steel: THREE.Material) {
  const orange = material('#c85b2c', 0.34), white = material('#f6f3e8', 0.8)
  box(env, [0.28, 3.2, 0.36], [0, 1.6, -0.9], steel, true)
  box(env, [0.6, 1.7, 0.55], [0, 0.88, -0.88], material('#274d4b', 0.92))
  tube(env, [new THREE.Vector3(0, 2.9, -0.9), new THREE.Vector3(0, 3.6, 0.7), new THREE.Vector3(0, 3.45, 1.15)], 0.07, steel)
  const backboard = new THREE.Mesh(new THREE.BoxGeometry(1.8288, 1.0668, 0.045), new THREE.MeshPhysicalMaterial({ color: '#d6e3dc', roughness: 0.12, transmission: 0.0, transparent: true, opacity: 0.38, metalness: 0.05 }))
  backboard.position.set(0, 3.58, 1.18); env.add(backboard)
  for (const [w, h, x, y] of [[1.87, 0.035, 0, 4.13], [1.87, 0.035, 0, 3.03], [0.035, 1.13, -0.935, 3.58], [0.035, 1.13, 0.935, 3.58], [0.59, 0.022, 0, 3.49], [0.59, 0.022, 0, 3.05], [0.022, 0.46, -0.295, 3.27], [0.022, 0.46, 0.295, 3.27]]) box(env, [w, h, 0.04], [x, y, 1.21], white)
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.2286, 0.012, 8, 48), orange)
  rim.rotation.x = Math.PI / 2; rim.position.set(0, COURT.rimHeight, COURT.basketZ); rim.castShadow = true; env.add(rim)
  box(env, [0.15, 0.055, 0.2], [0, 3.05, 1.29], orange)
  const net = new THREE.LineBasicMaterial({ color: '#f2f0e6', transparent: true, opacity: 0.8 })
  const pts: THREE.Vector3[] = []
  for (let i = 0; i < 14; i++) {
    const a = i / 14 * Math.PI * 2, next = (i + 1) / 14 * Math.PI * 2
    pts.push(new THREE.Vector3(Math.cos(a) * 0.225, 3.04, COURT.basketZ + Math.sin(a) * 0.225), new THREE.Vector3(Math.cos(next) * 0.14, 2.65, COURT.basketZ + Math.sin(next) * 0.14))
    pts.push(new THREE.Vector3(Math.cos(next) * 0.225, 3.04, COURT.basketZ + Math.sin(next) * 0.225), new THREE.Vector3(Math.cos(a) * 0.14, 2.65, COURT.basketZ + Math.sin(a) * 0.14))
  }
  env.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), net))
}

export function buildBall(): THREE.Group {
  const root = new THREE.Group()
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 256
  const ctx = canvas.getContext('2d')!, rnd = seeded(39)
  ctx.fillStyle = '#b96228'; ctx.fillRect(0, 0, 512, 256)
  for (let i = 0; i < 13000; i++) { ctx.fillStyle = i % 2 ? '#c76d30' : '#a95521'; ctx.fillRect(rnd() * 512, rnd() * 256, 1.3, 1.3) }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.119, 28, 20), new THREE.MeshStandardMaterial({ map: texture, roughness: 0.88, metalness: 0 }))
  body.castShadow = true; root.add(body)
  const seamMat = material('#352b22', 0.95)
  for (let i = 0; i < 3; i++) {
    const seam = new THREE.Mesh(new THREE.TorusGeometry(0.119, 0.0023, 4, 48), seamMat)
    if (i === 1) seam.rotation.x = Math.PI / 2
    if (i === 2) seam.rotation.y = Math.PI / 2
    root.add(seam)
  }
  return root
}

/** Dispose only renderer-owned objects; source GLTF remains cached for other lab mounts. */
export function disposeTree(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>()
  root.traverse(object => {
    const mesh = object as THREE.Mesh
    if (mesh.geometry) geometries.add(mesh.geometry)
    const mats = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : []
    for (const mat of mats) {
      materials.add(mat)
      for (const value of Object.values(mat)) if (value instanceof THREE.Texture) textures.add(value)
    }
    const skeleton = (mesh as THREE.SkinnedMesh).skeleton
    if (skeleton) skeleton.dispose()
  })
  for (const geometry of geometries) geometry.dispose()
  for (const texture of textures) texture.dispose()
  for (const mat of materials) mat.dispose()
}

/**
 * Call each frame (cheap). Hides the overhead light banks / trusses whenever the camera is at or above
 * them so elevated broadcast / top-down cameras never see beams across the court.
 */
export function updateEnvironmentForCamera(env: THREE.Group, camera: THREE.Camera) {
  const overhead = env.userData.overhead as THREE.Object3D | undefined
  if (overhead) overhead.visible = camera.position.y < 6.6
}

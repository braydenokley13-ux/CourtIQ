import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

/** Presentation units are metres; the analytical world is never derived from this geometry. */
export const COURT = { width: 15.24, length: 14.326, basketZ: 1.575, rimHeight: 3.048 }

function material(color: string, roughness = 0.75) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.02 })
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

export function makeCourtTexture(markings = true, analytical = false): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 2048; canvas.height = 1920
  const ctx = canvas.getContext('2d')!
  const rnd = seeded()
  const W = canvas.width, H = canvas.height
  const X = (x: number) => (x + COURT.width / 2) / COURT.width * W
  const Z = (z: number) => z / COURT.length * H
  ctx.fillStyle = analytical ? '#e8efec' : '#bf915a'; ctx.fillRect(0, 0, W, H)
  for (let y = 0; !analytical && y < H; y += 25) {
    for (let x = -rnd() * 400; x < W;) {
      const w = 260 + rnd() * 340, tint = Math.floor(rnd() * 10)
      ctx.fillStyle = `rgb(${173 + tint}, ${125 + tint}, ${73 + tint})`
      ctx.fillRect(x, y, w - 0.9, 24.3)
      for (let grain = 0; grain < 7; grain++) {
        ctx.strokeStyle = `rgba(94,55,25,${0.028 + rnd() * 0.024})`; ctx.lineWidth = 0.7
        ctx.beginPath(); ctx.moveTo(x, y + grain * 3.4)
        ctx.bezierCurveTo(x + w * 0.3, y + grain * 3.4 + rnd() * 3, x + w * 0.6, y + grain * 3.4 - rnd() * 3, x + w, y + grain * 3.4)
        ctx.stroke()
      }
      x += w
    }
  }
  if (!markings) {
    const wood = new THREE.CanvasTexture(canvas); wood.colorSpace = THREE.SRGBColorSpace; wood.anisotropy = 8
    wood.wrapS = wood.wrapT = THREE.RepeatWrapping; wood.repeat.set(27 / COURT.width, 29 / COURT.length)
    return wood
  }
  // High school markings: 12-foot lane, 19'9 three, 15-foot foul line.
  ctx.fillStyle = analytical ? '#d4e3df' : '#38575b'; ctx.fillRect(X(-1.8288), Z(0), X(1.8288) - X(-1.8288), Z(5.7912))
  ctx.strokeStyle = analytical ? '#8da9a3' : '#f4eddb'; ctx.lineWidth = 6
  const line = (points: number[][]) => { ctx.beginPath(); points.forEach(([x, z], i) => i ? ctx.lineTo(X(x), Z(z)) : ctx.moveTo(X(x), Z(z))); ctx.stroke() }
  const arc = (x: number, z: number, r: number, start: number, end: number) => {
    ctx.beginPath()
    for (let i = 0; i <= 150; i++) {
      const a = start + (end - start) * i / 150
      if (i) ctx.lineTo(X(x + Math.cos(a) * r), Z(z + Math.sin(a) * r))
      else ctx.moveTo(X(x + Math.cos(a) * r), Z(z + Math.sin(a) * r))
    }
    ctx.stroke()
  }
  line([[-7.59, 0.03], [7.59, 0.03], [7.59, 14.296], [-7.59, 14.296], [-7.59, 0.03]])
  line([[-1.8288, 0], [-1.8288, 5.7912], [1.8288, 5.7912], [1.8288, 0]])
  arc(0, 5.7912, 1.8288, 0, Math.PI)
  ctx.setLineDash([17, 14]); arc(0, 5.7912, 1.8288, Math.PI, Math.PI * 2); ctx.setLineDash([])
  arc(0, COURT.basketZ, 6.0198, 0, Math.PI)
  line([[-6.0198, 0], [-6.0198, COURT.basketZ]])
  line([[6.0198, 0], [6.0198, COURT.basketZ]])
  arc(0, COURT.length, 1.8288, Math.PI, Math.PI * 2)
  ctx.lineWidth = 3
  for (const x of [-1.8288, 1.8288]) for (const z of [2.15, 2.98, 3.81, 4.65]) line([[x, z], [x + (x < 0 ? -0.2 : 0.2), z]])
  // Deliberately subdued brand; court lines remain the main visual structure.
  ctx.save(); ctx.translate(X(0), Z(11.2)); ctx.fillStyle = 'rgba(34,65,64,.14)'; ctx.textAlign = 'center'
  ctx.font = '700 155px Arial'; ctx.fillText('COURTIQ', 0, 0)
  ctx.font = '500 24px Arial'; ctx.fillText('D E F E N S E   L A B', 0, 58); ctx.restore()
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8
  return texture
}

export function buildLabEnvironment(scene: THREE.Scene, renderer: THREE.WebGLRenderer, software = false, onReady?: () => void): THREE.Group {
  const env = new THREE.Group(); env.name = 'presentation-gym'; scene.add(env)
  scene.background = new THREE.Color('#dedbd1')
  scene.fog = new THREE.Fog('#dedbd1', 46, 88)
  const pmrem = new THREE.PMREMGenerator(renderer)
  const room = new RoomEnvironment()
  const envMap = pmrem.fromScene(room, 0.025)
  scene.environment = envMap.texture; scene.environmentIntensity = 0.55
  env.userData.environmentTarget = envMap
  room.dispose(); pmrem.dispose()
  const surround = material('#b58c5f', 0.48), wall = material('#d6d0bd', 0.91), steel = material('#343f40', 0.54)
  box(env, [27, 0.28, 29], [0, -0.21, 6.5], surround)
  const outerFloor = new THREE.Mesh(new THREE.PlaneGeometry(27, 29), new THREE.MeshPhysicalMaterial({ map: makeCourtTexture(false), roughness: 0.3, clearcoat: 0.55, clearcoatRoughness: 0.24 }))
  outerFloor.rotation.x = -Math.PI / 2; outerFloor.position.set(0, -0.004, 6.5); outerFloor.receiveShadow = true; env.add(outerFloor)
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(COURT.width, COURT.length), new THREE.MeshPhysicalMaterial({ map: makeCourtTexture(), roughness: 0.25, metalness: 0.0, clearcoat: 0.65, clearcoatRoughness: 0.22 }))
  floor.name = 'normal-court-floor'
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0.002, COURT.length / 2); floor.receiveShadow = true; env.add(floor)
  const analyticalFloor = new THREE.Mesh(new THREE.PlaneGeometry(COURT.width, COURT.length), new THREE.MeshBasicMaterial({ map: makeCourtTexture(true, true), toneMapped: false, transparent: true, opacity: 0, depthWrite: false }))
  analyticalFloor.name = 'analytical-court-floor'; analyticalFloor.rotation.x = -Math.PI / 2; analyticalFloor.position.set(0, .018, COURT.length / 2); analyticalFloor.visible = false; env.add(analyticalFloor)
  box(env, [25, 6.1, 0.24], [0, 2.9, -4.2], wall)
  box(env, [0.24, 6.1, 27], [-11.4, 2.9, 7.0], wall)
  const padFallback = new THREE.Group(); env.add(padFallback)
  const pad = material('#263f43', 0.88)
  box(padFallback, [25, 1.4, 0.16], [0, 0.7, -4.02], pad)
  box(padFallback, [0.16, 1.4, 27], [-11.23, 0.7, 7.0], pad)
  // Individually sewn wall pads and masonry courses keep the room physically scaled.
  const seam = material('#1c3035', 0.95)
  for (let x = -12; x < 12; x += 0.95) box(padFallback, [0.018, 1.37, 0.025], [x, 0.7, -3.925], seam)
  for (let z = -3.5; z < 20; z += 0.95) box(padFallback, [0.025, 1.37, 0.018], [-11.135, 0.7, z], seam)
  const mortar = material('#c6c1b1', 1)
  for (let y = 1.65; y < 6; y += 0.4) box(env, [25, 0.008, 0.01], [0, y, -4.065], mortar)
  for (const x of [-10.4, -4.5, 4.5, 10.4]) box(env, [0.18, 6, 0.3], [x, 3, -3.91], wall)
  // Equipment belongs at the room edge, leaving every teaching angle unobstructed.
  box(env, [1.35, 2.18, 0.045], [-7.2, 1.1, -3.9], material('#a6a496', 0.8))
  box(env, [0.09, 0.22, 0.06], [-6.71, 1.05, -3.855], steel)
  const glass = new THREE.MeshStandardMaterial({ color: '#e0ecee', emissive: '#e4f0f4', emissiveIntensity: 0.32, roughness: 0.25 })
  for (let x = -9; x <= 9; x += 3) {
    box(env, [2.5, 2.0, 0.08], [x, 4.45, -4.04], glass)
    box(env, [0.05, 2.1, 0.12], [x, 4.45, -3.97], steel)
  }
  // Slim architectural rafters, no ceiling plane that hides overhead teaching view.
  for (const z of [-3.5]) {
    box(env, [25, 0.14, 0.18], [0, 6.35, z], steel)
    for (const x of [-6.5, 0, 6.5]) {
      box(env, [1.25, 0.13, 0.34], [x, 6.13, z], steel)
      box(env, [1.16, 0.02, 0.29], [x, 6.05, z], new THREE.MeshStandardMaterial({ color: '#f8f4df', emissive: '#fff5d4', emissiveIntensity: 1.5 }))
    }
  }
  // Quiet bleacher seating provides depth without crowds or stadium distraction.
  const benchFallback = new THREE.Group(); env.add(benchFallback)
  const bench = material('#a58b67', 0.68)
  for (let i = 0; i < 3; i++) box(benchFallback, [8.5, 0.2, 0.72], [7.0, 0.37 + i * 0.34, -2.6 - i * 0.75], bench)
  for (const x of [3.4, 6, 8.7, 10.5]) box(benchFallback, [0.065, 1.02, 1.9], [x, 0.5, -3.1], steel)
  // Long window reflections are painted illumination only, not analytical geometry.
  const lightTexture = document.createElement('canvas'); lightTexture.width = 64; lightTexture.height = 64
  const lc = lightTexture.getContext('2d')!, gradient = lc.createLinearGradient(0, 0, 0, 64)
  gradient.addColorStop(0, 'rgba(255,244,209,0)'); gradient.addColorStop(0.3, 'rgba(255,244,209,.15)'); gradient.addColorStop(1, 'rgba(255,244,209,0)')
  lc.fillStyle = gradient; lc.fillRect(0, 0, 64, 64)
  const wash = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(lightTexture), transparent: true, depthWrite: false, opacity: 0.5 })
  for (let x = -9; x <= 9; x += 3) {
    const light = new THREE.Mesh(new THREE.PlaneGeometry(2.25, 8), wash)
    light.rotation.x = -Math.PI / 2; light.rotation.z = -0.35; light.position.set(x + 2, 0.009, 3); env.add(light)
  }
  const basketFallback = new THREE.Group(); env.add(basketFallback); buildBasket(basketFallback, steel)
  const hemi = new THREE.HemisphereLight('#f7efdf', '#82796a', 1.15); scene.add(hemi)
  const key = new THREE.DirectionalLight('#fff0d1', 3.2); key.position.set(-5, 12, -1); key.target.position.set(0, 0, 5)
  key.castShadow = true; key.shadow.mapSize.set(software ? 1024 : 2048, software ? 1024 : 2048)
  key.shadow.camera.left = -12; key.shadow.camera.right = 12; key.shadow.camera.top = 14; key.shadow.camera.bottom = -10
  key.shadow.camera.near = 1; key.shadow.camera.far = 45; key.shadow.bias = -0.00015; key.shadow.normalBias = 0.025
  scene.add(key, key.target)
  const fill = new THREE.DirectionalLight('#dbe9f1', 0.78); fill.position.set(-8, 8, -2); scene.add(fill)
  const materials = new Map<THREE.MeshStandardMaterial, THREE.Color>()
  env.traverse(o => { const m = (o as THREE.Mesh).material; for (const mat of Array.isArray(m) ? m : m ? [m] : []) if ((mat as THREE.MeshStandardMaterial).isMeshStandardMaterial) materials.set(mat as THREE.MeshStandardMaterial, (mat as THREE.MeshStandardMaterial).color.clone()) })
  env.userData.analysisState = { materials, analyticalFloor, key, hemi, fill }
  const addAuthored = (url: string, fallback: THREE.Group, placements: { x: number; z: number; yaw?: number }[]) => {
    void loadEnvironmentAsset(url).then(source => {
      if (env.userData.disposed) return
      for (const placement of placements) {
        const asset = source.clone(true)
        asset.position.set(placement.x, 0, placement.z); asset.rotation.y = placement.yaw ?? 0
        asset.traverse(o => {
          const mesh = o as THREE.Mesh; if (!mesh.isMesh) return
          mesh.geometry = mesh.geometry.clone(); mesh.castShadow = !(Array.isArray(mesh.material) ? mesh.material : [mesh.material]).some(m => m.transparent || /tempered glass/i.test(m.name)); mesh.receiveShadow = true
          const own = (m: THREE.Material) => { const copy = m.clone(); if ((copy as THREE.MeshStandardMaterial).isMeshStandardMaterial) materials.set(copy as THREE.MeshStandardMaterial, (copy as THREE.MeshStandardMaterial).color.clone()); return copy }
          mesh.material = Array.isArray(mesh.material) ? mesh.material.map(own) : own(mesh.material)
        })
        env.add(asset)
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
    materials.set(material, material.color.clone())
    const placements: { x: number; z: number; yaw: number }[] = []
    for (let x = -12; x <= 12; x += .95) placements.push({ x, z: -3.94, yaw: 0 })
    for (let z = -3.5; z < 20; z += .95) placements.push({ x: -11.23, z, yaw: Math.PI / 2 })
    const pads = new THREE.InstancedMesh(geometry, material, placements.length), transform = new THREE.Object3D()
    for (let i = 0; i < placements.length; i++) { const p = placements[i]; transform.position.set(p.x, 0, p.z); transform.rotation.y = p.yaw; transform.updateMatrix(); pads.setMatrixAt(i, transform.matrix) }
    pads.receiveShadow = true; env.add(pads); padFallback.visible = false; onReady?.()
  }).catch(() => {})
  return env
}

const environmentAssets = new Map<string, Promise<THREE.Group>>()
function loadEnvironmentAsset(url: string) {
  let load = environmentAssets.get(url)
  if (!load) { load = new GLTFLoader().loadAsync(url).then(gltf => gltf.scene); environmentAssets.set(url, load) }
  return load
}

/** Reversible art-direction state. No positions or analytics are changed. */
export function setLabEnvironmentAnalytical(env: THREE.Group, amount: number, style: 'porcelain' | 'spectral') {
  const state = env.userData.analysisState as { materials: Map<THREE.MeshStandardMaterial, THREE.Color>; analyticalFloor: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>; key: THREE.DirectionalLight; hemi: THREE.HemisphereLight; fill: THREE.DirectionalLight }
  if (!state) return
  const scene = env.parent as THREE.Scene
  if (scene.background instanceof THREE.Color) scene.background.set('#dedbd1').lerp(new THREE.Color(style === 'porcelain' ? '#edf2ee' : '#d7e4e7'), amount)
  if (scene.fog instanceof THREE.Fog) scene.fog.color.copy(scene.background as THREE.Color)
  const wash = new THREE.Color(style === 'porcelain' ? '#e5ece7' : '#b4ccd0')
  for (const [material, original] of state.materials) material.color.copy(original).lerp(wash, amount * .86)
  state.analyticalFloor.visible = amount > .001; state.analyticalFloor.material.opacity = amount
  state.analyticalFloor.material.color.set(style === 'porcelain' ? '#ffffff' : '#c4dcdf')
  state.key.intensity = 3.2 - amount * 2.25
  state.hemi.intensity = 1.15 + amount * .5
  state.fill.intensity = .78 - amount * .38
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

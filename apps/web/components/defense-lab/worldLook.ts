import * as THREE from 'three'

export type WorldQuality = 'high' | 'balanced' | 'low'

/**
 * Renderer settings for the "Normal World" look. Call once, right after creating the
 * WebGLRenderer (it replaces the tone mapping / shadow lines in LabWorld).
 *
 * - Khronos PBR Neutral tone mapping keeps maple honey-gold instead of ACES' orange/grey shift.
 * - `shadowMap.autoUpdate` is intentionally left to the caller: the world re-bakes shadows
 *   (`renderer.shadowMap.needsUpdate = true`) only when athletes move.
 * - 'low' keeps the shadow map enabled (so the world can flip it on) but the environment
 *   build disables the key light's casting; contact shadows carry grounding.
 */
export function configureWorldRenderer(renderer: THREE.WebGLRenderer, quality: WorldQuality): void {
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.NeutralToneMapping
  renderer.toneMappingExposure = quality === 'low' ? 0.92 : 0.94
  renderer.shadowMap.enabled = true
  // PCFSoftShadowMap is deprecated in r184; PCFShadowMap already filters.
  renderer.shadowMap.type = THREE.PCFShadowMap
  renderer.setClearColor('#07090d', 1)
}

let blobTexture: THREE.CanvasTexture | null = null
let blobGeometry: THREE.PlaneGeometry | null = null
function getBlobTexture() {
  if (blobTexture) return blobTexture
  const size = 128, canvas = document.createElement('canvas'); canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  // tight dark core (feet) inside a long soft skirt
  g.addColorStop(0, 'rgba(0,0,0,0.95)'); g.addColorStop(0.28, 'rgba(0,0,0,0.62)')
  g.addColorStop(0.6, 'rgba(0,0,0,0.20)'); g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size)
  blobTexture = new THREE.CanvasTexture(canvas)
  blobTexture.colorSpace = THREE.SRGBColorSpace
  return blobTexture
}

/**
 * Cheap grounded contact shadow: one transparent quad with a radial falloff.
 * Add it as a child of the athlete root (so it follows x/z, not the figure's bob/rotation):
 *   `athlete.root.add(createContactShadow())`
 * It sits at y = 0.012 above the court (below the athlete's ring at 0.024), never writes depth,
 * and shares one texture + geometry across every instance (materials are per-mesh so opacity can
 * be tuned). Scales with `radius` (metres, default 0.62 => ~1.2 m soft disc).
 * `disposeTree` on an athlete will dispose the shared texture/geometry; three.js transparently
 * re-uploads them on next use, so this is safe.
 */
export function createContactShadow(options: { radius?: number; opacity?: number } = {}): THREE.Mesh {
  const radius = options.radius ?? 0.62, opacity = options.opacity ?? 0.8
  blobGeometry ??= new THREE.PlaneGeometry(2, 2)
  const mat = new THREE.MeshBasicMaterial({ map: getBlobTexture(), transparent: true, opacity, depthWrite: false, toneMapped: false, color: '#000000' })
  mat.polygonOffset = true; mat.polygonOffsetFactor = -2; mat.polygonOffsetUnits = -2
  const mesh = new THREE.Mesh(blobGeometry, mat)
  mesh.name = 'contact-shadow'; mesh.rotation.x = -Math.PI / 2; mesh.position.y = 0.012
  mesh.scale.setScalar(radius); mesh.renderOrder = 2; mesh.castShadow = false; mesh.receiveShadow = false
  mesh.matrixAutoUpdate = false; mesh.updateMatrix()
  mesh.userData.isContactShadow = true
  return mesh
}

/**
 * Post-processing is intentionally not provided: Neutral tone mapping + baked vignette in the
 * floor/walls delivers the look at zero extra render targets, which matters on integrated GPUs.
 */

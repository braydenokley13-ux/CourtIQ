/**
 * Subtle atmospheric polish for the imperative basketball scene. Currently
 * limited to a slow drifting dust-mote field — a single THREE.Points cloud
 * built once per mount, animated by mutating its existing position buffer
 * (no per-frame mesh recreation). Intended to run only on the high quality
 * tier; medium and low skip it entirely.
 *
 * All resources owned here (geometry, material, alphaMap) are GPU-bound
 * and must be disposed via `disposeDustMotes()` when the scene unmounts.
 */
import * as THREE from 'three'
import { COURT } from './coords'

const DUST_PARTICLE_COUNT = 110
const DUST_COLOR = '#FFE2A8'
const DUST_OPACITY = 0.18
const DUST_SIZE = 0.42
const DUST_MIN_Y = 4
const DUST_MAX_Y = 22

export interface DustMotes {
  /** The Points object the caller adds to the scene graph. */
  points: THREE.Points
  /** Mutates the position buffer for the current time. Cheap (~O(N))
   *  and allocates nothing — safe to call from the parent rAF loop. */
  tick: (nowMs: number) => void
  /** Disposes the geometry, material, and alpha-map texture. The caller
   *  must also remove `points` from its parent. */
  dispose: () => void
}

/**
 * Builds the dust-mote field. Positions are seeded deterministically off
 * a small linear-congruential generator so two replays of the same scene
 * see the same dust pattern — preserves visual consistency the way the
 * rest of the deterministic playback system does.
 */
export function buildDustMotes(): DustMotes {
  const halfW = COURT.halfWidthFt
  const halfL = COURT.halfLengthFt
  // Spread dust slightly outside the court so the cloud frames the
  // action without forming a hard rectangular border at the sidelines.
  const spreadX = halfW * 1.15
  const spreadZ = halfL * 1.05

  const positions = new Float32Array(DUST_PARTICLE_COUNT * 3)
  const phases = new Float32Array(DUST_PARTICLE_COUNT)
  const baseY = new Float32Array(DUST_PARTICLE_COUNT)

  let seed = 1337
  const rand = () => {
    // Park-Miller LCG. Sufficient for visual placement; not crypto.
    seed = (seed * 16807) % 2147483647
    return (seed - 1) / 2147483646
  }

  for (let i = 0; i < DUST_PARTICLE_COUNT; i++) {
    const x = (rand() - 0.5) * 2 * spreadX
    const z = halfL / 2 + (rand() - 0.5) * spreadZ
    const y = DUST_MIN_Y + rand() * (DUST_MAX_Y - DUST_MIN_Y)
    positions[i * 3 + 0] = x
    positions[i * 3 + 1] = y
    positions[i * 3 + 2] = z
    phases[i] = rand() * Math.PI * 2
    baseY[i] = y
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))

  const alphaMap = makeSoftCircleTexture()
  const material = new THREE.PointsMaterial({
    color: DUST_COLOR,
    size: DUST_SIZE,
    sizeAttenuation: true,
    transparent: true,
    opacity: DUST_OPACITY,
    alphaMap,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  })

  const points = new THREE.Points(geometry, material)
  points.name = 'dust-motes'
  // Render after opaque geometry — additive points sit in front of the
  // hardwood + players, but behind any future translucent overlay.
  points.renderOrder = 2
  // Frustum culling on a wide cloud occasionally pops particles in/out
  // when the camera pans; disabling it is cheaper than recomputing the
  // bounding sphere every frame because the cloud is tiny.
  points.frustumCulled = false

  // Snapshot of seeded x positions — phases[] reuses the same values
  // for the lateral sway, but we sample positions[i*3] once at build
  // time so successive ticks oscillate around a fixed center rather
  // than drifting unboundedly.
  const baseX = new Float32Array(DUST_PARTICLE_COUNT)
  for (let i = 0; i < DUST_PARTICLE_COUNT; i++) baseX[i] = positions[i * 3]!

  const tick = (nowMs: number) => {
    const t = nowMs * 0.001
    const positionAttr = geometry.getAttribute('position') as THREE.BufferAttribute
    const arr = positionAttr.array as Float32Array
    for (let i = 0; i < DUST_PARTICLE_COUNT; i++) {
      const phase = phases[i]!
      // Slow vertical bob — amplitude is small enough to read as
      // floating dust, not flying confetti.
      const bob = Math.sin(t * 0.15 + phase) * 0.6
      const sway = Math.sin(t * 0.07 + phase * 1.3) * 0.4
      const idx = i * 3
      arr[idx + 0] = baseX[i]! + sway
      arr[idx + 1] = baseY[i]! + bob
      // z is left at its seeded value so the cloud stays anchored
      // around the court rather than drifting into the bleachers.
    }
    positionAttr.needsUpdate = true
  }

  const dispose = () => {
    geometry.dispose()
    material.dispose()
    alphaMap.dispose()
  }

  return { points, tick, dispose }
}

/**
 * Generates a small soft circular alpha gradient on a 32x32 canvas.
 * Used as the alphaMap so additive points render as hazy circles
 * instead of harsh squares.
 */
function makeSoftCircleTexture(): THREE.Texture {
  if (typeof document === 'undefined') {
    // SSR or non-DOM context — return an empty data texture so the
    // material still constructs cleanly. The renderer never runs in
    // this code path because Scenario3DCanvas only mounts on the
    // client, but guarding here keeps unit tests happy.
    return new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1)
  }
  const size = 32
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (ctx) {
    const gradient = ctx.createRadialGradient(
      size / 2,
      size / 2,
      0,
      size / 2,
      size / 2,
      size / 2,
    )
    gradient.addColorStop(0, 'rgba(255,255,255,1)')
    gradient.addColorStop(0.5, 'rgba(255,255,255,0.6)')
    gradient.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, size, size)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.needsUpdate = true
  return texture
}

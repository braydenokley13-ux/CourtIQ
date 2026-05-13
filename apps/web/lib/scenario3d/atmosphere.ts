/**
 * Subtle atmospheric polish for the imperative basketball scene.
 *
 * Currently exposes:
 *   - `buildDustMotes` — slow drifting dust-mote field; high-tier only.
 *   - `buildFloorSparkles` — AAA upgrade — sparse polished-floor twinkles
 *     that catch the eye like overhead arena lights glinting off lacquer.
 *     High-tier only.
 *   - `getRimHaloPulseAlpha` — pure helper that returns the deterministic
 *     alpha multiplier the rim glow should sit at for a given wall-clock
 *     ms. Pulses once every ~6 seconds at very low amplitude.
 *   - `getKeyDefenderPulseAlpha` — faster pulse for the key-defender ring.
 *   - `getRimMetalShimmerIntensity` — AAA upgrade — fast micro-shimmer
 *     applied to the rim's emissive intensity so the orange torus catches
 *     stadium lights like real chromed steel.
 *   - `getCourtSpotPulseAlpha` — AAA upgrade — slow broadcast spotlight
 *     breath multiplier for the warm court pool glow.
 *
 * All resources owned here (geometry, material, alphaMap) are GPU-bound
 * and must be disposed via the corresponding handle's `dispose()` when
 * the scene unmounts.
 */
import * as THREE from 'three'
import { COURT } from './coords'

// V2-A — rim halo ambient pulse.
//
// The pre-V2 rim glow was a static MeshBasicMaterial at opacity 0.12.
// Adding a deterministic, low-amplitude breath to its alpha makes the
// gym feel alive without competing with the action — the pulse cycles
// once every ~5.8 seconds and varies the alpha by ±10% of the authored
// value. Pure function: same `nowMs` → same alpha multiplier, byte-
// identical across replays.
const RIM_HALO_PULSE_PERIOD_S = 5.8
const RIM_HALO_PULSE_AMPLITUDE = 0.1

/**
 * Returns the alpha multiplier the rim glow should sit at for the given
 * wall-clock millisecond timestamp. Stays inside [1 - amp, 1 + amp]
 * so the renderer's authored opacity is preserved on average.
 *
 * Pure / deterministic. SSR-safe (no DOM).
 */
export function getRimHaloPulseAlpha(nowMs: number): number {
  if (!Number.isFinite(nowMs)) return 1
  const t = (nowMs / 1000) / RIM_HALO_PULSE_PERIOD_S
  // 2π * t produces one full cycle per period. Sin → cosine-like
  // breathing; (1 + amp * sin) gives a base of 1 with ±amp swing.
  return 1 + RIM_HALO_PULSE_AMPLITUDE * Math.sin(2 * Math.PI * t)
}

// V4-D — Key defender heat-ring pulse.
//
// Slightly faster + slightly stronger than the rim halo so the key
// defender pulls forward in the read on a busy scene without ever
// fully blinking off. Period 1.6s gives ~38 BPM (mid-tempo); ±25%
// amplitude is large enough to register but small enough that the
// ring is always above 0.75× authored opacity.
const KEY_DEFENDER_PULSE_PERIOD_S = 1.6
const KEY_DEFENDER_PULSE_AMPLITUDE = 0.25

/**
 * Returns the alpha multiplier the key-defender heat ring should sit
 * at for the given wall-clock ms. Stays inside [1-amp, 1+amp].
 * Pure / deterministic. SSR-safe.
 */
export function getKeyDefenderPulseAlpha(nowMs: number): number {
  if (!Number.isFinite(nowMs)) return 1
  const t = (nowMs / 1000) / KEY_DEFENDER_PULSE_PERIOD_S
  return 1 + KEY_DEFENDER_PULSE_AMPLITUDE * Math.sin(2 * Math.PI * t)
}

// AAA polish — rim metal micro-shimmer.
//
// Real broadcast hoops show subtle bright flecks moving across the rim
// as overhead venue lights catch the chrome. A two-frequency sin keeps
// the shimmer interesting (it never sits at a single phase for long)
// while staying deterministic. Output multiplier band [0.78, 1.22]
// scales the rim material's authored `emissiveIntensity` so the
// average emissive level is preserved.
const RIM_SHIMMER_PRIMARY_PERIOD_S = 2.3
const RIM_SHIMMER_SECONDARY_PERIOD_S = 0.71
const RIM_SHIMMER_AMPLITUDE = 0.22

/**
 * Returns the multiplier the rim's authored emissive intensity should
 * be scaled by at the given wall-clock millisecond. Stays in
 * [1 - amp, 1 + amp]. Pure / deterministic. SSR-safe.
 */
export function getRimMetalShimmerIntensity(nowMs: number): number {
  if (!Number.isFinite(nowMs)) return 1
  const t = nowMs / 1000
  // Two-frequency sin so the shimmer never lands on the same phase
  // twice in a row — reads as a wandering glint across the chrome.
  const primary = Math.sin((2 * Math.PI * t) / RIM_SHIMMER_PRIMARY_PERIOD_S)
  const secondary = Math.sin(
    (2 * Math.PI * t) / RIM_SHIMMER_SECONDARY_PERIOD_S + Math.PI / 3,
  )
  // Weighted blend; primary dominates so the shimmer reads as a single
  // moving highlight rather than buzzing high-frequency noise.
  const blended = primary * 0.7 + secondary * 0.3
  return 1 + RIM_SHIMMER_AMPLITUDE * blended
}

// AAA polish — court spot breathing.
//
// The warm court pool light beneath the rim is given a slow swell so
// the painted key reads like a live broadcast venue (lights gently
// catching their cue) rather than a static decal. Slower than the rim
// halo so the two effects don't sync up; amplitude smaller so the
// painted key doesn't appear to "blink."
const COURT_SPOT_PULSE_PERIOD_S = 8.4
const COURT_SPOT_PULSE_AMPLITUDE = 0.07

/**
 * Returns the multiplier the warm court spotlight intensity should be
 * scaled by at the given wall-clock millisecond. Stays in
 * [1 - amp, 1 + amp]. Pure / deterministic. SSR-safe.
 */
export function getCourtSpotPulseAlpha(nowMs: number): number {
  if (!Number.isFinite(nowMs)) return 1
  const t = (nowMs / 1000) / COURT_SPOT_PULSE_PERIOD_S
  return 1 + COURT_SPOT_PULSE_AMPLITUDE * Math.sin(2 * Math.PI * t)
}

// AAA polish — backboard glass shimmer.
//
// The backboard glass front catches stadium light like a real piece of
// tempered glass — a soft moving highlight that walks across the
// surface. Slower and quieter than the rim shimmer so the two glints
// never fight, but the same two-frequency construction so the
// highlight wanders rather than blinking. Output multiplier band
// [0.85, 1.15] scales the glass highlight's authored opacity.
const GLASS_SHIMMER_PRIMARY_PERIOD_S = 4.7
const GLASS_SHIMMER_SECONDARY_PERIOD_S = 1.31
const GLASS_SHIMMER_AMPLITUDE = 0.15

/**
 * Returns the multiplier the backboard glass highlight should sit at
 * for the given wall-clock millisecond. Stays in [1 - amp, 1 + amp].
 * Pure / deterministic. SSR-safe.
 */
export function getGlassShimmerAlpha(nowMs: number): number {
  if (!Number.isFinite(nowMs)) return 1
  const t = nowMs / 1000
  const primary = Math.sin((2 * Math.PI * t) / GLASS_SHIMMER_PRIMARY_PERIOD_S)
  const secondary = Math.sin(
    (2 * Math.PI * t) / GLASS_SHIMMER_SECONDARY_PERIOD_S + Math.PI / 4,
  )
  const blended = primary * 0.65 + secondary * 0.35
  return 1 + GLASS_SHIMMER_AMPLITUDE * blended
}

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

// AAA polish — sparse polished-floor twinkles. Tiny additive points
// scattered across the wood inside the half-court box that brighten
// and dim deterministically, reading as overhead venue lights catching
// the lacquer at glancing angles. Built once per scene, animated by
// mutating per-vertex alpha values so the same Points object stays in
// the scene graph.
const FLOOR_SPARKLE_COUNT = 38
const FLOOR_SPARKLE_COLOR = '#FFE9B6'
const FLOOR_SPARKLE_SIZE = 0.28
const FLOOR_SPARKLE_BASE_OPACITY = 0.55
const FLOOR_SPARKLE_PERIOD_S = 4.6

export interface FloorSparkles {
  /** The Points object the caller adds to the scene graph. */
  points: THREE.Points
  /** Mutates per-vertex alpha for the current time. Allocates nothing. */
  tick: (nowMs: number) => void
  /** Disposes geometry, material, and alphaMap texture. */
  dispose: () => void
}

/**
 * Builds the polished-floor sparkle field. Positions are seeded
 * deterministically so replays paint identical sparkle locations. Each
 * sparkle has its own phase so the field reads as a constellation of
 * independent glints rather than a single synchronized flash.
 */
export function buildFloorSparkles(): FloorSparkles {
  const halfW = COURT.halfWidthFt
  const halfL = COURT.halfLengthFt

  const positions = new Float32Array(FLOOR_SPARKLE_COUNT * 3)
  const alphas = new Float32Array(FLOOR_SPARKLE_COUNT)
  const phases = new Float32Array(FLOOR_SPARKLE_COUNT)

  // Park-Miller LCG, same approach as the dust motes — same seed yields
  // same sparkle layout, so replays stay byte-identical.
  let seed = 9173
  const rand = () => {
    seed = (seed * 16807) % 2147483647
    return (seed - 1) / 2147483646
  }

  for (let i = 0; i < FLOOR_SPARKLE_COUNT; i++) {
    // Bias placement to the area where the camera dwells (mid-court
    // through the painted key) so the glints land where the eye is
    // already looking. The bias keeps sparkles out of the far
    // baselines where they would compete with the rim cluster.
    const x = (rand() - 0.5) * 2 * halfW * 0.9
    const z = 2 + rand() * halfL * 0.85
    // Lift a hair above the hardwood + arc lines so the sparkle reads
    // as a finish highlight rather than punching through line decals.
    positions[i * 3 + 0] = x
    positions[i * 3 + 1] = 0.15
    positions[i * 3 + 2] = z
    phases[i] = rand() * Math.PI * 2
    alphas[i] = FLOOR_SPARKLE_BASE_OPACITY
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))

  const alphaMap = makeSoftCircleTexture()
  const material = new THREE.PointsMaterial({
    color: FLOOR_SPARKLE_COLOR,
    size: FLOOR_SPARKLE_SIZE,
    sizeAttenuation: true,
    transparent: true,
    opacity: FLOOR_SPARKLE_BASE_OPACITY,
    alphaMap,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  })

  const points = new THREE.Points(geometry, material)
  points.name = 'floor-sparkles'
  // Render after the hardwood + lines but before player markers so a
  // sparkle never punches over a jersey number.
  points.renderOrder = 1
  // Same rationale as dust motes: the field is tiny so frustum-culling
  // savings are negligible, but pop-in artifacts from a tight bounding
  // sphere look bad on a slow pan.
  points.frustumCulled = false

  const tick = (nowMs: number) => {
    const t = nowMs * 0.001 / FLOOR_SPARKLE_PERIOD_S
    const positionAttr = geometry.getAttribute('position') as THREE.BufferAttribute
    const arr = positionAttr.array as Float32Array
    // We animate the alpha via a per-sparkle on/off twinkle by remapping
    // sin into the per-point alpha. Three.js PointsMaterial only honors
    // a single opacity, so we modulate opacity globally and add a tiny
    // vertical shimmer to the y-position for a "shimmering finish" feel.
    let avg = 0
    for (let i = 0; i < FLOOR_SPARKLE_COUNT; i++) {
      const phase = phases[i]!
      const wave = Math.sin(2 * Math.PI * t + phase)
      const a = FLOOR_SPARKLE_BASE_OPACITY * (0.4 + 0.6 * Math.max(0, wave) ** 2)
      alphas[i] = a
      avg += a
      const idx = i * 3
      // Subtle vertical jitter so a fixed-camera frame never reads as
      // perfectly still under the sparkles.
      arr[idx + 1] = 0.15 + wave * 0.02
    }
    positionAttr.needsUpdate = true
    material.opacity = avg / FLOOR_SPARKLE_COUNT
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

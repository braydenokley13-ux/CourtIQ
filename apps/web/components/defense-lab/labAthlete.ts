import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { buildGlbAthletePreview, getGlbAthleteHandle, loadGlbAthleteAsset as loadSourceRig } from '../scenario3d/glbAthlete'
import { buildSkinnedAthletePreview, getSkinnedAthleteHandle } from '../scenario3d/skinnedAthlete'

/** DCC-authored geometry + a reusable basketball action library on one skeleton.
 * Blender source, build/optimization scripts and provenance are bundled
 * (scripts/athlete, public/athlete/LAB-ATHLETE-STUDIO.md).
 *
 * Rendering model
 *  - One skinned mesh per LOD (LOD0 ~16k tris, LOD1 ~5.6k, LOD2 ~2k) on ONE skeleton; the
 *    chosen hair style is merged into each LOD geometry and every part (skin, kit, shoes,
 *    hair, face) samples ONE texture atlas painted per player, so a visible athlete is a
 *    single draw call (plus its ground ring / label sprite, which the world may hide).
 *
 * Motion model
 *  - Time-driven loops (stances, screen, pass, catch, dribble...) are sampled by absolute
 *    simulation time.
 *  - Distance-driven locomotion loops (walk, jog, sprint, slides, backpedal, chop) are
 *    authored so ONE loop covers exactly `stride` metres of ground; the cycle advances by
 *    (ground distance / blended stride). The angle between velocity and facing picks
 *    forward / slide-left / slide-right / backpedal; any residual angle is absorbed by
 *    turning the hips (root) while the chest and head counter-rotate toward the facing.
 *  - Arms are a separate layer over the legs/torso so passing, catching, dribbling or
 *    contesting never interrupts footwork.
 *  - Runtime foot-lock IK pins planted feet (plant markers baked in the GLB) to the court
 *    through blends, starts and stops; acceleration leans / sinks the body. */
let studioAsset: GLTF | undefined
let studioMotion: MotionTable | undefined
let loading: Promise<boolean> | undefined
interface ClipMeta { mode?: string; strideMeters?: number; plant?: { l?: number[]; r?: number[] } }
interface MotionTable { clips?: Record<string, ClipMeta>; hair?: string[] }
export function loadGlbAthleteAsset(): Promise<boolean> {
  if (!loading) loading = new GLTFLoader().loadAsync('/athlete/lab-athlete.glb').then(asset => {
    if (!asset.animations.length) throw new Error('Basketball action library missing')
    studioAsset = asset
    studioMotion = (asset.asset?.extras as { CourtIQMotion?: MotionTable } | undefined)?.CourtIQMotion
    return true
  }).catch(async () => !!(await loadSourceRig()))
  return loading
}
export type AthleteQuality = 'high' | 'balanced' | 'low'
export interface AthleteAppearance {
  id: string; team: string; height?: number; role?: string
  /** Jersey number; defaults to the digits in `id`. Optional additions only. */
  number?: number | string
  /** 0.9-1.12 shoulder/hip width multiplier. Defaults to a deterministic build per index. */
  build?: number
  /** Index into the skin-tone palette. Defaults to the player's index. */
  skinTone?: number
  /** Hair style index (crop, buzz, hightop, afro, bald). Defaults to a hash of the id. */
  hair?: number
}
export interface AthleteMotion {
  time: number; speed: number; velocity?: { x: number; z: number }; defensive: boolean
  /** Engine stances: ready | run | defend | screen | dribble | pass | catch | shoot.
   * Optional extra intents the world may feed: 'closeout' | 'fight' (over a screen) |
   * 'cut' (plant-and-cut) | 'skip' (overhead skip pass) | 'pivot'. */
  pose?: string
  /** Engine gait accumulator: 4.2 rad per metre of ground travelled. */
  phase?: number
  hands?: number; ball?: { x: number; y: number; z: number }; hasBall: boolean; facing: number
}
export interface AthleteStats { drawCalls: number; triangles: number; lod: number; quality: AthleteQuality }
export interface LabAthlete {
  root: THREE.Group; figure: THREE.Group; ring: THREE.Mesh; label: THREE.Sprite; hit: THREE.Mesh
  setPose(motion: AthleteMotion): void
  /** high = LOD0 + full layers; balanced = LOD1 + cheaper material; low = LOD1/LOD2 + half-rate
   * skeleton/IK updates when not focused. All tiers share one skeleton and one mixer. */
  setQuality(quality: AthleteQuality): void
  /** Optional: in 'low' quality, unfocused athletes update their skeleton at half rate and use
   * the cheapest mesh. Focused (selected / ball handler / near camera) athletes stay full. */
  setFocus?(focused: boolean | undefined): void
  /** Optional: visible mesh stats for the current tier (draw calls exclude ring/label). */
  stats?(): AthleteStats
}
export const DEFENSE_COLOR = '#1c6263'
export const OFFENSE_COLOR = '#f1e9d3'
/** Colourways are read from a high camera: defense is dark with light numerals, offense
 * is light with dark numerals. */
const DEFENSE_KIT = { body: '#16414a', trim: '#e6efe9', number: '#f2f5ef', outline: '#0b2429', shorts: '#12363e' }
const OFFENSE_KIT = { body: '#f3ecd9', trim: '#2b5f64', number: '#24545a', outline: '#fbf7ea', shorts: '#ece3cc' }
const skinTones = ['#b07a56', '#cb9a74', '#7b523c', '#d6a888', '#9b6a4a', '#5e3b2b', '#e1b896']
const hairTones = ['#1b1814', '#2b211a', '#14120f', '#3a2a1c', '#1b1814', '#0f0e0c', '#4a3623']
const shoeTones = [['#1d2523', '#e8e8e0'], ['#eceae0', '#2d3836'], ['#222a2a', '#c8d6d0'], ['#f1efe6', '#1c6263']]
const HAIR_NAMES = ['crop', 'buzz', 'hightop', 'afro', 'bald']
const TAU = Math.PI * 2
const PHASE_PER_METRE = 4.2
const DEG = Math.PI / 180

/** Ground distance covered by one loop of each locomotion clip (metres). Overridden by
 * the stride table baked into the GLB (asset.extras.CourtIQMotion) when present. */
const DEFAULT_STRIDE: Record<string, number> = {
  walk: 1.45, jog: 2.25, sprint: 3.1, backpedal: 1.75, chop: 1.05,
  defense_slide_left: .9, defense_slide_right: .9, defense_slide_fast_left: 1.5, defense_slide_fast_right: 1.5,
}
const GAIT_NAMES = Object.keys(DEFAULT_STRIDE)
const MAX_CADENCE = 3.6 // loops per second: beyond this the feet skate rather than blur

function labelTexture(id: string, defense: boolean) {
  const canvas = document.createElement('canvas'); canvas.width = 192; canvas.height = 112
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = defense ? '#215e5d' : '#f7f2e6'
  ctx.beginPath(); ctx.roundRect(14, 12, 164, 82, 28); ctx.fill()
  ctx.fillStyle = defense ? '#f7f2e6' : '#6b4532'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.font = '700 54px Arial'; ctx.fillText(id, 96, 55)
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace
  return map
}

/** Atlas layout (matches scripts/athlete/athlete_geo.py): 512x512; top 128 px are 16 swatches
 * of 64 px (8 per row); below, the jersey front panel (x 15-240) and back panel (x 273-497),
 * hem at the bottom (y 512), shoulders at y 128. */
const SWATCH_INDEX: Record<string, number> = { skin: 0, hair: 1, trim: 2, shorts: 3, shoe: 4, sole: 5, eye_white: 6, feature: 7, lips: 8, sock: 9, lace: 10, skin_shadow: 11, hair_hi: 12, accent: 13 }
const SWATCH_ROUGH: Record<string, number> = { skin: .68, hair: .82, trim: .8, shorts: .86, shoe: .4, sole: .78, eye_white: .22, feature: .6, lips: .45, sock: .92, lace: .7, skin_shadow: .52, hair_hi: .6, accent: .7 }
const shade = (c: string, k: number) => '#' + new THREE.Color(c).multiplyScalar(k).getHexString()
const mix = (a: string, b: string, t: number) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString()

function hashString(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) } return h >>> 0 }
interface AtlasSpec { kit: typeof DEFENSE_KIT; number: string; skin: string; hair: string; shoe: string; sole: string; accent: string }
function paintAtlas(spec: AtlasSpec) {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 512
  const ctx = canvas.getContext('2d')!
  const rough = document.createElement('canvas'); rough.width = 512; rough.height = 512
  const rctx = rough.getContext('2d')!
  const { kit } = spec
  const colors: Record<string, string> = {
    skin: spec.skin, hair: spec.hair, trim: kit.trim, shorts: kit.shorts, shoe: spec.shoe, sole: spec.sole, eye_white: '#ecebe4', feature: '#1a1210',
    lips: mix(spec.skin, '#7a2f2a', .42), sock: '#eef0ea', lace: '#dcdcd2', skin_shadow: shade(spec.skin, .8), hair_hi: mix(spec.hair, '#ffffff', .18), accent: spec.accent,
  }
  for (const [name, index] of Object.entries(SWATCH_INDEX)) {
    const x = (index % 8) * 64, y = Math.floor(index / 8) * 64
    ctx.fillStyle = colors[name]; ctx.fillRect(x, y, 64, 64)
    const r = Math.round(255 * SWATCH_ROUGH[name]); rctx.fillStyle = `rgb(${r},${r},${r})`; rctx.fillRect(x, y, 64, 64)
  }
  ctx.fillStyle = kit.body; ctx.fillRect(0, 128, 512, 384)
  rctx.fillStyle = `rgb(${Math.round(255 * .9)},${Math.round(255 * .9)},${Math.round(255 * .9)})`; rctx.fillRect(0, 128, 512, 384)
  // Jersey: tonal gradient (lighter shoulders), contrast side panels, strap piping, hem band.
  const g = ctx.createLinearGradient(0, 128, 0, 512)
  g.addColorStop(0, 'rgba(255,255,255,.07)'); g.addColorStop(.55, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,.10)')
  ctx.fillStyle = g; ctx.fillRect(0, 128, 512, 384)
  // side panels: front panel edges (x 15..240) and back panel edges (x 273..497)
  for (const [a, b] of [[13, 18], [238, 243], [269, 274], [490, 495]]) { ctx.fillStyle = kit.trim; ctx.fillRect(a, 128, b - a, 384) }
  ctx.fillStyle = mix(kit.body, kit.trim, .55); ctx.fillRect(0, 128, 512, 12)      // strap / yoke piping
  ctx.fillStyle = kit.trim; ctx.fillRect(0, 507, 512, 5)                   // hem piping
  
  // fine mesh weave + speckle so the fabric reads matte, not plastic
  ctx.globalAlpha = .05; ctx.fillStyle = '#000'
  for (let y = 130; y < 506; y += 3) ctx.fillRect(0, y, 512, 1)
  for (let x = 0; x < 512; x += 3) ctx.fillRect(x, 130, 1, 376)
  let seed = hashString(spec.number + kit.body) || 1
  for (let i = 0; i < 2600; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    const x = seed % 512; seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    ctx.fillStyle = seed & 1 ? '#fff' : '#000'; ctx.globalAlpha = .035; ctx.fillRect(x, 130 + (seed >>> 8) % 376, 1, 1)
  }
  ctx.globalAlpha = 1
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'
  const digits = spec.number.length
  const draw = (cx: number, cy: number, size: number) => {
    ctx.font = `800 ${size}px Arial Black, Arial, sans-serif`
    ctx.lineWidth = size * .1; ctx.strokeStyle = kit.outline; ctx.strokeText(spec.number, cx, cy)
    ctx.fillStyle = kit.number; ctx.fillText(spec.number, cx, cy)
  }
  draw(128, 296, digits > 1 ? 112 : 132)  // chest
  draw(384, 282, digits > 1 ? 138 : 176)  // back
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4; map.flipY = false
  const roughMap = new THREE.CanvasTexture(rough); roughMap.flipY = false
  return { map, roughMap }
}

const smoothstep = THREE.MathUtils.smoothstep
const wrapPi = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))
interface FootLock { on: boolean; x: number; z: number; yaw: number }
/** Everything that depends on the previous frame. Snapshots are stored per step so scrubbing
 * back to a played time restores the exact state (and therefore the exact pose). */
interface State {
  t: number; dist: number; cycle: number; dir: [number, number, number, number]; valid: boolean
  vx: number; vz: number; ax: number; az: number; off: number; pitch: number; roll: number; crouch: number; speedS: number
  lock: [FootLock, FootLock]
}
const newState = (): State => ({ t: NaN, dist: 0, cycle: 0, dir: [1, 0, 0, 0], valid: false, vx: 0, vz: 0, ax: 0, az: 0, off: 0, pitch: 0, roll: 0, crouch: 0, speedS: 0, lock: [{ on: false, x: 0, z: 0, yaw: 0 }, { on: false, x: 0, z: 0, yaw: 0 }] })
const copyState = (s: State): State => ({ ...s, dir: [...s.dir] as State['dir'], lock: [{ ...s.lock[0] }, { ...s.lock[1] }] })

export function createLabAthlete(player: AthleteAppearance, index: number, ready: boolean): LabAthlete {
  const defensive = player.team === 'defense' || player.id.startsWith('D')
  const kit = defensive ? DEFENSE_KIT : OFFENSE_KIT
  const teamColor = defensive ? DEFENSE_COLOR : OFFENSE_COLOR
  const height = player.height ?? (index % 5 === 1 ? 1.99 : 1.87)
  const number = String(player.number ?? (player.id.replace(/\D/g, '') || player.id.slice(-1)))
  const build = THREE.MathUtils.clamp(player.build ?? [.97, 1.03, 1.0, .94, 1.06][index % 5], .88, 1.14)
  const root = new THREE.Group(); root.name = `lab-player-${player.id}`; root.userData.playerId = player.id
  const studio = ready && studioAsset ? cloneSkinned(studioAsset.scene) : null
  let figure: THREE.Group
  if (studio) { figure = new THREE.Group(); figure.name = 'basketball-studio-athlete'; figure.add(studio) }
  else figure = (ready ? buildGlbAthletePreview(teamColor, '#dc713d', false, false, player.id.slice(-1), defensive ? 'defensive' : 'idle') : null)
    ?? buildSkinnedAthletePreview(teamColor, '#dc713d', false, false, player.id.slice(-1), defensive ? 'defensive' : 'idle') ?? new THREE.Group()
  const glb = getGlbAthleteHandle(figure), procedural = getSkinnedAthleteHandle(figure)
  const rig = studio ?? glb?.cloned ?? figure
  const scale = height / (studio || glb ? 1.808 : 5.95)
  if (studio) figure.scale.set(scale * build, scale, scale * (1 + (build - 1) * .8)); else figure.scale.setScalar(scale)

  // ---------------------------------------------------------------- mesh / material set-up
  const lodMeshes: THREE.SkinnedMesh[] = []
  let material: THREE.MeshPhysicalMaterial | undefined
  let atlas: ReturnType<typeof paintAtlas> | undefined
  const skinColor = skinTones[(player.skinTone ?? index) % skinTones.length]
  const hairStyleIndex = player.hair !== undefined ? player.hair % HAIR_NAMES.length : (hashString(player.id) + index * 3) % (HAIR_NAMES.length - 1)
  const hairName = HAIR_NAMES[hairStyleIndex]
  if (studio) {
    const shoes = shoeTones[index % shoeTones.length]
    atlas = paintAtlas({ kit, number, skin: skinColor, hair: hairTones[(player.skinTone ?? index) % hairTones.length], shoe: shoes[0], sole: shoes[1], accent: defensive ? '#e07a3c' : '#2b5f64' })
    material = new THREE.MeshPhysicalMaterial({ name: 'athlete_atlas', map: atlas.map, roughnessMap: atlas.roughMap, roughness: 1, metalness: 0, vertexColors: true, side: THREE.DoubleSide })
    material.sheen = .55; material.sheenColor = new THREE.Color('#e9c9b2'); material.sheenRoughness = .6; material.specularIntensity = .28
    const hairMesh = hairName === 'bald' ? undefined : studio.getObjectByName('HAIR_' + hairName) as THREE.SkinnedMesh | undefined
    const sources: THREE.SkinnedMesh[] = []
    studio.traverse(o => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) sources.push(o as THREE.SkinnedMesh) })
    let sharedSkeleton: THREE.Skeleton | undefined
    for (const mesh of sources) {
      if (!/^LOD\d_athlete$/.test(mesh.name)) { mesh.removeFromParent(); continue }
      // SkeletonUtils clones a Skeleton per primitive: consolidate so every LOD drives one skeleton.
      if (sharedSkeleton) mesh.bind(sharedSkeleton, mesh.bindMatrix); else sharedSkeleton = mesh.skeleton
      // Each actor owns its geometry (LOD + chosen hair merged into one vertex buffer).
      let geometry = mesh.geometry.clone()
      if (hairMesh) { const merged = mergeGeometries([mesh.geometry, hairMesh.geometry], false); if (merged) geometry = merged }
      mesh.geometry = geometry
      mesh.material = material
      mesh.castShadow = true; mesh.receiveShadow = false; mesh.userData.playerId = player.id
      mesh.visible = false
      lodMeshes[Number(mesh.name[3])] = mesh
    }
  } else {
    figure.traverse(object => {
      if (/indicator|shadow|halo|chevron/i.test(object.name)) object.visible = false
      const mesh = object as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true; mesh.receiveShadow = false; mesh.userData.playerId = player.id
      mesh.geometry = mesh.geometry.clone()
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(m => m.clone()) : mesh.material.clone()
    })
  }
  const lodAvailable = lodMeshes.map((m, i) => m ? i : -1).filter(i => i >= 0)
  const meshForLod = (lod: number) => { for (let i = Math.min(lod, 2); i >= 0; i--) if (lodMeshes[i]) return i; return lodAvailable[0] ?? 0 }
  let activeLod = -1
  const showLod = (lod: number) => {
    const next = meshForLod(lod)
    if (next === activeLod) return
    lodMeshes.forEach((m, i) => { if (m) m.visible = i === next })
    activeLod = next
  }
  showLod(0)
  root.add(figure)
  const ring = new THREE.Mesh(new THREE.RingGeometry(.31, .36, 48), new THREE.MeshBasicMaterial({ color: defensive ? '#347a7b' : '#bb704b', transparent: true, opacity: .42, depthWrite: false }))
  ring.rotation.x = -Math.PI / 2; ring.position.y = .024; root.add(ring)
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(player.id, defensive), depthTest: true, depthWrite: false, transparent: true }))
  label.scale.set(.52, .303, 1); label.position.set(0, height + .28, 0); root.add(label)
  const hit = new THREE.Mesh(new THREE.CylinderGeometry(.4, .4, height + .35, 8), new THREE.MeshBasicMaterial({ visible: false }))
  hit.position.y = height * .5; hit.userData.playerId = player.id; root.add(hit)

  // ---------------------------------------------------------------- animation set-up
  const mixer = studio ? new THREE.AnimationMixer(studio) : glb?.mixer ?? procedural?.mixer
  const actions: Record<string, THREE.AnimationAction> = studio ? {} : glb?.actions ?? procedural?.actions ?? {}
  const durations: Record<string, number> = {}
  const stride: Record<string, number> = { ...DEFAULT_STRIDE }
  const plantTables: Record<string, { l: number[]; r: number[] }> = {}
  if (studioMotion?.clips) for (const [name, entry] of Object.entries(studioMotion.clips)) {
    if (entry.strideMeters) stride[name] = entry.strideMeters
    if (entry.plant?.l && entry.plant?.r) plantTables[name] = { l: entry.plant.l, r: entry.plant.r }
  }
  if (studio && studioAsset && mixer) for (const clip of studioAsset.animations) {
    // Arms are a separate layer over legs/torso/head, so passing while cutting keeps the
    // run's stance and contact timing, and a screen keeps its braced base with free hands.
    durations[clip.name] = clip.duration
    for (const section of ['lower', 'arms']) {
      const tracks = clip.tracks.filter(track => /^(clavicle|upperarm|lowerarm|hand)/.test(track.name) === (section === 'arms'))
      const layered = new THREE.AnimationClip(`${clip.name}:${section}`, clip.duration, tracks)
      const action = mixer.clipAction(layered); action.play(); action.paused = true; action.enabled = false; actions[layered.name] = action
    }
  }
  const bone = (name: string) => rig.getObjectByName(name) as THREE.Bone | undefined
  const feet = ['foot_l', 'foot_r'].map(bone).filter((b): b is THREE.Bone => !!b)
  const legs = (['l', 'r'] as const).map(side => ({ thigh: bone('thigh_' + side), calf: bone('calf_' + side), foot: bone('foot_' + side) }))
  const spine = ['spine_01', 'spine_02', 'spine_03'].map(bone).filter((b): b is THREE.Bone => !!b)
  const pelvis = bone('pelvis'), neck = bone('neck_01'), head = bone('Head')
  const rightHand = bone('hand_r'), leftHand = bone('hand_l')
  const arms = {
    right: ['lowerarm_r', 'upperarm_r'].map(bone).filter((b): b is THREE.Bone => !!b),
    left: ['lowerarm_l', 'upperarm_l'].map(bone).filter((b): b is THREE.Bone => !!b),
  }
  const scratch = { hand: new THREE.Vector3(), joint: new THREE.Vector3(), from: new THREE.Vector3(), to: new THREE.Vector3(), parent: new THREE.Quaternion(), inverse: new THREE.Quaternion(), delta: new THREE.Quaternion(), identity: new THREE.Quaternion() }
  const target = new THREE.Vector3(), otherTarget = new THREE.Vector3(), footPoint = new THREE.Vector3()
  const ik = { hip: new THREE.Vector3(), knee: new THREE.Vector3(), ankle: new THREE.Vector3(), goal: new THREE.Vector3(), axis: new THREE.Vector3(), perp: new THREE.Vector3(), from: new THREE.Vector3(), to: new THREE.Vector3(), newKnee: new THREE.Vector3(), q: new THREE.Quaternion(), qw: new THREE.Quaternion(), pw: new THREE.Quaternion(), tmp: new THREE.Vector3() }
  const animatedAnkle = [new THREE.Vector3(), new THREE.Vector3()]
  const ankleQuat = [new THREE.Quaternion(), new THREE.Quaternion()]
  const weights: Record<string, number> = {}, armWeights: Record<string, number> = {}
  const st = newState()
  const history: State[] = []
  const debug = { clip: '', stride: 0, cycle: 0, dir: [1, 0, 0, 0] as number[], cadence: 0, special: '', hipOffset: 0, locks: 0, lockOn: [false, false] as boolean[], weights: weights as Record<string, number> }
  figure.userData.motionDebug = debug
  let quality: AthleteQuality = 'high', lastFallbackClip = '', focused = false, focusOverride: boolean | undefined, frameParity = 0
  const addWeight = (target: Record<string, number>, name: string, weight: number) => { if (weight > 1e-5) target[name] = (target[name] ?? 0) + weight }

  const applyQuality = (next: AthleteQuality) => {
    quality = next
    if (!material) return
    const rich = next === 'high'
    const wasSheen = material.sheen
    material.sheen = rich ? .55 : 0
    material.specularIntensity = rich ? .28 : .2
    if (wasSheen !== material.sheen) material.needsUpdate = true
    const roughMap = rich ? atlas!.roughMap : null
    if (material.roughnessMap !== roughMap) { material.roughnessMap = roughMap; material.roughness = rich ? 1 : .7; material.needsUpdate = true }
    for (const m of lodMeshes) if (m) m.castShadow = next !== 'low' || focused
    showLod(next === 'high' ? 0 : next === 'balanced' ? 1 : focused ? 1 : 2)
  }

  /** Locomotion clip mix for a given smoothed direction (F,B,L,R) and speed. */
  function locomotionMix(dir: number[], speed: number, low: boolean, out: Record<string, number>) {
    const mid = smoothstep(speed, 1.7, 2.6), fast = smoothstep(speed, 3.9, 5.0)
    const slideFast = smoothstep(speed, 2.0, 3.0)
    addWeight(out, low ? 'chop' : 'walk', dir[0] * (1 - mid))
    addWeight(out, 'jog', dir[0] * mid * (1 - fast))
    addWeight(out, 'sprint', dir[0] * fast)
    addWeight(out, 'backpedal', dir[1])
    addWeight(out, 'defense_slide_left', dir[2] * (1 - slideFast)); addWeight(out, 'defense_slide_fast_left', dir[2] * slideFast)
    addWeight(out, 'defense_slide_right', dir[3] * (1 - slideFast)); addWeight(out, 'defense_slide_fast_right', dir[3] * slideFast)
  }
  const effectiveStride = (mix: Record<string, number>) => {
    let total = 0, sum = 0
    for (const [name, weight] of Object.entries(mix)) { sum += weight * (stride[name] ?? 1.5); total += weight }
    return total > 1e-6 ? sum / total : 2
  }
  /** Direction sectors from the heading angle alpha (0 forward, +90deg character-left).
   * Wide dead-zones around each axis keep a single clip carrying the motion (no crossed feet
   * from half-forward / half-slide blends); the leftover angle becomes a hip yaw. */
  const sectorDir = (alpha: number, speed: number, out: [number, number, number, number]): number => {
    if (speed < 1e-3) { out[0] = 1; out[1] = out[2] = out[3] = 0; return 0 }
    const a = Math.abs(alpha)
    const f = 1 - smoothstep(a, 40 * DEG, 62 * DEG)
    const b = smoothstep(a, 118 * DEG, 140 * DEG)
    const side = Math.max(0, 1 - f - b)
    out[0] = f; out[1] = b; out[2] = alpha > 0 ? side : 0; out[3] = alpha < 0 ? side : 0
    const sgn = alpha >= 0 ? 1 : -1
    return f * alpha + b * wrapPi(alpha - sgn * Math.PI) + out[2] * (alpha - Math.PI / 2) + out[3] * (alpha + Math.PI / 2)
  }
  const goal: [number, number, number, number] = [1, 0, 0, 0]
  const mixScratch: Record<string, number> = {}
  let goalOffset = 0

  const resetState = (motion: AthleteMotion, dist: number, low: boolean, speed: number) => {
    const fresh = newState()
    Object.assign(st, fresh)
    st.dir = [...goal] as State['dir']
    for (const key of Object.keys(mixScratch)) delete mixScratch[key]
    locomotionMix(st.dir, speed, low, mixScratch)
    st.t = motion.time; st.dist = dist
    st.cycle = dist / effectiveStride(mixScratch) + index * .173
    st.valid = true; st.off = goalOffset; st.speedS = speed
    st.vx = motion.velocity?.x ?? 0; st.vz = motion.velocity?.z ?? 0
    history.length = 0
  }
  /** Advance (or restore) the gait + body state. Absolute sampling is kept where it matters:
   * revisiting a time that was already played returns the exact stored state, and any
   * unplayed jump re-seeds from the absolute ground distance. */
  function stepState(motion: AthleteMotion, dist: number, low: boolean, speed: number, vx: number, vz: number) {
    const dt = motion.time - st.t
    if (!st.valid || Number.isNaN(st.t)) return resetState(motion, dist, low, speed)
    if (dt === 0) return
    if (dt < 0 || dt > .6 || dist < st.dist - 1e-6) {
      let found = -1
      for (let i = history.length - 1; i >= 0; i--) if (history[i].t <= motion.time + 1e-9) { found = i; break }
      if (found < 0 || motion.time - history[found].t > .6) return resetState(motion, dist, low, speed)
      const h = history[found]
      history.length = found + 1
      Object.assign(st, copyState(h))
      if (Math.abs(h.t - motion.time) < 1e-9) return
      return stepState(motion, dist, low, speed, vx, vz)
    }
    const k = 1 - Math.exp(-dt / .085)
    for (let i = 0; i < 4; i++) st.dir[i] += (goal[i] - st.dir[i]) * k
    const total = st.dir[0] + st.dir[1] + st.dir[2] + st.dir[3] || 1
    for (let i = 0; i < 4; i++) st.dir[i] /= total
    for (const key of Object.keys(mixScratch)) delete mixScratch[key]
    locomotionMix(st.dir, speed, low, mixScratch)
    st.cycle += Math.min((dist - st.dist) / effectiveStride(mixScratch), MAX_CADENCE * dt)
    // smoothed world acceleration (low-pass of the velocity derivative) and hip offset
    const ka = 1 - Math.exp(-dt / .11)
    st.ax += ((vx - st.vx) / dt - st.ax) * ka; st.az += ((vz - st.vz) / dt - st.az) * ka
    st.vx = vx; st.vz = vz
    st.off += (goalOffset - st.off) * (1 - Math.exp(-dt / .14))
    st.speedS += (speed - st.speedS) * (1 - Math.exp(-dt / .25))
    st.t = motion.time; st.dist = dist
  }
  const record = () => { history.push(copyState(st)); if (history.length > 700) history.splice(0, 100) }

  // ---------------------------------------------------------------- runtime rig helpers
  const rotateWorld = (b: THREE.Bone, q: THREE.Quaternion) => {
    if (!b.parent) return
    b.parent.getWorldQuaternion(ik.pw)
    ik.qw.copy(ik.pw).invert().multiply(q).multiply(ik.pw)
    b.quaternion.premultiply(ik.qw)
  }
  const worldAxisAngle = (axis: THREE.Vector3, angle: number) => ik.q.setFromAxisAngle(axis, angle)
  /** Analytic two-bone IK: move the ankle to `goalPoint` keeping the animated knee direction;
   * the foot keeps its world orientation. */
  function solveLeg(leg: typeof legs[number], goalPoint: THREE.Vector3, footQuat: THREE.Quaternion) {
    const { thigh, calf, foot } = leg
    if (!thigh || !calf || !foot) return
    thigh.getWorldPosition(ik.hip); calf.getWorldPosition(ik.knee); foot.getWorldPosition(ik.ankle)
    const l1 = ik.hip.distanceTo(ik.knee), l2 = ik.knee.distanceTo(ik.ankle)
    ik.axis.copy(goalPoint).sub(ik.hip)
    const d = Math.min(Math.max(ik.axis.length(), Math.abs(l1 - l2) + .02), (l1 + l2) * .9985)
    ik.axis.normalize()
    // knee pole = current knee offset from the hip->ankle line
    ik.perp.copy(ik.knee).sub(ik.hip)
    ik.tmp.copy(ik.ankle).sub(ik.hip).normalize()
    ik.perp.addScaledVector(ik.tmp, -ik.perp.dot(ik.tmp))
    ik.perp.addScaledVector(ik.axis, -ik.perp.dot(ik.axis))
    if (ik.perp.lengthSq() < 1e-8) ik.perp.set(0, 0, 1).addScaledVector(ik.axis, -ik.axis.z)
    ik.perp.normalize()
    const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(1e-6, l1 * l1 - along * along))
    ik.newKnee.copy(ik.hip).addScaledVector(ik.axis, along).addScaledVector(ik.perp, h)
    // rotate the thigh, then the calf, in world space
    ik.from.copy(ik.knee).sub(ik.hip).normalize(); ik.to.copy(ik.newKnee).sub(ik.hip).normalize()
    ik.q.setFromUnitVectors(ik.from, ik.to); rotateWorld(thigh, ik.q); thigh.updateWorldMatrix(false, true)
    calf.getWorldPosition(ik.knee); foot.getWorldPosition(ik.ankle)
    ik.from.copy(ik.ankle).sub(ik.knee).normalize()
    ik.to.copy(ik.hip).addScaledVector(ik.axis, d).sub(ik.knee).normalize()
    ik.q.setFromUnitVectors(ik.from, ik.to); rotateWorld(calf, ik.q); calf.updateWorldMatrix(false, true)
    // restore the sole orientation
    if (foot.parent) { foot.parent.getWorldQuaternion(ik.pw); foot.quaternion.copy(ik.pw).invert().multiply(footQuat) }
    foot.updateWorldMatrix(false, true)
  }
  const plantAt = (name: string, side: 'l' | 'r', u: number) => {
    const table = plantTables[name]?.[side]
    if (!table) return 1
    const f = (((u % 1) + 1) % 1) * (table.length - 1), i = Math.floor(f)
    return table[i] + (table[Math.min(table.length - 1, i + 1)] - table[i]) * (f - i)
  }
  const leftAxis = new THREE.Vector3(), forwardAxis = new THREE.Vector3(), upAxis = new THREE.Vector3(0, 1, 0)

  return {
    root, figure, ring, label, hit,
    setQuality(next) { applyQuality(next) },
    setFocus(next) { focusOverride = next; if (next !== undefined && next !== focused) { focused = next; applyQuality(quality) } },
    stats() {
      const mesh = lodMeshes[activeLod]
      const idx = mesh?.geometry.index
      return { drawCalls: mesh ? 1 : 0, triangles: idx ? idx.count / 3 : 0, lod: activeLod, quality }
    },
    setPose(motion) {
      const pose = motion.pose ?? ''
      // Without an explicit setFocus(), the ball handler is the focus athlete.
      const wantFocus = focusOverride ?? motion.hasBall
      if (wantFocus !== focused) { focused = wantFocus; applyQuality(quality) }
      let flightAllowance = 0
      root.rotation.y = motion.facing
      if (studio && mixer) {
        // Skeleton LOD: unfocused low-quality athletes refresh their skeleton every other call
        // (the root still follows the simulation every frame).
        if (quality === 'low' && !focused && (frameParity ^= 1) === 1 && st.valid && Math.abs(motion.time - st.t) < .1) { root.rotation.y = motion.facing + st.off; return }
        for (const name of Object.keys(weights)) delete weights[name]
        for (const name of Object.keys(armWeights)) delete armWeights[name]
        const speed = motion.speed
        const vx = motion.velocity?.x ?? Math.sin(motion.facing) * speed
        const vz = motion.velocity?.z ?? Math.cos(motion.facing) * speed
        // Player space: +lateral = character's left, +forward = facing direction.
        const lateral = Math.cos(motion.facing) * vx - Math.sin(motion.facing) * vz
        const forward = Math.sin(motion.facing) * vx + Math.cos(motion.facing) * vz
        const closeoutIntent = pose === 'closeout' || (motion.defensive && (motion.hands ?? 0) > .76 && pose !== 'screen')
        const low = motion.defensive || closeoutIntent || pose === 'fight'
        const catching = /catch|receive/.test(pose)
        const locomotion = smoothstep(speed, .12, .6)
        goalOffset = sectorDir(Math.atan2(lateral, forward), speed, goal)
        const dist = (motion.phase ?? motion.time * motion.speed * PHASE_PER_METRE) / PHASE_PER_METRE
        stepState(motion, dist, low, speed, vx, vz)
        const hipYaw = THREE.MathUtils.clamp(st.off, -62 * DEG, 62 * DEG) * locomotion
        root.rotation.y = motion.facing + hipYaw
        const moving = Object.keys(mixScratch)
        // ---- legs / torso layer
        const readyClip = closeoutIntent ? 'closeout' : catching && speed < .5 ? 'receive' : motion.defensive ? 'defense_ready' : 'offense_ready'
        addWeight(weights, readyClip, 1 - locomotion)
        for (const name of moving) addWeight(weights, name, locomotion * mixScratch[name])
        flightAllowance = locomotion * ((weights.jog ?? 0) * .018 + (weights.sprint ?? 0) * .045 + (weights.defense_slide_fast_left ?? 0) * .03 + (weights.defense_slide_fast_right ?? 0) * .03)
        for (const [name, weight] of Object.entries(weights)) armWeights[name] = weight
        // ---- semantic actions (regular basketball vocabulary, not P&R specific)
        const skip = pose === 'skip' || pose === 'pass-skip'
        const special = pose === 'screen' ? 'screen_plant' : pose === 'fight' ? 'screen_fight' : /pivot|turn/.test(pose) ? 'pivot' : pose === 'cut' ? 'cut_plant'
          : pose === 'pass' || skip ? skip ? 'skip_pass' : 'chest_pass' : catching ? 'receive' : pose === 'shoot' ? 'shot_release'
          : closeoutIntent ? 'closeout' : pose === 'dribble' || motion.hasBall ? 'dribble' : ''
        debug.special = special
        if (special) {
          const bodyOwner = special === 'screen_plant' || special === 'pivot' || special === 'screen_fight' || special === 'cut_plant' || special === 'chest_pass' || special === 'skip_pass' || special === 'shot_release'
          const settle = bodyOwner ? 1 - smoothstep(speed, special === 'screen_fight' ? 1.4 : .6, special === 'screen_fight' ? 2.4 : 1.3) : 0
          if (settle > 0) {
            for (const name of Object.keys(weights)) weights[name] *= 1 - settle
            addWeight(weights, special, settle)
          }
          const amount = special === 'dribble' || special === 'closeout' ? .95 : 1
          for (const name of Object.keys(armWeights)) armWeights[name] *= 1 - amount
          addWeight(armWeights, special, amount)
        }
        const plantMix: [number, number] = [0, 0]
        let weightSum = 0
        for (const [layeredName, action] of Object.entries(actions)) {
          const [name, section] = layeredName.split(':')
          const weight = (section === 'arms' ? armWeights[name] : weights[name]) ?? 0
          action.enabled = weight > .0001; action.setEffectiveWeight(weight)
          if (!action.enabled) continue
          const duration = durations[name] ?? action.getClip().duration
          const gaitClip = GAIT_NAMES.includes(name)
          // Locomotion loops are driven by ground distance; everything else by sim time.
          const cycle = gaitClip ? st.cycle : motion.time / duration + index * .173
          action.time = ((cycle % 1) + 1) % 1 * duration
          if ((name === 'chest_pass' || name === 'skip_pass') && motion.ball) {
            const distance = Math.hypot(motion.ball.x - root.position.x, motion.ball.z - root.position.z)
            action.time = duration * .5 * THREE.MathUtils.clamp((distance - .16) / (name === 'skip_pass' ? 1.3 : .85), 0, 1)
          }
          if (name === 'shot_release' && motion.ball) action.time = duration * .5 * THREE.MathUtils.clamp((motion.ball.y - 1.35) / .85, 0, 1)
          if (name === 'dribble' && motion.ball) {
            const bounce = THREE.MathUtils.clamp((motion.ball.y - .5) / .65, 0, 1)
            action.time = Math.acos(2 * bounce - 1) / TAU * duration
          }
          if (section === 'lower') {
            const u = action.time / duration
            plantMix[0] += weight * plantAt(name, 'l', u); plantMix[1] += weight * plantAt(name, 'r', u); weightSum += weight
          }
        }
        debug.cycle = st.cycle; debug.dir = st.dir; debug.stride = effectiveStride(mixScratch); debug.hipOffset = hipYaw / DEG
        debug.cadence = motion.speed / (debug.stride || 1)
        debug.clip = Object.entries(weights).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
        mixer.update(0)
        // ---- body mechanics: chest counter-twist, acceleration lean, braking sink
        root.updateMatrixWorld(true)
        const fullRig = quality !== 'low' || focused
        const cosF = Math.cos(motion.facing), sinF = Math.sin(motion.facing)
        const aF = sinF * st.ax + cosF * st.az, aL = cosF * st.ax - sinF * st.az
        const planarSpeed = Math.min(1, speed / 1.5 + .25)
        // forward lean when speeding up, back lean + sink when braking; lean into lateral/turning accel
        const targetPitch = THREE.MathUtils.clamp(aF * .028, -.14, .22) * planarSpeed
        const targetRoll = THREE.MathUtils.clamp(-aL * .02, -.2, .2) * planarSpeed
        const braking = THREE.MathUtils.clamp(-aF * .0085 - Math.abs(aL) * .002, 0, .06) * smoothstep(st.speedS, .3, 1.2)
        st.pitch += (targetPitch - st.pitch) * .35; st.roll += (targetRoll - st.roll) * .35; st.crouch += (braking - st.crouch) * .3
        for (let i = 0; i < 2; i++) { const f = feet[i]; if (f) { f.getWorldPosition(animatedAnkle[i]); f.getWorldQuaternion(ankleQuat[i]) } }
        if (fullRig) {
          leftAxis.set(cosF, 0, -sinF); forwardAxis.set(sinF, 0, cosF)
          if (spine.length) {
            // chest + head return to the facing direction after the hip yaw
            const counter = -hipYaw
            for (const b of spine) rotateWorld(b, worldAxisAngle(upAxis, counter * .24))
            if (neck) rotateWorld(neck, worldAxisAngle(upAxis, counter * .14))
            if (head) rotateWorld(head, worldAxisAngle(upAxis, counter * .14))
            for (const b of spine) {
              rotateWorld(b, worldAxisAngle(leftAxis, st.pitch * .3)); rotateWorld(b, worldAxisAngle(forwardAxis, st.roll * .3))
            }
            if (neck) rotateWorld(neck, worldAxisAngle(leftAxis, -st.pitch * .45))
            if (head) rotateWorld(head, worldAxisAngle(leftAxis, -st.pitch * .3))
          }
          if (pelvis?.parent && st.crouch > .002) {
            pelvis.parent.getWorldQuaternion(ik.pw).invert()
            pelvis.position.add(ik.tmp.set(0, -st.crouch * .9 / (scale || 1), 0).applyQuaternion(ik.pw))
          }
          rig.updateMatrixWorld(true)
        }
        // ---- foot-lock IK: planted feet stay on the court through blends, starts and stops
        const plantL = weightSum > 1e-4 ? plantMix[0] / weightSum : 1, plantR = weightSum > 1e-4 ? plantMix[1] / weightSum : 1
        let lockCount = 0
        for (let i = 0; i < 2; i++) {
          const lock = st.lock[i], A = animatedAnkle[i], plant = i === 0 ? plantL : plantR
          const leg = legs[i]
          if (!leg.foot || !leg.thigh || !leg.calf) continue
          const yawNow = root.rotation.y
          if (plant > .55 && fullRig) {
            if (!lock.on || Math.abs(wrapPi(yawNow - lock.yaw)) > .75) { lock.on = true; lock.x = A.x; lock.z = A.z; lock.yaw = yawNow }
            let ex = lock.x - A.x, ez = lock.z - A.z
            const err = Math.hypot(ex, ez), maxErr = .34
            if (err > maxErr) { // drag the anchor so the residual slide is minimal and bounded
              const s = maxErr / err; lock.x = A.x + ex * s; lock.z = A.z + ez * s; ex *= s; ez *= s
            }
            const k = smoothstep(plant, .55, .9)
            ik.goal.set(A.x + ex * k, A.y, A.z + ez * k)
            solveLeg(leg, ik.goal, ankleQuat[i])
            lockCount++
          } else {
            lock.on = false
            if (fullRig && (st.crouch > .002)) solveLeg(leg, A, ankleQuat[i])
          }
        }
        debug.locks = lockCount; debug.lockOn = [st.lock[0].on, st.lock[1].on]
        record()
      } else {
        const clip = motion.speed > .22 ? motion.defensive && motion.speed < 3.2 ? 'defense_slide' : 'cut_sprint' : motion.defensive && glb ? 'defensive_deny' : 'idle_ready'
        if (clip !== lastFallbackClip) { mixer?.stopAllAction(); actions[clip]?.reset().play(); lastFallbackClip = clip }
        mixer?.setTime(motion.time + index * .173)
      }
      figure.position.y = 0
      // Ground the blended pose. The correction always lifts a foot that would sink and
      // pulls down a floating blend, but leaves a small allowance for the flight phase
      // of jogs/sprints/hop-slides so running keeps its bounce.
      if (feet.length) {
        root.updateMatrixWorld(true)
        let lowest = Infinity
        for (const foot of feet) lowest = Math.min(lowest, foot.getWorldPosition(footPoint).y)
        const wanted = root.position.y + .006 + .0867 * scale
        const delta = wanted - lowest
        figure.position.y = THREE.MathUtils.clamp(delta > 0 ? delta : Math.min(0, delta + flightAllowance * scale), -.16, .12)
      }
      // Only the contact correction remains procedural. The authored body/footwork
      // survives the solve; one ball target drives the visible hand, never the ball.
      if (motion.ball && (motion.hasBall || /catch|pass|shoot|skip/.test(pose))) {
        root.updateMatrixWorld(true)
        target.set(motion.ball.x, motion.ball.y, motion.ball.z)
        if (pose === 'dribble') target.y = Math.max(target.y + .10, .9)
        if (target.distanceToSquared(root.position) < 4.5) {
          const iterations = quality === 'high' ? 2 : 1
          const twoHanded = /catch|pass|shoot|skip/.test(pose)
          // character-left in world space is (cos f, 0, -sin f): the two hands bracket the ball
          const sx = Math.cos(motion.facing), sz = -Math.sin(motion.facing)
          if (twoHanded) target.x -= sx * .085, target.z -= sz * .085
          if (rightHand) aimArm(arms.right, rightHand, target, scratch, iterations)
          if (leftHand && twoHanded) {
            otherTarget.set(motion.ball.x + sx * .085, motion.ball.y, motion.ball.z + sz * .085)
            aimArm(arms.left, leftHand, otherTarget, scratch, iterations)
          }
        }
      }
    },
  }
}

type ArmScratch = { hand: THREE.Vector3; joint: THREE.Vector3; from: THREE.Vector3; to: THREE.Vector3; parent: THREE.Quaternion; inverse: THREE.Quaternion; delta: THREE.Quaternion; identity: THREE.Quaternion }
/** Bounded wrist contact correction over an authored pose. Scratch objects are
 * actor-owned so ten athletes do not allocate vectors in the animation loop. */
function aimArm(chain: THREE.Bone[], hand: THREE.Bone, target: THREE.Vector3, scratch: ArmScratch, iterations: number) {
  for (let iteration = 0; iteration < iterations; iteration++) for (const joint of chain) {
    if (!joint.parent) continue
    hand.getWorldPosition(scratch.hand); joint.getWorldPosition(scratch.joint)
    scratch.from.copy(scratch.hand).sub(scratch.joint); scratch.to.copy(target).sub(scratch.joint)
    if (scratch.from.lengthSq() < 1e-8 || scratch.to.lengthSq() < 1e-8) continue
    scratch.delta.setFromUnitVectors(scratch.from.normalize(), scratch.to.normalize())
    // Limit each joint correction to 16 degrees so a distant target cannot destroy
    // the authored shoulder/elbow silhouette or imply an impossible catch.
    const angle = scratch.delta.angleTo(scratch.identity)
    if (angle > .28) scratch.delta.slerp(scratch.identity, 1 - .28 / angle)
    joint.parent.getWorldQuaternion(scratch.parent)
    scratch.inverse.copy(scratch.parent).invert().multiply(scratch.delta).multiply(scratch.parent)
    joint.quaternion.premultiply(scratch.inverse); joint.updateWorldMatrix(false, true)
  }
}

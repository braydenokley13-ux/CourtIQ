import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { buildGlbAthletePreview, getGlbAthleteHandle, loadGlbAthleteAsset as loadSourceRig } from '../scenario3d/glbAthlete'
import { buildSkinnedAthletePreview, getSkinnedAthleteHandle } from '../scenario3d/skinnedAthlete'

/** DCC-authored geometry + a reusable basketball action library on one skeleton.
 * Blender source, build/optimization scripts and provenance are bundled
 * (scripts/athlete, public/athlete/LAB-ATHLETE-STUDIO.md).
 *
 * Motion model
 *  - Time-driven loops (stances, screen, pass, catch, dribble...) are sampled by absolute
 *    simulation time.
 *  - Distance-driven locomotion loops (walk, jog, sprint, slides, backpedal, chop) are
 *    authored so ONE loop covers exactly `stride` metres of ground; planted feet then move
 *    at ground speed and do not skate. The cycle advances by (ground distance / blended
 *    stride). Direction relative to facing picks forward / slide-left / slide-right /
 *    backpedal; speed picks walk-or-chop / jog / sprint / slow-or-fast slide.
 *  - Arms are a separate layer over the legs/torso so passing, catching, dribbling or
 *    contesting never interrupts footwork. */
let studioAsset: GLTF | undefined
let studioMotion: MotionTable | undefined
let loading: Promise<boolean> | undefined
interface MotionTable { clips?: Record<string, { mode?: string; strideMeters?: number }> }
export function loadGlbAthleteAsset(): Promise<boolean> {
  if (!loading) loading = new GLTFLoader().loadAsync('/athlete/lab-athlete.glb').then(asset => {
    if (!asset.animations.length) throw new Error('Basketball action library missing')
    studioAsset = asset
    studioMotion = (asset.asset?.extras as { CourtIQMotion?: MotionTable } | undefined)?.CourtIQMotion
    return true
  }).catch(async () => !!(await loadSourceRig()))
  return loading
}
export interface AthleteAppearance {
  id: string; team: string; height?: number; role?: string
  /** Jersey number; defaults to the digits in `id`. Optional additions only. */
  number?: number | string
  /** 0.9-1.12 shoulder/hip width multiplier. Defaults to a deterministic build per index. */
  build?: number
  /** Index into the skin-tone palette. Defaults to the player's index. */
  skinTone?: number
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
export interface LabAthlete {
  root: THREE.Group; figure: THREE.Group; ring: THREE.Mesh; label: THREE.Sprite; hit: THREE.Mesh
  setPose(motion: AthleteMotion): void
  /** Both meshes use the same bones/mixer; quality changes never double rig work. */
  setQuality(quality: 'high' | 'low'): void
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
const TAU = Math.PI * 2
const PHASE_PER_METRE = 4.2

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

/** Front/back numerals, side-seam stripes and a faint knit on the jersey UV atlas
 * (front panel u 0.03-0.47, back panel u 0.53-0.97, v 0 = hem, 1 = shoulder). */
function jerseyTexture(kit: typeof DEFENSE_KIT, number: string) {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 384
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = kit.body; ctx.fillRect(0, 0, 512, 384)
  // Contrast side-seam stripes (the atlas seams sit at u = 0, .5, 1).
  ctx.fillStyle = kit.trim
  for (const x of [0, 242, 500]) ctx.fillRect(x, 0, x === 242 ? 28 : 12, 384)
  // Faint horizontal knit so large jerseys do not read as flat plastic.
  ctx.globalAlpha = .05; ctx.fillStyle = '#000'
  for (let y = 0; y < 384; y += 4) ctx.fillRect(0, y, 512, 1)
  ctx.globalAlpha = 1
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'
  const draw = (cx: number, cy: number, size: number) => {
    ctx.font = `800 ${size}px Arial Black, Arial, sans-serif`
    ctx.lineWidth = size * .09; ctx.strokeStyle = kit.outline; ctx.strokeText(number, cx, cy)
    ctx.fillStyle = kit.number; ctx.fillText(number, cx, cy)
  }
  draw(128, 166, 118) // chest
  draw(384, 150, 150) // back
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4; map.flipY = false
  return map
}

const smoothstep = THREE.MathUtils.smoothstep
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
interface GaitState { t: number; dist: number; cycle: number; dir: [number, number, number, number]; valid: boolean }
interface GaitRecord { t: number; cycle: number; dir: [number, number, number, number]; dist: number }

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
  let sharedSkeleton: THREE.Skeleton | undefined
  const ownedMaterials = new Map<THREE.Material, THREE.Material>()
  const ownedGeometries = new Map<THREE.BufferGeometry, THREE.BufferGeometry>()
  const skin = new THREE.Color(skinTones[(player.skinTone ?? index) % skinTones.length])
  const shoes = shoeTones[index % shoeTones.length]
  let jerseyMap: THREE.Texture | undefined
  const upgrade = (source: THREE.Material): THREE.Material => {
    const base = source as THREE.MeshStandardMaterial
    if (!studio || !base.color) return source.clone()
    const m = new THREE.MeshPhysicalMaterial({ name: base.name, color: base.color.clone(), roughness: base.roughness, metalness: 0, map: base.map ?? null })
    switch (base.name) {
      case 'athlete_skin': // warm sheen stands in for subsurface scatter at the shadow terminator
        m.color.copy(skin); m.roughness = .56; m.sheen = 1; m.sheenColor = new THREE.Color(skin).lerp(new THREE.Color('#ff8a66'), .55).multiplyScalar(.7); m.sheenRoughness = .62; m.specularIntensity = .55
        break
      case 'athlete_jersey': case 'athlete_kit': {
        const body = base.name === 'athlete_jersey' ? kit.body : kit.shorts
        m.color.set(base.name === 'athlete_jersey' && jerseyMap ? '#ffffff' : body)
        if (base.name === 'athlete_jersey' && jerseyMap) m.map = jerseyMap
        m.roughness = .86; m.specularIntensity = .22; m.sheen = 1; m.sheenColor = new THREE.Color(body).lerp(new THREE.Color('#ffffff'), .42); m.sheenRoughness = .42
        break
      }
      case 'athlete_trim': m.color.set(kit.trim); m.roughness = .8; m.sheen = .6; m.sheenColor = new THREE.Color(kit.trim); m.sheenRoughness = .5; break
      case 'athlete_shoe': m.color.set(shoes[0]); m.roughness = .42; m.clearcoat = .4; m.clearcoatRoughness = .35; m.specularIntensity = .6; break
      case 'athlete_sole': m.color.set(shoes[1]); m.roughness = .82; break
      case 'athlete_hair': m.color.set(hairTones[(player.skinTone ?? index) % hairTones.length]); m.roughness = .9; m.sheen = .5; m.sheenColor = new THREE.Color('#5d4a3c'); m.sheenRoughness = .7; break
      case 'athlete_eye': m.roughness = .3; break
    }
    return m
  }
  if (studio) jerseyMap = jerseyTexture(kit, number)
  figure.traverse(object => {
    if (/indicator|shadow|halo|chevron/i.test(object.name)) object.visible = false
    const mesh = object as THREE.Mesh
    if (!mesh.isMesh) return
    if (studio && (mesh as THREE.SkinnedMesh).isSkinnedMesh) {
      const skinned = mesh as THREE.SkinnedMesh
      // SkeletonUtils clones a Skeleton per primitive. All exported primitives
      // share this one skin, so consolidate their palette/update work again.
      if (sharedSkeleton) skinned.bind(sharedSkeleton, skinned.bindMatrix)
      else sharedSkeleton = skinned.skeleton
    }
    mesh.castShadow = true; mesh.receiveShadow = false; mesh.userData.playerId = player.id
    // Each actor owns its resources. Teardown cannot invalidate the cached GLTF or
    // another actor; shared primitive materials are cloned once within this actor.
    if (!ownedGeometries.has(mesh.geometry)) ownedGeometries.set(mesh.geometry, mesh.geometry.clone())
    mesh.geometry = ownedGeometries.get(mesh.geometry)!
    const adapt = (material: THREE.Material) => {
      if (!ownedMaterials.has(material)) ownedMaterials.set(material, upgrade(material))
      return ownedMaterials.get(material)!
    }
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(adapt) : adapt(mesh.material)
  })
  const highMesh = studio?.getObjectByName('LOD0_athlete'), lowMesh = studio?.getObjectByName('LOD1_athlete')
  if (lowMesh) lowMesh.visible = false
  const numbers: THREE.Mesh[] = []
  if (studio && !jerseyMapUsed()) {
    // Older asset without a jersey UV atlas: fall back to number cards on the chest/back.
    const chest = rig.getObjectByName('spine_02')
    if (chest) {
      const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 160
      const ctx = canvas.getContext('2d')!; ctx.fillStyle = kit.number; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = 'bold 112px Arial'; ctx.fillText(number, 64, 82)
      const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace
      const material = new THREE.MeshStandardMaterial({ map, transparent: true, roughness: .95, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 })
      for (const back of [false, true]) {
        const card = new THREE.Mesh(new THREE.PlaneGeometry(.12, .15), material)
        card.name = 'practice-jersey-number'; card.position.set(0, 1.255, back ? -.148 : .14); if (back) card.rotation.y = Math.PI
        rig.add(card); figure.updateMatrixWorld(true); chest.attach(card); numbers.push(card)
      }
    }
  }
  function jerseyMapUsed() {
    let used = false
    for (const material of ownedMaterials.values()) if (material.name === 'athlete_jersey') used = true
    return used
  }
  root.add(figure)
  const ring = new THREE.Mesh(new THREE.RingGeometry(.31, .36, 48), new THREE.MeshBasicMaterial({ color: defensive ? '#347a7b' : '#bb704b', transparent: true, opacity: .42, depthWrite: false }))
  ring.rotation.x = -Math.PI / 2; ring.position.y = .024; root.add(ring)
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(player.id, defensive), depthTest: true, depthWrite: false, transparent: true }))
  label.scale.set(.52, .303, 1); label.position.set(0, height + .28, 0); root.add(label)
  const hit = new THREE.Mesh(new THREE.CylinderGeometry(.4, .4, height + .35, 8), new THREE.MeshBasicMaterial({ visible: false }))
  hit.position.y = height * .5; hit.userData.playerId = player.id; root.add(hit)
  const mixer = studio ? new THREE.AnimationMixer(studio) : glb?.mixer ?? procedural?.mixer
  const actions: Record<string, THREE.AnimationAction> = studio ? {} : glb?.actions ?? procedural?.actions ?? {}
  const durations: Record<string, number> = {}
  const stride: Record<string, number> = { ...DEFAULT_STRIDE }
  if (studioMotion?.clips) for (const [name, entry] of Object.entries(studioMotion.clips)) if (entry.strideMeters) stride[name] = entry.strideMeters
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
  const feet = ['foot_l', 'foot_r'].map(name => rig.getObjectByName(name) as THREE.Bone | undefined).filter((bone): bone is THREE.Bone => !!bone)
  const rightHand = rig.getObjectByName('hand_r') as THREE.Bone | undefined
  const leftHand = rig.getObjectByName('hand_l') as THREE.Bone | undefined
  const arms = {
    right: ['lowerarm_r', 'upperarm_r'].map(name => rig.getObjectByName(name) as THREE.Bone).filter(Boolean),
    left: ['lowerarm_l', 'upperarm_l'].map(name => rig.getObjectByName(name) as THREE.Bone).filter(Boolean),
  }
  const scratch = { hand: new THREE.Vector3(), joint: new THREE.Vector3(), from: new THREE.Vector3(), to: new THREE.Vector3(), parent: new THREE.Quaternion(), inverse: new THREE.Quaternion(), delta: new THREE.Quaternion(), identity: new THREE.Quaternion() }
  const target = new THREE.Vector3(), otherTarget = new THREE.Vector3(), footPoint = new THREE.Vector3()
  const weights: Record<string, number> = {}, armWeights: Record<string, number> = {}
  const gait: GaitState = { t: NaN, dist: 0, cycle: 0, dir: [1, 0, 0, 0], valid: false }
  const history: GaitRecord[] = []
  const debug = { clip: '', stride: 0, cycle: 0, dir: [1, 0, 0, 0] as number[], cadence: 0, special: '', weights: weights as Record<string, number> }
  figure.userData.motionDebug = debug
  let quality: 'high' | 'low' = 'high', lastFallbackClip = ''
  const addWeight = (target: Record<string, number>, name: string, weight: number) => { if (weight > 1e-5) target[name] = (target[name] ?? 0) + weight }

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
  const targetDir = (forward: number, lateral: number, speed: number, out: [number, number, number, number]) => {
    if (speed < 1e-3) { out[0] = 1; out[1] = out[2] = out[3] = 0; return }
    const p = 1.7 // sharpen so the dominant direction clip carries the motion
    const f = (Math.max(0, forward) / speed) ** p, b = (Math.max(0, -forward) / speed) ** p
    const l = (Math.max(0, lateral) / speed) ** p, r = (Math.max(0, -lateral) / speed) ** p
    const total = f + b + l + r || 1
    out[0] = f / total; out[1] = b / total; out[2] = l / total; out[3] = r / total
  }
  const goal: [number, number, number, number] = [1, 0, 0, 0]
  const mixScratch: Record<string, number> = {}

  /** Advance (or restore) the gait cycle. Absolute sampling is kept where it matters:
   * revisiting a time that was already played returns the exact stored state, and any
   * unplayed jump re-seeds from the absolute ground distance. */
  function stepGait(motion: AthleteMotion, dist: number, low: boolean, speed: number) {
    const record = (): void => {
      history.push({ t: gait.t, cycle: gait.cycle, dir: [...gait.dir], dist: gait.dist })
      if (history.length > 700) history.splice(0, 100)
    }
    const dt = motion.time - gait.t
    const reseed = () => {
      gait.dir = [...goal]
      for (const key of Object.keys(mixScratch)) delete mixScratch[key]
      locomotionMix(gait.dir, speed, low, mixScratch)
      gait.t = motion.time; gait.dist = dist
      gait.cycle = dist / effectiveStride(mixScratch) + index * .173
      gait.valid = true
      history.length = 0; record()
    }
    if (!gait.valid || Number.isNaN(gait.t)) return reseed()
    if (dt === 0) return
    if (dt < 0 || dt > .6 || dist < gait.dist - 1e-6) {
      // Rewind/scrub: restore the exact played state when we have it, else nearest earlier.
      let found = -1
      for (let i = history.length - 1; i >= 0; i--) if (history[i].t <= motion.time + 1e-9) { found = i; break }
      if (found < 0 || motion.time - history[found].t > .6) return reseed()
      const h = history[found]
      history.length = found + 1
      gait.t = h.t; gait.cycle = h.cycle; gait.dir = [...h.dir]; gait.dist = h.dist
      if (Math.abs(h.t - motion.time) < 1e-9) return
      return stepGait(motion, dist, low, speed)
    }
    const k = 1 - Math.exp(-dt / .085)
    for (let i = 0; i < 4; i++) gait.dir[i] += (goal[i] - gait.dir[i]) * k
    const total = gait.dir[0] + gait.dir[1] + gait.dir[2] + gait.dir[3] || 1
    for (let i = 0; i < 4; i++) gait.dir[i] /= total
    for (const key of Object.keys(mixScratch)) delete mixScratch[key]
    locomotionMix(gait.dir, speed, low, mixScratch)
    gait.cycle += Math.min((dist - gait.dist) / effectiveStride(mixScratch), MAX_CADENCE * dt)
    gait.t = motion.time; gait.dist = dist
    record()
  }

  return {
    root, figure, ring, label, hit,
    setQuality(next) {
      quality = next
      if (highMesh) highMesh.visible = next === 'high'
      if (lowMesh) lowMesh.visible = next === 'low'
      for (const number of numbers) number.visible = next === 'high'
    },
    setPose(motion) {
      root.rotation.y = motion.facing
      figure.position.y = 0
      const pose = motion.pose ?? ''
      let flightAllowance = 0
      if (studio && mixer) {
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
        targetDir(forward, lateral, speed, goal)
        const dist = (motion.phase ?? motion.time * motion.speed * PHASE_PER_METRE) / PHASE_PER_METRE
        stepGait(motion, dist, low, speed)
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
          const bodyOwner = special === 'screen_plant' || special === 'pivot' || special === 'screen_fight' || special === 'cut_plant'
          const settle = bodyOwner ? 1 - smoothstep(speed, special === 'screen_fight' ? 1.4 : .6, special === 'screen_fight' ? 2.4 : 1.3) : 0
          if (settle > 0) {
            for (const name of Object.keys(weights)) weights[name] *= 1 - settle
            addWeight(weights, special, settle)
          }
          const amount = special === 'dribble' || special === 'closeout' ? .95 : 1
          for (const name of Object.keys(armWeights)) armWeights[name] *= 1 - amount
          addWeight(armWeights, special, amount)
        }
        for (const [layeredName, action] of Object.entries(actions)) {
          const [name, section] = layeredName.split(':')
          const weight = (section === 'arms' ? armWeights[name] : weights[name]) ?? 0
          action.enabled = weight > .0001; action.setEffectiveWeight(weight)
          if (!action.enabled) continue
          const duration = durations[name] ?? action.getClip().duration
          const gaitClip = GAIT_NAMES.includes(name)
          // Locomotion loops are driven by ground distance; everything else by sim time.
          const cycle = gaitClip ? gait.cycle : motion.time / duration + index * .173
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
        }
        debug.cycle = gait.cycle; debug.dir = gait.dir; debug.stride = effectiveStride(mixScratch)
        debug.cadence = motion.speed / (debug.stride || 1)
        debug.clip = Object.entries(weights).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
        mixer.update(0)
      } else {
        const clip = motion.speed > .22 ? motion.defensive && motion.speed < 3.2 ? 'defense_slide' : 'cut_sprint' : motion.defensive && glb ? 'defensive_deny' : 'idle_ready'
        if (clip !== lastFallbackClip) { mixer?.stopAllAction(); actions[clip]?.reset().play(); lastFallbackClip = clip }
        mixer?.setTime(motion.time + index * .173)
      }
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
          if (rightHand) aimArm(arms.right, rightHand, target, scratch, quality === 'high' ? 2 : 1)
          if (leftHand && /catch|pass|shoot|skip/.test(pose)) {
            otherTarget.copy(target); otherTarget.x -= Math.cos(motion.facing) * .11; otherTarget.z += Math.sin(motion.facing) * .11
            aimArm(arms.left, leftHand, otherTarget, scratch, quality === 'high' ? 2 : 1)
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

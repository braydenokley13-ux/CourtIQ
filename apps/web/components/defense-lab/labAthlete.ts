import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { buildGlbAthletePreview, getGlbAthleteHandle, loadGlbAthleteAsset as loadSourceRig } from '../scenario3d/glbAthlete'
import { buildSkinnedAthletePreview, getSkinnedAthleteHandle } from '../scenario3d/skinnedAthlete'

/** DCC-authored geometry + 13 reusable basketball actions, sharing one skeleton.
 * The Blender source, build/optimization scripts and provenance are bundled. */
let studioAsset: GLTF | undefined
let loading: Promise<boolean> | undefined
export function loadGlbAthleteAsset(): Promise<boolean> {
  if (!loading) loading = new GLTFLoader().loadAsync('/athlete/lab-athlete.glb').then(asset => {
    if (!asset.animations.length) throw new Error('Basketball action library missing')
    studioAsset = asset
    return true
  }).catch(async () => !!(await loadSourceRig()))
  return loading
}
export interface AthleteAppearance { id: string; team: string; height?: number; role?: string }
export interface AthleteMotion { time: number; speed: number; velocity?: { x: number; z: number }; defensive: boolean; pose?: string; phase?: number; hands?: number; ball?: { x: number; y: number; z: number }; hasBall: boolean; facing: number }
export interface LabAthlete {
  root: THREE.Group; figure: THREE.Group; ring: THREE.Mesh; label: THREE.Sprite; hit: THREE.Mesh
  setPose(motion: AthleteMotion): void
  /** Both meshes use the same bones/mixer; quality changes never double rig work. */
  setQuality(quality: 'high' | 'low'): void
}
export const DEFENSE_COLOR = '#1c6263'
export const OFFENSE_COLOR = '#f1e9d3'
const skinTones = ['#ae7953', '#c79670', '#79523f', '#d1a182', '#9c6c4e']
const TAU = Math.PI * 2

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

export function createLabAthlete(player: AthleteAppearance, index: number, ready: boolean): LabAthlete {
  const defensive = player.team === 'defense' || player.id.startsWith('D')
  const teamColor = defensive ? DEFENSE_COLOR : OFFENSE_COLOR
  const height = player.height ?? (index % 5 === 1 ? 1.99 : 1.87)
  const root = new THREE.Group(); root.name = `lab-player-${player.id}`; root.userData.playerId = player.id
  const studio = ready && studioAsset ? cloneSkinned(studioAsset.scene) : null
  let figure: THREE.Group
  if (studio) { figure = new THREE.Group(); figure.name = 'basketball-studio-athlete'; figure.add(studio) }
  else figure = (ready ? buildGlbAthletePreview(teamColor, '#dc713d', false, false, player.id.slice(-1), defensive ? 'defensive' : 'idle') : null)
    ?? buildSkinnedAthletePreview(teamColor, '#dc713d', false, false, player.id.slice(-1), defensive ? 'defensive' : 'idle') ?? new THREE.Group()
  const glb = getGlbAthleteHandle(figure), procedural = getSkinnedAthleteHandle(figure)
  const rig = studio ?? glb?.cloned ?? figure
  const scale = height / (studio || glb ? 1.808 : 5.95)
  figure.scale.setScalar(scale)
  let sharedSkeleton: THREE.Skeleton | undefined
  const ownedMaterials = new Map<THREE.Material, THREE.Material>()
  const ownedGeometries = new Map<THREE.BufferGeometry, THREE.BufferGeometry>()
  const skin = new THREE.Color(skinTones[index % skinTones.length])
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
      if (!ownedMaterials.has(material)) {
        const copy = material.clone() as THREE.MeshStandardMaterial
        if (studio && copy.color) {
          if (copy.name === 'athlete_skin') copy.color.copy(skin)
          if (copy.name === 'athlete_kit') copy.color.set(teamColor)
          if (copy.name === 'athlete_trim') copy.color.set(defensive ? '#d5dfd5' : '#355c5e')
          if (copy.name === 'athlete_shoe') copy.color.set(index % 2 ? '#e3dfd2' : '#293e3a')
          if (copy.name === 'athlete_hair') copy.color.set(index % 3 === 0 ? '#312820' : '#191b18')
          copy.metalness = 0
        }
        ownedMaterials.set(material, copy)
      }
      return ownedMaterials.get(material)!
    }
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(adapt) : adapt(mesh.material)
  })
  const highMesh = studio?.getObjectByName('LOD0_athlete'), lowMesh = studio?.getObjectByName('LOD1_athlete')
  if (lowMesh) lowMesh.visible = false
  const numbers: THREE.Mesh[] = []
  if (studio) {
    const chest = rig.getObjectByName('spine_02')
    if (chest) {
      const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 160
      const ctx = canvas.getContext('2d')!; ctx.fillStyle = defensive ? '#eee9d7' : '#285154'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = 'bold 112px Arial'; ctx.fillText(player.id.slice(-1), 64, 82)
      const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace
      const material = new THREE.MeshStandardMaterial({ map, transparent: true, roughness: .95, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 })
      for (const back of [false, true]) {
        const number = new THREE.Mesh(new THREE.PlaneGeometry(.12, .15), material)
        number.name = 'practice-jersey-number'; number.position.set(0, 1.255, back ? -.148 : .14); if (back) number.rotation.y = Math.PI
        rig.add(number); figure.updateMatrixWorld(true); chest.attach(number); numbers.push(number)
      }
    }
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
  if (studio && studioAsset && mixer) for (const clip of studioAsset.animations) {
    // Layer authored upper-body intent over uninterrupted locomotion. A player
    // passing while cutting keeps the run's stance/contact timing in his legs.
    for (const section of ['lower', 'upper']) {
      const tracks = clip.tracks.filter(track => /^(spine|neck|Head|clavicle|upperarm|lowerarm|hand)/.test(track.name) === (section === 'upper'))
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
  const weights: Record<string, number> = {}, upperWeights: Record<string, number> = {}
  let quality: 'high' | 'low' = 'high', lastFallbackClip = ''
  const addWeight = (name: string, weight: number) => { weights[name] = (weights[name] ?? 0) + weight }
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
      if (studio && mixer) {
        // Absolute clip sampling makes pause/rewind/fork reproducible. The engine's
        // integrated ground-distance phase sets cadence; no hidden render clock.
        for (const name of Object.keys(weights)) delete weights[name]
        const locomotion = THREE.MathUtils.smoothstep(motion.speed, .18, 1.1)
        const vx = motion.velocity?.x ?? Math.sin(motion.facing) * motion.speed
        const vz = motion.velocity?.z ?? Math.cos(motion.facing) * motion.speed
        const lateral = Math.cos(motion.facing) * vx - Math.sin(motion.facing) * vz
        const forward = Math.sin(motion.facing) * vx + Math.cos(motion.facing) * vz
        const slide = motion.defensive && Math.abs(lateral) > Math.abs(forward) * .65 && motion.speed < 3.8
        const movingClip = slide ? lateral > 0 ? 'defense_slide_left' : 'defense_slide_right' : motion.speed < 1.35 ? 'start_stop' : 'cut_run'
        addWeight(motion.defensive ? 'defense_ready' : 'offense_ready', 1 - locomotion)
        addWeight(movingClip, locomotion)
        for (const name of Object.keys(upperWeights)) delete upperWeights[name]
        Object.assign(upperWeights, weights)
        // Semantic actions are regular basketball vocabulary, not P&R-specific code.
        const special = pose === 'screen' ? 'screen_plant' : pose === 'pass' ? 'chest_pass' : /catch|receive/.test(pose) ? 'receive' : /pivot|turn/.test(pose) ? 'pivot' : pose === 'shoot' ? 'shot_release' : motion.defensive && (motion.hands ?? 0) > .76 ? 'closeout' : pose === 'dribble' || motion.hasBall ? 'dribble' : ''
        if (special) {
          const amount = special === 'screen_plant' || special === 'pivot' ? 1 : .92
          for (const name of Object.keys(upperWeights)) upperWeights[name] *= 1 - amount
          upperWeights[special] = amount
          if (special === 'screen_plant' || special === 'pivot') {
            for (const name of Object.keys(weights)) weights[name] = 0
            addWeight(special, 1)
          }
        }
        for (const [layeredName, action] of Object.entries(actions)) {
          const [name, section] = layeredName.split(':')
          const weight = (section === 'upper' ? upperWeights[name] : weights[name]) ?? 0
          action.enabled = weight > .0001; action.setEffectiveWeight(weight)
          if (!action.enabled) continue
          const duration = action.getClip().duration
          const movement = /cut_run|start_stop|defense_slide/.test(name)
          // 4.2 rad/m is the engine's gait-distance accumulator. Calibration below
          // matches the DCC stance travel to ground speed, reducing sole skating.
          const cycle = movement ? (motion.phase ?? motion.time * motion.speed * 4.2) / TAU * (name.startsWith('defense_slide') ? 2.3 : name === 'start_stop' ? 3.4 : 2)
            : motion.time / duration + index * .173
          action.time = ((cycle % 1) + 1) % 1 * duration
          if (name === 'chest_pass' && motion.ball) {
            const distance = Math.hypot(motion.ball.x - root.position.x, motion.ball.z - root.position.z)
            action.time = duration * .5 * THREE.MathUtils.clamp((distance - .16) / .85, 0, 1)
          }
          if (name === 'shot_release' && motion.ball) action.time = duration * .5 * THREE.MathUtils.clamp((motion.ball.y - 1.35) / .85, 0, 1)
          if (name === 'dribble' && motion.ball) {
            const bounce = THREE.MathUtils.clamp((motion.ball.y - .5) / .65, 0, 1)
            action.time = Math.acos(2 * bounce - 1) / TAU * duration
          }
        }
        mixer.update(0)
      } else {
        const clip = motion.speed > .22 ? motion.defensive && motion.speed < 3.2 ? 'defense_slide' : 'cut_sprint' : motion.defensive && glb ? 'defensive_deny' : 'idle_ready'
        if (clip !== lastFallbackClip) { mixer?.stopAllAction(); actions[clip]?.reset().play(); lastFallbackClip = clip }
        mixer?.setTime(motion.time + index * .173)
      }
      // DCC soles stay flat throughout authored stance contacts. This small root
      // correction keeps blended stances on the analytical floor, including actor
      // height variation; it never changes simulation position or collision data.
      if (feet.length) {
        root.updateMatrixWorld(true)
        let lowest = Infinity
        for (const foot of feet) lowest = Math.min(lowest, foot.getWorldPosition(footPoint).y)
        figure.position.y = THREE.MathUtils.clamp(root.position.y + .006 + .0867 * scale - lowest, -.16, .12)
      }
      // Only the contact correction remains procedural. The authored body/footwork
      // survives the solve; one ball target drives the visible hand, never the ball.
      if (motion.ball && (motion.hasBall || /catch|pass|shoot/.test(pose))) {
        root.updateMatrixWorld(true)
        target.set(motion.ball.x, motion.ball.y, motion.ball.z)
        if (pose === 'dribble') target.y = Math.max(target.y + .10, .9)
        if (target.distanceToSquared(root.position) < 4.5) {
          if (rightHand) aimArm(arms.right, rightHand, target, scratch, quality === 'high' ? 2 : 1)
          if (leftHand && /catch|pass|shoot/.test(pose)) {
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

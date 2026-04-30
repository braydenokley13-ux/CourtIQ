/**
 * Phase M — experimental SkinnedMesh + AnimationMixer player path.
 *
 * This module is isolated from `imperativeScene.ts` on purpose: it
 * owns the experimental skinned/animated player builder while the
 * procedural builders (Phase F / J / K / L) remain the production
 * default. Phase M3 ships this scaffold; Phase M4 fleshes out a
 * generated low-poly humanoid prototype with a small bone chain so
 * a real SkinnedMesh + AnimationMixer can be wired in M5.
 *
 * Public contract — same return shape the procedural builder
 * exposes via `imperativeScene.buildPlayerFigure`:
 *
 *   - returns a `THREE.Group` (the figure root) on success
 *   - returns `null` if the skinned path is not available; the
 *     caller falls back to the procedural figure
 *   - attaches `userData.indicatorLayers` so
 *     `getPlayerIndicatorLayers` resolves the same way as the
 *     procedural figure
 *   - all geometry / materials / textures owned by the figure are
 *     reachable via figure descendants so the existing
 *     `disposeGroup` traversal frees them
 *
 * Determinism — the skinned figure does NOT animate during build.
 * Every animation update flows through the
 * `updateSkinnedAthletePose` helper from a controlled `dt`, which
 * the scene's motion controller can drive from the same parent
 * rAF tick that the timeline uses. Replay still owns root motion.
 */

import * as THREE from 'three'
import type { PlayerStance } from './imperativeScene'

/**
 * Indicator layer handles attached to a skinned figure. Same
 * shape as the procedural `PlayerIndicatorLayers` so the
 * existing `getPlayerIndicatorLayers` resolver returns the same
 * fields. Re-declared here to keep the skinned module
 * dependency-light.
 */
interface SkinnedIndicatorLayers {
  base: THREE.Group
  user: THREE.Group
  userHead: THREE.Group
  possession: THREE.Group
}

/**
 * Marker stored on the figure root userData so callers can detect
 * a skinned figure without inspecting the geometry. The motion
 * controller, indicator helper, and tests all key off this.
 */
export const SKINNED_ATHLETE_USER_DATA_KEY = 'skinnedAthlete'

/**
 * Names of the deterministic animation clips Phase M ships. Adding
 * a clip requires both extending this union and registering the
 * clip in `buildAnimationClips`. Keep the set small — Phase M is a
 * three-clip experiment.
 */
export type SkinnedAthleteAnimationName =
  | 'idle_ready'
  | 'cut_sprint'
  | 'defense_slide'

export const SKINNED_ATHLETE_ANIMATION_NAMES: readonly SkinnedAthleteAnimationName[] =
  ['idle_ready', 'cut_sprint', 'defense_slide'] as const

/**
 * Per-figure handle returned alongside the figure root. Holds the
 * mixer, named clip actions, and root bone so the scene's motion
 * controller can drive animation deterministically.
 *
 * M4 ships the bone chain + skinned mesh; the mixer/actions stay
 * `null` until M5.
 */
export interface SkinnedAthleteHandle {
  figure: THREE.Group
  rootBone: THREE.Bone | null
  mixer: THREE.AnimationMixer | null
  actions: Record<string, THREE.AnimationAction>
  indicatorLayers: SkinnedIndicatorLayers
}

// =====================================================================
// Generated low-poly humanoid prototype — proportions in court units
// (~ft). Tuned to read at the broadcast camera distance the
// procedural athlete is framed for.
// =====================================================================
const SK_HIP_Y = 2.85
const SK_CHEST_Y = 4.05
const SK_NECK_Y = 4.85
const SK_HEAD_Y = 5.35
const SK_HEAD_R = 0.34
const SK_SHOULDER_HALF_W = 0.78
const SK_ARM_UPPER_LEN = 0.95
const SK_ARM_LOWER_LEN = 0.95
const SK_HIP_HALF_W = 0.36
const SK_LEG_UPPER_LEN = 1.4
const SK_LEG_LOWER_LEN = 1.25

/**
 * Phase M — experimental skinned/animated player builder.
 *
 * Builds a tiny generated low-poly humanoid using a single
 * SkinnedMesh + a 12-bone chain (hips, spine, head, L/R upper arm,
 * L/R lower arm, L/R thigh, L/R shin). No external assets, no GLB,
 * no texture loading. Intentionally low-poly so the experiment
 * cannot blow the per-figure GPU budget.
 *
 * Returns `null` if anything goes wrong during build; the caller
 * falls back to the procedural figure.
 */
export function buildSkinnedAthletePreview(
  teamColor: string,
  _trimColor: string,
  isUser: boolean,
  hasBall: boolean,
  _jerseyNumber: string,
  _stance: PlayerStance,
): THREE.Group | null {
  try {
    const figure = new THREE.Group()
    figure.name = 'skinned-player-figure'

    const { skinnedMesh, bones, rootBone } = buildSkinnedHumanoid(teamColor)

    figure.add(rootBone)
    figure.add(skinnedMesh)

    const mixer = new THREE.AnimationMixer(skinnedMesh)
    const clips = buildAnimationClips(bones)
    const actions: Record<string, THREE.AnimationAction> = {}
    for (const clip of clips) {
      const action = mixer.clipAction(clip)
      action.loop = THREE.LoopRepeat
      action.enabled = true
      actions[clip.name] = action
    }
    // Default clip is `idle_ready` — figures with no replay-state
    // mapping yet stay in a calm ready stance instead of T-posing.
    actions['idle_ready']?.play()

    // Indicator layers. Parenting policy:
    //   - base / user / possession: parented to the figure root so
    //     they live on the floor at y ≈ 0.05 and never rotate with
    //     the body. Same convention as the procedural figure.
    //   - userHead: parented to the figure root (NOT the head
    //     bone) so the chevron stays vertical and at a fixed
    //     height above the resting head position. Anchoring to the
    //     head bone would let the chevron rotate with the body
    //     during cut_sprint / defense_slide, which the existing
    //     `userHeadLayer.visible` test guard treats as a fail.
    const baseLayer = new THREE.Group()
    baseLayer.name = 'indicator-layer-base'
    const userLayer = new THREE.Group()
    userLayer.name = 'indicator-layer-user'
    userLayer.visible = isUser
    const userHeadLayer = new THREE.Group()
    userHeadLayer.name = 'indicator-layer-user-head'
    userHeadLayer.visible = isUser
    const possessionLayer = new THREE.Group()
    possessionLayer.name = 'indicator-layer-possession'
    possessionLayer.visible = hasBall
    figure.add(baseLayer)
    figure.add(userLayer)
    figure.add(possessionLayer)
    figure.add(userHeadLayer)

    populateSkinnedIndicators({
      baseLayer,
      userLayer,
      userHeadLayer,
      possessionLayer,
      isUser,
      hasBall,
      teamColor,
    })

    const indicatorLayers: SkinnedIndicatorLayers = {
      base: baseLayer,
      user: userLayer,
      userHead: userHeadLayer,
      possession: possessionLayer,
    }
    ;(figure.userData as Record<string, unknown>).indicatorLayers =
      indicatorLayers

    const handle: SkinnedAthleteHandle = {
      figure,
      rootBone,
      mixer,
      actions,
      indicatorLayers,
    }
    ;(figure.userData as Record<string, unknown>)[
      SKINNED_ATHLETE_USER_DATA_KEY
    ] = handle

    return figure
  } catch {
    return null
  }
}

// =====================================================================
// Indicator attachment (Phase M7)
// =====================================================================
//
// The skinned figure must preserve the same indicator contract the
// procedural figure ships:
//   - base ring: thin team-colored ring on the floor under the
//     figure, always visible
//   - user halo: brighter ring on top of the base ring, visible iff
//     the figure is the user
//   - user head chevron: cone above the head, visible iff the
//     figure is the user
//   - possession ring: warm gold ring on the floor under the figure,
//     visible iff the figure currently holds the ball
//
// All four anchor at *figure root coordinates* (not bone-local) so
// the indicators stay world-stable while the body animates. The
// floor-level rings sit at y ≈ 0.05 to match the procedural floor
// shadow lift.

const SKINNED_FLOOR_LIFT = 0.05
const SKINNED_BASE_RING_RADIUS = 0.95
const SKINNED_USER_HALO_RADIUS = 1.45
const SKINNED_POSSESSION_RING_RADIUS = 1.1
const SKINNED_CHEVRON_HEIGHT_ABOVE_HEAD = 1.1

function populateSkinnedIndicators(args: {
  baseLayer: THREE.Group
  userLayer: THREE.Group
  userHeadLayer: THREE.Group
  possessionLayer: THREE.Group
  isUser: boolean
  hasBall: boolean
  teamColor: string
}): void {
  const { baseLayer, userLayer, userHeadLayer, possessionLayer, isUser, hasBall, teamColor } = args

  // Base ring — always present.
  const baseRing = new THREE.Mesh(
    new THREE.RingGeometry(SKINNED_BASE_RING_RADIUS - 0.06, SKINNED_BASE_RING_RADIUS, 32),
    new THREE.MeshBasicMaterial({
      color: teamColor,
      toneMapped: false,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.55,
    }),
  )
  baseRing.rotation.x = -Math.PI / 2
  baseRing.position.y = SKINNED_FLOOR_LIFT
  baseLayer.add(baseRing)

  if (isUser) {
    // Floor halo — bright ring just outside the base.
    const halo = new THREE.Mesh(
      new THREE.RingGeometry(SKINNED_BASE_RING_RADIUS + 0.05, SKINNED_USER_HALO_RADIUS, 32),
      new THREE.MeshBasicMaterial({
        color: '#3BFF9D',
        toneMapped: false,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.45,
      }),
    )
    halo.rotation.x = -Math.PI / 2
    halo.position.y = SKINNED_FLOOR_LIFT - 0.005
    userLayer.add(halo)

    // Head chevron — cone above the head pointing down. Anchored
    // at figure-root coordinates so animation does not rotate it.
    const chevron = new THREE.Mesh(
      new THREE.ConeGeometry(0.42, 0.85, 16),
      new THREE.MeshBasicMaterial({
        color: '#3BFF9D',
        toneMapped: false,
      }),
    )
    chevron.rotation.x = Math.PI
    chevron.position.set(
      0,
      SK_HEAD_Y + SK_HEAD_R + SKINNED_CHEVRON_HEIGHT_ABOVE_HEAD,
      0,
    )
    userHeadLayer.add(chevron)
  }

  if (hasBall) {
    const possessionRing = new THREE.Mesh(
      new THREE.RingGeometry(
        SKINNED_POSSESSION_RING_RADIUS - 0.05,
        SKINNED_POSSESSION_RING_RADIUS,
        32,
      ),
      new THREE.MeshBasicMaterial({
        color: '#FFCB44',
        toneMapped: false,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
      }),
    )
    possessionRing.rotation.x = -Math.PI / 2
    possessionRing.position.y = SKINNED_FLOOR_LIFT - 0.002
    possessionLayer.add(possessionRing)
  }
}

// =====================================================================
// Animation clip builders
// =====================================================================
//
// Phase M ships three short looping clips, all built from
// procedural keyframes against the bone names above. Each clip is
// short (1.0–1.4s) and loops; the mixer's `update(dt)` advances
// playback deterministically when called from a controlled `dt`.
//
// Important: clips affect bone rotation only. Replay still owns
// root motion — the figure root's world position is set by the
// motion controller from the timeline, not by the clip.

function buildAnimationClips(bones: BoneSet): THREE.AnimationClip[] {
  return [
    buildIdleReadyClip(bones),
    buildCutSprintClip(bones),
    buildDefenseSlideClip(bones),
  ]
}

/**
 * Calm "ready" stance — slight knee bend, slow breathing-style
 * spine sway, hands relaxed at the sides.
 */
function buildIdleReadyClip(bones: BoneSet): THREE.AnimationClip {
  const duration = 2.4
  const t = [0, duration * 0.5, duration]
  const tracks: THREE.KeyframeTrack[] = []

  // Slow sway in the spine, ~3deg amplitude.
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${bones.spine.name}.quaternion`,
      t,
      flattenQuats([
        eulerQuat(0.04, 0, 0),
        eulerQuat(-0.04, 0, 0),
        eulerQuat(0.04, 0, 0),
      ]),
    ),
  )
  // Hips static.
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${bones.hips.name}.quaternion`,
      [0, duration],
      flattenQuats([eulerQuat(0, 0, 0), eulerQuat(0, 0, 0)]),
    ),
  )
  // Small shoulder relaxation — both arms hang slightly forward.
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${bones.leftUpperArm.name}.quaternion`,
      [0, duration],
      flattenQuats([eulerQuat(0.1, 0, -0.05), eulerQuat(0.1, 0, -0.05)]),
    ),
  )
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${bones.rightUpperArm.name}.quaternion`,
      [0, duration],
      flattenQuats([eulerQuat(0.1, 0, 0.05), eulerQuat(0.1, 0, 0.05)]),
    ),
  )
  // Knees slightly bent.
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${bones.leftThigh.name}.quaternion`,
      [0, duration],
      flattenQuats([eulerQuat(-0.05, 0, 0), eulerQuat(-0.05, 0, 0)]),
    ),
  )
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${bones.rightThigh.name}.quaternion`,
      [0, duration],
      flattenQuats([eulerQuat(-0.05, 0, 0), eulerQuat(-0.05, 0, 0)]),
    ),
  )

  return new THREE.AnimationClip('idle_ready', duration, tracks)
}

/**
 * Drive / cut clip — alternating leg drive and arm swing with
 * phase opposition (left arm forward when right leg forward).
 */
function buildCutSprintClip(bones: BoneSet): THREE.AnimationClip {
  const duration = 0.8
  const t = [0, duration * 0.5, duration]
  const tracks: THREE.KeyframeTrack[] = []

  // Hips counter-rotate slightly with each stride.
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${bones.hips.name}.quaternion`,
      t,
      flattenQuats([
        eulerQuat(0, -0.12, 0),
        eulerQuat(0, 0.12, 0),
        eulerQuat(0, -0.12, 0),
      ]),
    ),
  )
  // Spine leans forward and counters hip yaw.
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${bones.spine.name}.quaternion`,
      t,
      flattenQuats([
        eulerQuat(0.18, 0.06, 0),
        eulerQuat(0.18, -0.06, 0),
        eulerQuat(0.18, 0.06, 0),
      ]),
    ),
  )

  // Arms swing in opposition — left arm forward when right is back.
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${bones.leftUpperArm.name}.quaternion`,
      t,
      flattenQuats([
        eulerQuat(0.85, 0, -0.05),
        eulerQuat(-0.6, 0, -0.05),
        eulerQuat(0.85, 0, -0.05),
      ]),
    ),
  )
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${bones.rightUpperArm.name}.quaternion`,
      t,
      flattenQuats([
        eulerQuat(-0.6, 0, 0.05),
        eulerQuat(0.85, 0, 0.05),
        eulerQuat(-0.6, 0, 0.05),
      ]),
    ),
  )
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${bones.leftForeArm.name}.quaternion`,
      t,
      flattenQuats([
        eulerQuat(-1.0, 0, 0),
        eulerQuat(-0.4, 0, 0),
        eulerQuat(-1.0, 0, 0),
      ]),
    ),
  )
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${bones.rightForeArm.name}.quaternion`,
      t,
      flattenQuats([
        eulerQuat(-0.4, 0, 0),
        eulerQuat(-1.0, 0, 0),
        eulerQuat(-0.4, 0, 0),
      ]),
    ),
  )

  // Legs in opposition. Front leg drives forward; back leg pulls
  // through. The shin bends back while the thigh drives.
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${bones.leftThigh.name}.quaternion`,
      t,
      flattenQuats([
        eulerQuat(0.65, 0, 0),
        eulerQuat(-0.45, 0, 0),
        eulerQuat(0.65, 0, 0),
      ]),
    ),
  )
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${bones.rightThigh.name}.quaternion`,
      t,
      flattenQuats([
        eulerQuat(-0.45, 0, 0),
        eulerQuat(0.65, 0, 0),
        eulerQuat(-0.45, 0, 0),
      ]),
    ),
  )
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${bones.leftShin.name}.quaternion`,
      t,
      flattenQuats([
        eulerQuat(-0.55, 0, 0),
        eulerQuat(-1.1, 0, 0),
        eulerQuat(-0.55, 0, 0),
      ]),
    ),
  )
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${bones.rightShin.name}.quaternion`,
      t,
      flattenQuats([
        eulerQuat(-1.1, 0, 0),
        eulerQuat(-0.55, 0, 0),
        eulerQuat(-1.1, 0, 0),
      ]),
    ),
  )

  return new THREE.AnimationClip('cut_sprint', duration, tracks)
}

/**
 * Defensive slide / closeout clip — wide stance, low hips, hands
 * up. The body rocks side-to-side as the defender shuffles.
 */
function buildDefenseSlideClip(bones: BoneSet): THREE.AnimationClip {
  const duration = 1.0
  const t = [0, duration * 0.5, duration]
  const tracks: THREE.KeyframeTrack[] = []

  // Hips rock side-to-side.
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${bones.hips.name}.quaternion`,
      t,
      flattenQuats([
        eulerQuat(0, 0, 0.06),
        eulerQuat(0, 0, -0.06),
        eulerQuat(0, 0, 0.06),
      ]),
    ),
  )
  // Spine slight forward lean — defensive stance.
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${bones.spine.name}.quaternion`,
      [0, duration],
      flattenQuats([eulerQuat(0.2, 0, 0), eulerQuat(0.2, 0, 0)]),
    ),
  )
  // Arms held up, slightly out — active hands.
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${bones.leftUpperArm.name}.quaternion`,
      [0, duration],
      flattenQuats([eulerQuat(0.4, 0, -0.55), eulerQuat(0.4, 0, -0.55)]),
    ),
  )
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${bones.rightUpperArm.name}.quaternion`,
      [0, duration],
      flattenQuats([eulerQuat(0.4, 0, 0.55), eulerQuat(0.4, 0, 0.55)]),
    ),
  )
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${bones.leftForeArm.name}.quaternion`,
      [0, duration],
      flattenQuats([eulerQuat(-1.05, 0, 0), eulerQuat(-1.05, 0, 0)]),
    ),
  )
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${bones.rightForeArm.name}.quaternion`,
      [0, duration],
      flattenQuats([eulerQuat(-1.05, 0, 0), eulerQuat(-1.05, 0, 0)]),
    ),
  )

  // Legs in deep, wide stance — thigh splayed outward, knees bent.
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${bones.leftThigh.name}.quaternion`,
      t,
      flattenQuats([
        eulerQuat(-0.55, 0, 0.22),
        eulerQuat(-0.65, 0, 0.22),
        eulerQuat(-0.55, 0, 0.22),
      ]),
    ),
  )
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${bones.rightThigh.name}.quaternion`,
      t,
      flattenQuats([
        eulerQuat(-0.65, 0, -0.22),
        eulerQuat(-0.55, 0, -0.22),
        eulerQuat(-0.65, 0, -0.22),
      ]),
    ),
  )
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${bones.leftShin.name}.quaternion`,
      [0, duration],
      flattenQuats([eulerQuat(0.35, 0, 0), eulerQuat(0.35, 0, 0)]),
    ),
  )
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${bones.rightShin.name}.quaternion`,
      [0, duration],
      flattenQuats([eulerQuat(0.35, 0, 0), eulerQuat(0.35, 0, 0)]),
    ),
  )

  return new THREE.AnimationClip('defense_slide', duration, tracks)
}

const _scratchEuler = new THREE.Euler()
const _scratchQuat = new THREE.Quaternion()

function eulerQuat(x: number, y: number, z: number): THREE.Quaternion {
  _scratchEuler.set(x, y, z, 'XYZ')
  return new THREE.Quaternion().setFromEuler(_scratchEuler)
}

function flattenQuats(quats: THREE.Quaternion[]): number[] {
  const out: number[] = []
  for (const q of quats) {
    out.push(q.x, q.y, q.z, q.w)
  }
  return out
}

// Suppress unused — `_scratchQuat` reserved for follow-up where
// the action interpolant is reused across figures without
// per-update allocation.
void _scratchQuat

interface BoneSet {
  hips: THREE.Bone
  spine: THREE.Bone
  head: THREE.Bone
  leftUpperArm: THREE.Bone
  leftForeArm: THREE.Bone
  rightUpperArm: THREE.Bone
  rightForeArm: THREE.Bone
  leftThigh: THREE.Bone
  leftShin: THREE.Bone
  rightThigh: THREE.Bone
  rightShin: THREE.Bone
}

/**
 * Builds the generated humanoid SkinnedMesh + bone chain. The
 * geometry is a small set of merged cylinders / a sphere head, all
 * skinned to a 12-bone chain anchored at the hips.
 *
 * Bones (12 total):
 *   hips (root)
 *     spine
 *       leftUpperArm → leftForeArm
 *       rightUpperArm → rightForeArm
 *       head
 *     leftThigh → leftShin
 *     rightThigh → rightShin
 *
 * Skin weights are hard-assigned per vertex (one bone per vertex,
 * weight 1.0) — sufficient for a low-poly proof and trivially
 * cheap to compute on the GPU.
 */
function buildSkinnedHumanoid(teamColor: string): {
  skinnedMesh: THREE.SkinnedMesh
  bones: BoneSet
  rootBone: THREE.Bone
  skeleton: THREE.Skeleton
} {
  // ---- Bones --------------------------------------------------------
  const hips = new THREE.Bone()
  hips.name = 'hips'
  hips.position.set(0, SK_HIP_Y, 0)

  const spine = new THREE.Bone()
  spine.name = 'spine'
  spine.position.set(0, SK_CHEST_Y - SK_HIP_Y, 0)
  hips.add(spine)

  const head = new THREE.Bone()
  head.name = 'head'
  head.position.set(0, SK_HEAD_Y - SK_CHEST_Y, 0)
  spine.add(head)

  const leftUpperArm = new THREE.Bone()
  leftUpperArm.name = 'leftUpperArm'
  leftUpperArm.position.set(SK_SHOULDER_HALF_W, SK_NECK_Y - SK_CHEST_Y, 0)
  spine.add(leftUpperArm)

  const leftForeArm = new THREE.Bone()
  leftForeArm.name = 'leftForeArm'
  leftForeArm.position.set(0, -SK_ARM_UPPER_LEN, 0)
  leftUpperArm.add(leftForeArm)

  const rightUpperArm = new THREE.Bone()
  rightUpperArm.name = 'rightUpperArm'
  rightUpperArm.position.set(-SK_SHOULDER_HALF_W, SK_NECK_Y - SK_CHEST_Y, 0)
  spine.add(rightUpperArm)

  const rightForeArm = new THREE.Bone()
  rightForeArm.name = 'rightForeArm'
  rightForeArm.position.set(0, -SK_ARM_UPPER_LEN, 0)
  rightUpperArm.add(rightForeArm)

  const leftThigh = new THREE.Bone()
  leftThigh.name = 'leftThigh'
  leftThigh.position.set(SK_HIP_HALF_W, 0, 0)
  hips.add(leftThigh)

  const leftShin = new THREE.Bone()
  leftShin.name = 'leftShin'
  leftShin.position.set(0, -SK_LEG_UPPER_LEN, 0)
  leftThigh.add(leftShin)

  const rightThigh = new THREE.Bone()
  rightThigh.name = 'rightThigh'
  rightThigh.position.set(-SK_HIP_HALF_W, 0, 0)
  hips.add(rightThigh)

  const rightShin = new THREE.Bone()
  rightShin.name = 'rightShin'
  rightShin.position.set(0, -SK_LEG_UPPER_LEN, 0)
  rightThigh.add(rightShin)

  const bonesArr: THREE.Bone[] = [
    hips,
    spine,
    head,
    leftUpperArm,
    leftForeArm,
    rightUpperArm,
    rightForeArm,
    leftThigh,
    leftShin,
    rightThigh,
    rightShin,
  ]
  const skeleton = new THREE.Skeleton(bonesArr)

  // ---- Body geometry ------------------------------------------------
  // Each segment is a small cylinder geometry whose vertices are
  // skinned to a single bone (hard skinning, weight 1.0). We merge
  // them by hand so the SkinnedMesh has one geometry / one material
  // pair.
  //
  // SkinnedMesh vertex space is *mesh-local* — i.e. the world
  // coordinates each vertex should occupy at bind time when the
  // SkinnedMesh sits at the world origin with identity transform.
  // The bone bind-matrix inverses + bone-current-matrices on the GPU
  // do the rest. So each segment is positioned in world coordinates
  // at the bone's bind world position; rotation around the bone
  // emerges automatically from the skinning shader.
  const segments: Array<{ geom: THREE.BufferGeometry; boneIndex: number }> =
    []

  const cyl = (
    radius: number,
    height: number,
    boneIndex: number,
    centerY: number,
    centerX: number = 0,
  ) => {
    const geom = new THREE.CylinderGeometry(radius, radius, height, 8, 1)
    geom.translate(centerX, centerY, 0)
    segments.push({ geom, boneIndex })
  }

  // Hips/pelvis block — straddles the hips bone at world y = SK_HIP_Y.
  cyl(0.42, 0.5, 0, SK_HIP_Y)
  // Spine (chest) — straddles the spine bone region. Bone is at
  // SK_CHEST_Y; the chest cylinder runs from chest to neck.
  cyl(
    0.5,
    SK_NECK_Y - SK_CHEST_Y,
    1,
    (SK_CHEST_Y + SK_NECK_Y) * 0.5,
  )
  // Head: sphere centred on the head's bind world position.
  {
    const headGeom = new THREE.SphereGeometry(SK_HEAD_R, 12, 10)
    headGeom.translate(0, SK_HEAD_Y, 0)
    segments.push({ geom: headGeom, boneIndex: 2 })
  }
  // Arms. Bone bind positions:
  //   leftUpperArm  at  (+SK_SHOULDER_HALF_W, SK_NECK_Y, 0)
  //   leftForeArm   at  (+SK_SHOULDER_HALF_W, SK_NECK_Y - SK_ARM_UPPER_LEN, 0)
  //   right* mirror on -x
  const leftShoulderY = SK_NECK_Y
  const leftElbowY = SK_NECK_Y - SK_ARM_UPPER_LEN
  const leftWristY = leftElbowY - SK_ARM_LOWER_LEN
  cyl(0.16, SK_ARM_UPPER_LEN, 3, (leftShoulderY + leftElbowY) * 0.5, +SK_SHOULDER_HALF_W)
  cyl(0.13, SK_ARM_LOWER_LEN, 4, (leftElbowY + leftWristY) * 0.5, +SK_SHOULDER_HALF_W)
  cyl(0.16, SK_ARM_UPPER_LEN, 5, (leftShoulderY + leftElbowY) * 0.5, -SK_SHOULDER_HALF_W)
  cyl(0.13, SK_ARM_LOWER_LEN, 6, (leftElbowY + leftWristY) * 0.5, -SK_SHOULDER_HALF_W)
  // Legs. Bone bind positions:
  //   leftThigh  at  (+SK_HIP_HALF_W, SK_HIP_Y, 0)
  //   leftShin   at  (+SK_HIP_HALF_W, SK_HIP_Y - SK_LEG_UPPER_LEN, 0)
  const kneeY = SK_HIP_Y - SK_LEG_UPPER_LEN
  const ankleY = kneeY - SK_LEG_LOWER_LEN
  cyl(0.24, SK_LEG_UPPER_LEN, 7, (SK_HIP_Y + kneeY) * 0.5, +SK_HIP_HALF_W)
  cyl(0.18, SK_LEG_LOWER_LEN, 8, (kneeY + ankleY) * 0.5, +SK_HIP_HALF_W)
  cyl(0.24, SK_LEG_UPPER_LEN, 9, (SK_HIP_Y + kneeY) * 0.5, -SK_HIP_HALF_W)
  cyl(0.18, SK_LEG_LOWER_LEN, 10, (kneeY + ankleY) * 0.5, -SK_HIP_HALF_W)

  // Merge into one geometry + skin weights / indices.
  const positions: number[] = []
  const normals: number[] = []
  const indices: number[] = []
  const skinIndices: number[] = []
  const skinWeights: number[] = []
  let vertexBase = 0

  for (const { geom, boneIndex } of segments) {
    const pos = geom.attributes.position
    const nrm = geom.attributes.normal
    const idx = geom.index
    if (!pos || !nrm || !idx) continue
    for (let i = 0; i < pos.count; i++) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i))
      normals.push(nrm.getX(i), nrm.getY(i), nrm.getZ(i))
      // Hard skinning — single bone, weight 1.
      skinIndices.push(boneIndex, 0, 0, 0)
      skinWeights.push(1, 0, 0, 0)
    }
    for (let i = 0; i < idx.count; i++) {
      indices.push(idx.getX(i) + vertexBase)
    }
    vertexBase += pos.count
    // Free the source segment geometry — the merged geometry below
    // owns the data outright, so we never need the per-segment
    // CylinderGeometry / SphereGeometry again.
    geom.dispose()
  }

  const merged = new THREE.BufferGeometry()
  merged.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  )
  merged.setAttribute(
    'normal',
    new THREE.Float32BufferAttribute(normals, 3),
  )
  merged.setIndex(indices)
  merged.setAttribute(
    'skinIndex',
    new THREE.Uint16BufferAttribute(skinIndices, 4),
  )
  merged.setAttribute(
    'skinWeight',
    new THREE.Float32BufferAttribute(skinWeights, 4),
  )

  // SkinnedMesh handles the skinning shader path automatically in
  // modern three (r155+). The material does not need a `skinning`
  // flag — the shader chunks are injected when the mesh binds to a
  // skeleton.
  const material = new THREE.MeshStandardMaterial({
    color: teamColor,
    roughness: 0.7,
    metalness: 0.05,
  })

  const skinnedMesh = new THREE.SkinnedMesh(merged, material)
  skinnedMesh.name = 'skinned-player-mesh'
  skinnedMesh.add(hips)
  skinnedMesh.bind(skeleton)
  skinnedMesh.frustumCulled = false

  return {
    skinnedMesh,
    skeleton,
    rootBone: hips,
    bones: {
      hips,
      spine,
      head,
      leftUpperArm,
      leftForeArm,
      rightUpperArm,
      rightForeArm,
      leftThigh,
      leftShin,
      rightThigh,
      rightShin,
    },
  }
}

/**
 * Read the skinned-athlete handle attached to a figure root by
 * `buildSkinnedAthletePreview`, or `null` if the figure is not a
 * skinned figure (e.g. the procedural fallback). Lookup is O(1).
 */
export function getSkinnedAthleteHandle(
  figure: THREE.Object3D,
): SkinnedAthleteHandle | null {
  const handle = (figure.userData as Record<string, unknown>)[
    SKINNED_ATHLETE_USER_DATA_KEY
  ]
  if (!handle || typeof handle !== 'object') return null
  return handle as SkinnedAthleteHandle
}

/**
 * Phase M5 entry point. Ticks the AnimationMixer for the figure
 * with a deterministic `dt`. No-op for procedural figures and for
 * skinned figures whose mixer has not been built yet.
 *
 * The caller is responsible for using the same `dt` source the
 * scene uses for replay (so animation stays in lock-step with
 * timeline-driven root motion).
 */
export function updateSkinnedAthletePose(
  figure: THREE.Object3D,
  dt: number,
): void {
  const handle = getSkinnedAthleteHandle(figure)
  if (!handle || !handle.mixer) return
  handle.mixer.update(dt)
}

/**
 * Phase M6 — replay/motion state input the mapper consumes.
 *
 * `kind` is the SceneMovement kind from `lib/scenario3d/scene.ts`.
 * `team` lets the mapper differentiate defender movement (which
 * is always `defense_slide`) from offensive movement (which is
 * `cut_sprint` for cuts/drives/rips/jabs, otherwise `idle_ready`).
 * `isMoving` is `true` while the player has an active movement at
 * the current replay time and `false` while they are stationary.
 *
 * The shape is intentionally narrow so it can be assembled from
 * the existing motion controller without adding new replay state.
 */
export interface ReplayMotionState {
  kind?:
    | 'cut'
    | 'closeout'
    | 'rotation'
    | 'lift'
    | 'drift'
    | 'pass'
    | 'drive'
    | 'stop_ball'
    | 'back_cut'
    | 'baseline_sneak'
    | 'skip_pass'
    | 'rip'
    | 'jab'
  team?: 'offense' | 'defense'
  isMoving: boolean
}

/**
 * Phase M6 — pure helper. Maps a player's current replay/motion
 * state to one of the three Phase M animation clips.
 *
 * Mapping rules (deterministic, testable without WebGL):
 *
 *   stationary                                → 'idle_ready'
 *   defender movement (any kind)              → 'defense_slide'
 *   defender stationary in 'closeout'         → 'defense_slide'
 *   offensive cut / drive / sprint-like       → 'cut_sprint'
 *   offensive small footwork (rip/jab/drift)  → 'idle_ready'
 *   passes / ball-only kinds                  → 'idle_ready'
 *   unknown                                   → 'idle_ready'
 *
 * The "stationary defender in closeout" case keeps a defender
 * that just finished a closeout in the active defensive base
 * pose instead of dropping back to idle for one frame.
 */
export function mapReplayStateToAnimation(
  state: ReplayMotionState,
): SkinnedAthleteAnimationName {
  // Defenders default to defensive slide whenever the kind reads
  // as defensive footwork or movement, even if `isMoving` is false
  // (e.g. mid-stride freeze frame on a closeout).
  if (state.team === 'defense') {
    if (state.isMoving) return 'defense_slide'
    if (state.kind === 'closeout' || state.kind === 'rotation') {
      return 'defense_slide'
    }
    return 'idle_ready'
  }

  if (!state.isMoving) return 'idle_ready'

  // Offense. Cuts, drives, back cuts, baseline sneaks, and
  // skip-pass-like kinetic movements drive the sprint clip; small
  // footwork (rip / jab / drift / lift) and passes do not.
  switch (state.kind) {
    case 'cut':
    case 'drive':
    case 'back_cut':
    case 'baseline_sneak':
      return 'cut_sprint'
    case 'rip':
    case 'jab':
    case 'drift':
    case 'lift':
    case 'pass':
    case 'skip_pass':
    case 'stop_ball':
      return 'idle_ready'
    case 'closeout':
    case 'rotation':
      // Offensive closeout/rotation is a degenerate case — treat
      // as cut_sprint since the player is actively moving.
      return 'cut_sprint'
    default:
      return 'idle_ready'
  }
}

/**
 * Switch the active animation on a skinned figure. No-op for
 * procedural figures and for skinned figures whose mixer was not
 * built (the figure is rendered statically). When the requested
 * clip is already playing, this is a no-op so callers can call it
 * every tick from the replay-state mapper without restarting the
 * clip.
 */
export function setSkinnedAthleteAnimation(
  figure: THREE.Object3D,
  name: SkinnedAthleteAnimationName,
  options?: { fadeSeconds?: number },
): void {
  const handle = getSkinnedAthleteHandle(figure)
  if (!handle || !handle.mixer) return
  const next = handle.actions[name]
  if (!next) return
  if (next.isRunning() && next.getEffectiveWeight() > 0.95) return
  const fade = options?.fadeSeconds ?? 0.15
  for (const [otherName, action] of Object.entries(handle.actions)) {
    if (otherName === name) continue
    if (action.isRunning()) action.fadeOut(fade)
  }
  next.reset()
  next.fadeIn(fade)
  next.play()
}

/**
 * Dispose every mixer/action attached to the skinned figure.
 * Geometry, materials, and textures are freed by the existing
 * `disposeGroup` traversal in `imperativeScene.ts` because the
 * skinned figure follows the same "everything reachable via
 * descendants" contract; this helper only handles the
 * AnimationMixer state that is *not* a Three.js Object3D.
 */
export function disposeSkinnedAthlete(figure: THREE.Object3D): void {
  const handle = getSkinnedAthleteHandle(figure)
  if (!handle) return
  if (handle.mixer) {
    handle.mixer.stopAllAction()
    handle.mixer.uncacheRoot(handle.mixer.getRoot())
  }
  for (const action of Object.values(handle.actions)) {
    action.stop()
  }
}

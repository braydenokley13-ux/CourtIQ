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

    // Indicator layers — empty Groups parented to the figure root
    // so the existing chevron / halo / possession ring system can
    // attach the same primitives it does for the procedural figure.
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
      mixer: null,
      actions: {},
      indicatorLayers,
    }
    ;(figure.userData as Record<string, unknown>)[
      SKINNED_ATHLETE_USER_DATA_KEY
    ] = handle

    // Suppress unused — bones map will be consumed by M5 when
    // animation clips are wired.
    void bones

    return figure
  } catch {
    return null
  }
}

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
  const segments: Array<{ geom: THREE.BufferGeometry; boneIndex: number }> =
    []

  const cyl = (
    radius: number,
    height: number,
    boneIndex: number,
    yOffset: number,
  ) => {
    const geom = new THREE.CylinderGeometry(radius, radius, height, 8, 1)
    geom.translate(0, yOffset, 0)
    segments.push({ geom, boneIndex })
  }

  // Hips/pelvis block
  cyl(0.42, 0.5, 0, 0.0)
  // Spine (chest)
  cyl(0.5, SK_NECK_Y - SK_CHEST_Y, 1, (SK_NECK_Y - SK_CHEST_Y) * 0.5)
  // Head: small sphere centred on head bone
  {
    const headGeom = new THREE.SphereGeometry(SK_HEAD_R, 12, 10)
    headGeom.translate(0, SK_HEAD_R * 0.6, 0)
    segments.push({ geom: headGeom, boneIndex: 2 })
  }
  // Arms
  cyl(0.16, SK_ARM_UPPER_LEN, 3, -SK_ARM_UPPER_LEN * 0.5)
  cyl(0.13, SK_ARM_LOWER_LEN, 4, -SK_ARM_LOWER_LEN * 0.5)
  cyl(0.16, SK_ARM_UPPER_LEN, 5, -SK_ARM_UPPER_LEN * 0.5)
  cyl(0.13, SK_ARM_LOWER_LEN, 6, -SK_ARM_LOWER_LEN * 0.5)
  // Legs
  cyl(0.24, SK_LEG_UPPER_LEN, 7, -SK_LEG_UPPER_LEN * 0.5)
  cyl(0.18, SK_LEG_LOWER_LEN, 8, -SK_LEG_LOWER_LEN * 0.5)
  cyl(0.24, SK_LEG_UPPER_LEN, 9, -SK_LEG_UPPER_LEN * 0.5)
  cyl(0.18, SK_LEG_LOWER_LEN, 10, -SK_LEG_LOWER_LEN * 0.5)

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

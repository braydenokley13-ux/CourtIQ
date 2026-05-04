/**
 * Phase O-ASSET — license-clean GLB athlete preview path.
 *
 * Bundled asset: `apps/web/public/athlete/mannequin.glb` (Quaternius
 * Universal Animation Library 2 — Female Mannequin, CC0 1.0). See
 * `apps/web/public/athlete/ATTRIBUTION.md` for source URL, license,
 * downloaded date, and size deviation note.
 *
 * Architecture mirrors `skinnedAthlete.ts`: this module owns the
 * experimental GLB path and is invoked from `imperativeScene.ts`
 * only when `USE_GLB_ATHLETE_PREVIEW` is `true`. The procedural
 * builder, the generated skinned prototype, and BDW-01 itself stay
 * unchanged when the flag is off.
 *
 * Public contract — same return shape the procedural and skinned
 * builders expose via `imperativeScene.buildPlayerFigure`:
 *
 *   - returns a `THREE.Group` (the figure root) on success
 *   - returns `null` if the GLB asset is not yet cached, the caller
 *     is running outside a browser, or anything throws; the caller
 *     falls back to the next path in the chain
 *   - attaches `userData.indicatorLayers` so
 *     `getPlayerIndicatorLayers` resolves the same way as the other
 *     paths
 *   - all geometry / materials owned by the cloned figure are
 *     reachable via figure descendants so the existing
 *     `disposeGroup` traversal frees them
 *
 * Animation contract — Phase O-ASSET ships a STATIC GLB preview
 * only. The bundled mannequin file intentionally has zero
 * animation tracks (the companion `UAL2_Standard.glb` carries the
 * shared library, and none of those clips are basketball-style).
 * Retargeting Phase M's `idle_ready` / `cut_sprint` /
 * `defense_slide` clips onto this rig is deferred — see
 * `docs/qa/courtiq/phase-o-glb-athlete.md` § Phase O-ASSET — Animation
 * strategy (OA5).
 */

import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import type { PlayerStance } from './imperativeScene'
import {
  getCachedImportedClip,
  loadImportedClip,
  stripRootMotionTracks,
  _setImportedClipCacheForTest,
} from './importedClipLoader'

/**
 * Marker stored on the figure root userData so callers and tests
 * can detect a GLB-built figure without inspecting geometry. Same
 * shape as `SKINNED_ATHLETE_USER_DATA_KEY` in the skinned module.
 */
export const GLB_ATHLETE_USER_DATA_KEY = 'glbAthlete'

/**
 * Public-folder URL of the bundled CC0 mannequin GLB. Fetched from
 * the Next.js static asset path so cold-load goes through the same
 * caching layer the rest of the public folder uses.
 */
export const GLB_ATHLETE_ASSET_URL = '/athlete/mannequin.glb'

/**
 * Source-unit → court-unit conversion. The Quaternius mannequin is
 * authored in metres (POSITION bbox y ≈ 1.808). Court space is in
 * feet, with the procedural athlete standing at ATH_TOTAL_HEIGHT =
 * 5.95 ft. The factor is 1 / 0.3048 m·ft⁻¹ — the GLB stands at
 * ~5.93 ft after this scale, matching the procedural figure within
 * 0.02 ft.
 */
const GLB_M_TO_FT_SCALE = 1 / 0.3048

interface GlbIndicatorLayers {
  base: THREE.Group
  user: THREE.Group
  userHead: THREE.Group
  possession: THREE.Group
}

/**
 * Phase O-ANIM (OB1) — bone-name map from Phase M's 12-bone
 * procedural rig onto the Quaternius/Unreal-style 65-bone GLB
 * skeleton. Only key bones are mapped; fingers, toes, twist, and IK
 * helpers are intentionally left out — Phase M clips drive only the
 * core hierarchy (hips, spine, head, shoulders, upper/lower arms,
 * upper/lower legs).
 *
 * GLB skeleton names follow Unreal-Godot convention (lowercase with
 * `_l` / `_r` side suffixes), with the lone exception of `Head`
 * which is PascalCase in the Quaternius UAL2 export. The bone-map
 * audit logged once on first build (P0-LOCK) confirms this matches
 * the actual skeleton the loader hands us. The Phase M `spine` bone
 * maps to `spine_02` (mid-torso) so chest sway concentrates near
 * the centre of mass rather than at the lumbar root.
 */
export const GLB_BONE_MAP: Readonly<Record<string, string>> = {
  hips: 'pelvis',
  spine: 'spine_02',
  head: 'Head',
  leftUpperArm: 'upperarm_l',
  leftForeArm: 'lowerarm_l',
  rightUpperArm: 'upperarm_r',
  rightForeArm: 'lowerarm_r',
  leftThigh: 'thigh_l',
  leftShin: 'calf_l',
  rightThigh: 'thigh_r',
  rightShin: 'calf_r',
}

/**
 * Audited local rest rotations for the Quaternius UAL2 lower body.
 * Three.js animation tracks write absolute local quaternions, so a
 * "small knee bend" cannot be authored as a near-identity quaternion
 * on these bones. It must start from bind and then add a small delta.
 */
const GLB_LOWER_BODY_BIND_QUATERNIONS: Readonly<
  Record<string, [number, number, number, number]>
> = {
  pelvis: [0.7904685, 0, 0, 0.6125028],
  thigh_l: [0.9924845, 0, 0, 0.1223706],
  thigh_r: [0.9924845, 0, 0, 0.1223706],
  calf_l: [0.0365859, -0.0001312, -0.0000048, 0.9993305],
  calf_r: [0.0365859, -0.0001312, -0.0000048, 0.9993305],
}

/**
 * Audited local rest rotations for the Quaternius UAL2 arm bones.
 * Like the lower body, these bones are far from identity in bind
 * pose. Authoring small "basketball pose" deltas against identity
 * makes the shoulders snap toward a mannequin/T-pose silhouette, so
 * readable CourtIQ arm poses must start from bind and multiply in a
 * small deterministic delta.
 */
const GLB_ARM_BIND_QUATERNIONS: Readonly<
  Record<string, [number, number, number, number]>
> = {
  upperarm_l: [0.2320518, 0.6680781, -0.2315034, 0.6680044],
  lowerarm_l: [0.0192334, 0, 0, 0.999815],
  upperarm_r: [0.2320517, -0.6680781, 0.2315034, 0.6680044],
  lowerarm_r: [0.0192334, 0, 0, 0.999815],
}

/**
 * P0-LOCK — one-shot dev-only bone-map audit. Walks the cloned
 * skeleton on first build, logs the actual bone names, and warns
 * about any `GLB_BONE_MAP` entry whose target bone is not present.
 *
 * Behaviour:
 *   - Production builds (NODE_ENV === 'production'): the audit does
 *     not run, no logs are emitted.
 *   - Dev builds: runs once per page session and short-circuits on
 *     subsequent figures so we don't spam the console with one log
 *     per athlete.
 *
 * The mixer relies on Three.js's PropertyBinding name lookup to
 * resolve track names like `pelvis.quaternion` against the cloned
 * scene; if the map drifts away from the asset, the bones the clip
 * targets simply will not move and the figure looks static. Logging
 * the mismatch surfaces that class of regression at flag-on time
 * rather than as a silent visual bug.
 */
let _glbBoneMapAuditDone = false
function _runBoneMapAuditOnce(cloned: THREE.Object3D): void {
  if (_glbBoneMapAuditDone) return
  _glbBoneMapAuditDone = true
  if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'production') {
    return
  }
  if (typeof console === 'undefined') return
  const present = new Set<string>()
  cloned.traverse((child) => {
    if ((child as THREE.Bone).isBone) present.add(child.name)
  })
  const missing: string[] = []
  for (const [intentName, sourceName] of Object.entries(GLB_BONE_MAP)) {
    if (!present.has(sourceName)) missing.push(`${intentName} → ${sourceName}`)
  }
  // eslint-disable-next-line no-console
  console.info('[glbAthlete] bone-map audit', {
    boneCount: present.size,
    bones: Array.from(present).sort(),
    mapped: GLB_BONE_MAP,
    missing,
  })
  if (missing.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(
      '[glbAthlete] GLB_BONE_MAP references bones not present in the loaded skeleton',
      missing,
    )
  }
}

/** Test-only — reset the one-shot audit guard between cases. */
export function _resetGlbAthleteBoneMapAuditGuard(): void {
  _glbBoneMapAuditDone = false
}

/**
 * Phase O-ANIM (OB2) — `idle_ready` retargeted to the GLB rig.
 *
 * The Unreal/Quaternius rig's rest pose has arms at a T-pose-ish
 * orientation (~45 deg down-and-out) and shoulders/legs aligned to
 * the upper-arm / thigh local axes. Eulers below are authored
 * relative to that rest pose, NOT the procedural rig — so amplitudes
 * are smaller than `skinnedAthlete.buildIdleReadyClip`.
 */
function buildGlbIdleReadyClip(): THREE.AnimationClip {
  const duration = 2.4
  const t = [0, duration * 0.5, duration]
  const tracks: THREE.KeyframeTrack[] = []

  // Slow chest sway. P0-LOCK bumped this from ~2° to ~3.4° amplitude
  // so the motion is readable at broadcast-camera distance without
  // breaking the film-room "athletic but still" silhouette.
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.spine}.quaternion`,
      t,
      flattenGlbQuats([
        glbEulerQuat(0.06, 0, 0),
        glbEulerQuat(-0.06, 0, 0),
        glbEulerQuat(0.06, 0, 0),
      ]),
    ),
  )
  // Subtle opposing head sway. Counter-rotated against the spine so
  // the eyes track forward as the chest leans — the most natural
  // "active stance" cue at broadcast distance and the easiest motion
  // for a player to read.
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.head}.quaternion`,
      t,
      flattenGlbQuats([
        glbEulerQuat(-0.04, 0, 0),
        glbEulerQuat(0.04, 0, 0),
        glbEulerQuat(-0.04, 0, 0),
      ]),
    ),
  )
  // Keep the mannequin out of its broad rest silhouette. Arms stay
  // near the ribs with soft elbows so idle players read as ready,
  // not parked in an asset bind pose.
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.leftUpperArm}.quaternion`,
      [0, duration],
      flattenGlbQuats([
        glbArmBindRelativeQuat(GLB_BONE_MAP.leftUpperArm, 2.3, 0, 0.02),
        glbArmBindRelativeQuat(GLB_BONE_MAP.leftUpperArm, 2.3, 0, 0.02),
      ]),
    ),
  )
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.rightUpperArm}.quaternion`,
      [0, duration],
      flattenGlbQuats([
        glbArmBindRelativeQuat(GLB_BONE_MAP.rightUpperArm, 2.3, 0, -0.02),
        glbArmBindRelativeQuat(GLB_BONE_MAP.rightUpperArm, 2.3, 0, -0.02),
      ]),
    ),
  )
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.leftForeArm}.quaternion`,
      [0, duration],
      flattenGlbQuats([
        glbArmBindRelativeQuat(GLB_BONE_MAP.leftForeArm, 0, -0.42, 0),
        glbArmBindRelativeQuat(GLB_BONE_MAP.leftForeArm, 0, -0.42, 0),
      ]),
    ),
  )
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.rightForeArm}.quaternion`,
      [0, duration],
      flattenGlbQuats([
        glbArmBindRelativeQuat(GLB_BONE_MAP.rightForeArm, 0, -0.42, 0),
        glbArmBindRelativeQuat(GLB_BONE_MAP.rightForeArm, 0, -0.42, 0),
      ]),
    ),
  )
  // Knees softened (slight thigh forward).
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.leftThigh}.quaternion`,
      [0, duration],
      flattenGlbQuats([
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.leftThigh, -0.14, 0, 0),
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.leftThigh, -0.14, 0, 0),
      ]),
    ),
  )
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.rightThigh}.quaternion`,
      [0, duration],
      flattenGlbQuats([
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.rightThigh, -0.14, 0, 0),
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.rightThigh, -0.14, 0, 0),
      ]),
    ),
  )
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.leftShin}.quaternion`,
      [0, duration],
      flattenGlbQuats([
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.leftShin, 0.08, 0, 0),
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.leftShin, 0.08, 0, 0),
      ]),
    ),
  )
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.rightShin}.quaternion`,
      [0, duration],
      flattenGlbQuats([
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.rightShin, 0.08, 0, 0),
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.rightShin, 0.08, 0, 0),
      ]),
    ),
  )

  return new THREE.AnimationClip('idle_ready', duration, tracks)
}

/**
 * Phase O-ANIM (OB3) — `cut_sprint` retargeted to the GLB rig.
 *
 * Forward lean at the spine, hip counter-rotation, and L/R legs +
 * arms in opposition. Knee bend uses calf bones (lowerleg), shin
 * pulls under as the thigh drives forward. Amplitudes are damped
 * relative to the procedural clip — the GLB rig is taller and the
 * rest pose already has the legs straight, so smaller eulers read
 * the same on screen.
 */
function buildGlbCutSprintClip(): THREE.AnimationClip {
  const duration = 0.8
  const t = [0, duration * 0.5, duration]
  const tracks: THREE.KeyframeTrack[] = []

  // Hips counter-rotate (yaw) per stride.
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.hips}.quaternion`,
      t,
      flattenGlbQuats([
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.hips, 0, -0.1, 0),
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.hips, 0, 0.1, 0),
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.hips, 0, -0.1, 0),
      ]),
    ),
  )
  // Forward chest lean + counter yaw.
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.spine}.quaternion`,
      t,
      flattenGlbQuats([
        glbEulerQuat(0.16, 0.05, 0),
        glbEulerQuat(0.16, -0.05, 0),
        glbEulerQuat(0.16, 0.05, 0),
      ]),
    ),
  )
  // Arms swing in opposition. Unreal upperarm local +X is roughly
  // along the bone, so pitch on Z drives shoulder swing.
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.leftUpperArm}.quaternion`,
      t,
      flattenGlbQuats([
        glbArmBindRelativeQuat(GLB_BONE_MAP.leftUpperArm, 0, 0, 0.7),
        glbArmBindRelativeQuat(GLB_BONE_MAP.leftUpperArm, 0, 0, -0.5),
        glbArmBindRelativeQuat(GLB_BONE_MAP.leftUpperArm, 0, 0, 0.7),
      ]),
    ),
  )
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.rightUpperArm}.quaternion`,
      t,
      flattenGlbQuats([
        glbArmBindRelativeQuat(GLB_BONE_MAP.rightUpperArm, 0, 0, -0.5),
        glbArmBindRelativeQuat(GLB_BONE_MAP.rightUpperArm, 0, 0, 0.7),
        glbArmBindRelativeQuat(GLB_BONE_MAP.rightUpperArm, 0, 0, -0.5),
      ]),
    ),
  )
  // Forearm bend at the elbow.
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.leftForeArm}.quaternion`,
      t,
      flattenGlbQuats([
        glbArmBindRelativeQuat(GLB_BONE_MAP.leftForeArm, 0, -0.9, 0),
        glbArmBindRelativeQuat(GLB_BONE_MAP.leftForeArm, 0, -0.4, 0),
        glbArmBindRelativeQuat(GLB_BONE_MAP.leftForeArm, 0, -0.9, 0),
      ]),
    ),
  )
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.rightForeArm}.quaternion`,
      t,
      flattenGlbQuats([
        glbArmBindRelativeQuat(GLB_BONE_MAP.rightForeArm, 0, -0.4, 0),
        glbArmBindRelativeQuat(GLB_BONE_MAP.rightForeArm, 0, -0.9, 0),
        glbArmBindRelativeQuat(GLB_BONE_MAP.rightForeArm, 0, -0.4, 0),
      ]),
    ),
  )
  // Legs in opposition — thigh pitch around X.
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.leftThigh}.quaternion`,
      t,
      flattenGlbQuats([
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.leftThigh, 0.55, 0, 0),
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.leftThigh, -0.4, 0, 0),
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.leftThigh, 0.55, 0, 0),
      ]),
    ),
  )
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.rightThigh}.quaternion`,
      t,
      flattenGlbQuats([
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.rightThigh, -0.4, 0, 0),
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.rightThigh, 0.55, 0, 0),
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.rightThigh, -0.4, 0, 0),
      ]),
    ),
  )
  // Calves bend back during stride.
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.leftShin}.quaternion`,
      t,
      flattenGlbQuats([
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.leftShin, -0.5, 0, 0),
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.leftShin, -1.0, 0, 0),
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.leftShin, -0.5, 0, 0),
      ]),
    ),
  )
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.rightShin}.quaternion`,
      t,
      flattenGlbQuats([
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.rightShin, -1.0, 0, 0),
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.rightShin, -0.5, 0, 0),
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.rightShin, -1.0, 0, 0),
      ]),
    ),
  )

  return new THREE.AnimationClip('cut_sprint', duration, tracks)
}

/**
 * Phase O-ANIM (OB4) — `defense_slide` retargeted to the GLB rig.
 *
 * Wide low stance with hands up. Hips rock laterally, thighs splay
 * outward (Z roll), knees stay bent. Spine holds a forward lean
 * across the full duration so the torso reads "active" rather than
 * stiff.
 */
function buildGlbDefenseSlideClip(): THREE.AnimationClip {
  const duration = 1.0
  const t = [0, duration * 0.5, duration]
  const tracks: THREE.KeyframeTrack[] = []

  // Hips rock side-to-side (Z roll).
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.hips}.quaternion`,
      t,
      flattenGlbQuats([
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.hips, 0, 0, 0.05),
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.hips, 0, 0, -0.05),
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.hips, 0, 0, 0.05),
      ]),
    ),
  )
  // Forward lean held across duration.
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.spine}.quaternion`,
      [0, duration],
      flattenGlbQuats([glbEulerQuat(0.18, 0, 0), glbEulerQuat(0.18, 0, 0)]),
    ),
  )
  // Arms held active but below airplane/T-pose height.
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.leftUpperArm}.quaternion`,
      [0, duration],
      flattenGlbQuats([
        glbArmBindRelativeQuat(GLB_BONE_MAP.leftUpperArm, 1.6, 0, 0.2),
        glbArmBindRelativeQuat(GLB_BONE_MAP.leftUpperArm, 1.6, 0, 0.2),
      ]),
    ),
  )
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.rightUpperArm}.quaternion`,
      [0, duration],
      flattenGlbQuats([
        glbArmBindRelativeQuat(GLB_BONE_MAP.rightUpperArm, 1.6, 0, -0.2),
        glbArmBindRelativeQuat(GLB_BONE_MAP.rightUpperArm, 1.6, 0, -0.2),
      ]),
    ),
  )
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.leftForeArm}.quaternion`,
      [0, duration],
      flattenGlbQuats([
        glbArmBindRelativeQuat(GLB_BONE_MAP.leftForeArm, 0, -0.72, 0),
        glbArmBindRelativeQuat(GLB_BONE_MAP.leftForeArm, 0, -0.72, 0),
      ]),
    ),
  )
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.rightForeArm}.quaternion`,
      [0, duration],
      flattenGlbQuats([
        glbArmBindRelativeQuat(GLB_BONE_MAP.rightForeArm, 0, -0.72, 0),
        glbArmBindRelativeQuat(GLB_BONE_MAP.rightForeArm, 0, -0.72, 0),
      ]),
    ),
  )
  // Wide thigh splay + slight rock.
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.leftThigh}.quaternion`,
      t,
      flattenGlbQuats([
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.leftThigh, -0.5, 0, 0.2),
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.leftThigh, -0.6, 0, 0.2),
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.leftThigh, -0.5, 0, 0.2),
      ]),
    ),
  )
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.rightThigh}.quaternion`,
      t,
      flattenGlbQuats([
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.rightThigh, -0.6, 0, -0.2),
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.rightThigh, -0.5, 0, -0.2),
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.rightThigh, -0.6, 0, -0.2),
      ]),
    ),
  )
  // Knees bent.
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.leftShin}.quaternion`,
      [0, duration],
      flattenGlbQuats([
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.leftShin, 0.32, 0, 0),
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.leftShin, 0.32, 0, 0),
      ]),
    ),
  )
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.rightShin}.quaternion`,
      [0, duration],
      flattenGlbQuats([
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.rightShin, 0.32, 0, 0),
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.rightShin, 0.32, 0, 0),
      ]),
    ),
  )

  return new THREE.AnimationClip('defense_slide', duration, tracks)
}

/**
 * P2.4 — readable `DEFENSIVE_DENY` posture.
 *
 * Teaching goal: before the back cut, the defender must visibly own
 * the passing lane. This is a deterministic pose shim, not a movement
 * system: every track is a quaternion, and scenario data still owns
 * route position.
 */
function buildGlbDefensiveDenyClip(): THREE.AnimationClip {
  const duration = 1.2
  const tracks: THREE.KeyframeTrack[] = []

  // Hips and chest angle into the lane so the defender reads as
  // overplaying instead of standing square to the cutter.
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.hips}.quaternion`,
      [0, duration],
      flattenGlbQuats([
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.hips, 0, -0.16, -0.04),
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.hips, 0, -0.16, -0.04),
      ]),
    ),
  )
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.spine}.quaternion`,
      [0, duration],
      flattenGlbQuats([
        glbEulerQuat(0.16, -0.24, -0.08),
        glbEulerQuat(0.16, -0.24, -0.08),
      ]),
    ),
  )
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.head}.quaternion`,
      [0, duration],
      flattenGlbQuats([
        glbEulerQuat(0.02, 0.18, 0.02),
        glbEulerQuat(0.02, 0.18, 0.02),
      ]),
    ),
  )

  // Inside arm is in the lane, but below T-pose height; off arm stays
  // bent near the body. Asymmetry is the visual read.
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.leftUpperArm}.quaternion`,
      [0, duration],
      flattenGlbQuats([
        glbArmBindRelativeQuat(GLB_BONE_MAP.leftUpperArm, 1.1, 0, 0.45),
        glbArmBindRelativeQuat(GLB_BONE_MAP.leftUpperArm, 1.1, 0, 0.45),
      ]),
    ),
  )
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.leftForeArm}.quaternion`,
      [0, duration],
      flattenGlbQuats([
        glbArmBindRelativeQuat(GLB_BONE_MAP.leftForeArm, 0, -0.42, 0),
        glbArmBindRelativeQuat(GLB_BONE_MAP.leftForeArm, 0, -0.42, 0),
      ]),
    ),
  )
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.rightUpperArm}.quaternion`,
      [0, duration],
      flattenGlbQuats([
        glbArmBindRelativeQuat(GLB_BONE_MAP.rightUpperArm, 2.25, 0, -0.04),
        glbArmBindRelativeQuat(GLB_BONE_MAP.rightUpperArm, 2.25, 0, -0.04),
      ]),
    ),
  )
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.rightForeArm}.quaternion`,
      [0, duration],
      flattenGlbQuats([
        glbArmBindRelativeQuat(GLB_BONE_MAP.rightForeArm, 0, -0.62, 0),
        glbArmBindRelativeQuat(GLB_BONE_MAP.rightForeArm, 0, -0.62, 0),
      ]),
    ),
  )

  // Athletic base: mild crouch, narrow enough to avoid leg folding.
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.leftThigh}.quaternion`,
      [0, duration],
      flattenGlbQuats([
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.leftThigh, -0.32, 0, 0.08),
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.leftThigh, -0.32, 0, 0.08),
      ]),
    ),
  )
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.rightThigh}.quaternion`,
      [0, duration],
      flattenGlbQuats([
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.rightThigh, -0.28, 0, -0.06),
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.rightThigh, -0.28, 0, -0.06),
      ]),
    ),
  )
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.leftShin}.quaternion`,
      [0, duration],
      flattenGlbQuats([
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.leftShin, 0.18, 0, 0),
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.leftShin, 0.18, 0, 0),
      ]),
    ),
  )
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.rightShin}.quaternion`,
      [0, duration],
      flattenGlbQuats([
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.rightShin, 0.16, 0, 0),
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.rightShin, 0.16, 0, 0),
      ]),
    ),
  )

  return new THREE.AnimationClip('defensive_deny', duration, tracks)
}

/**
 * P2.6 — `receive_ready` retargeted to the GLB rig.
 *
 * Stationary catch-and-read pose. Used when the offensive player is
 * about to receive, has just received, is settled in a shooting
 * stance, or is holding the ball after a reset. The pre-P2.6 routing
 * sent `RECEIVE_READY`, `SHOT_READY`, and `RESET_HOLD` to
 * `cut_sprint`, which made a stationary catcher visibly run in place;
 * that has been replaced with this clip.
 *
 * Pose intent (Phase P §5):
 *   - Slight forward lean at chest, head up tracking the ball.
 *   - Hands up at chest height, palms toward the ball (target hand).
 *   - Knees softly bent in a balanced ready stance.
 *   - Subtle weight shift over the duration so the silhouette does
 *     not freeze into a still photo at broadcast distance.
 *   - No translation or scale tracks: scenario data still owns x/z/t.
 *
 * The shoulders / arms intentionally stay below T-pose height so the
 * mannequin does not snap into a broad rest silhouette when this clip
 * cross-fades over `idle_ready` or `cut_sprint`.
 */
function buildGlbReceiveReadyClip(): THREE.AnimationClip {
  const duration = 2.0
  const t = [0, duration * 0.5, duration]
  const tracks: THREE.KeyframeTrack[] = []

  // Slight forward chest lean with a gentle weight shift so the
  // figure looks alive but stationary. Amplitudes are smaller than
  // `idle_ready` because the receiver is in a more committed
  // basketball pose.
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.spine}.quaternion`,
      t,
      flattenGlbQuats([
        glbEulerQuat(0.1, 0.03, 0),
        glbEulerQuat(0.12, -0.03, 0),
        glbEulerQuat(0.1, 0.03, 0),
      ]),
    ),
  )
  // Head up, eyes tracking the ball.
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.head}.quaternion`,
      t,
      flattenGlbQuats([
        glbEulerQuat(-0.06, -0.02, 0),
        glbEulerQuat(-0.06, 0.02, 0),
        glbEulerQuat(-0.06, -0.02, 0),
      ]),
    ),
  )
  // Both arms come up to chest height with elbows bent — target hands.
  // Elbows kept bent on the forearm tracks so the silhouette reads as
  // "hands ready to catch" rather than reaching out toward the ball.
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.leftUpperArm}.quaternion`,
      [0, duration],
      flattenGlbQuats([
        glbArmBindRelativeQuat(GLB_BONE_MAP.leftUpperArm, 1.55, 0, 0.18),
        glbArmBindRelativeQuat(GLB_BONE_MAP.leftUpperArm, 1.55, 0, 0.18),
      ]),
    ),
  )
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.rightUpperArm}.quaternion`,
      [0, duration],
      flattenGlbQuats([
        glbArmBindRelativeQuat(GLB_BONE_MAP.rightUpperArm, 1.55, 0, -0.18),
        glbArmBindRelativeQuat(GLB_BONE_MAP.rightUpperArm, 1.55, 0, -0.18),
      ]),
    ),
  )
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.leftForeArm}.quaternion`,
      [0, duration],
      flattenGlbQuats([
        glbArmBindRelativeQuat(GLB_BONE_MAP.leftForeArm, 0, -0.95, 0),
        glbArmBindRelativeQuat(GLB_BONE_MAP.leftForeArm, 0, -0.95, 0),
      ]),
    ),
  )
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.rightForeArm}.quaternion`,
      [0, duration],
      flattenGlbQuats([
        glbArmBindRelativeQuat(GLB_BONE_MAP.rightForeArm, 0, -0.95, 0),
        glbArmBindRelativeQuat(GLB_BONE_MAP.rightForeArm, 0, -0.95, 0),
      ]),
    ),
  )
  // Athletic base — mild knee bend, slightly more committed than idle.
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.leftThigh}.quaternion`,
      [0, duration],
      flattenGlbQuats([
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.leftThigh, -0.22, 0, 0.04),
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.leftThigh, -0.22, 0, 0.04),
      ]),
    ),
  )
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.rightThigh}.quaternion`,
      [0, duration],
      flattenGlbQuats([
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.rightThigh, -0.22, 0, -0.04),
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.rightThigh, -0.22, 0, -0.04),
      ]),
    ),
  )
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.leftShin}.quaternion`,
      [0, duration],
      flattenGlbQuats([
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.leftShin, 0.14, 0, 0),
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.leftShin, 0.14, 0, 0),
      ]),
    ),
  )
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.rightShin}.quaternion`,
      [0, duration],
      flattenGlbQuats([
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.rightShin, 0.14, 0, 0),
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.rightShin, 0.14, 0, 0),
      ]),
    ),
  )

  return new THREE.AnimationClip('receive_ready', duration, tracks)
}

/**
 * P2.6 — `closeout_read` retargeted to the GLB rig.
 *
 * Forward closeout body language for the FALLBACK path (when
 * `USE_IMPORTED_CLOSEOUT_CLIP` is off). The pre-P2.6 routing sent
 * `CLOSEOUT` flag-off to `defense_slide`, which is laterally
 * shifting body language — wrong for what should read as a forward
 * sprint at the shooter. The imported `closeout.glb` still wins when
 * the flag is on; this clip only owns the deterministic fallback.
 *
 * Pose intent (Phase P §5):
 *   - Forward chest lean (~12°) so the shoulders read as committing.
 *   - High inside hand to contest the shot, off hand bent near body.
 *   - Athletic base with knees bent and feet narrow enough to avoid
 *     leg folding at the rig's bind pose.
 *   - Subtle hip rock (deceleration cue) over the duration.
 *   - No translation or scale tracks: scenario data still owns x/z/t.
 *
 * The pose is intentionally distinct from `defense_slide` (lateral
 * stance, mirror arms) and from `defensive_deny` (asymmetric arm in
 * the passing lane) so the three defensive postures can be
 * distinguished at broadcast-camera distance.
 */
function buildGlbCloseoutReadClip(): THREE.AnimationClip {
  const duration = 1.2
  const t = [0, duration * 0.5, duration]
  const tracks: THREE.KeyframeTrack[] = []

  // Hip rock — small forward yaw modulation across the closeout so
  // the figure does not freeze into a single forward stance.
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.hips}.quaternion`,
      t,
      flattenGlbQuats([
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.hips, 0, 0.04, 0),
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.hips, 0, -0.04, 0),
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.hips, 0, 0.04, 0),
      ]),
    ),
  )
  // Forward chest lean. More committed than `defense_slide` — this is
  // the cue the receiver reads as "the defender is closing on me."
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.spine}.quaternion`,
      [0, duration],
      flattenGlbQuats([
        glbEulerQuat(0.21, 0, 0),
        glbEulerQuat(0.21, 0, 0),
      ]),
    ),
  )
  // Head up, tracking the shooter.
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.head}.quaternion`,
      [0, duration],
      flattenGlbQuats([
        glbEulerQuat(-0.1, 0, 0),
        glbEulerQuat(-0.1, 0, 0),
      ]),
    ),
  )
  // Inside hand goes high to contest. Bent forearm so the silhouette
  // does not push toward T-pose.
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.leftUpperArm}.quaternion`,
      [0, duration],
      flattenGlbQuats([
        glbArmBindRelativeQuat(GLB_BONE_MAP.leftUpperArm, 2.55, 0, 0.18),
        glbArmBindRelativeQuat(GLB_BONE_MAP.leftUpperArm, 2.55, 0, 0.18),
      ]),
    ),
  )
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.leftForeArm}.quaternion`,
      [0, duration],
      flattenGlbQuats([
        glbArmBindRelativeQuat(GLB_BONE_MAP.leftForeArm, 0, -0.4, 0),
        glbArmBindRelativeQuat(GLB_BONE_MAP.leftForeArm, 0, -0.4, 0),
      ]),
    ),
  )
  // Off hand bent near body, ready to slide-recover.
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.rightUpperArm}.quaternion`,
      [0, duration],
      flattenGlbQuats([
        glbArmBindRelativeQuat(GLB_BONE_MAP.rightUpperArm, 1.4, 0, -0.18),
        glbArmBindRelativeQuat(GLB_BONE_MAP.rightUpperArm, 1.4, 0, -0.18),
      ]),
    ),
  )
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.rightForeArm}.quaternion`,
      [0, duration],
      flattenGlbQuats([
        glbArmBindRelativeQuat(GLB_BONE_MAP.rightForeArm, 0, -0.7, 0),
        glbArmBindRelativeQuat(GLB_BONE_MAP.rightForeArm, 0, -0.7, 0),
      ]),
    ),
  )
  // Athletic base — knees bent, narrow stance.
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.leftThigh}.quaternion`,
      [0, duration],
      flattenGlbQuats([
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.leftThigh, -0.34, 0, 0.06),
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.leftThigh, -0.34, 0, 0.06),
      ]),
    ),
  )
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.rightThigh}.quaternion`,
      [0, duration],
      flattenGlbQuats([
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.rightThigh, -0.3, 0, -0.06),
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.rightThigh, -0.3, 0, -0.06),
      ]),
    ),
  )
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.leftShin}.quaternion`,
      [0, duration],
      flattenGlbQuats([
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.leftShin, 0.22, 0, 0),
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.leftShin, 0.22, 0, 0),
      ]),
    ),
  )
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.rightShin}.quaternion`,
      [0, duration],
      flattenGlbQuats([
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.rightShin, 0.22, 0, 0),
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.rightShin, 0.22, 0, 0),
      ]),
    ),
  )

  return new THREE.AnimationClip('closeout_read', duration, tracks)
}

const _glbScratchEuler = new THREE.Euler()

function glbEulerQuat(x: number, y: number, z: number): THREE.Quaternion {
  _glbScratchEuler.set(x, y, z, 'XYZ')
  return new THREE.Quaternion().setFromEuler(_glbScratchEuler)
}

function glbLowerBodyBindRelativeQuat(
  boneName: string,
  x: number,
  y: number,
  z: number,
): THREE.Quaternion {
  const bind = GLB_LOWER_BODY_BIND_QUATERNIONS[boneName]
  if (!bind) return glbEulerQuat(x, y, z)
  const [bx, by, bz, bw] = bind
  return new THREE.Quaternion(bx, by, bz, bw)
    .multiply(glbEulerQuat(x, y, z))
    .normalize()
}

function glbArmBindRelativeQuat(
  boneName: string,
  x: number,
  y: number,
  z: number,
): THREE.Quaternion {
  const bind = GLB_ARM_BIND_QUATERNIONS[boneName]
  if (!bind) return glbEulerQuat(x, y, z)
  const [bx, by, bz, bw] = bind
  return new THREE.Quaternion(bx, by, bz, bw)
    .multiply(glbEulerQuat(x, y, z))
    .normalize()
}

function flattenGlbQuats(quats: THREE.Quaternion[]): number[] {
  const out: number[] = []
  for (const q of quats) out.push(q.x, q.y, q.z, q.w)
  return out
}

interface GlbAthleteCacheEntry {
  /** The fully parsed GLTF asset returned by GLTFLoader. */
  gltf: GLTF
  /**
   * The first SkinnedMesh inside the parsed scene. Held so the
   * asset's vertex buffer is reachable for the per-figure clone
   * without re-traversing the scene each call.
   */
  skinnedMesh: THREE.SkinnedMesh
}

let cache: GlbAthleteCacheEntry | null = null
let loadInFlight: Promise<GlbAthleteCacheEntry | null> | null = null

/**
 * Kicks off (or returns the in-flight) async load of the bundled
 * mannequin GLB. Resolves with the cache entry on success, or
 * `null` if anything fails (asset missing, network blocked, parse
 * failure, running outside a browser). Idempotent — repeat calls
 * after a successful load return the cached entry without refetching.
 *
 * Exported for tests and so the renderer's mount path can warm the
 * cache before the first build call if a preload point is added later.
 */
export function loadGlbAthleteAsset(): Promise<GlbAthleteCacheEntry | null> {
  if (cache) return Promise.resolve(cache)
  if (loadInFlight) return loadInFlight
  if (typeof window === 'undefined') return Promise.resolve(null)

  const loader = new GLTFLoader()
  loadInFlight = new Promise<GlbAthleteCacheEntry | null>((resolve) => {
    loader.load(
      GLB_ATHLETE_ASSET_URL,
      (gltf) => {
        const skinned = findFirstSkinnedMesh(gltf.scene)
        if (!skinned) {
          resolve(null)
          return
        }
        cache = { gltf, skinnedMesh: skinned }
        resolve(cache)
      },
      undefined,
      () => resolve(null),
    )
  }).catch(() => null)
  return loadInFlight
}

/** Internal — clears the cache. Used by tests. */
export function _resetGlbAthleteCache(): void {
  cache = null
  loadInFlight = null
}

/**
 * P3.3F — last failure reason for `buildGlbAthletePreview`. Updated
 * on every call (including success), so callers can read it
 * synchronously after the figure builder returns to find out *why*
 * a `null` result happened (`cache-cold` vs the figure-construction
 * try/catch on line 1280 swallowing a real exception).
 *
 * Without this hook the `buildPlayerFigure` fallback chain silently
 * reverts to the procedural Phase F figure on any failure, so a
 * production user sees procedural with no console signal for *why*.
 * Surfacing the reason lets `Scenario3DCanvas` emit a hard
 * `[CourtIQ GLB ERROR]` line when the gate is on, the cache is
 * populated, and procedural was picked anyway.
 *
 * Module-scope rather than per-call return-value because the
 * existing public signature of `buildGlbAthletePreview` (returns
 * `THREE.Group | null`) is consumed by determinism / e2e tests we
 * do not want to churn. The failure tracker is an out-of-band
 * diagnostic only — production code paths still branch on the
 * return value.
 */
export type GlbBuildFailureKind =
  | 'success'
  | 'cache-cold'
  | 'threw'
  | 'not-browser'

export interface GlbBuildFailure {
  kind: GlbBuildFailureKind
  /** Stringified error message when `kind === 'threw'`. */
  error?: string
}

let _lastGlbBuildFailure: GlbBuildFailure = { kind: 'cache-cold' }

export function _getLastGlbBuildFailure(): GlbBuildFailure {
  return _lastGlbBuildFailure
}

export function _resetLastGlbBuildFailureForTest(): void {
  _lastGlbBuildFailure = { kind: 'cache-cold' }
}

/**
 * P0-LOCK-2 — test-only cache injector. Bypasses the GLTFLoader so
 * Vitest can exercise the actual GLB athlete construction path
 * (clone, bone-map audit, foot-to-floor offset, mixer wiring) on a
 * faithful mock skeleton. The mock asset must:
 *
 *   1. expose a `scene` whose tree contains the SkinnedMesh and
 *      every bone the bespoke clips target (see `GLB_BONE_MAP`).
 *   2. expose a `skinnedMesh` reachable inside that scene.
 *
 * The end-to-end GLB determinism gate sits on top of this helper.
 * See `glbAthleteEndToEndDeterminism.test.ts`.
 */
export function _setGlbAthleteCacheForTest(
  scene: THREE.Object3D,
  skinnedMesh: THREE.SkinnedMesh,
): void {
  cache = { gltf: { scene } as unknown as GLTF, skinnedMesh }
  loadInFlight = null
}

/**
 * Phase O-ASSET — synchronous builder entry point. Returns the
 * cloned figure if the GLB asset cache is populated, otherwise
 * returns `null` and (in a browser) kicks off the async load so
 * subsequent calls can succeed.
 *
 * Static-only: no AnimationMixer, no clips, no per-frame pose
 * advance. Root motion stays owned by the scene timeline (same as
 * the procedural figure). When animation retargeting lands in a
 * follow-up phase, the per-figure `mixer` and `actions` will attach
 * onto the same figure root via `userData.glbAthlete`.
 */
export interface BuildGlbAthletePreviewOptions {
  /**
   * Phase P (P1.0) — when true, attach the imported closeout clip
   * action to this figure's mixer. Caller is expected to gate this
   * on `USE_IMPORTED_CLOSEOUT_CLIP`; the GLB module does not import
   * the flag itself to avoid a circular dependency with
   * `imperativeScene.ts`.
   *
   * If true and no `closeout.glb` asset is on disk, the builder
   * falls back to the synthetic placeholder closeout clip (built
   * in `_ensurePlaceholderImportedCloseoutClip`) so the action is
   * always attached when the flag is on.
   */
  attachImportedCloseoutClip?: boolean
  /**
   * Phase P (P2.2) — when true, attach the imported back-cut clip
   * action to this figure's mixer. Caller is expected to gate this
   * on `USE_IMPORTED_BACK_CUT_CLIP`; the GLB module does not import
   * the flag itself to avoid a circular dependency with
   * `imperativeScene.ts`.
   *
   * If true and no `back_cut.glb` asset is available in the loader
   * cache yet, the builder falls back to the bespoke `cut_sprint`
   * clip (the same fallback the resolver picks when the flag is
   * off) so the action is always populated. The async loader is
   * kicked off in the background; subsequent figure builds pick
   * up the real clip once the cache is warm.
   */
  attachImportedBackCutClip?: boolean
}

export function buildGlbAthletePreview(
  teamColor: string,
  _trimColor: string,
  isUser: boolean,
  hasBall: boolean,
  _jerseyNumber: string,
  _stance: PlayerStance,
  options?: BuildGlbAthletePreviewOptions,
): THREE.Group | null {
  try {
    if (!cache) {
      _lastGlbBuildFailure =
        typeof window === 'undefined'
          ? { kind: 'not-browser' }
          : { kind: 'cache-cold' }
      if (typeof window !== 'undefined') void loadGlbAthleteAsset()
      return null
    }

    const figure = new THREE.Group()
    figure.name = 'glb-player-figure'
    figure.scale.setScalar(GLB_M_TO_FT_SCALE)

    const cloned = cloneSkinned(cache.gltf.scene)
    cloned.name = 'glb-mannequin-clone'
    figure.add(cloned)

    _runBoneMapAuditOnce(cloned)
    _alignGlbFeetToFigureFloor(figure, cloned)

    applyMultiRegionMaterialsToCloned(cloned, teamColor)

    const indicatorLayers = buildGlbIndicatorLayers(figure, teamColor, isUser, hasBall)
    ;(figure.userData as Record<string, unknown>).indicatorLayers = indicatorLayers

    const mixer = new THREE.AnimationMixer(cloned)
    const clips = getCachedGlbClips()
    const actions: Record<string, THREE.AnimationAction> = {}
    for (const clip of clips) {
      actions[clip.name] = mixer.clipAction(clip)
    }
    if (options?.attachImportedCloseoutClip) {
      // Loader contract: every imported clip is root-motion-stripped
      // before it reaches an AnimationMixer. The cache holds the
      // stripped form; if the cache is cold we prime it with the
      // synthetic placeholder (also stripped). A real
      // `closeout.glb` on disk is fetched in the background; when
      // that fetch lands, the next figure build will pick it up.
      //
      // P1.9 closeout follow-up — pose readability. The raw imported
      // clip stays upper-body only; the lower body is replaced with
      // a CourtIQ-authored athletic base so we do not fall back to
      // the Quaternius rest pose after stripping the broken leg
      // tracks. The readable clip is cached per source clip so the
      // cost is paid once per asset swap, not per figure.
      const closeoutClip = _getReadableCloseoutClip()
      actions['closeout'] = mixer.clipAction(closeoutClip)
      _kickOffImportedCloseoutClipLoad()
    }
    if (options?.attachImportedBackCutClip) {
      // P2.3 — attach the readable back-cut action when the flag is
      // on. The cache still holds the loader-stripped imported clip,
      // but the mixer sees a CourtIQ-safe teaching shim instead of
      // the raw NinjaJump pose. If the cache is cold the builder
      // falls back to the bespoke `cut_sprint` action so the
      // resolver-chosen action is always present on the handle,
      // matching the flag-off resolver fallback exactly.
      const backCutClip = _getCachedImportedBackCutClipOrNull()
      if (backCutClip) {
        actions['back_cut'] = mixer.clipAction(_getReadableBackCutClip(backCutClip))
      } else if (actions['cut_sprint']) {
        actions['back_cut'] = actions['cut_sprint']
      }
      _kickOffImportedBackCutClipLoad()
    }
    actions['idle_ready']?.play()

    const rootBone = findGlbRootBone(cloned)

    // P0-LOCK — pick a mapped probe bone so the mixer-tick assertion
    // can compare its quaternion against an initial snapshot a few
    // ticks later. Spine sits in the middle of the kinematic chain
    // and is animated by every bespoke clip the GLB path ships, so
    // it is the most reliable single bone to watch.
    const probeBoneName = GLB_BONE_MAP.spine
    let probeInitial: THREE.Quaternion | null = null
    cloned.traverse((child) => {
      if (probeInitial) return
      if ((child as THREE.Bone).isBone && child.name === probeBoneName) {
        probeInitial = (child as THREE.Bone).quaternion.clone()
      }
    })

    ;(figure.userData as Record<string, unknown>)[GLB_ATHLETE_USER_DATA_KEY] = {
      figure,
      cloned,
      mixer,
      actions,
      rootBone,
      _mixerAssertion: {
        ticks: 0,
        asserted: false,
        probeBoneName: probeInitial ? probeBoneName : null,
        initialQuat: probeInitial,
      },
    } satisfies GlbAthleteHandle

    _lastGlbBuildFailure = { kind: 'success' }
    return figure
  } catch (err) {
    _lastGlbBuildFailure = {
      kind: 'threw',
      error: err instanceof Error ? err.message : String(err),
    }
    return null
  }
}

let _cachedGlbClips: THREE.AnimationClip[] | null = null

function getCachedGlbClips(): THREE.AnimationClip[] {
  if (_cachedGlbClips) return _cachedGlbClips
  _cachedGlbClips = [
    buildGlbIdleReadyClip(),
    buildGlbCutSprintClip(),
    buildGlbDefenseSlideClip(),
    buildGlbDefensiveDenyClip(),
    // P2.6 — stationary catch / shot / reset readability.
    buildGlbReceiveReadyClip(),
    // P2.6 — forward closeout fallback (replaces defense_slide for
    // CLOSEOUT when `USE_IMPORTED_CLOSEOUT_CLIP` is off).
    buildGlbCloseoutReadClip(),
  ]
  return _cachedGlbClips
}

/**
 * Phase P (P1.0) — synthetic placeholder for the imported closeout
 * clip. Authored programmatically because no real CC0 closeout clip
 * is bundled yet (see `apps/web/public/athlete/clips/README.md`).
 *
 * Critically, this clip is built to look like a real Mixamo-style
 * imported clip — INCLUDING a `pelvis.position` track — so the
 * loader-level root-motion strip is exercised end-to-end and the
 * determinism gate can verify the strip actually keeps the
 * defender on the authored route.
 *
 * Pose intent (Phase P §5):
 *   - Forward chest lean held over duration.
 *   - Hands raised high (active hand).
 *   - Wide stance with knees bent.
 *   - Hip rock (subtle, decelerating).
 *
 * The track values are deliberately distinct from
 * `defense_slide` so a flag-on render visibly differs from the
 * flag-off render — proves the closeout action is in fact
 * driving the defender, not the bespoke slide clip.
 */
function buildPlaceholderImportedCloseoutClip(): THREE.AnimationClip {
  const duration = 1.2
  const t = [0, duration * 0.5, duration]
  const tracks: THREE.KeyframeTrack[] = []

  // Root motion track. This is what the loader strips. Authored to
  // a non-trivial forward translation so a missing strip step would
  // visibly drift the figure. The strip is enforced inside
  // `_buildAndStripPlaceholderCloseoutClip`; the un-stripped clip
  // never reaches a mixer in production.
  tracks.push(
    new THREE.VectorKeyframeTrack(
      `${GLB_BONE_MAP.hips}.position`,
      [0, duration],
      [0, 0, 0, 0, 0, 1.5],
    ),
  )

  // Hip rock (Z roll), decelerating closeout posture.
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.hips}.quaternion`,
      t,
      flattenGlbQuats([
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.hips, 0, 0, 0.04),
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.hips, 0, 0, -0.04),
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.hips, 0, 0, 0.02),
      ]),
    ),
  )
  // Forward chest lean held over duration.
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.spine}.quaternion`,
      [0, duration],
      flattenGlbQuats([glbEulerQuat(0.22, 0, 0), glbEulerQuat(0.22, 0, 0)]),
    ),
  )
  // Head slightly down, eyes on the receiver.
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.head}.quaternion`,
      [0, duration],
      flattenGlbQuats([glbEulerQuat(0.08, 0, 0), glbEulerQuat(0.08, 0, 0)]),
    ),
  )
  // Active hands — both arms raised high.
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.leftUpperArm}.quaternion`,
      [0, duration],
      flattenGlbQuats([
        glbArmBindRelativeQuat(GLB_BONE_MAP.leftUpperArm, 0, 0, 1.4),
        glbArmBindRelativeQuat(GLB_BONE_MAP.leftUpperArm, 0, 0, 1.4),
      ]),
    ),
  )
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.rightUpperArm}.quaternion`,
      [0, duration],
      flattenGlbQuats([
        glbArmBindRelativeQuat(GLB_BONE_MAP.rightUpperArm, 0, 0, -1.4),
        glbArmBindRelativeQuat(GLB_BONE_MAP.rightUpperArm, 0, 0, -1.4),
      ]),
    ),
  )
  // Forearms slightly bent.
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.leftForeArm}.quaternion`,
      [0, duration],
      flattenGlbQuats([
        glbArmBindRelativeQuat(GLB_BONE_MAP.leftForeArm, 0, -0.6, 0),
        glbArmBindRelativeQuat(GLB_BONE_MAP.leftForeArm, 0, -0.6, 0),
      ]),
    ),
  )
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.rightForeArm}.quaternion`,
      [0, duration],
      flattenGlbQuats([
        glbArmBindRelativeQuat(GLB_BONE_MAP.rightForeArm, 0, -0.6, 0),
        glbArmBindRelativeQuat(GLB_BONE_MAP.rightForeArm, 0, -0.6, 0),
      ]),
    ),
  )
  // Wide stance — thighs splay outward, knees bent.
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.leftThigh}.quaternion`,
      [0, duration],
      flattenGlbQuats([
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.leftThigh, -0.45, 0, 0.18),
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.leftThigh, -0.45, 0, 0.18),
      ]),
    ),
  )
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.rightThigh}.quaternion`,
      [0, duration],
      flattenGlbQuats([
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.rightThigh, -0.45, 0, -0.18),
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.rightThigh, -0.45, 0, -0.18),
      ]),
    ),
  )
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.leftShin}.quaternion`,
      [0, duration],
      flattenGlbQuats([
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.leftShin, 0.42, 0, 0),
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.leftShin, 0.42, 0, 0),
      ]),
    ),
  )
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.rightShin}.quaternion`,
      [0, duration],
      flattenGlbQuats([
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.rightShin, 0.42, 0, 0),
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.rightShin, 0.42, 0, 0),
      ]),
    ),
  )

  return new THREE.AnimationClip('closeout', duration, tracks)
}

/**
 * Phase P (P1.0) — primes the imported-clip cache with the
 * synthetic placeholder closeout clip after running it through the
 * loader-level root-motion strip. Idempotent; safe to call from
 * every figure build.
 *
 * In production this is the path used while no real
 * `/athlete/clips/closeout.glb` is on disk. When a real permissive
 * asset lands, the in-flight `loadImportedClip` call from
 * `_kickOffImportedCloseoutClipLoad` will overwrite the cache with
 * the real clip's tracks (also stripped). The synthetic clip stays
 * useful as a deterministic test fixture forever.
 *
 * Returns the cached, stripped clip.
 */
function _ensurePlaceholderImportedCloseoutClip(): THREE.AnimationClip {
  const cached = getCachedImportedClip(GLB_IMPORTED_CLOSEOUT_CLIP_URL)
  if (cached) return cached.clip
  const raw = buildPlaceholderImportedCloseoutClip()
  const stripped = stripRootMotionTracks(raw)
  _setImportedClipCacheForTest(GLB_IMPORTED_CLOSEOUT_CLIP_URL, {
    clip: stripped,
    strippedTrackNames: [`${GLB_BONE_MAP.hips}.position`],
  })
  return stripped
}

/**
 * P1.9 — closeout lower-body safety strip.
 *
 * Diagnosis (recorded in `docs/qa/courtiq/phase-o-glb-athlete.md`
 * §P1.9): the bundled Quaternius UAL2 `closeout.glb` is authored
 * against the same rig as the runtime mannequin, but its lower-body
 * rotation tracks dump near-180° absolute quaternions onto bones
 * whose bind pose already carries a non-trivial rotation:
 *
 *   thigh_l/r bind ≈ 166° around X.  Closeout track at t=0 ≈ 179°
 *   along a similar axis. The DELTA from bind is small in
 *   isolation, but compose-with-pelvis + foot tracks pushes the
 *   visible thigh into a near-vertical "knees folded under" pose —
 *   the "legs flipped up" silhouette in P1.8 screenshots.
 *
 *   pelvis bind ≈ 75° around X. Closeout pelvis track ≈ 100–131°
 *   along a multi-axis quaternion — the figure rolls forward past
 *   the cushion read.
 *
 *   root bone has a -90° X rotation track that contradicts the
 *   bind orientation entirely; with the mixer overwriting bind on
 *   every frame, the entire figure flips.
 *
 * P1.8 also shipped a rotation dampener that slerped each keyframe
 * from identity toward the authored value. That helper is bind-pose
 * NAIVE: bones whose bind rotation is large (clavicle/upperarm at
 * 96°, thigh at 166°, foot at 64°) get dragged toward identity
 * rather than toward bind, which compounded the leg break with
 * arm/shoulder distortion.
 *
 * Fix (P1.9 first pass): **Option D — disable imported lower-body
 * tracks** for the closeout clip, and drop the bind-naive dampener.
 *
 * P1.9 visual follow-up: holding the Quaternius rest pose was not
 * enough. The mannequin's runtime rest pose is technically valid
 * skinning data, but it is not a CourtIQ basketball stance once the
 * imported closeout action owns the upper body. The legs read as a
 * frozen mannequin base: knees/feet can look tucked, floating, or
 * bug-like at the AOR camera distance. The closeout action now keeps
 * the strip, then adds a tiny authored lower-body base: upright hips,
 * slight knee bend, feet under the body, and zero translation. This
 * is Option A/C from the closeout brief, not a decoder-wide mapping
 * pass.
 *
 * Stripped bone rotations (defaults; overridable for tests):
 *   - root, pelvis      — torso / hips orientation already lives
 *                         on spine_01..03 plus the figure root.
 *   - thigh_l/r         — biggest source of inversions.
 *   - calf_l/r          — kept stable so knees don't fold.
 *   - foot_l/r, ball_l/r — keep feet flat and on the floor.
 *
 * Translation tracks for the same bones are also stripped; the
 * loader-level root-motion strip already handles `pelvis.position`
 * but the imported clip carries thigh / calf translation tracks
 * too (UAL2 exports include translation tracks even when the
 * authored animation is rotation-only).
 *
 * Scale tracks are stripped for the same reason — the imported
 * clip ships scale=1 keyframes which are visually no-ops, but
 * stripping them keeps the mixer track count tight and the
 * determinism gate green.
 */
export const CLOSEOUT_LOWER_BODY_BONE_NAMES: ReadonlyArray<string> = [
  'root',
  'pelvis',
  'thigh_l',
  'thigh_r',
  'calf_l',
  'calf_r',
  'foot_l',
  'foot_r',
  'ball_l',
  'ball_r',
]

/**
 * Authored lower-body tracks added back after the imported closeout
 * lower body is stripped. Deliberately excludes:
 *
 *   - `root` — route/world ownership stays scenario-authored.
 *   - `foot_*` / `ball_*` — their Quaternius bind rotations already
 *     keep the shoes coherent when the hip/thigh/calf base is sane;
 *     overwriting them risks another foot-flip variant.
 *
 * The values are conservative cousins of the existing GLB
 * `defense_slide` lower body: less wide, less low, and almost static
 * so the imported upper body can provide the closeout pressure.
 */
export const CLOSEOUT_SAFE_LOWER_BODY_BONE_NAMES: ReadonlyArray<string> = [
  'pelvis',
  'thigh_l',
  'thigh_r',
  'calf_l',
  'calf_r',
]

/**
 * Returns true when the track targets ANY property channel of one
 * of the listed bones. The helper is name-prefixed: it matches both
 * `thigh_l.quaternion` and the rarer `thigh_l.position.x`.
 */
function isLowerBodyTrack(
  track: THREE.KeyframeTrack,
  boneNames: ReadonlyArray<string>,
): boolean {
  const dot = track.name.indexOf('.')
  if (dot < 0) return false
  const objectName = track.name.slice(0, dot)
  return boneNames.includes(objectName)
}

/**
 * Returns a NEW `THREE.AnimationClip` with every track targeting a
 * lower-body bone removed. Pure function — input clip is not mutated.
 */
export function stripCloseoutLowerBodyTracks(
  clip: THREE.AnimationClip,
  boneNames: ReadonlyArray<string> = CLOSEOUT_LOWER_BODY_BONE_NAMES,
): THREE.AnimationClip {
  const kept: THREE.KeyframeTrack[] = []
  for (const track of clip.tracks) {
    if (isLowerBodyTrack(track, boneNames)) continue
    kept.push(track)
  }
  return new THREE.AnimationClip(clip.name, clip.duration, kept)
}

function buildStableCloseoutLowerBodyTracks(duration: number): THREE.KeyframeTrack[] {
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 1
  const t = [0, safeDuration * 0.5, safeDuration]
  return [
    // Hips stay upright with only a tiny deceleration rock. This is
    // pose, not route: no position track is authored.
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.hips}.quaternion`,
      t,
      flattenGlbQuats([
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.hips, 0, 0, 0.02),
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.hips, 0, 0, -0.02),
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.hips, 0, 0, 0.01),
      ]),
    ),
    // Slight athletic knee bend. Narrower and taller than
    // defense_slide so the closeout does not look like a lateral
    // shuffle or a crouch.
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.leftThigh}.quaternion`,
      [0, safeDuration],
      flattenGlbQuats([
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.leftThigh, -0.28, 0, 0.08),
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.leftThigh, -0.28, 0, 0.08),
      ]),
    ),
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.rightThigh}.quaternion`,
      [0, safeDuration],
      flattenGlbQuats([
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.rightThigh, -0.28, 0, -0.08),
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.rightThigh, -0.28, 0, -0.08),
      ]),
    ),
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.leftShin}.quaternion`,
      [0, safeDuration],
      flattenGlbQuats([
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.leftShin, 0.18, 0, 0),
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.leftShin, 0.18, 0, 0),
      ]),
    ),
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.rightShin}.quaternion`,
      [0, safeDuration],
      flattenGlbQuats([
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.rightShin, 0.18, 0, 0),
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.rightShin, 0.18, 0, 0),
      ]),
    ),
  ]
}

/**
 * Builds the closeout action clip used by the GLB mixer:
 *
 *   1. Remove every imported lower-body/root track that caused the
 *      P1.8/P1.9 leg failures.
 *   2. Add the static CourtIQ lower-body base above.
 *
 * Pure helper: callers may pass the synthetic placeholder or the
 * real bundled `closeout.glb` clip; neither input is mutated.
 */
export function buildReadableCloseoutClip(
  source: THREE.AnimationClip,
): THREE.AnimationClip {
  const upperBodyOnly = stripCloseoutLowerBodyTracks(source)
  return new THREE.AnimationClip(source.name, source.duration, [
    ...upperBodyOnly.tracks,
    ...buildStableCloseoutLowerBodyTracks(source.duration),
  ])
}

/**
 * Lists every track name that `stripCloseoutLowerBodyTracks` would
 * remove for the given clip. Test-only; production code never
 * inspects which tracks were dropped (they're gone by mixer time).
 */
export function listStrippedCloseoutLowerBodyTrackNames(
  clip: THREE.AnimationClip,
  boneNames: ReadonlyArray<string> = CLOSEOUT_LOWER_BODY_BONE_NAMES,
): string[] {
  const out: string[] = []
  for (const track of clip.tracks) {
    if (isLowerBodyTrack(track, boneNames)) out.push(track.name)
  }
  return out
}

/**
 * P2.3 — back-cut readability safety strip.
 *
 * The bundled `back_cut.glb` is useful as a flag-gated imported-clip
 * proof, but the raw pose reads like generic asset motion in BDW-01:
 * wide arms, jump-like lower body, and root/pelvis authoring that
 * fights the teaching route. For CourtIQ the route belongs to
 * scenario data, so the readable clip intentionally replaces the raw
 * pose with a deterministic basketball body-language layer:
 *
 *   - recognition: head/shoulders check the denial;
 *   - plant: torso turns and hips load;
 *   - burst: compact arms pump as the cutter goes behind.
 *
 * Every position/scale track is dropped, along with all raw tracks on
 * the authored core bones. The replacement tracks are rotations only.
 */
export const BACK_CUT_REPLACED_BONE_NAMES: ReadonlyArray<string> = [
  'root',
  'pelvis',
  'spine_01',
  'spine_02',
  'spine_03',
  'neck_01',
  'Head',
  'clavicle_l',
  'clavicle_r',
  'upperarm_l',
  'upperarm_r',
  'lowerarm_l',
  'lowerarm_r',
  'hand_l',
  'hand_r',
  'thigh_l',
  'thigh_r',
  'calf_l',
  'calf_r',
  'foot_l',
  'foot_r',
  'ball_l',
  'ball_r',
]

function isReadableBackCutUnsafeTrack(track: THREE.KeyframeTrack): boolean {
  const dot = track.name.indexOf('.')
  if (dot < 0) return false
  const objectName = track.name.slice(0, dot)
  const property = track.name.slice(dot + 1)
  if (property.startsWith('position') || property.startsWith('scale')) return true
  return BACK_CUT_REPLACED_BONE_NAMES.includes(objectName)
}

/**
 * Returns a NEW clip with raw back-cut tracks that are unsafe or
 * replaced by the readable shim removed. Pure function — input clip
 * is not mutated.
 */
export function stripReadableBackCutSourceTracks(
  clip: THREE.AnimationClip,
): THREE.AnimationClip {
  const kept: THREE.KeyframeTrack[] = []
  for (const track of clip.tracks) {
    if (isReadableBackCutUnsafeTrack(track)) continue
    kept.push(track)
  }
  return new THREE.AnimationClip(clip.name, clip.duration, kept)
}

function buildTeachingBackCutTracks(duration: number): THREE.KeyframeTrack[] {
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 1
  const t0 = 0
  const t1 = safeDuration * 0.2
  const t2 = safeDuration * 0.45
  const t3 = safeDuration * 0.72
  const t4 = safeDuration
  const t = [t0, t1, t2, t3, t4]

  return [
    // Hips load away from the denial, then rotate into the backdoor
    // lane. This is pose only: no pelvis/root translation is authored.
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.hips}.quaternion`,
      t,
      flattenGlbQuats([
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.hips, 0, -0.1, 0),
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.hips, 0, -0.2, 0.03),
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.hips, 0, 0.24, -0.03),
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.hips, 0, 0.14, 0.01),
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.hips, 0, -0.08, 0),
      ]),
    ),
    // Chest sells the read: small denial check, hard shoulder turn,
    // then forward burst.
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.spine}.quaternion`,
      t,
      flattenGlbQuats([
        glbEulerQuat(0.1, -0.12, 0),
        glbEulerQuat(0.16, -0.28, 0.03),
        glbEulerQuat(0.3, 0.36, -0.04),
        glbEulerQuat(0.26, 0.18, 0),
        glbEulerQuat(0.18, -0.08, 0),
      ]),
    ),
    new THREE.QuaternionKeyframeTrack(
      'spine_03.quaternion',
      t,
      flattenGlbQuats([
        glbEulerQuat(0.04, -0.08, 0),
        glbEulerQuat(0.08, -0.22, 0.02),
        glbEulerQuat(0.16, 0.3, -0.03),
        glbEulerQuat(0.12, 0.14, 0),
        glbEulerQuat(0.06, -0.04, 0),
      ]),
    ),
    // Head checks the denial before snapping back down the cut path.
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.head}.quaternion`,
      t,
      flattenGlbQuats([
        glbEulerQuat(-0.02, -0.22, 0),
        glbEulerQuat(-0.04, -0.34, 0),
        glbEulerQuat(0.08, 0.3, 0),
        glbEulerQuat(0.06, 0.12, 0),
        glbEulerQuat(0.02, -0.06, 0),
      ]),
    ),
    // Compact arm pump. Values stay well inside the imported clip's
    // wide-arm silhouette so the cutter never reads T-pose-like.
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.leftUpperArm}.quaternion`,
      t,
      flattenGlbQuats([
        glbArmBindRelativeQuat(GLB_BONE_MAP.leftUpperArm, 0, 0, 0.25),
        glbArmBindRelativeQuat(GLB_BONE_MAP.leftUpperArm, 0, 0, 0.45),
        glbArmBindRelativeQuat(GLB_BONE_MAP.leftUpperArm, 0, 0, -0.42),
        glbArmBindRelativeQuat(GLB_BONE_MAP.leftUpperArm, 0, 0, -0.2),
        glbArmBindRelativeQuat(GLB_BONE_MAP.leftUpperArm, 0, 0, 0.3),
      ]),
    ),
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.rightUpperArm}.quaternion`,
      t,
      flattenGlbQuats([
        glbArmBindRelativeQuat(GLB_BONE_MAP.rightUpperArm, 0, 0, -0.3),
        glbArmBindRelativeQuat(GLB_BONE_MAP.rightUpperArm, 0, 0, -0.48),
        glbArmBindRelativeQuat(GLB_BONE_MAP.rightUpperArm, 0, 0, 0.5),
        glbArmBindRelativeQuat(GLB_BONE_MAP.rightUpperArm, 0, 0, 0.22),
        glbArmBindRelativeQuat(GLB_BONE_MAP.rightUpperArm, 0, 0, -0.28),
      ]),
    ),
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.leftForeArm}.quaternion`,
      t,
      flattenGlbQuats([
        glbArmBindRelativeQuat(GLB_BONE_MAP.leftForeArm, 0, -0.72, 0),
        glbArmBindRelativeQuat(GLB_BONE_MAP.leftForeArm, 0, -0.88, 0),
        glbArmBindRelativeQuat(GLB_BONE_MAP.leftForeArm, 0, -0.54, 0),
        glbArmBindRelativeQuat(GLB_BONE_MAP.leftForeArm, 0, -0.64, 0),
        glbArmBindRelativeQuat(GLB_BONE_MAP.leftForeArm, 0, -0.78, 0),
      ]),
    ),
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.rightForeArm}.quaternion`,
      t,
      flattenGlbQuats([
        glbArmBindRelativeQuat(GLB_BONE_MAP.rightForeArm, 0, -0.78, 0),
        glbArmBindRelativeQuat(GLB_BONE_MAP.rightForeArm, 0, -0.58, 0),
        glbArmBindRelativeQuat(GLB_BONE_MAP.rightForeArm, 0, -0.92, 0),
        glbArmBindRelativeQuat(GLB_BONE_MAP.rightForeArm, 0, -0.7, 0),
        glbArmBindRelativeQuat(GLB_BONE_MAP.rightForeArm, 0, -0.76, 0),
      ]),
    ),
    // Plant-and-go legs, conservative and bind-relative to avoid the
    // lower-body fold/inversion class seen during closeout import.
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.leftThigh}.quaternion`,
      t,
      flattenGlbQuats([
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.leftThigh, -0.18, 0, 0.04),
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.leftThigh, -0.5, 0, 0.08),
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.leftThigh, 0.42, 0, -0.04),
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.leftThigh, 0.26, 0, 0),
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.leftThigh, -0.2, 0, 0.04),
      ]),
    ),
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.rightThigh}.quaternion`,
      t,
      flattenGlbQuats([
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.rightThigh, 0.32, 0, -0.04),
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.rightThigh, 0.12, 0, -0.08),
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.rightThigh, -0.58, 0, 0.05),
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.rightThigh, -0.18, 0, 0),
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.rightThigh, 0.28, 0, -0.04),
      ]),
    ),
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.leftShin}.quaternion`,
      t,
      flattenGlbQuats([
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.leftShin, 0.08, 0, 0),
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.leftShin, 0.36, 0, 0),
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.leftShin, -0.34, 0, 0),
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.leftShin, -0.18, 0, 0),
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.leftShin, 0.06, 0, 0),
      ]),
    ),
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.rightShin}.quaternion`,
      t,
      flattenGlbQuats([
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.rightShin, -0.28, 0, 0),
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.rightShin, -0.08, 0, 0),
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.rightShin, 0.42, 0, 0),
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.rightShin, 0.16, 0, 0),
        glbLowerBodyBindRelativeQuat(GLB_BONE_MAP.rightShin, -0.22, 0, 0),
      ]),
    ),
  ]
}

/**
 * Builds the action clip used when the dev back-cut override is on.
 * The clip is intentionally teaching-authored instead of asset-
 * faithful: it communicates "denied, so cut behind" while scenario
 * data still owns every inch of x/z route motion.
 */
export function buildReadableBackCutClip(
  source: THREE.AnimationClip,
): THREE.AnimationClip {
  const safeSource = stripReadableBackCutSourceTracks(source)
  return new THREE.AnimationClip(source.name, source.duration, [
    ...safeSource.tracks,
    ...buildTeachingBackCutTracks(source.duration),
  ])
}

let _cleanedCloseoutCache:
  | { source: THREE.AnimationClip; cleaned: THREE.AnimationClip }
  | null = null

/**
 * Returns the imported closeout clip with unsafe imported
 * lower-body tracks stripped and a stable CourtIQ lower-body base
 * added back. Cached per source clip identity — when the loader
 * swaps the synthetic placeholder for a real-asset clip, the cache
 * invalidates automatically because the `source` reference changes.
 */
function _getReadableCloseoutClip(): THREE.AnimationClip {
  const source = _ensurePlaceholderImportedCloseoutClip()
  if (_cleanedCloseoutCache?.source === source) {
    return _cleanedCloseoutCache.cleaned
  }
  const cleaned = buildReadableCloseoutClip(source)
  _cleanedCloseoutCache = { source, cleaned }
  return cleaned
}

/** Test-only — reset the cleaned-closeout cache between cases. */
export function _resetReadableCloseoutClipCache(): void {
  _cleanedCloseoutCache = null
}

let _cleanedBackCutCache:
  | { source: THREE.AnimationClip; cleaned: THREE.AnimationClip }
  | null = null

function _getReadableBackCutClip(source: THREE.AnimationClip): THREE.AnimationClip {
  if (_cleanedBackCutCache?.source === source) {
    return _cleanedBackCutCache.cleaned
  }
  const cleaned = buildReadableBackCutClip(source)
  _cleanedBackCutCache = { source, cleaned }
  return cleaned
}

/** Test-only — reset the cleaned-back-cut cache between cases. */
export function _resetReadableBackCutClipCache(): void {
  _cleanedBackCutCache = null
}

/**
 * Phase P (P1.0) — kicks off the async fetch of a real
 * `/athlete/clips/closeout.glb` if one is on disk. Resolves to the
 * cached, stripped clip on success, or `null` if no real asset is
 * present (the synthetic placeholder remains in the cache in that
 * case). Browser-only; a no-op under JSDOM/Node.
 *
 * The build path attaches the closeout action using whatever clip
 * is in the cache at build time, so the synchronous builder never
 * blocks on this fetch — the next time a figure is built (e.g.
 * scene re-mount, replay restart) the real clip is used if the
 * fetch completed.
 */
function _kickOffImportedCloseoutClipLoad(): void {
  if (typeof window === 'undefined') return
  void loadImportedClip(GLB_IMPORTED_CLOSEOUT_CLIP_URL)
}

/**
 * P1.7 — public preload for the imported closeout clip. Returns the
 * cached + root-motion-stripped clip on success, or `null` if the
 * asset is missing / network blocked / running outside a browser.
 *
 * Used by `Scenario3DCanvas`'s cold-load handoff: when both the GLB
 * flag and the imported closeout flag are active, this kicks the
 * fetch in parallel with the mannequin GLB and triggers an `apply`
 * pass once both resolve, so the next scene rebuild builds figures
 * with the real closeout clip in cache (no first-frame placeholder
 * regression).
 *
 * Idempotent — repeat calls hit the existing cache. Never throws;
 * caller handles `null` by leaving the synthetic placeholder in
 * place.
 */
export function preloadImportedCloseoutClip(): Promise<unknown> {
  if (typeof window === 'undefined') return Promise.resolve(null)
  return loadImportedClip(GLB_IMPORTED_CLOSEOUT_CLIP_URL).catch(() => null)
}

/**
 * P2.2 — synchronous accessor for the imported back-cut clip cache.
 * Returns the cached + root-motion-stripped clip when warm, or
 * `null` when the asset has not been fetched yet (cold mount,
 * JSDOM, fetch failed). Production callers of the figure builder
 * pair this with `_kickOffImportedBackCutClipLoad` so subsequent
 * builds pick up the real clip once the network promise resolves.
 *
 * Unlike the closeout path (which has a synthetic placeholder
 * authored in code so the action is *always* attached when the
 * flag is on), the back-cut path leaves the action slot empty
 * when the cache is cold — the figure builder then aliases the
 * `back_cut` action to `cut_sprint` so the resolver's chosen
 * action name is always present and the flag-off fallback
 * (`cut_sprint`) remains the visible behaviour until the real
 * clip arrives.
 */
function _getCachedImportedBackCutClipOrNull(): THREE.AnimationClip | null {
  const cached = getCachedImportedClip(GLB_IMPORTED_BACK_CUT_CLIP_URL)
  return cached?.clip ?? null
}

/**
 * P2.2 — kicks off the async fetch of `/athlete/clips/back_cut.glb`
 * if it has not been requested yet. Idempotent. Browser-only;
 * a no-op under JSDOM/Node.
 */
function _kickOffImportedBackCutClipLoad(): void {
  if (typeof window === 'undefined') return
  void loadImportedClip(GLB_IMPORTED_BACK_CUT_CLIP_URL)
}

/**
 * P2.2 — public preload for the imported back-cut clip. Returns
 * the cached + root-motion-stripped clip on success, or `null`
 * if the asset is missing / network blocked / running outside a
 * browser. Used by the dev-preview client to warm the cache
 * before the canvas mounts so the very first figure build picks
 * up the real clip rather than falling back to `cut_sprint`.
 */
export function preloadImportedBackCutClip(): Promise<unknown> {
  if (typeof window === 'undefined') return Promise.resolve(null)
  return loadImportedClip(GLB_IMPORTED_BACK_CUT_CLIP_URL).catch(() => null)
}

/**
 * Test-only — exposes the synthetic placeholder closeout clip
 * (un-stripped) so tests can assert the strip behaviour against
 * the same authoring source the production builder uses.
 */
export function _buildPlaceholderImportedCloseoutClipForTest(): THREE.AnimationClip {
  return buildPlaceholderImportedCloseoutClip()
}

/** Test-only — reset the GLB clip cache between cases. */
export function _resetGlbAthleteClipCache(): void {
  _cachedGlbClips = null
}

/**
 * P0-LOCK — test-only accessor for the bespoke clips. Returns fresh
 * factory output (bypassing the cache) so determinism tests can run
 * two clip instances side-by-side and verify identical track data.
 */
export function _buildGlbAthleteClipsForTest(): {
  idle_ready: THREE.AnimationClip
  cut_sprint: THREE.AnimationClip
  defense_slide: THREE.AnimationClip
  defensive_deny: THREE.AnimationClip
  receive_ready: THREE.AnimationClip
  closeout_read: THREE.AnimationClip
} {
  return {
    idle_ready: buildGlbIdleReadyClip(),
    cut_sprint: buildGlbCutSprintClip(),
    defense_slide: buildGlbDefenseSlideClip(),
    defensive_deny: buildGlbDefensiveDenyClip(),
    // P2.6 — exposed for determinism and pose-shape tests.
    receive_ready: buildGlbReceiveReadyClip(),
    closeout_read: buildGlbCloseoutReadClip(),
  }
}

/**
 * P0-LOCK — foot-to-floor offset.
 *
 * Measures the rest-pose bounding box of the cloned mannequin in
 * figure-local space and translates the inner clone so its lowest
 * vertex sits at figure-local y = 0. The MotionController later
 * applies `PLAYER_LIFT` to the figure root, so the final world
 * y of the mesh feet matches the procedural athlete (≈ 0.05 ft).
 *
 * Constraints honored:
 *   - The figure root's translation is left to the scenario timeline.
 *     Only `cloned.position.y` is mutated.
 *   - Indicator layers (rings, halo, possession ring) stay parented
 *     to the figure root so they remain on the floor regardless of
 *     this offset — the rings are NOT moved up to hide the bug.
 *   - The procedural figure path is unaffected (this function is
 *     only invoked from `buildGlbAthletePreview`).
 *
 * The offset is computed once at build time, in bind pose. Clip
 * playback can deform the mesh per frame, but anything beyond a
 * static offset belongs to a later P1+ packet (clip authoring vs.
 * bind pose composition is out of scope for P0-LOCK).
 */
function _alignGlbFeetToFigureFloor(
  figure: THREE.Group,
  cloned: THREE.Object3D,
): void {
  // figure has GLB_M_TO_FT_SCALE applied; we need bbox values in
  // figure-local (i.e. WORLD when figure is at origin) so the offset
  // we write into `cloned.position.y` is in cloned-local units. The
  // figure root has not yet been added to the scene graph at this
  // point so its world matrix == its local matrix; updateMatrixWorld
  // refreshes the children's world matrices off that.
  figure.updateMatrixWorld(true)
  const bbox = new THREE.Box3()
  // `precise = true` walks the SkinnedMesh's vertices applying the
  // current skin transform — this returns the actual rest-pose
  // bounds rather than the bind-pose bounds, which differ on rigs
  // where the bone rest pose is not a T-pose (the Quaternius UAL2
  // mannequin is exactly that case).
  bbox.setFromObject(cloned, true)
  if (!Number.isFinite(bbox.min.y)) return
  // No-op if the clone is already grounded (within a hair); avoids
  // floating-point drift each rebuild.
  if (Math.abs(bbox.min.y) < 1e-3) return
  // `bbox.min.y` is measured in WORLD coordinates (figure has not
  // yet been added to the scene graph and its position is at the
  // origin, so figure-world == figure-local-after-scale here). The
  // clone's `position` is in figure-LOCAL coordinates (before the
  // figure's scale propagates to children), so we divide by
  // `figure.scale.y` to convert. Without the divide we overshoot by
  // the figure's metres→feet factor and the feet plant 5–6 ft below
  // the floor.
  const figureScaleY = figure.scale.y || 1
  cloned.position.y -= bbox.min.y / figureScaleY
  figure.updateMatrixWorld(true)
}

function findGlbRootBone(root: THREE.Object3D): THREE.Bone | null {
  let found: THREE.Bone | null = null
  root.traverse((child) => {
    if (found) return
    if ((child as THREE.Bone).isBone && child.name === GLB_BONE_MAP.hips) {
      found = child as THREE.Bone
    }
  })
  return found
}

function findFirstSkinnedMesh(root: THREE.Object3D): THREE.SkinnedMesh | null {
  let found: THREE.SkinnedMesh | null = null
  root.traverse((child) => {
    if (found) return
    if ((child as THREE.SkinnedMesh).isSkinnedMesh) {
      found = child as THREE.SkinnedMesh
    }
  })
  return found
}

/**
 * P1.8 — multi-region athlete tinting.
 *
 * The Quaternius mannequin ships as a single skinned mesh (M_Main)
 * plus a thin "joints" overlay (M_Joints). Painting both meshes the
 * same team colour reads as a flat plastic doll at film-room
 * distance. P1.8 splits the athlete into five readable regions so
 * the silhouette communicates "basketball player in jersey" rather
 * than "tinted mannequin":
 *
 *   - jersey/torso/sleeve top  → team colour
 *   - shorts                   → dark neutral
 *   - skin (calves, forearms,
 *     hands, neck, lower face) → athletic skin tone
 *   - shoes                    → near-black
 *   - hair (top of head)       → dark neutral
 *
 * The regions are chosen per-vertex by walking the SkinnedMesh's
 * skin weights: each vertex's primary-bone name (and, for sleeves,
 * its secondary-bone influence) maps to one of the five regions. A
 * single MeshStandardMaterial with `vertexColors: true` then renders
 * all five regions in one draw call without textures, custom shaders,
 * or per-frame work — staying inside the P1.8 hard scope (no PBR,
 * no per-frame material churn).
 *
 * Performance: the per-figure cost is one geometry clone (so the
 * `color` attribute is per-figure rather than per-asset, which lets
 * each team's jersey colour be baked in) plus one O(N) sweep over
 * vertices to compute regions. The cloned geometry is disposed by
 * the existing `disposeGroup` traversal when the figure is torn down.
 */
const GLB_REGION_COLOR = {
  shorts: '#3a3d44',
  skin: '#caa68a',
  shoes: '#16181c',
  hair: '#1a1c20',
} as const

type GlbRegion = 'jersey' | 'shorts' | 'skin' | 'shoes' | 'hair'

/**
 * Maps a vertex to a body region based on its primary skinning bone
 * (and, for sleeves, its secondary). Heuristics are tuned for the
 * Quaternius UAL2 / Unreal-style rig CourtIQ ships — bone-name
 * prefixes follow the `lowercase_side` convention with the lone
 * exception of `Head`.
 *
 * `primaryName` and `secondaryName` come from
 * `SkinnedMesh.skeleton.bones[i].name`. Empty string is acceptable
 * (returns 'skin' as the safest default).
 */
function regionForBoneNames(
  primaryName: string,
  secondaryName: string,
  posY: number,
): GlbRegion {
  if (primaryName === 'pelvis' || primaryName.startsWith('thigh_')) return 'shorts'
  if (primaryName.startsWith('calf_')) return 'skin'
  if (primaryName.startsWith('foot_') || primaryName.startsWith('ball_')) return 'shoes'
  if (primaryName.startsWith('spine_') || primaryName.startsWith('clavicle_')) {
    return 'jersey'
  }
  if (primaryName === 'neck_01') return 'skin'
  if (primaryName === 'Head') {
    // Top of skull reads as hair, lower as skin/face. The mannequin
    // stands ≈ 1.81 m, with head bone origin at ≈ 1.65 m; vertices
    // above ~1.78 m sit on the cranium.
    return posY > 1.78 ? 'hair' : 'skin'
  }
  if (primaryName.startsWith('upperarm_')) {
    // Sleeve covers the proximal half of the upperarm. We
    // disambiguate via the secondary skinning bone: a vertex on the
    // upperarm whose secondary influence pulls from clavicle/spine
    // sits high (sleeve), while one pulled by the lowerarm sits at
    // the elbow seam (skin).
    if (
      secondaryName.startsWith('clavicle_') ||
      secondaryName.startsWith('spine_')
    ) {
      return 'jersey'
    }
    return 'skin'
  }
  if (
    primaryName.startsWith('lowerarm_') ||
    primaryName.startsWith('hand_') ||
    primaryName.startsWith('index_') ||
    primaryName.startsWith('middle_') ||
    primaryName.startsWith('pinky_') ||
    primaryName.startsWith('ring_') ||
    primaryName.startsWith('thumb_')
  ) {
    return 'skin'
  }
  return 'skin'
}

/** Test-only — exposes the region rule for unit coverage. */
export function _regionForBoneNamesForTest(
  primaryName: string,
  secondaryName: string,
  posY: number,
): GlbRegion {
  return regionForBoneNames(primaryName, secondaryName, posY)
}

function applyMultiRegionMaterialsToCloned(
  cloned: THREE.Object3D,
  teamColor: string,
): void {
  const teamCol = new THREE.Color(teamColor)
  const shortsCol = new THREE.Color(GLB_REGION_COLOR.shorts)
  const skinCol = new THREE.Color(GLB_REGION_COLOR.skin)
  const shoeCol = new THREE.Color(GLB_REGION_COLOR.shoes)
  const hairCol = new THREE.Color(GLB_REGION_COLOR.hair)

  const colorForRegion = (region: GlbRegion): THREE.Color => {
    switch (region) {
      case 'jersey':
        return teamCol
      case 'shorts':
        return shortsCol
      case 'skin':
        return skinCol
      case 'shoes':
        return shoeCol
      case 'hair':
        return hairCol
    }
  }

  cloned.traverse((child) => {
    const sm = child as THREE.SkinnedMesh
    const mesh = child as THREE.Mesh
    if (!sm.isSkinnedMesh && !mesh.isMesh) return
    const baseMat = (sm.material ?? mesh.material) as
      | THREE.Material
      | THREE.Material[]
      | undefined
    if (!baseMat) return

    // Joints overlay (M_Joints in the source asset) is a thin set of
    // sphere knobs at every joint. Painted in the team colour they
    // read like fantasy armour studs; tint them skin-neutral so they
    // disappear into the silhouette.
    const matName = Array.isArray(baseMat)
      ? baseMat[0]?.name ?? ''
      : baseMat.name ?? ''
    const isJointsOverlay = matName.toLowerCase().includes('joint')

    const disposeOld = (m: THREE.Material | THREE.Material[]): void => {
      if (Array.isArray(m)) m.forEach((x) => x.dispose())
      else m.dispose()
    }

    if (isJointsOverlay) {
      const swap = new THREE.MeshStandardMaterial({
        color: skinCol.clone(),
        roughness: 0.7,
        metalness: 0.0,
      })
      disposeOld(baseMat)
      ;(sm.isSkinnedMesh ? sm : mesh).material = swap
      return
    }

    if (!sm.isSkinnedMesh || !sm.skeleton) {
      // Plain mesh — fall back to a flat team-colour material.
      const swap = new THREE.MeshStandardMaterial({
        color: teamCol.clone(),
        roughness: 0.55,
        metalness: 0.05,
      })
      disposeOld(baseMat)
      mesh.material = swap
      return
    }

    const geom = sm.geometry
    const skinIdxAttr = geom.getAttribute('skinIndex') as
      | THREE.BufferAttribute
      | undefined
    const skinWeightAttr = geom.getAttribute('skinWeight') as
      | THREE.BufferAttribute
      | undefined
    const posAttr = geom.getAttribute('position') as
      | THREE.BufferAttribute
      | undefined
    if (!skinIdxAttr || !skinWeightAttr || !posAttr) {
      const swap = new THREE.MeshStandardMaterial({
        color: teamCol.clone(),
        roughness: 0.55,
        metalness: 0.05,
      })
      disposeOld(baseMat)
      sm.material = swap
      return
    }

    const boneNames = sm.skeleton.bones.map((b) => b.name)
    const N = posAttr.count
    const colorArray = new Float32Array(N * 3)
    for (let i = 0; i < N; i++) {
      // Find primary (highest weight) and secondary bone for this vertex.
      const w0 = skinWeightAttr.getX(i)
      const w1 = skinWeightAttr.getY(i)
      const w2 = skinWeightAttr.getZ(i)
      const w3 = skinWeightAttr.getW(i)
      const i0 = skinIdxAttr.getX(i)
      const i1 = skinIdxAttr.getY(i)
      const i2 = skinIdxAttr.getZ(i)
      const i3 = skinIdxAttr.getW(i)
      let primaryW = -1
      let primaryIdx = -1
      let secondaryW = -1
      let secondaryIdx = -1
      const ws = [w0, w1, w2, w3]
      const is = [i0, i1, i2, i3]
      for (let k = 0; k < 4; k++) {
        if (ws[k] > primaryW) {
          secondaryW = primaryW
          secondaryIdx = primaryIdx
          primaryW = ws[k]
          primaryIdx = is[k]
        } else if (ws[k] > secondaryW) {
          secondaryW = ws[k]
          secondaryIdx = is[k]
        }
      }
      const primaryName = boneNames[primaryIdx] ?? ''
      const secondaryName = boneNames[secondaryIdx] ?? ''
      const py = posAttr.getY(i)
      const region = regionForBoneNames(primaryName, secondaryName, py)
      const c = colorForRegion(region)
      colorArray[i * 3] = c.r
      colorArray[i * 3 + 1] = c.g
      colorArray[i * 3 + 2] = c.b
    }

    // Clone geometry per-figure so each athlete carries its own
    // colour buffer. The skinIndex/skinWeight clones still reference
    // the same skeleton bone indices, which is correct — the cloned
    // mesh continues to bind to the per-figure skeleton built by
    // SkeletonUtils.clone.
    const clonedGeom = geom.clone()
    clonedGeom.setAttribute(
      'color',
      new THREE.Float32BufferAttribute(colorArray, 3),
    )
    sm.geometry = clonedGeom

    const swap = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: 0.6,
      metalness: 0.05,
    })
    disposeOld(baseMat)
    sm.material = swap
  })
}

const GLB_FLOOR_LIFT = 0.05
const GLB_BASE_RING_RADIUS_FT = 0.95
const GLB_USER_HALO_RADIUS_FT = 1.45
const GLB_POSSESSION_RING_RADIUS_FT = 1.1

function buildGlbIndicatorLayers(
  parent: THREE.Group,
  teamColor: string,
  isUser: boolean,
  hasBall: boolean,
): GlbIndicatorLayers {
  // The figure root is uniformly scaled by GLB_M_TO_FT_SCALE so the
  // mannequin lands at court height. Indicator layers live OUTSIDE
  // that scale (they're parented to the same root, but their
  // geometry is authored at the same scale, so the layer Group
  // counter-scales to keep court-unit-sized rings on the floor).
  const inverseScale = 1 / GLB_M_TO_FT_SCALE

  const baseLayer = new THREE.Group()
  baseLayer.name = 'indicator-layer-base'
  baseLayer.scale.setScalar(inverseScale)
  parent.add(baseLayer)

  const userLayer = new THREE.Group()
  userLayer.name = 'indicator-layer-user'
  userLayer.scale.setScalar(inverseScale)
  userLayer.visible = isUser
  parent.add(userLayer)

  const userHeadLayer = new THREE.Group()
  userHeadLayer.name = 'indicator-layer-user-head'
  userHeadLayer.scale.setScalar(inverseScale)
  userHeadLayer.visible = isUser
  parent.add(userHeadLayer)

  const possessionLayer = new THREE.Group()
  possessionLayer.name = 'indicator-layer-possession'
  possessionLayer.scale.setScalar(inverseScale)
  possessionLayer.visible = hasBall
  parent.add(possessionLayer)

  const baseRing = new THREE.Mesh(
    new THREE.RingGeometry(
      GLB_BASE_RING_RADIUS_FT - 0.06,
      GLB_BASE_RING_RADIUS_FT,
      32,
    ),
    new THREE.MeshBasicMaterial({
      color: teamColor,
      toneMapped: false,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.55,
    }),
  )
  baseRing.rotation.x = -Math.PI / 2
  baseRing.position.y = GLB_FLOOR_LIFT
  baseLayer.add(baseRing)

  if (isUser) {
    const halo = new THREE.Mesh(
      new THREE.RingGeometry(
        GLB_USER_HALO_RADIUS_FT - 0.07,
        GLB_USER_HALO_RADIUS_FT,
        32,
      ),
      new THREE.MeshBasicMaterial({
        color: teamColor,
        toneMapped: false,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.7,
      }),
    )
    halo.rotation.x = -Math.PI / 2
    halo.position.y = GLB_FLOOR_LIFT
    userLayer.add(halo)
  }

  if (hasBall) {
    const possessionRing = new THREE.Mesh(
      new THREE.RingGeometry(
        GLB_POSSESSION_RING_RADIUS_FT - 0.07,
        GLB_POSSESSION_RING_RADIUS_FT,
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
    possessionRing.position.y = GLB_FLOOR_LIFT
    possessionLayer.add(possessionRing)
  }

  return {
    base: baseLayer,
    user: userLayer,
    userHead: userHeadLayer,
    possession: possessionLayer,
  }
}

/**
 * Phase O-ANIM (OB6) — animation control helpers. Mirror the
 * skinned-athlete API so the motion controller can drive both paths
 * with the same logic.
 */
export type GlbAthleteAnimationName =
  | 'idle_ready'
  | 'cut_sprint'
  | 'defense_slide'
  | 'defensive_deny'
  | 'closeout'
  | 'back_cut'
  // P2.6 — shared readability primitives.
  | 'receive_ready'
  | 'closeout_read'

/**
 * Phase P (P1.0) — public-folder URL of the imported `closeout`
 * clip GLB. The file is intentionally NOT bundled in this packet —
 * see `apps/web/public/athlete/clips/README.md` for what to put
 * here when a real permissive asset lands. Until then, the GLB
 * athlete system uses the synthetic placeholder closeout clip
 * authored in `buildPlaceholderImportedCloseoutClip` so the entire
 * import path (loader cache, root-motion strip, mixer wiring,
 * determinism gate) is exercisable end-to-end.
 */
export const GLB_IMPORTED_CLOSEOUT_CLIP_URL = '/athlete/clips/closeout.glb'

/**
 * Phase P (P2.2) — public-folder URL of the imported `back_cut`
 * clip GLB. Bundled in this packet (~57 KB, NinjaJump_Start
 * extracted from Quaternius UAL2 under CC0 — see
 * `apps/web/public/athlete/ATTRIBUTION.md`). Fetched via the same
 * loader as the closeout asset so root motion is stripped at the
 * loader layer before any track reaches the mixer.
 */
export const GLB_IMPORTED_BACK_CUT_CLIP_URL = '/athlete/clips/back_cut.glb'

interface GlbAthleteHandle {
  figure: THREE.Group
  cloned: THREE.Object3D
  mixer: THREE.AnimationMixer
  actions: Record<string, THREE.AnimationAction>
  rootBone: THREE.Bone | null
  /**
   * P0-LOCK — one-shot dev-only mixer-tick assertion state. Tracks
   * how many ticks have run, the first observed bone quaternion of
   * a mapped probe bone, and whether the assertion has fired so we
   * never log more than once per figure.
   */
  _mixerAssertion?: {
    ticks: number
    asserted: boolean
    probeBoneName: string | null
    initialQuat: THREE.Quaternion | null
  }
}

export function getGlbAthleteHandle(
  figure: THREE.Object3D,
): GlbAthleteHandle | null {
  const userData = figure.userData as Record<string, unknown> | undefined
  if (!userData) return null
  const handle = userData[GLB_ATHLETE_USER_DATA_KEY]
  if (!handle || typeof handle !== 'object') return null
  const h = handle as Partial<GlbAthleteHandle>
  if (!h.mixer || !h.actions) return null
  return handle as GlbAthleteHandle
}

/** Tick the GLB figure's mixer with a deterministic dt (seconds). */
export function updateGlbAthletePose(
  figure: THREE.Object3D,
  dt: number,
): void {
  const handle = getGlbAthleteHandle(figure)
  if (!handle) return
  handle.mixer.update(dt)
  _assertMixerAdvanceOnce(handle)
}

/**
 * P0-LOCK — one-shot dev-only mixer-tick assertion.
 *
 * After the third call into `updateGlbAthletePose` (so the mixer
 * has had a chance to integrate dt and write keyframes onto a
 * mapped bone), check:
 *
 *   1. mixer exists and `mixer.time > 0`
 *   2. at least one clipAction is registered and running
 *   3. the mapped probe bone exists in the cloned skeleton
 *   4. the probe bone's quaternion has drifted from its initial
 *      bind-pose snapshot by more than a tiny epsilon
 *
 * If any check fails the assertion logs a single dev warning so
 * the failure is visible during /dev/scene-preview QA without
 * spamming production logs (production short-circuits via the
 * NODE_ENV guard). The asserted flag latches forever after the
 * first run.
 */
function _assertMixerAdvanceOnce(handle: GlbAthleteHandle): void {
  const probe = handle._mixerAssertion
  if (!probe || probe.asserted) return
  probe.ticks += 1
  if (probe.ticks < 3) return
  probe.asserted = true
  if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'production') {
    return
  }
  if (typeof console === 'undefined') return

  const failures: string[] = []

  if (!handle.mixer) {
    failures.push('mixer is missing')
  } else if (!(handle.mixer.time > 0)) {
    failures.push(`mixer.time did not advance (time=${handle.mixer.time})`)
  }

  const runningActions = Object.entries(handle.actions).filter(
    ([, a]) => a.isRunning(),
  )
  if (runningActions.length === 0) {
    failures.push('no AnimationAction is running on the mixer')
  }

  let probeBone: THREE.Bone | null = null
  if (probe.probeBoneName) {
    handle.cloned.traverse((child) => {
      if (probeBone) return
      if ((child as THREE.Bone).isBone && child.name === probe.probeBoneName) {
        probeBone = child as THREE.Bone
      }
    })
  }
  if (!probeBone) {
    failures.push(`probe bone '${probe.probeBoneName}' not found`)
  } else if (probe.initialQuat) {
    const current = (probeBone as THREE.Bone).quaternion
    const init = probe.initialQuat
    const dx = current.x - init.x
    const dy = current.y - init.y
    const dz = current.z - init.z
    const dw = current.w - init.w
    const delta = Math.sqrt(dx * dx + dy * dy + dz * dz + dw * dw)
    if (!(delta > 1e-4)) {
      failures.push(
        `probe bone '${probe.probeBoneName}' did not move (quat delta=${delta.toExponential(2)})`,
      )
    }
  }

  if (failures.length > 0) {
    // eslint-disable-next-line no-console
    console.warn('[glbAthlete] mixer-tick assertion failed', {
      failures,
      mixerTime: handle.mixer?.time,
      runningActions: runningActions.map(([n]) => n),
      probeBoneName: probe.probeBoneName,
    })
  } else {
    // eslint-disable-next-line no-console
    console.info('[glbAthlete] mixer-tick assertion ok', {
      mixerTime: handle.mixer.time,
      runningActions: runningActions.map(([n]) => n),
      probeBoneName: probe.probeBoneName,
    })
  }
}

/** Switch the active clip with a small cross-fade. No-op for non-GLB
 *  figures and when the requested clip is already at full weight. */
export function setGlbAthleteAnimation(
  figure: THREE.Object3D,
  name: GlbAthleteAnimationName,
  options?: { fadeSeconds?: number },
): void {
  const handle = getGlbAthleteHandle(figure)
  if (!handle) return
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

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
 * `_l` / `_r` side suffixes). The Phase M `spine` bone maps to
 * `spine_02` (mid-torso) so chest sway concentrates near the centre
 * of mass rather than at the lumbar root.
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

  // Slow chest sway (~2 deg amplitude on spine_02).
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.spine}.quaternion`,
      t,
      flattenGlbQuats([
        glbEulerQuat(0.035, 0, 0),
        glbEulerQuat(-0.035, 0, 0),
        glbEulerQuat(0.035, 0, 0),
      ]),
    ),
  )
  // Knees softened (slight thigh forward).
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.leftThigh}.quaternion`,
      [0, duration],
      flattenGlbQuats([glbEulerQuat(-0.06, 0, 0), glbEulerQuat(-0.06, 0, 0)]),
    ),
  )
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.rightThigh}.quaternion`,
      [0, duration],
      flattenGlbQuats([glbEulerQuat(-0.06, 0, 0), glbEulerQuat(-0.06, 0, 0)]),
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
        glbEulerQuat(0, -0.1, 0),
        glbEulerQuat(0, 0.1, 0),
        glbEulerQuat(0, -0.1, 0),
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
        glbEulerQuat(0, 0, 0.7),
        glbEulerQuat(0, 0, -0.5),
        glbEulerQuat(0, 0, 0.7),
      ]),
    ),
  )
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.rightUpperArm}.quaternion`,
      t,
      flattenGlbQuats([
        glbEulerQuat(0, 0, -0.5),
        glbEulerQuat(0, 0, 0.7),
        glbEulerQuat(0, 0, -0.5),
      ]),
    ),
  )
  // Forearm bend at the elbow.
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.leftForeArm}.quaternion`,
      t,
      flattenGlbQuats([
        glbEulerQuat(0, -0.9, 0),
        glbEulerQuat(0, -0.4, 0),
        glbEulerQuat(0, -0.9, 0),
      ]),
    ),
  )
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.rightForeArm}.quaternion`,
      t,
      flattenGlbQuats([
        glbEulerQuat(0, -0.4, 0),
        glbEulerQuat(0, -0.9, 0),
        glbEulerQuat(0, -0.4, 0),
      ]),
    ),
  )
  // Legs in opposition — thigh pitch around X.
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.leftThigh}.quaternion`,
      t,
      flattenGlbQuats([
        glbEulerQuat(0.55, 0, 0),
        glbEulerQuat(-0.4, 0, 0),
        glbEulerQuat(0.55, 0, 0),
      ]),
    ),
  )
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.rightThigh}.quaternion`,
      t,
      flattenGlbQuats([
        glbEulerQuat(-0.4, 0, 0),
        glbEulerQuat(0.55, 0, 0),
        glbEulerQuat(-0.4, 0, 0),
      ]),
    ),
  )
  // Calves bend back during stride.
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.leftShin}.quaternion`,
      t,
      flattenGlbQuats([
        glbEulerQuat(-0.5, 0, 0),
        glbEulerQuat(-1.0, 0, 0),
        glbEulerQuat(-0.5, 0, 0),
      ]),
    ),
  )
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.rightShin}.quaternion`,
      t,
      flattenGlbQuats([
        glbEulerQuat(-1.0, 0, 0),
        glbEulerQuat(-0.5, 0, 0),
        glbEulerQuat(-1.0, 0, 0),
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
        glbEulerQuat(0, 0, 0.05),
        glbEulerQuat(0, 0, -0.05),
        glbEulerQuat(0, 0, 0.05),
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
  // Arms held up and out (active hands).
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.leftUpperArm}.quaternion`,
      [0, duration],
      flattenGlbQuats([glbEulerQuat(0, 0, 1.0), glbEulerQuat(0, 0, 1.0)]),
    ),
  )
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.rightUpperArm}.quaternion`,
      [0, duration],
      flattenGlbQuats([glbEulerQuat(0, 0, -1.0), glbEulerQuat(0, 0, -1.0)]),
    ),
  )
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.leftForeArm}.quaternion`,
      [0, duration],
      flattenGlbQuats([glbEulerQuat(0, -0.9, 0), glbEulerQuat(0, -0.9, 0)]),
    ),
  )
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.rightForeArm}.quaternion`,
      [0, duration],
      flattenGlbQuats([glbEulerQuat(0, -0.9, 0), glbEulerQuat(0, -0.9, 0)]),
    ),
  )
  // Wide thigh splay + slight rock.
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.leftThigh}.quaternion`,
      t,
      flattenGlbQuats([
        glbEulerQuat(-0.5, 0, 0.2),
        glbEulerQuat(-0.6, 0, 0.2),
        glbEulerQuat(-0.5, 0, 0.2),
      ]),
    ),
  )
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.rightThigh}.quaternion`,
      t,
      flattenGlbQuats([
        glbEulerQuat(-0.6, 0, -0.2),
        glbEulerQuat(-0.5, 0, -0.2),
        glbEulerQuat(-0.6, 0, -0.2),
      ]),
    ),
  )
  // Knees bent.
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.leftShin}.quaternion`,
      [0, duration],
      flattenGlbQuats([glbEulerQuat(0.32, 0, 0), glbEulerQuat(0.32, 0, 0)]),
    ),
  )
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.rightShin}.quaternion`,
      [0, duration],
      flattenGlbQuats([glbEulerQuat(0.32, 0, 0), glbEulerQuat(0.32, 0, 0)]),
    ),
  )

  return new THREE.AnimationClip('defense_slide', duration, tracks)
}

const _glbScratchEuler = new THREE.Euler()

function glbEulerQuat(x: number, y: number, z: number): THREE.Quaternion {
  _glbScratchEuler.set(x, y, z, 'XYZ')
  return new THREE.Quaternion().setFromEuler(_glbScratchEuler)
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
export function buildGlbAthletePreview(
  teamColor: string,
  _trimColor: string,
  isUser: boolean,
  hasBall: boolean,
  _jerseyNumber: string,
  _stance: PlayerStance,
): THREE.Group | null {
  try {
    if (!cache) {
      if (typeof window !== 'undefined') void loadGlbAthleteAsset()
      return null
    }

    const figure = new THREE.Group()
    figure.name = 'glb-player-figure'
    figure.scale.setScalar(GLB_M_TO_FT_SCALE)

    const cloned = cloneSkinned(cache.gltf.scene)
    cloned.name = 'glb-mannequin-clone'
    figure.add(cloned)

    applyTeamColorToCloned(cloned, teamColor)

    const indicatorLayers = buildGlbIndicatorLayers(figure, teamColor, isUser, hasBall)
    ;(figure.userData as Record<string, unknown>).indicatorLayers = indicatorLayers

    const mixer = new THREE.AnimationMixer(cloned)
    const clips = getCachedGlbClips()
    const actions: Record<string, THREE.AnimationAction> = {}
    for (const clip of clips) {
      actions[clip.name] = mixer.clipAction(clip)
    }
    actions['idle_ready']?.play()

    const rootBone = findGlbRootBone(cloned)

    ;(figure.userData as Record<string, unknown>)[GLB_ATHLETE_USER_DATA_KEY] = {
      figure,
      cloned,
      mixer,
      actions,
      rootBone,
    }

    return figure
  } catch {
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
  ]
  return _cachedGlbClips
}

/** Test-only — reset the GLB clip cache between cases. */
export function _resetGlbAthleteClipCache(): void {
  _cachedGlbClips = null
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

function applyTeamColorToCloned(cloned: THREE.Object3D, teamColor: string): void {
  const colorObj = new THREE.Color(teamColor)
  cloned.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (!mesh.isMesh && !(child as THREE.SkinnedMesh).isSkinnedMesh) return
    const baseMat = mesh.material
    if (!baseMat) return
    const replaceMat = (m: THREE.Material): THREE.Material => {
      const swap = new THREE.MeshStandardMaterial({
        color: colorObj.clone(),
        roughness: 0.55,
        metalness: 0.05,
      })
      m.dispose()
      return swap
    }
    if (Array.isArray(baseMat)) {
      mesh.material = baseMat.map((m) => replaceMat(m))
    } else {
      mesh.material = replaceMat(baseMat)
    }
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

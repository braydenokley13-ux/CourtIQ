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

    applyTeamColorToCloned(cloned, teamColor)

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
      const closeoutClip = _ensurePlaceholderImportedCloseoutClip()
      actions['closeout'] = mixer.clipAction(closeoutClip)
      _kickOffImportedCloseoutClipLoad()
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
        glbEulerQuat(0, 0, 0.04),
        glbEulerQuat(0, 0, -0.04),
        glbEulerQuat(0, 0, 0.02),
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
      flattenGlbQuats([glbEulerQuat(0, 0, 1.4), glbEulerQuat(0, 0, 1.4)]),
    ),
  )
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.rightUpperArm}.quaternion`,
      [0, duration],
      flattenGlbQuats([glbEulerQuat(0, 0, -1.4), glbEulerQuat(0, 0, -1.4)]),
    ),
  )
  // Forearms slightly bent.
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.leftForeArm}.quaternion`,
      [0, duration],
      flattenGlbQuats([glbEulerQuat(0, -0.6, 0), glbEulerQuat(0, -0.6, 0)]),
    ),
  )
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.rightForeArm}.quaternion`,
      [0, duration],
      flattenGlbQuats([glbEulerQuat(0, -0.6, 0), glbEulerQuat(0, -0.6, 0)]),
    ),
  )
  // Wide stance — thighs splay outward, knees bent.
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.leftThigh}.quaternion`,
      [0, duration],
      flattenGlbQuats([glbEulerQuat(-0.45, 0, 0.18), glbEulerQuat(-0.45, 0, 0.18)]),
    ),
  )
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.rightThigh}.quaternion`,
      [0, duration],
      flattenGlbQuats([glbEulerQuat(-0.45, 0, -0.18), glbEulerQuat(-0.45, 0, -0.18)]),
    ),
  )
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.leftShin}.quaternion`,
      [0, duration],
      flattenGlbQuats([glbEulerQuat(0.42, 0, 0), glbEulerQuat(0.42, 0, 0)]),
    ),
  )
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      `${GLB_BONE_MAP.rightShin}.quaternion`,
      [0, duration],
      flattenGlbQuats([glbEulerQuat(0.42, 0, 0), glbEulerQuat(0.42, 0, 0)]),
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
} {
  return {
    idle_ready: buildGlbIdleReadyClip(),
    cut_sprint: buildGlbCutSprintClip(),
    defense_slide: buildGlbDefenseSlideClip(),
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

/**
 * Phase O-ANIM (OB6) — animation control helpers. Mirror the
 * skinned-athlete API so the motion controller can drive both paths
 * with the same logic.
 */
export type GlbAthleteAnimationName =
  | 'idle_ready'
  | 'cut_sprint'
  | 'defense_slide'
  | 'closeout'

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

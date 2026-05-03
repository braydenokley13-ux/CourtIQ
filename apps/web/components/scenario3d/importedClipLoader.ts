/**
 * P1.0 — Imported animation clip loader for the GLB athlete path.
 *
 * Phase P §4 ("How imported animation clips should be used safely")
 * declares two non-negotiable rules for any imported clip CourtIQ
 * loads:
 *
 *   1. **Bones only.** The clip may drive bone-local TRS only. It may
 *      not write to the figure root or any ancestor of the skeleton.
 *   2. **Root motion stripped or locked.** Translation channels on
 *      the root/hip bone must be zeroed. The strip MUST happen at
 *      the loader layer so per-callsite code cannot accidentally
 *      bypass it.
 *
 * This module owns rule #2. Every imported clip flowing into the GLB
 * athlete system goes through `stripRootMotionTracks` before it ever
 * reaches an `AnimationMixer`. The mixer never sees the un-stripped
 * clip; the production callsite in `glbAthlete.ts` calls the helpers
 * here, not the raw `gltf.animations[i]`.
 *
 * Design notes:
 *
 *   - The strip helper is a **pure function**. Given a clip and a
 *     list of root bone names, it returns a new `THREE.AnimationClip`
 *     with the offending tracks removed. Inputs are not mutated, so
 *     the cached parse result of a `.glb` file remains intact and
 *     can be re-stripped (e.g. with a different root-bone list) for
 *     future intents without re-fetching the asset.
 *   - "Translation channel" covers both `<bone>.position` (the standard
 *     glTF emission for root motion) and the rarer `<root>.position`
 *     emitted by some Blender exporters when the root object itself
 *     carries the translation. Both are handled by name-prefix match.
 *   - Rotation and scale tracks on the same bones are left untouched
 *     — those are pose, not route.
 *   - Default root bone names default to the Quaternius UAL2 rig
 *     (`root`, `pelvis`) plus a pair of common Mixamo aliases
 *     (`Hips`, `mixamorig:Hips`) so callers do not need to remember
 *     which rig a given clip was authored for.
 *   - The loader is test-friendly: the cache injector
 *     `_setImportedClipCacheForTest` lets Vitest inject a synthetic
 *     clip without going through `GLTFLoader`.
 */

import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

/**
 * Default list of bone / root-object names whose `.position` tracks
 * are stripped. Covers the Quaternius UAL2 rig that ships with this
 * project plus the most common imported-rig aliases so a caller does
 * not need to know which authoring tool produced the clip.
 *
 * Adding a new alias here is the right way to support a new rig — do
 * NOT mutate the imported clip file or hand-edit per-callsite code.
 */
export const DEFAULT_ROOT_MOTION_BONE_NAMES: ReadonlyArray<string> = [
  // Quaternius UAL2 — the rig CourtIQ ships today.
  'root',
  'pelvis',
  // Mixamo defaults — most common third-party clip source.
  'Hips',
  'mixamorig:Hips',
  'mixamorigHips',
  // Generic — Unity/Unreal export naming.
  'Root',
  'RootNode',
  'Armature',
]

/**
 * Returns true if `track.name` targets a `.position` channel on one
 * of the named bones / root objects. Used to filter out root motion
 * before a clip is exposed to the mixer.
 *
 * Track names follow Three.js's `PropertyBinding` syntax:
 *   "<objectName>.<property>[.<sub-property>]"
 *
 * Examples this function returns true for:
 *   "pelvis.position"
 *   "root.position"
 *   "Hips.position.x"             (rare — sub-property selector)
 *   "mixamorig:Hips.position"
 */
export function isRootMotionTrack(
  track: THREE.KeyframeTrack,
  rootBoneNames: ReadonlyArray<string> = DEFAULT_ROOT_MOTION_BONE_NAMES,
): boolean {
  const name = track.name
  // Track names always contain a dot between the object selector and
  // the property selector. If there is no dot, the track is malformed
  // and we leave it alone (the mixer will silently ignore it later).
  const dot = name.indexOf('.')
  if (dot < 0) return false
  const objectName = name.slice(0, dot)
  const property = name.slice(dot + 1)
  // We only strip translation. Rotation / scale on the same bone are
  // pose, not route, and must be preserved.
  if (!property.startsWith('position')) return false
  for (const root of rootBoneNames) {
    if (objectName === root) return true
  }
  return false
}

/**
 * Returns a NEW `THREE.AnimationClip` with every root-motion
 * translation track removed. The input clip is not mutated.
 *
 * This is the single chokepoint Phase P §4 promises: any code path
 * that builds an `AnimationMixer` action from an imported clip must
 * pass the clip through this function first. The callsite in
 * `glbAthlete.ts` does exactly that; tests in
 * `importedClipLoader.test.ts` lock the contract.
 *
 * Why "remove" instead of "zero"?
 *
 *   - Removing the track guarantees the mixer never blends a
 *     non-zero `.position` write onto the root bone, even if a
 *     future track added by a clip update sneaks in non-zero values
 *     at a non-keyframe time. A zeroed-but-present track would
 *     still be evaluated and would still write the bone's position
 *     to (0, 0, 0) every frame — that overwrites the bind-pose
 *     translation the rig depends on. Removing the track leaves the
 *     bone at its bind-pose translation, which is what we want.
 *   - Removing the track also avoids paying the per-frame
 *     interpolation cost for a track that produces a constant
 *     value.
 *
 * The returned clip carries the same `name` and `duration` as the
 * input; only the track list is filtered.
 */
export function stripRootMotionTracks(
  clip: THREE.AnimationClip,
  rootBoneNames: ReadonlyArray<string> = DEFAULT_ROOT_MOTION_BONE_NAMES,
): THREE.AnimationClip {
  const kept: THREE.KeyframeTrack[] = []
  for (const track of clip.tracks) {
    if (isRootMotionTrack(track, rootBoneNames)) continue
    kept.push(track)
  }
  return new THREE.AnimationClip(clip.name, clip.duration, kept)
}

/**
 * Lists every track name removed by `stripRootMotionTracks` for the
 * given clip + root bone list. Provided for test assertions and
 * dev-only logging — production code should not need to inspect
 * which tracks were stripped (they are gone by the time the mixer
 * sees the clip).
 */
export function listStrippedRootMotionTrackNames(
  clip: THREE.AnimationClip,
  rootBoneNames: ReadonlyArray<string> = DEFAULT_ROOT_MOTION_BONE_NAMES,
): string[] {
  const out: string[] = []
  for (const track of clip.tracks) {
    if (isRootMotionTrack(track, rootBoneNames)) out.push(track.name)
  }
  return out
}

// ---------------------------------------------------------------------------
// Per-asset loader + cache. One entry per imported clip URL. Shared
// across all 10 figures so a single `.glb` parse covers the whole scene.
// ---------------------------------------------------------------------------

interface ImportedClipCacheEntry {
  /** The clip after root-motion stripping — what the mixer ever sees. */
  clip: THREE.AnimationClip
  /** Names of tracks that were stripped, for dev-only logging. */
  strippedTrackNames: string[]
}

const _cache = new Map<string, ImportedClipCacheEntry>()
const _inFlight = new Map<string, Promise<ImportedClipCacheEntry | null>>()

/**
 * Fetches an imported animation clip from a `.glb` URL, strips its
 * root motion at the loader layer, and caches the result. Subsequent
 * calls for the same URL return the cached entry without refetching.
 *
 * Returns `null` if anything fails (asset missing, parse failed,
 * running outside a browser, the GLB has no animations, the named
 * clip is not present). The caller falls back to whatever it had
 * before — this loader never throws.
 *
 * Parameters:
 *   - `url` — public-folder URL, e.g. `/athlete/clips/closeout.glb`.
 *   - `clipName` — optional. If present, picks the named clip from
 *     `gltf.animations`. If absent, picks the first animation in the
 *     file. Most single-intent imported files have one animation,
 *     so the default is fine.
 *   - `rootBoneNames` — optional. Defaults to
 *     `DEFAULT_ROOT_MOTION_BONE_NAMES`. Override only if a specific
 *     clip's authoring rig uses a non-standard root bone name.
 */
export function loadImportedClip(
  url: string,
  options?: {
    clipName?: string
    rootBoneNames?: ReadonlyArray<string>
  },
): Promise<ImportedClipCacheEntry | null> {
  const cached = _cache.get(url)
  if (cached) return Promise.resolve(cached)
  const inFlight = _inFlight.get(url)
  if (inFlight) return inFlight
  if (typeof window === 'undefined') return Promise.resolve(null)

  const loader = new GLTFLoader()
  const promise = new Promise<ImportedClipCacheEntry | null>((resolve) => {
    loader.load(
      url,
      (gltf) => {
        const animations = gltf.animations ?? []
        if (animations.length === 0) {
          resolve(null)
          return
        }
        const requested = options?.clipName
        const picked = requested
          ? animations.find((a) => a.name === requested) ?? null
          : animations[0] ?? null
        if (!picked) {
          resolve(null)
          return
        }
        const stripped = stripRootMotionTracks(
          picked,
          options?.rootBoneNames ?? DEFAULT_ROOT_MOTION_BONE_NAMES,
        )
        const strippedNames = listStrippedRootMotionTrackNames(
          picked,
          options?.rootBoneNames ?? DEFAULT_ROOT_MOTION_BONE_NAMES,
        )
        const entry: ImportedClipCacheEntry = {
          clip: stripped,
          strippedTrackNames: strippedNames,
        }
        _cache.set(url, entry)
        resolve(entry)
      },
      undefined,
      () => resolve(null),
    )
  }).catch(() => null)
  _inFlight.set(url, promise)
  return promise
}

/**
 * Synchronous accessor — returns the cached, root-motion-stripped
 * clip for a URL, or `null` if it has not been fetched yet. Callers
 * use this from synchronous figure builders to attach the action
 * when the cache is warm and to skip when it is cold (an async
 * `loadImportedClip` call kicks off the fetch in the background so
 * the next mount succeeds).
 */
export function getCachedImportedClip(url: string): ImportedClipCacheEntry | null {
  return _cache.get(url) ?? null
}

/**
 * Test-only — inject a fully-formed (already stripped) clip into the
 * cache without going through the network. Used by Vitest to warm
 * the cache for the synthetic placeholder closeout clip and for any
 * future imported-clip determinism tests.
 *
 * The injected clip is NOT re-stripped. Callers building synthetic
 * clips with intentional root-motion tracks should pass them through
 * `stripRootMotionTracks` themselves before calling this — that is
 * the realistic behaviour of the production loader.
 */
export function _setImportedClipCacheForTest(
  url: string,
  entry: { clip: THREE.AnimationClip; strippedTrackNames?: string[] },
): void {
  _cache.set(url, {
    clip: entry.clip,
    strippedTrackNames: entry.strippedTrackNames ?? [],
  })
  _inFlight.delete(url)
}

/** Test-only — clear the cache between cases. */
export function _resetImportedClipCache(): void {
  _cache.clear()
  _inFlight.clear()
}

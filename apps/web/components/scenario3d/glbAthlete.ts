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
    ;(figure.userData as Record<string, unknown>)[GLB_ATHLETE_USER_DATA_KEY] = {
      figure,
      cloned,
    }

    return figure
  } catch {
    return null
  }
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

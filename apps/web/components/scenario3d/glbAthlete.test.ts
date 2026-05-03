import { describe, expect, it } from 'vitest'
import {
  buildGlbAthletePreview,
  GLB_ATHLETE_ASSET_URL,
  GLB_ATHLETE_USER_DATA_KEY,
  _resetGlbAthleteCache,
} from './glbAthlete'
import {
  USE_GLB_ATHLETE_PREVIEW,
  USE_IMPORTED_CLOSEOUT_CLIP,
  buildPlayerFigure,
  getPlayerIndicatorLayers,
} from './imperativeScene'

/**
 * Phase O-ASSET — GLB athlete preview path tests.
 *
 * The GLB asset itself cannot be loaded in the JSDOM test environment
 * because the Quaternius GLB ships as binary data behind the Next.js
 * public path; vitest does not run a server. These tests therefore
 * cover the contract pieces that DO matter for production safety:
 *
 *   1. The flag defaults to OFF.
 *   2. With the flag off, `buildPlayerFigure` returns the procedural
 *      figure (no GLB userData marker).
 *   3. The synchronous `buildGlbAthletePreview` returns `null` when
 *      the cache is empty (cold-load fallback path).
 *   4. The asset URL points at the bundled public-folder file.
 */

describe('Phase O-ASSET — flag default', () => {
  it('USE_GLB_ATHLETE_PREVIEW defaults to false', () => {
    expect(USE_GLB_ATHLETE_PREVIEW).toBe(false)
  })

  it('asset URL points at the bundled public-folder GLB', () => {
    expect(GLB_ATHLETE_ASSET_URL).toBe('/athlete/mannequin.glb')
  })
})

describe('Phase P (P1.0) — imported closeout flag default', () => {
  it('USE_IMPORTED_CLOSEOUT_CLIP defaults to false', () => {
    // Production traffic must never load the imported closeout clip.
    // The dev/test wiring is layered on top of USE_GLB_ATHLETE_PREVIEW
    // and exists only so the determinism gate can prove the closeout
    // clip cannot move the player off the authored route.
    expect(USE_IMPORTED_CLOSEOUT_CLIP).toBe(false)
  })
})

describe('Phase O-ASSET — fallback when cache empty', () => {
  it('buildGlbAthletePreview returns null when no asset is cached', () => {
    _resetGlbAthleteCache()
    const result = buildGlbAthletePreview(
      '#3BFF9D',
      '#0F8C4E',
      true,
      false,
      '12',
      'idle',
    )
    expect(result).toBeNull()
  })

  it('buildPlayerFigure returns a procedural figure with the flag off', () => {
    const figure = buildPlayerFigure('#3BFF9D', '#0F8C4E', true, false, '12', 'idle')
    expect(figure).toBeDefined()
    const userData = figure.userData as Record<string, unknown>
    expect(userData[GLB_ATHLETE_USER_DATA_KEY]).toBeUndefined()
    const layers = getPlayerIndicatorLayers(figure)
    expect(layers).not.toBeNull()
  })
})

describe('P1.8 — region-based GLB athlete material split', () => {
  it('regionForBoneNames maps body parts to readable regions', async () => {
    const mod = await import('./glbAthlete')
    const r = mod._regionForBoneNamesForTest
    expect(r('pelvis', '', 0.9)).toBe('shorts')
    expect(r('thigh_l', '', 0.7)).toBe('shorts')
    expect(r('calf_r', '', 0.3)).toBe('skin')
    expect(r('foot_l', '', 0.05)).toBe('shoes')
    expect(r('spine_02', '', 1.3)).toBe('jersey')
    expect(r('clavicle_r', '', 1.55)).toBe('jersey')
    // Sleeve seam: high on upper arm with shoulder secondary → jersey
    expect(r('upperarm_l', 'clavicle_l', 1.4)).toBe('jersey')
    // Below sleeve: upperarm with lowerarm secondary → skin
    expect(r('upperarm_l', 'lowerarm_l', 1.0)).toBe('skin')
    expect(r('lowerarm_r', '', 0.9)).toBe('skin')
    expect(r('Head', '', 1.85)).toBe('hair')
    expect(r('Head', '', 1.7)).toBe('skin')
  })
})

describe('P1.9 — closeout lower-body safety strip', () => {
  it('CLOSEOUT_LOWER_BODY_BONE_NAMES covers root, pelvis, legs and feet', async () => {
    const mod = await import('./glbAthlete')
    // Lock the strip target list so a future edit can't silently
    // re-include legs/root and reintroduce the P1.8 inversion bug.
    expect(new Set(mod.CLOSEOUT_LOWER_BODY_BONE_NAMES)).toEqual(
      new Set([
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
      ]),
    )
  })

  it('stripCloseoutLowerBodyTracks removes every lower-body track', async () => {
    const THREE = await import('three')
    const mod = await import('./glbAthlete')
    const tracks = [
      // upper-body (kept)
      new THREE.QuaternionKeyframeTrack(
        'spine_02.quaternion',
        [0],
        [0, 0, 0, 1],
      ),
      new THREE.QuaternionKeyframeTrack('Head.quaternion', [0], [0, 0, 0, 1]),
      new THREE.QuaternionKeyframeTrack(
        'upperarm_l.quaternion',
        [0],
        [0, 0, 0, 1],
      ),
      // lower-body (stripped)
      new THREE.QuaternionKeyframeTrack(
        'thigh_l.quaternion',
        [0],
        [0.948, 0.315, -0.039, 0.009],
      ),
      new THREE.QuaternionKeyframeTrack(
        'calf_r.quaternion',
        [0],
        [0, 0, 0, 1],
      ),
      new THREE.QuaternionKeyframeTrack(
        'foot_l.quaternion',
        [0],
        [0, 0, 0, 1],
      ),
      new THREE.QuaternionKeyframeTrack('root.quaternion', [0], [0, 0, 0, 1]),
      new THREE.QuaternionKeyframeTrack('pelvis.quaternion', [0], [0, 0, 0, 1]),
      new THREE.VectorKeyframeTrack('thigh_l.position', [0], [0, 0, 0]),
    ]
    const clip = new THREE.AnimationClip('closeout', 1, tracks)
    const stripped = mod.stripCloseoutLowerBodyTracks(clip)
    const remainingNames = stripped.tracks.map((t) => t.name).sort()
    expect(remainingNames).toEqual(
      ['Head.quaternion', 'spine_02.quaternion', 'upperarm_l.quaternion'].sort(),
    )

    const dropped = mod.listStrippedCloseoutLowerBodyTrackNames(clip).sort()
    expect(dropped).toEqual(
      [
        'thigh_l.quaternion',
        'calf_r.quaternion',
        'foot_l.quaternion',
        'root.quaternion',
        'pelvis.quaternion',
        'thigh_l.position',
      ].sort(),
    )

    // Pure function — input clip is unchanged.
    expect(clip.tracks.length).toBe(tracks.length)
  })

  it('stripCloseoutLowerBodyTracks preserves clip name and duration', async () => {
    const THREE = await import('three')
    const mod = await import('./glbAthlete')
    const clip = new THREE.AnimationClip('closeout', 1.234, [
      new THREE.QuaternionKeyframeTrack('thigh_l.quaternion', [0], [0, 0, 0, 1]),
    ])
    const stripped = mod.stripCloseoutLowerBodyTracks(clip)
    expect(stripped.name).toBe('closeout')
    expect(stripped.duration).toBe(1.234)
  })
})

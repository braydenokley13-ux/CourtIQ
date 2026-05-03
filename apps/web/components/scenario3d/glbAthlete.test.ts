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

describe('P1.8 — closeout pose readability dampener', () => {
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

  it('dampenClipRotationTracks reduces rotation magnitude toward identity', async () => {
    const THREE = await import('three')
    const mod = await import('./glbAthlete')
    // Build a clip with one large rotation ( 90° around x ).
    const q = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(1, 0, 0),
      Math.PI / 2,
    )
    const track = new THREE.QuaternionKeyframeTrack(
      'pelvis.quaternion',
      [0, 1],
      [q.x, q.y, q.z, q.w, q.x, q.y, q.z, q.w],
    )
    const clip = new THREE.AnimationClip('t', 1, [track])
    const dampened = mod._dampenClipRotationTracksForTest(clip, 0.5)
    const v = (dampened.tracks[0].values as Float32Array)
    const dq = new THREE.Quaternion(v[0], v[1], v[2], v[3])
    // Half-strength of a 90° rotation is 45°. The cosine of half-angle
    // is cos(22.5°) ≈ 0.924, so the dampened quaternion's w is much
    // closer to 1 than the original (cos(45°) ≈ 0.707).
    expect(dq.w).toBeGreaterThan(0.9)
    expect(dq.w).toBeLessThan(1.0)
    // Magnitude is preserved (still a unit quaternion).
    expect(dq.length()).toBeCloseTo(1, 5)
  })

  it('dampenClipRotationTracks leaves non-quaternion tracks untouched', async () => {
    const THREE = await import('three')
    const mod = await import('./glbAthlete')
    const positionTrack = new THREE.VectorKeyframeTrack(
      'pelvis.position',
      [0, 1],
      [0, 0, 0, 1, 2, 3],
    )
    const rotTrack = new THREE.QuaternionKeyframeTrack(
      'pelvis.quaternion',
      [0],
      [0, 0, 0, 1],
    )
    const clip = new THREE.AnimationClip('t', 1, [positionTrack, rotTrack])
    const dampened = mod._dampenClipRotationTracksForTest(clip, 0.4)
    expect(dampened.tracks[0]).toBeInstanceOf(THREE.VectorKeyframeTrack)
    expect(Array.from(dampened.tracks[0].values)).toEqual([0, 0, 0, 1, 2, 3])
  })
})

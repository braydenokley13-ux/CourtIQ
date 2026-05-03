import { afterEach, describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  GLB_IMPORTED_BACK_CUT_CLIP_URL,
  buildGlbAthletePreview,
  getGlbAthleteHandle,
  GLB_ATHLETE_ASSET_URL,
  GLB_ATHLETE_USER_DATA_KEY,
  _resetGlbAthleteCache,
  _resetGlbAthleteClipCache,
  _resetGlbAthleteBoneMapAuditGuard,
  _resetReadableBackCutClipCache,
  _setGlbAthleteCacheForTest,
} from './glbAthlete'
import {
  _resetImportedClipCache,
  _setImportedClipCacheForTest,
} from './importedClipLoader'
import {
  USE_GLB_ATHLETE_PREVIEW,
  USE_IMPORTED_CLOSEOUT_CLIP,
  buildPlayerFigure,
  getPlayerIndicatorLayers,
} from './imperativeScene'
import {
  assertMockCoversGlbBoneMap,
  buildMockGlbAsset,
} from './__fixtures__/mockGlbAsset'

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

describe('P2.3 — readable back-cut action attachment', () => {
  afterEach(() => {
    _resetGlbAthleteCache()
    _resetGlbAthleteClipCache()
    _resetGlbAthleteBoneMapAuditGuard()
    _resetReadableBackCutClipCache()
    _resetImportedClipCache()
  })

  it('attaches the readable back-cut clip, not the raw imported posture', () => {
    const asset = buildMockGlbAsset()
    assertMockCoversGlbBoneMap(asset)
    _setGlbAthleteCacheForTest(asset.scene, asset.skinnedMesh)

    _setImportedClipCacheForTest(GLB_IMPORTED_BACK_CUT_CLIP_URL, {
      clip: new THREE.AnimationClip('back_cut', 1, [
        new THREE.VectorKeyframeTrack('root.position', [0, 1], [0, 0, 0, 0, 0, 4]),
        new THREE.VectorKeyframeTrack(
          'pelvis.position',
          [0, 1],
          [0, 0.1, 0, 0, 0.1, 3],
        ),
        new THREE.QuaternionKeyframeTrack(
          'upperarm_l.quaternion',
          [0],
          [0.9, 0, 0, 0.44],
        ),
        new THREE.QuaternionKeyframeTrack(
          'foot_l.quaternion',
          [0],
          [0, 0, 0, 1],
        ),
      ]),
      strippedTrackNames: ['root.position', 'pelvis.position'],
    })

    const figure = buildGlbAthletePreview(
      '#3BFF9D',
      '#0F8C4E',
      true,
      false,
      '12',
      'idle',
      { attachImportedBackCutClip: true },
    )
    expect(figure).not.toBeNull()
    const handle = getGlbAthleteHandle(figure!)
    expect(handle).not.toBeNull()
    const clip = handle!.actions['back_cut']?.getClip()
    expect(clip).toBeDefined()
    expect(clip!.name).toBe('back_cut')

    const names = clip!.tracks.map((t) => t.name).sort()
    expect(names).toContain('spine_02.quaternion')
    expect(names).toContain('Head.quaternion')
    expect(names).toContain('upperarm_l.quaternion')
    expect(names).toContain('lowerarm_r.quaternion')
    expect(names).toContain('thigh_l.quaternion')
    expect(names).not.toContain('root.position')
    expect(names).not.toContain('pelvis.position')
    expect(names).not.toContain('foot_l.quaternion')
    for (const name of names) {
      expect(name.endsWith('.position'), `${name} must not move the route`).toBe(
        false,
      )
      expect(name.endsWith('.scale'), `${name} must not scale the rig`).toBe(false)
    }
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
  it('GLB bespoke lower-body clips preserve Quaternius bind rotations before adding deltas', async () => {
    const mod = await import('./glbAthlete')
    const clips = mod._buildGlbAthleteClipsForTest()

    const idleThigh = clips.idle_ready.tracks.find(
      (t) => t.name === 'thigh_l.quaternion',
    )
    const defenseShin = clips.defense_slide.tracks.find(
      (t) => t.name === 'calf_l.quaternion',
    )
    expect(idleThigh, 'idle_ready thigh track').toBeDefined()
    expect(defenseShin, 'defense_slide calf track').toBeDefined()

    // Regression lock: the old broken clips used near-identity
    // absolute quaternions for lower-body bones. The Quaternius
    // thigh bind w is ~0.12; a bind-relative stance should stay far
    // away from identity w≈1.
    expect(Math.abs(idleThigh!.values[3]!)).toBeLessThan(0.35)
    expect(Math.abs(defenseShin!.values[3]!)).toBeLessThan(0.99)
  })

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

  it('buildReadableCloseoutClip strips imported lower body and adds the CourtIQ stance base', async () => {
    const THREE = await import('three')
    const mod = await import('./glbAthlete')
    const clip = new THREE.AnimationClip('closeout', 1.1, [
      new THREE.QuaternionKeyframeTrack('spine_02.quaternion', [0], [0, 0, 0, 1]),
      new THREE.QuaternionKeyframeTrack('upperarm_l.quaternion', [0], [0, 0, 0, 1]),
      new THREE.QuaternionKeyframeTrack(
        'thigh_l.quaternion',
        [0],
        [0.948, 0.315, -0.039, 0.009],
      ),
      new THREE.VectorKeyframeTrack('pelvis.position', [0], [0, 0.1, 0.2]),
      new THREE.QuaternionKeyframeTrack('root.quaternion', [0], [0, 0, 0, 1]),
      new THREE.QuaternionKeyframeTrack('foot_l.quaternion', [0], [0, 0, 0, 1]),
    ])

    const readable = mod.buildReadableCloseoutClip(clip)
    const names = readable.tracks.map((t) => t.name).sort()

    // Imported upper body survives.
    expect(names).toContain('spine_02.quaternion')
    expect(names).toContain('upperarm_l.quaternion')

    // Unsafe imported lower body/root does not survive.
    expect(names).not.toContain('root.quaternion')
    expect(names).not.toContain('pelvis.position')
    expect(names).not.toContain('foot_l.quaternion')

    // CourtIQ-authored lower body is added back as pose-only tracks.
    expect(names).toEqual(
      [
        'calf_l.quaternion',
        'calf_r.quaternion',
        'pelvis.quaternion',
        'spine_02.quaternion',
        'thigh_l.quaternion',
        'thigh_r.quaternion',
        'upperarm_l.quaternion',
      ].sort(),
    )
    for (const name of names) {
      expect(name.endsWith('.position'), `${name} must not be a route track`).toBe(false)
      expect(name.endsWith('.scale'), `${name} must not be a scale track`).toBe(false)
    }
    expect(readable.name).toBe('closeout')
    expect(readable.duration).toBe(1.1)
  })
})

describe('P2.4 — readable deny and idle-ready GLB postures', () => {
  function unsafeRouteTrackNames(clip: THREE.AnimationClip): string[] {
    return clip.tracks
      .map((track) => track.name)
      .filter((name) => /\.position(\.|$)|\.scale(\.|$)/.test(name))
  }

  it('idle_ready pulls arms closer to the body without route-moving tracks', async () => {
    const mod = await import('./glbAthlete')
    const { idle_ready } = mod._buildGlbAthleteClipsForTest()
    const trackNames = new Set(idle_ready.tracks.map((track) => track.name))
    const leftUpperArm = idle_ready.tracks.find(
      (track) => track.name === 'upperarm_l.quaternion',
    )

    expect(trackNames.has('upperarm_l.quaternion')).toBe(true)
    expect(trackNames.has('upperarm_r.quaternion')).toBe(true)
    expect(trackNames.has('lowerarm_l.quaternion')).toBe(true)
    expect(trackNames.has('lowerarm_r.quaternion')).toBe(true)
    expect(trackNames.has('calf_l.quaternion')).toBe(true)
    expect(trackNames.has('calf_r.quaternion')).toBe(true)
    expect(unsafeRouteTrackNames(idle_ready)).toEqual([])

    // Upper-arm bind rotations are far from identity on this rig.
    // If the track is authored from identity again, the idle pose can
    // snap back toward a broad mannequin shoulder shape.
    expect(Math.abs(leftUpperArm!.values[3]!)).toBeLessThan(0.9)
  })

  it('defensive_deny authors an asymmetric lane-denial pose only with rotations', async () => {
    const mod = await import('./glbAthlete')
    const { defensive_deny } = mod._buildGlbAthleteClipsForTest()
    const trackNames = new Set(defensive_deny.tracks.map((track) => track.name))

    expect(defensive_deny.name).toBe('defensive_deny')
    expect(trackNames.has('pelvis.quaternion')).toBe(true)
    expect(trackNames.has('spine_02.quaternion')).toBe(true)
    expect(trackNames.has('Head.quaternion')).toBe(true)
    expect(trackNames.has('upperarm_l.quaternion')).toBe(true)
    expect(trackNames.has('upperarm_r.quaternion')).toBe(true)
    expect(trackNames.has('thigh_l.quaternion')).toBe(true)
    expect(trackNames.has('thigh_r.quaternion')).toBe(true)
    expect(unsafeRouteTrackNames(defensive_deny)).toEqual([])

    const laneArm = defensive_deny.tracks.find(
      (track) => track.name === 'upperarm_l.quaternion',
    )
    const offArm = defensive_deny.tracks.find(
      (track) => track.name === 'upperarm_r.quaternion',
    )
    expect(Array.from(laneArm!.values)).not.toEqual(Array.from(offArm!.values))
  })

  it('readable posture clips are deterministic across factory calls', async () => {
    const mod = await import('./glbAthlete')
    const a = mod._buildGlbAthleteClipsForTest()
    const b = mod._buildGlbAthleteClipsForTest()

    for (const name of ['idle_ready', 'defensive_deny'] as const) {
      const clipA = a[name]
      const clipB = b[name]
      expect(clipA.duration).toBe(clipB.duration)
      expect(clipA.tracks.map((track) => track.name)).toEqual(
        clipB.tracks.map((track) => track.name),
      )
      for (let i = 0; i < clipA.tracks.length; i++) {
        expect(Array.from(clipA.tracks[i]!.times)).toEqual(
          Array.from(clipB.tracks[i]!.times),
        )
        expect(Array.from(clipA.tracks[i]!.values)).toEqual(
          Array.from(clipB.tracks[i]!.values),
        )
      }
    }
  })
})

/**
 * Athlete-rendering reliability pass — `buildGlbAthletePreview`
 * must produce a base figure even when an animation clip's mixer
 * binding throws.
 *
 * Production-bug context: a tester running `?forceGlb=1` would see
 * the magenta marker any time the closeout / back-cut clip-builder
 * encountered an unexpected error — even though the GLB asset
 * itself loaded fine. Spec contract for this pass: "Base GLB mesh
 * rendering should not depend on animation clip success." This
 * test locks the new isolation: clip attachment runs inside its own
 * try/catch, the figure is built from the loaded asset, and a
 * console warning surfaces the failure for operators.
 */

/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import {
  GLB_ATHLETE_USER_DATA_KEY,
  buildGlbAthletePreview,
  _resetGlbAthleteCache,
  _resetGlbAthleteClipCache,
  _resetGlbAthleteBoneMapAuditGuard,
  _resetReadableBackCutClipCache,
  _setGlbAthleteCacheForTest,
  GLB_IMPORTED_BACK_CUT_CLIP_URL,
} from './glbAthlete'
import {
  _resetImportedClipCache,
  _setImportedClipCacheForTest,
} from './importedClipLoader'
import {
  assertMockCoversGlbBoneMap,
  buildMockGlbAsset,
} from './__fixtures__/mockGlbAsset'

describe('buildGlbAthletePreview — clip-attachment isolation', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    _resetGlbAthleteCache()
    _resetGlbAthleteClipCache()
    _resetGlbAthleteBoneMapAuditGuard()
    _resetReadableBackCutClipCache()
    _resetImportedClipCache()
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    _resetGlbAthleteCache()
    _resetGlbAthleteClipCache()
    _resetGlbAthleteBoneMapAuditGuard()
    _resetReadableBackCutClipCache()
    _resetImportedClipCache()
    warnSpy.mockRestore()
  })

  it('still returns a figure when an imported back-cut clip throws during readable-shim build', () => {
    const asset = buildMockGlbAsset()
    assertMockCoversGlbBoneMap(asset)
    _setGlbAthleteCacheForTest(asset.scene, asset.skinnedMesh)

    // Inject a corrupt-looking imported back-cut clip whose tracks
    // reference a non-existent property selector. The readable
    // back-cut shim consumes this and rebuilds against the rig; if
    // anything throws inside that build, the figure must still
    // render in idle/static pose.
    _setImportedClipCacheForTest(GLB_IMPORTED_BACK_CUT_CLIP_URL, {
      // intentionally weird — the clip has a track with NaN values
      // so any keyframe interpolation fails downstream. The base
      // figure must not vanish.
      clip: new THREE.AnimationClip('back_cut', 1, [
        new THREE.QuaternionKeyframeTrack(
          'upperarm_l.quaternion',
          [0, 0.5, 1],
          [
            Number.NaN,
            Number.NaN,
            Number.NaN,
            Number.NaN,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            1,
          ],
        ),
      ]),
      strippedTrackNames: [],
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

    // Base figure must exist regardless of clip failure.
    expect(figure).not.toBeNull()
    const userData = figure!.userData as Record<string, unknown>
    expect(userData[GLB_ATHLETE_USER_DATA_KEY]).toBeDefined()
    expect(figure!.children.some((c) => c.name === 'glb-mannequin-clone')).toBe(
      true,
    )
  })

  it('clip-cache build threw → figure still renders idle/static, console warns', () => {
    const asset = buildMockGlbAsset()
    _setGlbAthleteCacheForTest(asset.scene, asset.skinnedMesh)

    // Spy on `THREE.AnimationMixer.prototype.clipAction` so we can
    // throw on a specific call and confirm the figure still mounts.
    const realClipAction = THREE.AnimationMixer.prototype.clipAction
    let firstCallSeen = false
    const stub = vi
      .spyOn(THREE.AnimationMixer.prototype, 'clipAction')
      .mockImplementation(function (this: THREE.AnimationMixer, ...args) {
        if (!firstCallSeen) {
          firstCallSeen = true
          throw new Error('synthetic clip-action failure')
        }
        return realClipAction.apply(this, args as [THREE.AnimationClip])
      })

    const figure = buildGlbAthletePreview(
      '#3BFF9D',
      '#0F8C4E',
      true,
      false,
      '12',
      'idle',
    )
    stub.mockRestore()

    expect(figure).not.toBeNull()
    const userData = figure!.userData as Record<string, unknown>
    expect(userData[GLB_ATHLETE_USER_DATA_KEY]).toBeDefined()
    // A warn should have fired so an operator sees which clip family
    // failed.
    const warnFired = warnSpy.mock.calls.some(
      (args) =>
        typeof args[0] === 'string' &&
        args[0].includes('[glbAthlete]') &&
        args[0].includes('failed to attach bespoke clip'),
    )
    expect(warnFired).toBe(true)
  })
})

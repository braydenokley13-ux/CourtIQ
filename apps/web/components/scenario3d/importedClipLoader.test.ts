/**
 * P1.0 — root-motion-strip utility tests.
 *
 * Phase P §2 (the "animation must NOT control" rules) and §4
 * (imported-clip safety) both require that translation tracks on
 * the root/hip bone are removed before any imported clip reaches an
 * `AnimationMixer`. This test file is the unit-level lock on that
 * contract.
 *
 * Coverage:
 *
 *   1. `isRootMotionTrack` — name-only filter behaviour. Catches
 *      `<root>.position` and bone-aliased variants; leaves rotation,
 *      scale, and non-root translation alone.
 *   2. `stripRootMotionTracks` — returns a NEW clip with offending
 *      tracks removed, preserves name + duration + non-stripped
 *      tracks, leaves the input untouched, and never throws on
 *      empty / no-root clips.
 *   3. `listStrippedRootMotionTrackNames` — symmetric to #2 so
 *      callers can log what was stripped without re-running the
 *      strip.
 *   4. End-to-end strip on a synthetic Mixamo-style clip with a
 *      `Hips.position` track plus rotation tracks — proves the
 *      default root-bone alias list catches the most common
 *      third-party authoring source.
 *   5. The mixer applied to a stripped clip on a bone with non-zero
 *      bind-pose translation does NOT zero out the bone's position
 *      after a tick — locks the "remove, don't zero" choice.
 *   6. Test cache injector contract — `_setImportedClipCacheForTest`
 *      stores the entry verbatim; `_resetImportedClipCache` clears
 *      it; `getCachedImportedClip` returns the cached entry.
 */

/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  DEFAULT_ROOT_MOTION_BONE_NAMES,
  _resetImportedClipCache,
  _setImportedClipCacheForTest,
  getCachedImportedClip,
  isRootMotionTrack,
  listStrippedRootMotionTrackNames,
  stripRootMotionTracks,
} from './importedClipLoader'

// ---------------------------------------------------------------------------
// Fixtures — synthetic clips authored to cover the strip surface area.
// ---------------------------------------------------------------------------

function buildQuaternionTrack(name: string): THREE.QuaternionKeyframeTrack {
  // Two keyframes at t=0 and t=1, identity → small rotation around X.
  const q0 = new THREE.Quaternion()
  const q1 = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.2, 0, 0))
  return new THREE.QuaternionKeyframeTrack(
    name,
    [0, 1],
    [q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w],
  )
}

function buildPositionTrack(name: string): THREE.VectorKeyframeTrack {
  // Two keyframes — a real translation that, if NOT stripped, would
  // push the bone forward by 1 unit on the Z axis over the clip's
  // duration. This is what root motion looks like in the wild.
  return new THREE.VectorKeyframeTrack(
    name,
    [0, 1],
    [0, 0, 0, 0, 0, 1],
  )
}

function buildScaleTrack(name: string): THREE.VectorKeyframeTrack {
  return new THREE.VectorKeyframeTrack(
    name,
    [0, 1],
    [1, 1, 1, 1.01, 1.01, 1.01],
  )
}

function buildSyntheticClip(name: string): THREE.AnimationClip {
  // A fully populated clip mimicking a Mixamo-style export: hip
  // translation track (the one we want stripped), spine rotation,
  // arm rotation, and a leg scale track. Anything that isn't
  // `<root>.position` should survive the strip.
  return new THREE.AnimationClip(name, 1, [
    buildPositionTrack('Hips.position'),
    buildQuaternionTrack('Hips.quaternion'),
    buildQuaternionTrack('Spine.quaternion'),
    buildQuaternionTrack('LeftUpperArm.quaternion'),
    buildScaleTrack('LeftLeg.scale'),
  ])
}

// ---------------------------------------------------------------------------
// 1. isRootMotionTrack — single-track name classification.
// ---------------------------------------------------------------------------

describe('P1.0 — isRootMotionTrack', () => {
  it('returns true for <root>.position and known root aliases', () => {
    expect(isRootMotionTrack(buildPositionTrack('root.position'))).toBe(true)
    expect(isRootMotionTrack(buildPositionTrack('pelvis.position'))).toBe(true)
    expect(isRootMotionTrack(buildPositionTrack('Hips.position'))).toBe(true)
    expect(isRootMotionTrack(buildPositionTrack('mixamorig:Hips.position'))).toBe(true)
    expect(isRootMotionTrack(buildPositionTrack('mixamorigHips.position'))).toBe(true)
    expect(isRootMotionTrack(buildPositionTrack('Root.position'))).toBe(true)
    expect(isRootMotionTrack(buildPositionTrack('Armature.position'))).toBe(true)
  })

  it('returns false for rotation / scale tracks on the same bones', () => {
    expect(isRootMotionTrack(buildQuaternionTrack('Hips.quaternion'))).toBe(false)
    expect(isRootMotionTrack(buildScaleTrack('Hips.scale'))).toBe(false)
    expect(isRootMotionTrack(buildScaleTrack('pelvis.scale'))).toBe(false)
  })

  it('returns false for translation on non-root bones', () => {
    expect(isRootMotionTrack(buildPositionTrack('LeftFoot.position'))).toBe(false)
    expect(isRootMotionTrack(buildPositionTrack('Spine.position'))).toBe(false)
    expect(isRootMotionTrack(buildPositionTrack('upperarm_l.position'))).toBe(false)
  })

  it('returns false for a malformed track name with no dot', () => {
    // PropertyBinding requires the dot — names without it are inert
    // anyway, so the strip must not touch them.
    const bad = new THREE.NumberKeyframeTrack('orphan-name', [0, 1], [0, 1])
    expect(isRootMotionTrack(bad)).toBe(false)
  })

  it('honours a custom root-bone list', () => {
    expect(isRootMotionTrack(buildPositionTrack('CustomRoot.position'), ['CustomRoot'])).toBe(
      true,
    )
    // The default `Hips` alias must NOT match when the caller passes
    // an explicit list that excludes it.
    expect(isRootMotionTrack(buildPositionTrack('Hips.position'), ['CustomRoot'])).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 2. stripRootMotionTracks — clip-level filter behaviour.
// ---------------------------------------------------------------------------

describe('P1.0 — stripRootMotionTracks', () => {
  it('returns a new clip with the root-motion track removed', () => {
    const input = buildSyntheticClip('imported-closeout')
    expect(input.tracks.length).toBe(5)
    const stripped = stripRootMotionTracks(input)
    // Hips.position is gone; the other four survive.
    expect(stripped.tracks.length).toBe(4)
    const remainingNames = stripped.tracks.map((t) => t.name).sort()
    expect(remainingNames).toEqual([
      'Hips.quaternion',
      'LeftLeg.scale',
      'LeftUpperArm.quaternion',
      'Spine.quaternion',
    ])
  })

  it('does not mutate the input clip', () => {
    const input = buildSyntheticClip('preserve-input')
    const beforeNames = input.tracks.map((t) => t.name)
    stripRootMotionTracks(input)
    const afterNames = input.tracks.map((t) => t.name)
    expect(afterNames).toEqual(beforeNames)
    // Identity check — track objects must be the same references.
    expect(input.tracks[0]?.name).toBe('Hips.position')
  })

  it('preserves clip name and duration', () => {
    const input = new THREE.AnimationClip('keepme', 2.5, [
      buildPositionTrack('pelvis.position'),
      buildQuaternionTrack('Spine.quaternion'),
    ])
    const stripped = stripRootMotionTracks(input)
    expect(stripped.name).toBe('keepme')
    expect(stripped.duration).toBe(2.5)
  })

  it('returns an empty-track clip when the input had only root motion', () => {
    const input = new THREE.AnimationClip('only-root', 1, [
      buildPositionTrack('Hips.position'),
      buildPositionTrack('pelvis.position'),
    ])
    const stripped = stripRootMotionTracks(input)
    expect(stripped.tracks.length).toBe(0)
    // The clip is still valid; the mixer simply has nothing to do.
    expect(stripped.name).toBe('only-root')
    expect(stripped.duration).toBe(1)
  })

  it('returns the original tracks (by name) when the input has no root motion', () => {
    const input = new THREE.AnimationClip('clean', 1, [
      buildQuaternionTrack('Spine.quaternion'),
      buildQuaternionTrack('LeftUpperArm.quaternion'),
    ])
    const stripped = stripRootMotionTracks(input)
    expect(stripped.tracks.length).toBe(2)
    expect(stripped.tracks.map((t) => t.name).sort()).toEqual([
      'LeftUpperArm.quaternion',
      'Spine.quaternion',
    ])
  })
})

// ---------------------------------------------------------------------------
// 3. listStrippedRootMotionTrackNames — diagnostic mirror.
// ---------------------------------------------------------------------------

describe('P1.0 — listStrippedRootMotionTrackNames', () => {
  it('returns the names of every track that would be stripped', () => {
    const input = new THREE.AnimationClip('multi-root', 1, [
      buildPositionTrack('Hips.position'),
      buildPositionTrack('pelvis.position'),
      buildQuaternionTrack('Spine.quaternion'),
    ])
    const names = listStrippedRootMotionTrackNames(input)
    expect(names.sort()).toEqual(['Hips.position', 'pelvis.position'])
  })

  it('returns an empty array when nothing is stripped', () => {
    const input = new THREE.AnimationClip('clean', 1, [
      buildQuaternionTrack('Spine.quaternion'),
    ])
    expect(listStrippedRootMotionTrackNames(input)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// 4. End-to-end mixer behaviour — proves the strip is enough to keep the
//    bone at its bind-pose translation.
// ---------------------------------------------------------------------------

describe('P1.0 — stripped clip cannot move a bone via root motion', () => {
  it('after the mixer ticks, the root bone position equals its bind-pose translation', () => {
    // Build a tiny rig with a single root bone whose bind-pose
    // translation is (0, 0.5, 0). If a `Hips.position` track survives
    // the strip, the mixer would interpolate the bone to (0, 0, 1)
    // by t=1. After stripping, the bone must stay at (0, 0.5, 0).
    const root = new THREE.Group()
    const bone = new THREE.Bone()
    bone.name = 'Hips'
    bone.position.set(0, 0.5, 0)
    root.add(bone)

    const importedClip = new THREE.AnimationClip('imported', 1, [
      buildPositionTrack('Hips.position'),
      buildQuaternionTrack('Hips.quaternion'),
    ])
    const stripped = stripRootMotionTracks(importedClip)
    expect(stripped.tracks.length).toBe(1)
    expect(stripped.tracks[0]!.name).toBe('Hips.quaternion')

    const mixer = new THREE.AnimationMixer(root)
    const action = mixer.clipAction(stripped)
    // Clamp on the last keyframe so we sample the FULL extent of the
    // surviving rotation track — without this, default LoopRepeat
    // would wrap t back to 0 the moment it reaches the duration and
    // the rotation assertion below would coincidentally see identity.
    action.setLoop(THREE.LoopOnce, 1)
    action.clampWhenFinished = true
    action.play()
    // Two ticks past the clip duration so the rotation track, if it
    // survives, has written its final keyframe value, and the
    // position track, if it had survived, would have written its
    // full (0, 0, 1).
    mixer.update(0)
    mixer.update(2)

    expect(bone.position.x).toBe(0)
    expect(bone.position.y).toBe(0.5)
    expect(bone.position.z).toBe(0)

    // And the rotation track survives — the bone should have rotated.
    expect(Math.abs(bone.quaternion.x)).toBeGreaterThan(1e-6)
  })
})

// ---------------------------------------------------------------------------
// 5. Default root-bone list — quick coverage so the constant exposes
//    the names production callers depend on.
// ---------------------------------------------------------------------------

describe('P1.0 — DEFAULT_ROOT_MOTION_BONE_NAMES', () => {
  it('covers the rigs CourtIQ ships and the most common imports', () => {
    // Quaternius UAL2 (the rig CourtIQ ships).
    expect(DEFAULT_ROOT_MOTION_BONE_NAMES).toContain('root')
    expect(DEFAULT_ROOT_MOTION_BONE_NAMES).toContain('pelvis')
    // Mixamo aliases.
    expect(DEFAULT_ROOT_MOTION_BONE_NAMES).toContain('Hips')
    expect(DEFAULT_ROOT_MOTION_BONE_NAMES).toContain('mixamorig:Hips')
  })
})

// ---------------------------------------------------------------------------
// 6. Cache injector contract.
// ---------------------------------------------------------------------------

describe('P1.0 — imported clip cache (test injector)', () => {
  beforeEach(() => {
    _resetImportedClipCache()
  })
  afterEach(() => {
    _resetImportedClipCache()
  })

  it('stores the injected entry verbatim and returns it via the sync accessor', () => {
    const url = '/athlete/clips/closeout.glb'
    const clip = new THREE.AnimationClip('closeout', 1, [
      buildQuaternionTrack('spine_02.quaternion'),
    ])
    _setImportedClipCacheForTest(url, { clip, strippedTrackNames: ['pelvis.position'] })
    const cached = getCachedImportedClip(url)
    expect(cached).not.toBeNull()
    expect(cached!.clip.name).toBe('closeout')
    expect(cached!.strippedTrackNames).toEqual(['pelvis.position'])
  })

  it('returns null for a URL with no cached entry', () => {
    expect(getCachedImportedClip('/nope.glb')).toBeNull()
  })

  it('reset clears every entry', () => {
    _setImportedClipCacheForTest('/a.glb', {
      clip: new THREE.AnimationClip('a', 1, []),
    })
    _setImportedClipCacheForTest('/b.glb', {
      clip: new THREE.AnimationClip('b', 1, []),
    })
    _resetImportedClipCache()
    expect(getCachedImportedClip('/a.glb')).toBeNull()
    expect(getCachedImportedClip('/b.glb')).toBeNull()
  })
})

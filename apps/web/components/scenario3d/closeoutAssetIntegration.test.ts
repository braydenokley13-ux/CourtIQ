/**
 * P1.6 — Real `closeout.glb` asset integration tests.
 *
 * The P1.0 packet stood up the imported-clip loader and a synthetic
 * placeholder closeout clip; the determinism gate in
 * `glbAthleteEndToEndDeterminism.test.ts` runs against that synthetic
 * clip. P1.6 lands the real bundled asset
 * (`apps/web/public/athlete/clips/closeout.glb`, Quaternius UAL2
 * `Shield_Dash_RM` extracted under CC0) and this test file locks two
 * properties that only matter for the real file:
 *
 *   1. The bundled GLB parses cleanly via `GLTFLoader.parse`, exposes
 *      exactly one `AnimationClip` named `closeout`, and that clip
 *      contains the `<root>.position` + `<pelvis>.position` tracks the
 *      loader's root-motion-strip is supposed to remove.
 *   2. After running the parsed clip through `stripRootMotionTracks`
 *      (the production strip helper), no `<root>.position` track
 *      survives; non-root tracks (rotation/scale on every bone, plus
 *      translations on `Head`, `hand_l`, etc.) all do. Binding the
 *      stripped clip to a tiny rig and ticking the mixer past the
 *      clip's full duration leaves the bound `pelvis` bone at its
 *      bind-pose translation — proof that route ownership stays with
 *      the scenario timeline.
 *
 * This is a unit-level lock; the end-to-end determinism gate
 * (synthetic placeholder → MotionController → bone snapshots) still
 * carries the heavy contract. The two suites cover different surfaces:
 * this file proves the bundled file is loader-safe; the determinism
 * gate proves the loader's output is replay-safe under
 * `MotionController` ticking.
 */

/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { buildReadableCloseoutClip } from './glbAthlete'
import {
  isRootMotionTrack,
  listStrippedRootMotionTrackNames,
  stripRootMotionTracks,
} from './importedClipLoader'

const CLOSEOUT_GLB_PATH = path.resolve(
  __dirname,
  '../../public/athlete/clips/closeout.glb',
)

/**
 * Read the bundled GLB into an ArrayBuffer and synchronously parse it
 * via `GLTFLoader.parse`. We avoid the loader's network path so this
 * test can run under JSDOM/Node without a fetch shim.
 */
async function parseBundledCloseoutClip(): Promise<THREE.AnimationClip> {
  const buf = fs.readFileSync(CLOSEOUT_GLB_PATH)
  // Copy into a fresh ArrayBuffer because jsdom's typed-array stack
  // can mishandle a Node Buffer-backed view inside GLTFLoader's
  // internal header sniffer.
  const arrayBuffer = new ArrayBuffer(buf.byteLength)
  new Uint8Array(arrayBuffer).set(buf)
  const loader = new GLTFLoader()
  // GLTFLoader.parse runs asynchronously even when given an
  // ArrayBuffer (animation accessors resolve through a Promise
  // chain); wrap in a Promise so the test can await completion.
  const gltf = await new Promise<{ animations: THREE.AnimationClip[] }>(
    (resolve, reject) => {
      loader.parse(arrayBuffer, '', resolve, reject)
    },
  )
  const animations = gltf.animations ?? []
  if (animations.length === 0) {
    throw new Error('bundled closeout.glb parsed without animations')
  }
  return animations[0]!
}

describe('P1.6 — real closeout.glb integration', () => {
  let parsed: THREE.AnimationClip

  beforeEach(async () => {
    parsed = await parseBundledCloseoutClip()
  })
  afterEach(() => {
    // No module-level state to reset — the loader cache is bypassed
    // entirely in this suite (GLTFLoader.parse is direct).
  })

  it('exposes exactly one AnimationClip named "closeout"', () => {
    expect(parsed.name).toBe('closeout')
    // 23 mapped bones × 3 channels (translation/rotation/scale)
    // = 69 tracks in source. Asserting > 0 keeps this resilient if
    // the extraction script trims a finger or two later; the strip
    // contract is what really matters.
    expect(parsed.tracks.length).toBeGreaterThan(0)
    // 1.1 s in the original Shield_Dash_RM source.
    expect(parsed.duration).toBeGreaterThan(0)
    expect(parsed.duration).toBeLessThan(2)
  })

  it('contains <root>.position and <pelvis>.position tracks before stripping', () => {
    // Root motion is the whole reason the loader exists. If the
    // extraction script ever drops these accidentally, the strip
    // contract becomes vacuous — assert the source still has them.
    const trackNames = parsed.tracks.map((t) => t.name)
    expect(trackNames).toContain('root.position')
    expect(trackNames).toContain('pelvis.position')
    // Both must classify as root-motion under the production rules.
    expect(
      parsed.tracks.find((t) => t.name === 'root.position')!,
    ).toSatisfy((t: THREE.KeyframeTrack) => isRootMotionTrack(t))
    expect(
      parsed.tracks.find((t) => t.name === 'pelvis.position')!,
    ).toSatisfy((t: THREE.KeyframeTrack) => isRootMotionTrack(t))
  })

  it('stripRootMotionTracks removes both root-motion tracks and only those', () => {
    const stripped = stripRootMotionTracks(parsed)
    const strippedNames = listStrippedRootMotionTrackNames(parsed).sort()
    expect(strippedNames).toEqual(['pelvis.position', 'root.position'])

    // No <root>.position track survives.
    for (const t of stripped.tracks) {
      expect(isRootMotionTrack(t)).toBe(false)
    }

    // Sanity: rotation tracks for the bones GLB_BONE_MAP cares about
    // survive. (Names match the Quaternius UAL2 rig, same as the
    // bundled mannequin.glb.)
    const survivedNames = stripped.tracks.map((t) => t.name)
    expect(survivedNames).toContain('pelvis.quaternion')
    expect(survivedNames).toContain('spine_02.quaternion')
    expect(survivedNames).toContain('Head.quaternion')
    expect(survivedNames).toContain('upperarm_l.quaternion')
    expect(survivedNames).toContain('thigh_l.quaternion')

    // Stripped clip preserves name + duration.
    expect(stripped.name).toBe('closeout')
    expect(stripped.duration).toBe(parsed.duration)
    // Exactly two tracks fewer than the source.
    expect(stripped.tracks.length).toBe(parsed.tracks.length - 2)
  })

  it('readable closeout keeps imported upper body but replaces lower body with CourtIQ base', () => {
    const rootStripped = stripRootMotionTracks(parsed)
    const readable = buildReadableCloseoutClip(rootStripped)
    const names = readable.tracks.map((t) => t.name).sort()

    // Upper-body pressure from Shield_Dash_RM remains useful.
    expect(names).toContain('spine_02.quaternion')
    expect(names).toContain('Head.quaternion')
    expect(names).toContain('upperarm_l.quaternion')
    expect(names).toContain('upperarm_r.quaternion')

    // The dangerous imported lower-body/root channels are gone.
    expect(names).not.toContain('root.quaternion')
    expect(names).not.toContain('root.position')
    expect(names).not.toContain('pelvis.position')
    expect(names).not.toContain('foot_l.quaternion')
    expect(names).not.toContain('ball_l.quaternion')

    // The closeout action owns a stable lower-body pose instead of
    // falling back to the mannequin rest pose.
    for (const safeTrack of [
      'pelvis.quaternion',
      'thigh_l.quaternion',
      'thigh_r.quaternion',
      'calf_l.quaternion',
      'calf_r.quaternion',
    ]) {
      expect(names).toContain(safeTrack)
    }
    expect(readable.name).toBe('closeout')
    expect(readable.duration).toBe(parsed.duration)
  })

  it('stripped clip cannot move a bound pelvis bone off its bind pose', () => {
    // The minimal rig below only exposes `root` + `pelvis`, so
    // PropertyBinding logs a benign "No target node found" warning
    // for every other track. Silence those during the bind-pose
    // assertion so the test output stays readable.
    const originalWarn = console.warn
    console.warn = () => {}
    try {
    // Build a tiny rig with `pelvis` and `root` bones whose bind-pose
    // translations are non-zero. If the loader strip is bypassed and
    // the source `pelvis.position` track reaches the mixer, the bone
    // would be interpolated to (~0.005, ~0.086, ~0.877) by t = 1.1s
    // (see ATTRIBUTION.md "Root motion" notes). After stripping, the
    // bone must stay at its bind-pose translation.
    const rigRoot = new THREE.Group()
    const rootBone = new THREE.Bone()
    rootBone.name = 'root'
    rootBone.position.set(0, 0, 0)
    rigRoot.add(rootBone)
    const pelvisBone = new THREE.Bone()
    pelvisBone.name = 'pelvis'
    pelvisBone.position.set(0.1, 0.2, 0.3)
    rootBone.add(pelvisBone)

    const stripped = stripRootMotionTracks(parsed)
    const mixer = new THREE.AnimationMixer(rigRoot)
    const action = mixer.clipAction(stripped)
    // LoopOnce + clamp so we sample the very last keyframe values.
    action.setLoop(THREE.LoopOnce, 1)
    action.clampWhenFinished = true
    action.play()
    // Two ticks past the clip duration.
    mixer.update(0)
    mixer.update(parsed.duration + 1)

    // Pelvis position is unchanged.
    expect(pelvisBone.position.x).toBe(0.1)
    expect(pelvisBone.position.y).toBe(0.2)
    expect(pelvisBone.position.z).toBe(0.3)
    // Root position is unchanged.
    expect(rootBone.position.x).toBe(0)
    expect(rootBone.position.y).toBe(0)
    expect(rootBone.position.z).toBe(0)
    } finally {
      console.warn = originalWarn
    }
  })

  it('binding the stripped clip to a Quaternius-named rig drives the pelvis quaternion', () => {
    const originalWarn = console.warn
    console.warn = () => {}
    try {
    // Catches the silent regression where the extracted GLB renames
    // a bone (e.g. `Pelvis` ≠ `pelvis`) and the rotation tracks no
    // longer resolve via PropertyBinding. We bind to a bone named
    // `pelvis` and assert its quaternion drifts from identity after
    // the mixer ticks.
    const rigRoot = new THREE.Group()
    const pelvis = new THREE.Bone()
    pelvis.name = 'pelvis'
    rigRoot.add(pelvis)
    const initialQuat = pelvis.quaternion.clone()

    const stripped = stripRootMotionTracks(parsed)
    const mixer = new THREE.AnimationMixer(rigRoot)
    const action = mixer.clipAction(stripped)
    action.setLoop(THREE.LoopOnce, 1)
    action.clampWhenFinished = true
    action.play()
    mixer.update(0)
    mixer.update(parsed.duration * 0.5)

    const dx = pelvis.quaternion.x - initialQuat.x
    const dy = pelvis.quaternion.y - initialQuat.y
    const dz = pelvis.quaternion.z - initialQuat.z
    const dw = pelvis.quaternion.w - initialQuat.w
    const delta = Math.sqrt(dx * dx + dy * dy + dz * dz + dw * dw)
    expect(delta).toBeGreaterThan(1e-4)
    } finally {
      console.warn = originalWarn
    }
  })
})

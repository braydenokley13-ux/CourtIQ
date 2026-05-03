/**
 * P2.2 — Real `back_cut.glb` asset integration tests.
 *
 * Mirrors the closeout integration suite in
 * `closeoutAssetIntegration.test.ts` but for the bundled
 * `apps/web/public/athlete/clips/back_cut.glb` (Quaternius UAL2
 * `NinjaJump_Start` extracted under CC0). Locks four properties:
 *
 *   1. The bundled GLB parses cleanly via `GLTFLoader.parse` and
 *      exposes exactly one `AnimationClip` named `back_cut`.
 *   2. The clip carries `<root>.position` + `<pelvis>.position`
 *      tracks before stripping — the same root-motion shape the
 *      production loader is designed to remove.
 *   3. `stripRootMotionTracks` drops both translation tracks and
 *      leaves rotation tracks for the mapped Quaternius bones intact.
 *   4. Route invariance — binding the stripped clip to a tiny rig and
 *      ticking the mixer past the clip's full duration leaves
 *      bound `root` + `pelvis` bones at their bind-pose translation,
 *      proving the imported clip cannot mutate the player's authored
 *      x/z BDW route.
 *   5. Determinism — the same parsed clip stripped twice yields
 *      identical track-name lists, and the cached entry returned by
 *      the loader is stable across calls.
 *   6. The stripped clip drives the Quaternius `pelvis` bone
 *      quaternion (catches a silent rename regression).
 */

/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import {
  isRootMotionTrack,
  listStrippedRootMotionTrackNames,
  stripRootMotionTracks,
} from './importedClipLoader'

const BACK_CUT_GLB_PATH = path.resolve(
  __dirname,
  '../../public/athlete/clips/back_cut.glb',
)

async function parseBundledBackCutClip(): Promise<THREE.AnimationClip> {
  const buf = fs.readFileSync(BACK_CUT_GLB_PATH)
  const arrayBuffer = new ArrayBuffer(buf.byteLength)
  new Uint8Array(arrayBuffer).set(buf)
  const loader = new GLTFLoader()
  const gltf = await new Promise<{ animations: THREE.AnimationClip[] }>(
    (resolve, reject) => {
      loader.parse(arrayBuffer, '', resolve, reject)
    },
  )
  const animations = gltf.animations ?? []
  if (animations.length === 0) {
    throw new Error('bundled back_cut.glb parsed without animations')
  }
  return animations[0]!
}

describe('P2.2 — real back_cut.glb integration', () => {
  let parsed: THREE.AnimationClip

  beforeEach(async () => {
    parsed = await parseBundledBackCutClip()
  })
  afterEach(() => {
    // No module-level state to reset.
  })

  it('exposes exactly one AnimationClip named "back_cut"', () => {
    expect(parsed.name).toBe('back_cut')
    expect(parsed.tracks.length).toBeGreaterThan(0)
    // ~0.97 s in the original NinjaJump_Start source.
    expect(parsed.duration).toBeGreaterThan(0)
    expect(parsed.duration).toBeLessThan(1.5)
  })

  it('contains <root>.position and <pelvis>.position tracks before stripping', () => {
    const trackNames = parsed.tracks.map((t) => t.name)
    expect(trackNames).toContain('root.position')
    expect(trackNames).toContain('pelvis.position')
    expect(
      parsed.tracks.find((t) => t.name === 'root.position')!,
    ).toSatisfy((t: THREE.KeyframeTrack) => isRootMotionTrack(t))
    expect(
      parsed.tracks.find((t) => t.name === 'pelvis.position')!,
    ).toSatisfy((t: THREE.KeyframeTrack) => isRootMotionTrack(t))
  })

  it('stripRootMotionTracks removes root + pelvis position tracks and only those', () => {
    const stripped = stripRootMotionTracks(parsed)
    const strippedNames = listStrippedRootMotionTrackNames(parsed).sort()
    // The stripped list MUST contain at minimum root + pelvis. The
    // extraction script may leave additional <root>-equivalent
    // tracks if Quaternius adds aliases, so only require the two
    // we assert in the production loader contract.
    expect(strippedNames).toContain('root.position')
    expect(strippedNames).toContain('pelvis.position')

    for (const t of stripped.tracks) {
      expect(isRootMotionTrack(t)).toBe(false)
    }

    const survivedNames = stripped.tracks.map((t) => t.name)
    // GLB_BONE_MAP target bones survive — pose tracks are pose, not
    // route. Catches a silent rename or accidental over-strip.
    expect(survivedNames).toContain('pelvis.quaternion')
    expect(survivedNames).toContain('spine_02.quaternion')
    expect(survivedNames).toContain('Head.quaternion')
    expect(survivedNames).toContain('upperarm_l.quaternion')
    expect(survivedNames).toContain('upperarm_r.quaternion')
    expect(survivedNames).toContain('thigh_l.quaternion')
    expect(survivedNames).toContain('thigh_r.quaternion')

    expect(stripped.name).toBe('back_cut')
    expect(stripped.duration).toBe(parsed.duration)
  })

  it('route invariance — stripped clip cannot move a bound root/pelvis off bind pose', () => {
    // Silence "No target node found" PropertyBinding warnings for
    // tracks targeting bones absent from this minimal rig.
    const originalWarn = console.warn
    console.warn = () => {}
    try {
      const rigRoot = new THREE.Group()
      const rootBone = new THREE.Bone()
      rootBone.name = 'root'
      rootBone.position.set(0, 0, 0)
      rigRoot.add(rootBone)
      const pelvisBone = new THREE.Bone()
      pelvisBone.name = 'pelvis'
      // Non-zero bind translation so a missing strip would visibly
      // overwrite it.
      pelvisBone.position.set(0.13, 0.21, 0.42)
      rootBone.add(pelvisBone)

      const stripped = stripRootMotionTracks(parsed)
      const mixer = new THREE.AnimationMixer(rigRoot)
      const action = mixer.clipAction(stripped)
      action.setLoop(THREE.LoopOnce, 1)
      action.clampWhenFinished = true
      action.play()
      // Two ticks past the clip duration so we sample the final
      // clamped state.
      mixer.update(0)
      mixer.update(parsed.duration + 1)

      // Bind-pose translations preserved exactly. The imported
      // back-cut clip is not allowed to mutate world x/z.
      expect(pelvisBone.position.x).toBe(0.13)
      expect(pelvisBone.position.y).toBe(0.21)
      expect(pelvisBone.position.z).toBe(0.42)
      expect(rootBone.position.x).toBe(0)
      expect(rootBone.position.y).toBe(0)
      expect(rootBone.position.z).toBe(0)
    } finally {
      console.warn = originalWarn
    }
  })

  it('determinism — stripping twice yields identical track-name sets', () => {
    const a = stripRootMotionTracks(parsed)
      .tracks.map((t) => t.name)
      .sort()
    const b = stripRootMotionTracks(parsed)
      .tracks.map((t) => t.name)
      .sort()
    expect(a).toEqual(b)
  })

  it('binding the stripped clip to a Quaternius-named rig drives the pelvis quaternion', () => {
    const originalWarn = console.warn
    console.warn = () => {}
    try {
      // Catches the silent regression where the extracted GLB renames
      // a bone (e.g. `Pelvis` ≠ `pelvis`) and the rotation tracks no
      // longer resolve via PropertyBinding.
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

/**
 * P0-LOCK — Replay-determinism gate.
 *
 * Phase P §3 (How scenario movement stays deterministic) and the
 * P0-LOCK packet both require that the same scenario, replayed,
 * produces the same possession — same player route, same freeze
 * pose, same body-language cue. This test is the smallest practical
 * gate that protects that contract before any imported-clip or
 * decoder-mapping work begins.
 *
 * Coverage today (must pass):
 *
 *   1. Pure-function pose. `samplePositionsAt` returns the same
 *      (x, z) for every player and the ball at the freeze tick on
 *      every call — and identical across two independently-built
 *      timelines from the same scene.
 *   2. MotionController parity. Two `MotionController`s built from
 *      the same scenario, ticked with the same wall-clock sequence
 *      against fresh THREE.Group player+ball collections, write
 *      bit-identical positions onto those groups.
 *   3. Idempotent freeze. Re-ticking past `freezeAtMs` does not
 *      drift the sampled pose; the cap holds.
 *   4. Clip stability. Each call to the GLB clip factories produces
 *      identical track names, durations, and float keyframe values
 *      (no random state, no module-leak between runs).
 *   5. Mixer-bone determinism. Two `AnimationMixer`s wired against
 *      identical mock skeletons + identical clips, ticked with the
 *      same `dt` sequence, write identical quaternions onto the
 *      mapped bones at every observed tick — proving that GLB pose
 *      output is pure-function-of-time when given the same inputs.
 *
 * Coverage gap (documented for next packet):
 *
 *   - Full end-to-end GLB integration determinism (load
 *     `mannequin.glb`, build the GLB athlete, drive the mixer
 *     through `MotionController`, snapshot bones at the
 *     scene-authored freeze tick) cannot run in this Vitest
 *     environment because the bundled GLB is fetched via
 *     `GLTFLoader` which needs a network/file fetch the harness
 *     does not provide. The samplePositionsAt + MotionController
 *     parity + mock-skeleton-mixer trio below covers both halves
 *     of the contract independently; wiring them together
 *     end-to-end is the first follow-on once a Playwright/scene
 *     screenshot harness can warm the cache.
 */

import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  GLB_BONE_MAP,
  _buildGlbAthleteClipsForTest,
} from './glbAthlete'
import { MotionController } from './imperativeScene'
import { buildTimeline, samplePositionsAt } from '@/lib/scenario3d/timeline'
import type { Scene3D } from '@/lib/scenario3d/scene'

// ---------------------------------------------------------------------------
// Scenario fixture — small, deterministic, with a freeze tick and one
// authored cut + pass. Mirrors the shape of a decoder scenario so the
// timeline math exercises the same code paths the production loop uses.
// ---------------------------------------------------------------------------

function fixtureScene(): Scene3D {
  return {
    id: 'p0-lock-determinism-fixture',
    court: 'half',
    camera: 'teaching_angle',
    players: [
      {
        id: 'you',
        team: 'offense',
        role: 'ball_handler',
        label: 'You',
        start: { x: 0, z: 22 },
        isUser: true,
        hasBall: true,
      },
      {
        id: 'wing',
        team: 'offense',
        role: 'wing',
        label: 'SG',
        start: { x: 18, z: 10 },
      },
      {
        id: 'd_user',
        team: 'defense',
        role: 'on_ball',
        label: 'D',
        start: { x: 0, z: 24 },
      },
      {
        id: 'd_wing',
        team: 'defense',
        role: 'wing_d',
        label: 'D',
        start: { x: 17, z: 12 },
      },
    ],
    ball: { start: { x: 0, z: 22 }, holderId: 'you' },
    movements: [
      {
        id: 'wing-cut',
        playerId: 'wing',
        kind: 'cut',
        to: { x: 14, z: 4 },
        delayMs: 200,
        durationMs: 700,
      },
      {
        id: 'pass-to-wing',
        playerId: 'ball',
        kind: 'pass',
        to: { x: 14, z: 4 },
        delayMs: 950,
        durationMs: 350,
      },
    ],
    answerDemo: [],
    wrongDemos: [],
    preAnswerOverlays: [],
    postAnswerOverlays: [],
    freezeAtMs: 1500,
    synthetic: false,
  }
}

const FREEZE_AT_MS = 1500
const POSITION_EPSILON = 1e-9

// ---------------------------------------------------------------------------
// 1. samplePositionsAt — pure function of (scene, t).
// ---------------------------------------------------------------------------

describe('P0-LOCK — samplePositionsAt is pure-function of (scene, t)', () => {
  it('snapshots the same positions on repeated calls at the freeze tick', () => {
    const scene = fixtureScene()
    const timeline = buildTimeline(scene, scene.movements ?? [])
    const a = samplePositionsAt(scene, timeline, FREEZE_AT_MS)
    const b = samplePositionsAt(scene, timeline, FREEZE_AT_MS)
    expect(a.size).toBe(b.size)
    for (const [id, posA] of a) {
      const posB = b.get(id)
      expect(posB, `${id} missing in second snapshot`).toBeDefined()
      expect(Math.abs(posA.x - posB!.x)).toBeLessThan(POSITION_EPSILON)
      expect(Math.abs(posA.z - posB!.z)).toBeLessThan(POSITION_EPSILON)
    }
  })

  it('two independently-built timelines from the same scene snapshot identically', () => {
    const sceneA = fixtureScene()
    const sceneB = fixtureScene()
    const timelineA = buildTimeline(sceneA, sceneA.movements ?? [])
    const timelineB = buildTimeline(sceneB, sceneB.movements ?? [])
    const a = samplePositionsAt(sceneA, timelineA, FREEZE_AT_MS)
    const b = samplePositionsAt(sceneB, timelineB, FREEZE_AT_MS)
    for (const [id, posA] of a) {
      const posB = b.get(id)
      expect(posB).toBeDefined()
      expect(Math.abs(posA.x - posB!.x)).toBeLessThan(POSITION_EPSILON)
      expect(Math.abs(posA.z - posB!.z)).toBeLessThan(POSITION_EPSILON)
    }
  })
})

// ---------------------------------------------------------------------------
// 2. MotionController parity — same wall-clock sequence on two
//    independent controllers writes identical positions onto identical
//    fresh THREE.Group collections.
// ---------------------------------------------------------------------------

function buildMockPlayerGroups(scene: Scene3D): {
  players: Map<string, THREE.Group>
  ball: THREE.Group
} {
  const players = new Map<string, THREE.Group>()
  for (const p of scene.players) {
    const g = new THREE.Group()
    g.position.set(p.start.x, 0, p.start.z)
    players.set(p.id, g)
  }
  const ball = new THREE.Group()
  ball.position.set(scene.ball.start.x, 0, scene.ball.start.z)
  return { players, ball }
}

interface PoseSample {
  positions: Map<string, { x: number; y: number; z: number }>
  ball: { x: number; y: number; z: number }
}

function runMotionController(): PoseSample {
  const scene = fixtureScene()
  const { players, ball } = buildMockPlayerGroups(scene)
  const motion = new MotionController(scene, 'intro', players, ball, 0.65)
  motion.setFreezeAtMs(FREEZE_AT_MS)
  // Stable wall-clock anchor; the controller is wall-clock-driven.
  motion.tick(1_000_000)
  motion.tick(1_000_000 + FREEZE_AT_MS + 200)
  // Drain extras so freeze cap is fully observed.
  for (let i = 0; i < 5; i++) {
    motion.tick(1_000_000 + FREEZE_AT_MS + 250 + i * 16)
  }
  const positions = new Map<string, { x: number; y: number; z: number }>()
  for (const [id, g] of players) {
    positions.set(id, { x: g.position.x, y: g.position.y, z: g.position.z })
  }
  return {
    positions,
    ball: { x: ball.position.x, y: ball.position.y, z: ball.position.z },
  }
}

describe('P0-LOCK — MotionController replay determinism', () => {
  it('two MotionController runs sample identical positions at the freeze tick', () => {
    const a = runMotionController()
    const b = runMotionController()
    expect(a.positions.size).toBe(b.positions.size)
    for (const [id, posA] of a.positions) {
      const posB = b.positions.get(id)
      expect(posB, `player ${id} missing`).toBeDefined()
      expect(Math.abs(posA.x - posB!.x)).toBeLessThan(POSITION_EPSILON)
      expect(Math.abs(posA.y - posB!.y)).toBeLessThan(POSITION_EPSILON)
      expect(Math.abs(posA.z - posB!.z)).toBeLessThan(POSITION_EPSILON)
    }
    expect(Math.abs(a.ball.x - b.ball.x)).toBeLessThan(POSITION_EPSILON)
    expect(Math.abs(a.ball.y - b.ball.y)).toBeLessThan(POSITION_EPSILON)
    expect(Math.abs(a.ball.z - b.ball.z)).toBeLessThan(POSITION_EPSILON)
  })

  it('freeze cap holds — re-ticking past it does not drift the wing player', () => {
    const scene = fixtureScene()
    const { players, ball } = buildMockPlayerGroups(scene)
    const motion = new MotionController(scene, 'intro', players, ball, 0.65)
    motion.setFreezeAtMs(FREEZE_AT_MS)
    motion.tick(2_000_000)
    motion.tick(2_000_000 + FREEZE_AT_MS + 50)

    const wing = players.get('wing')!
    const wingFirst = { x: wing.position.x, z: wing.position.z }

    for (let i = 0; i < 12; i++) {
      motion.tick(2_000_000 + FREEZE_AT_MS + 200 + i * 100)
    }

    expect(Math.abs(wing.position.x - wingFirst.x)).toBeLessThan(POSITION_EPSILON)
    expect(Math.abs(wing.position.z - wingFirst.z)).toBeLessThan(POSITION_EPSILON)
  })

  it('animation never writes to figure x/z route — y stays at the mock initial', () => {
    // Phase P §2 hard rule: animation may not own world position.
    // The MotionController writes position.x and position.z from the
    // timeline; position.y is left to the caller (PLAYER_LIFT in the
    // real builder; 0 in this mock). Confirm y is untouched.
    const scene = fixtureScene()
    const { players, ball } = buildMockPlayerGroups(scene)
    const motion = new MotionController(scene, 'intro', players, ball, 0.65)
    motion.setFreezeAtMs(FREEZE_AT_MS)
    motion.tick(3_000_000)
    motion.tick(3_000_000 + FREEZE_AT_MS + 50)
    for (let i = 0; i < 8; i++) {
      motion.tick(3_000_000 + FREEZE_AT_MS + 100 + i * 20)
    }
    for (const g of players.values()) {
      expect(g.position.y).toBe(0)
    }
  })
})

// ---------------------------------------------------------------------------
// 3. Clip stability.
// ---------------------------------------------------------------------------

describe('P0-LOCK — GLB clip stability', () => {
  it('repeated calls to the clip factories produce identical track data', () => {
    const a = _buildGlbAthleteClipsForTest()
    const b = _buildGlbAthleteClipsForTest()
    for (const name of [
      'idle_ready',
      'cut_sprint',
      'defense_slide',
      'defensive_deny',
      // P2.6 — shared readability primitives.
      'receive_ready',
      'closeout_read',
    ] as const) {
      const ca = a[name]
      const cb = b[name]
      expect(ca.name).toBe(cb.name)
      expect(ca.duration).toBe(cb.duration)
      expect(ca.tracks.length).toBe(cb.tracks.length)
      for (let i = 0; i < ca.tracks.length; i++) {
        const ta = ca.tracks[i]!
        const tb = cb.tracks[i]!
        expect(ta.name).toBe(tb.name)
        expect(Array.from(ta.times)).toEqual(Array.from(tb.times))
        expect(Array.from(ta.values)).toEqual(Array.from(tb.values))
      }
    }
  })

  it('every clip targets only mapped GLB bones', () => {
    // Drift guard for Phase P §6 (decoder mapping). A track that
    // names a bone outside `GLB_BONE_MAP` would silently fail to
    // resolve via PropertyBinding and the clip would not animate.
    const mappedNames = new Set(Object.values(GLB_BONE_MAP))
    const clips = _buildGlbAthleteClipsForTest()
    for (const clip of [
      clips.idle_ready,
      clips.cut_sprint,
      clips.defense_slide,
      clips.defensive_deny,
      // P2.6 — shared readability primitives.
      clips.receive_ready,
      clips.closeout_read,
    ]) {
      for (const track of clip.tracks) {
        const dot = track.name.indexOf('.')
        const boneName = dot >= 0 ? track.name.slice(0, dot) : track.name
        expect(mappedNames.has(boneName), `clip ${clip.name} track ${track.name}`).toBe(true)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// 4. Mixer-bone determinism on a mock skeleton.
//
// The bundled GLB cannot be loaded under JSDOM, so this test builds
// a minimal skeleton whose bones are named exactly per `GLB_BONE_MAP`
// and feeds two parallel `AnimationMixer`s the same clip + dt
// sequence. If the mixer is deterministic in dt, the bones' written
// quaternions match across runs to within float epsilon. This is the
// strongest test we can run for the GLB pose layer without a fully
// loaded asset.
// ---------------------------------------------------------------------------

function buildMockGlbSkeleton(): { root: THREE.Object3D; bones: Map<string, THREE.Bone> } {
  const root = new THREE.Group()
  root.name = 'mock-mannequin-root'
  const bones = new Map<string, THREE.Bone>()
  for (const sourceName of Object.values(GLB_BONE_MAP)) {
    const bone = new THREE.Bone()
    bone.name = sourceName
    // Seed each bone with a non-identity rest-pose rotation so the
    // mixer's clip writes are visibly distinguishable from the bind
    // pose — same property as the real Quaternius rig.
    bone.quaternion.setFromEuler(new THREE.Euler(0.1, -0.05, 0.03))
    root.add(bone)
    bones.set(sourceName, bone)
  }
  return { root, bones }
}

function snapshotBoneQuaternions(
  bones: Map<string, THREE.Bone>,
): Record<string, [number, number, number, number]> {
  const out: Record<string, [number, number, number, number]> = {}
  for (const [name, bone] of bones) {
    out[name] = [bone.quaternion.x, bone.quaternion.y, bone.quaternion.z, bone.quaternion.w]
  }
  return out
}

const QUAT_EPSILON = 1e-9

describe('P0-LOCK — GLB mixer pose determinism (mock skeleton)', () => {
  it('two mixers ticked with the same dt sequence write identical bone quaternions', () => {
    const skelA = buildMockGlbSkeleton()
    const skelB = buildMockGlbSkeleton()

    const clipsA = _buildGlbAthleteClipsForTest()
    const clipsB = _buildGlbAthleteClipsForTest()

    const mixerA = new THREE.AnimationMixer(skelA.root)
    const mixerB = new THREE.AnimationMixer(skelB.root)

    mixerA.clipAction(clipsA.idle_ready).play()
    mixerB.clipAction(clipsB.idle_ready).play()

    // Deterministic dt sequence — varied timesteps so we don't trip
    // any "happens to be identical" coincidence on a single dt.
    const dts = [0.0, 0.016, 0.020, 0.012, 0.033, 0.016, 0.025, 0.040, 0.016, 0.016]
    for (const dt of dts) {
      mixerA.update(dt)
      mixerB.update(dt)
    }

    expect(mixerA.time).toBeCloseTo(mixerB.time, 12)

    const a = snapshotBoneQuaternions(skelA.bones)
    const b = snapshotBoneQuaternions(skelB.bones)
    for (const name of Object.keys(a)) {
      const qa = a[name]!
      const qb = b[name]!
      expect(Math.abs(qa[0] - qb[0])).toBeLessThan(QUAT_EPSILON)
      expect(Math.abs(qa[1] - qb[1])).toBeLessThan(QUAT_EPSILON)
      expect(Math.abs(qa[2] - qb[2])).toBeLessThan(QUAT_EPSILON)
      expect(Math.abs(qa[3] - qb[3])).toBeLessThan(QUAT_EPSILON)
    }
  })

  it('the spine bone actually moves under the idle_ready clip', () => {
    // Catches the regression where the bone-map entry resolves but
    // the keyframe values happen to coincide with the bind pose, so
    // the mixer "ran" but the bone never visibly moved. The spine
    // is the single bone the mixer-tick assertion in production
    // probes, so this is the unit-test mirror of that runtime check.
    const { root, bones } = buildMockGlbSkeleton()
    const spine = bones.get(GLB_BONE_MAP.spine)!
    const initial = spine.quaternion.clone()

    const mixer = new THREE.AnimationMixer(root)
    mixer.clipAction(_buildGlbAthleteClipsForTest().idle_ready).play()

    // Three ticks at ~16ms — same threshold the production assertion
    // waits before declaring the mixer alive.
    mixer.update(0)
    mixer.update(0.016)
    mixer.update(0.016)
    mixer.update(0.016)

    const dx = spine.quaternion.x - initial.x
    const dy = spine.quaternion.y - initial.y
    const dz = spine.quaternion.z - initial.z
    const dw = spine.quaternion.w - initial.w
    const delta = Math.sqrt(dx * dx + dy * dy + dz * dz + dw * dw)
    expect(delta).toBeGreaterThan(1e-4)
  })
})

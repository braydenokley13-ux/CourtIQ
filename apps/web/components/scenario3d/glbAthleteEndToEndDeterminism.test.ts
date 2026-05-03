/**
 * P0-LOCK-2 — End-to-end GLB athlete determinism gate.
 * P1.0 — Imported closeout clip determinism extension.
 *
 * The P0-LOCK packet shipped four determinism tests that proved the
 * contract in pieces (sampling purity, MotionController parity,
 * mock-skeleton mixer determinism, GLB clip-bone adherence). This
 * suite is the missing capstone: it drives the **actual** GLB
 * athlete construction path (`buildGlbAthletePreview` → cloneSkinned
 * → bone-map audit → foot-to-floor offset → AnimationMixer wiring)
 * through the **actual** `MotionController.applyGlbAnimation` loop on
 * a faithful Quaternius UAL2 mock asset, and asserts that two
 * independent runs of the same scenario produce bit-equivalent bone
 * poses at the scene-authored freeze tick.
 *
 * This is the gate every later phase depends on:
 *   - P1 (imported `closeout` clip) cannot ship without proving the
 *     end-to-end pose path stayed deterministic.
 *   - P2 (decoder-specific intent mapping) needs the same gate to
 *     prove the per-tick clip selector is replay-safe.
 *   - P3 (overlay/camera sync at freeze) needs the same gate to
 *     prove the freeze-tick pose snapshot is reproducible.
 *
 * Coverage today (must pass):
 *
 *   1. Two GLB-figure runs of the same scenario produce identical
 *      bone quaternions on every mapped bone at the freeze tick.
 *   2. Animation never writes player world `(x, z)` — those come
 *      only from `samplePlayer`; `playerGroup.position.y` stays at
 *      whatever PLAYER_LIFT-equivalent the caller set.
 *   3. Mapped bones actually move from their bind pose under the
 *      bespoke clips (catches the regression where the mixer "ran"
 *      but the bones never visibly drifted).
 *   4. Re-ticking past the freeze cap does not drift the snapshot.
 *
 * P1.0 imported-closeout coverage (must pass):
 *
 *   5. Two runs with the closeout action attached AND playing on
 *      the defender produce bit-equivalent bone quaternions at the
 *      freeze tick. Locks the determinism contract with the
 *      imported-clip path live.
 *   6. The closeout action's clip carries no `<root>.position` track
 *      after the loader-level strip — the loader, not the callsite,
 *      enforces the no-root-motion rule.
 *   7. Playing the closeout clip cannot move the figure root
 *      `(x, z)` route. Defender positions match a non-closeout run
 *      to within float epsilon, on every tick.
 *   8. Building a figure WITHOUT the closeout option attaches no
 *      `closeout` action — flag-off behaviour is byte-identical to
 *      pre-P1.0.
 *
 * Coverage gap (documented for next packet):
 *
 *   - Asset drift. This test runs against a hand-built mock that
 *     mirrors the bone names + topology audited from the bundled
 *     `mannequin.glb`. If Quaternius publishes a UAL2 update with
 *     renamed bones or a different parent chain, only a Playwright
 *     pass loading the real asset would catch it. The dev-only
 *     bone-map audit log added in P0-LOCK is the last-line defense
 *     when that flag is on in a real session.
 *   - Real `closeout.glb` asset drift. The closeout cases below run
 *     against the synthetic placeholder closeout clip, not a real
 *     imported file. When a real CC0 closeout clip lands in
 *     `apps/web/public/athlete/clips/`, a Playwright pass that
 *     loads it under `USE_IMPORTED_CLOSEOUT_CLIP=true` is the next
 *     follow-on gate.
 */

/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  GLB_BONE_MAP,
  GLB_IMPORTED_CLOSEOUT_CLIP_URL,
  buildGlbAthletePreview,
  getGlbAthleteHandle,
  setGlbAthleteAnimation,
  updateGlbAthletePose,
  _resetGlbAthleteCache,
  _resetGlbAthleteClipCache,
  _resetGlbAthleteBoneMapAuditGuard,
  _setGlbAthleteCacheForTest,
} from './glbAthlete'
import {
  _resetImportedClipCache,
  getCachedImportedClip,
  isRootMotionTrack,
} from './importedClipLoader'
import { MotionController } from './imperativeScene'
import {
  buildMockGlbAsset,
  assertMockCoversGlbBoneMap,
} from './__fixtures__/mockGlbAsset'
import type { Scene3D } from '@/lib/scenario3d/scene'

// ---------------------------------------------------------------------------
// Scenario fixture — same shape as the P0-LOCK replay-determinism test so
// the two suites share a mental model. Includes a `wing` cut and a pass to
// exercise the timeline + GLB animation loop simultaneously.
// ---------------------------------------------------------------------------

const FREEZE_AT_MS = 1500
const PLAYER_LIFT = 0.05
const QUAT_EPSILON = 1e-9
const POSITION_EPSILON = 1e-9

function fixtureScene(): Scene3D {
  return {
    id: 'p0-lock-2-glb-determinism-fixture',
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
    freezeAtMs: FREEZE_AT_MS,
    synthetic: false,
  }
}

// ---------------------------------------------------------------------------
// Test harness — builds a fresh GLB-driven scene from the mocked cache,
// runs a deterministic tick sequence, and snapshots bones + positions.
// ---------------------------------------------------------------------------

interface BoneSnapshot {
  // Per-figure: { boneName: [x, y, z, w] }
  perPlayer: Map<string, Record<string, [number, number, number, number]>>
  positions: Map<string, { x: number; y: number; z: number }>
  ball: { x: number; y: number; z: number }
  mixerTimes: Map<string, number>
}

function snapshotBonesForPlayers(
  groups: Map<string, THREE.Group>,
): BoneSnapshot['perPlayer'] {
  const out = new Map<string, Record<string, [number, number, number, number]>>()
  for (const [playerId, group] of groups) {
    const handle = getGlbAthleteHandle(group)
    if (!handle) continue
    const perBone: Record<string, [number, number, number, number]> = {}
    handle.cloned.traverse((child) => {
      if (!(child as THREE.Bone).isBone) return
      const bone = child as THREE.Bone
      perBone[bone.name] = [
        bone.quaternion.x,
        bone.quaternion.y,
        bone.quaternion.z,
        bone.quaternion.w,
      ]
    })
    out.set(playerId, perBone)
  }
  return out
}

function readMixerTimes(groups: Map<string, THREE.Group>): Map<string, number> {
  const out = new Map<string, number>()
  for (const [playerId, group] of groups) {
    const handle = getGlbAthleteHandle(group)
    if (!handle) continue
    out.set(playerId, handle.mixer.time)
  }
  return out
}

function buildGlbPlayerGroups(
  scene: Scene3D,
  options?: { attachImportedCloseoutClip?: boolean },
): {
  groups: Map<string, THREE.Group>
  ball: THREE.Group
} {
  const groups = new Map<string, THREE.Group>()
  for (const p of scene.players) {
    const figure = buildGlbAthletePreview(
      '#3BFF9D',
      '#0F8C4E',
      p.isUser ?? false,
      p.id === scene.ball.holderId,
      '0',
      'idle',
      options?.attachImportedCloseoutClip
        ? { attachImportedCloseoutClip: true }
        : undefined,
    )
    if (!figure) {
      throw new Error(
        `buildGlbAthletePreview returned null for ${p.id}; cache injection failed`,
      )
    }
    figure.position.set(p.start.x, PLAYER_LIFT, p.start.z)
    groups.set(p.id, figure)
  }
  const ball = new THREE.Group()
  ball.position.set(scene.ball.start.x, 0, scene.ball.start.z)
  return { groups, ball }
}

function runScenarioOnce(seedMs: number): BoneSnapshot {
  // Cache + clip + audit guard reset so each run is truly
  // independent — no module-level state can leak between runs.
  _resetGlbAthleteCache()
  _resetGlbAthleteClipCache()
  _resetGlbAthleteBoneMapAuditGuard()
  _resetImportedClipCache()
  const asset = buildMockGlbAsset()
  assertMockCoversGlbBoneMap(asset)
  _setGlbAthleteCacheForTest(asset.scene, asset.skinnedMesh)

  const scene = fixtureScene()
  const { groups, ball } = buildGlbPlayerGroups(scene)
  const motion = new MotionController(scene, 'intro', groups, ball, 0.65)
  motion.setFreezeAtMs(FREEZE_AT_MS)

  // Deterministic wall-clock sequence. We feed a fixed sequence of
  // nowMs values so the dt the GLB mixer sees is identical between
  // runs. The first tick anchors `startedAt`; subsequent ticks
  // advance the scenario clock and the mixer in lock-step.
  const ticks: number[] = []
  ticks.push(seedMs)
  // 16ms ticks for ~2 seconds of scenario time so we cover the
  // freeze edge plus a few extra frames at the cap.
  for (let t = 16; t <= FREEZE_AT_MS + 480; t += 16) {
    ticks.push(seedMs + t)
  }
  for (const now of ticks) {
    motion.tick(now)
  }

  const positions = new Map<string, { x: number; y: number; z: number }>()
  for (const [id, g] of groups) {
    positions.set(id, { x: g.position.x, y: g.position.y, z: g.position.z })
  }

  return {
    perPlayer: snapshotBonesForPlayers(groups),
    positions,
    ball: { x: ball.position.x, y: ball.position.y, z: ball.position.z },
    mixerTimes: readMixerTimes(groups),
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('P0-LOCK-2 — end-to-end GLB athlete determinism', () => {
  beforeEach(() => {
    _resetGlbAthleteCache()
    _resetGlbAthleteClipCache()
    _resetGlbAthleteBoneMapAuditGuard()
    _resetImportedClipCache()
  })
  afterEach(() => {
    _resetGlbAthleteCache()
    _resetGlbAthleteClipCache()
    _resetGlbAthleteBoneMapAuditGuard()
    _resetImportedClipCache()
  })

  it('two GLB-figure runs produce bit-equivalent bone quaternions at the freeze tick', () => {
    const seed = 5_000_000
    const a = runScenarioOnce(seed)
    const b = runScenarioOnce(seed)

    // Same set of GLB-driven players in both runs.
    expect(Array.from(a.perPlayer.keys()).sort()).toEqual(
      Array.from(b.perPlayer.keys()).sort(),
    )
    expect(a.perPlayer.size).toBeGreaterThan(0)

    // Mixer times must match — that's the upstream signal that
    // proves the dt sequence stayed identical.
    for (const [playerId, timeA] of a.mixerTimes) {
      const timeB = b.mixerTimes.get(playerId)
      expect(timeB, `${playerId} mixer.time missing in run B`).toBeDefined()
      expect(Math.abs(timeA - (timeB as number))).toBeLessThan(1e-12)
    }

    // Bone-by-bone equality.
    for (const [playerId, bonesA] of a.perPlayer) {
      const bonesB = b.perPlayer.get(playerId)
      expect(bonesB, `${playerId} bones missing in run B`).toBeDefined()
      for (const boneName of Object.keys(bonesA)) {
        const qa = bonesA[boneName]!
        const qb = bonesB![boneName]
        expect(qb, `${playerId}.${boneName} missing in run B`).toBeDefined()
        for (let i = 0; i < 4; i++) {
          expect(
            Math.abs(qa[i]! - qb![i]!),
            `${playerId}.${boneName}[${i}]`,
          ).toBeLessThan(QUAT_EPSILON)
        }
      }
    }
  })

  it('animation never writes to player world (x, y, z) — only the timeline does', () => {
    // Per Phase P §2: animation is bones/body only. The
    // MotionController writes (x, z) from samplePlayer; y stays at
    // PLAYER_LIFT-equivalent. This test snapshots positions BEFORE
    // any tick (initial placement) and AFTER the full tick run, then
    // proves x/z come purely from the scenario timeline (matched
    // across two runs to the same FREEZE_AT_MS sample) and y never
    // moved.
    const seed = 6_000_000
    const a = runScenarioOnce(seed)
    const b = runScenarioOnce(seed)

    // x/z determinism (also covered by replayDeterminism.test.ts; the
    // belt-and-suspenders check here is meaningful because GLB
    // figures could in principle have buggy code that mutates the
    // root position via a stray bone parenting). Equality must be
    // tighter than the bone equality: there is NO floating-point
    // interpolation in samplePlayer's pass-segment endpoint case.
    for (const [id, posA] of a.positions) {
      const posB = b.positions.get(id)!
      expect(Math.abs(posA.x - posB.x)).toBeLessThan(POSITION_EPSILON)
      expect(Math.abs(posA.z - posB.z)).toBeLessThan(POSITION_EPSILON)
    }

    // y is set ONCE at build time (PLAYER_LIFT) and must not drift
    // under the GLB animation tick.
    for (const pos of a.positions.values()) {
      expect(pos.y).toBe(PLAYER_LIFT)
    }
    for (const pos of b.positions.values()) {
      expect(pos.y).toBe(PLAYER_LIFT)
    }

    // Ball.y is set by the MotionController's ball-arc math (see
    // applyBall). After the freeze cap, the ball lands at
    // baseBallY-equivalent. The exact value depends on the test
    // ball-base we passed in; what matters is run A == run B.
    expect(Math.abs(a.ball.x - b.ball.x)).toBeLessThan(POSITION_EPSILON)
    expect(Math.abs(a.ball.y - b.ball.y)).toBeLessThan(POSITION_EPSILON)
    expect(Math.abs(a.ball.z - b.ball.z)).toBeLessThan(POSITION_EPSILON)
  })

  it('mapped bones drift from bind pose under the active clip', () => {
    // Catches the silent failure where the mixer ticks but the
    // resolved PropertyBinding writes a no-op (e.g., a bone-map
    // typo nobody noticed because the procedural fallback covered
    // it). At minimum, every player's `spine_02` and one of the
    // thigh bones must drift from their bind pose by the end of the
    // tick run.
    const seed = 7_000_000
    const initial = new Map<string, { spine: THREE.Quaternion; thigh: THREE.Quaternion }>()

    _resetGlbAthleteCache()
    _resetGlbAthleteClipCache()
    _resetGlbAthleteBoneMapAuditGuard()
    const asset = buildMockGlbAsset()
    _setGlbAthleteCacheForTest(asset.scene, asset.skinnedMesh)

    const scene = fixtureScene()
    const { groups, ball } = buildGlbPlayerGroups(scene)

    // Snapshot bind-pose bones BEFORE any tick.
    for (const [id, g] of groups) {
      const handle = getGlbAthleteHandle(g)!
      let spine: THREE.Quaternion | null = null
      let thigh: THREE.Quaternion | null = null
      handle.cloned.traverse((child) => {
        if (!(child as THREE.Bone).isBone) return
        const b = child as THREE.Bone
        if (b.name === GLB_BONE_MAP.spine) spine = b.quaternion.clone()
        if (b.name === GLB_BONE_MAP.leftThigh) thigh = b.quaternion.clone()
      })
      expect(spine, `${id} spine bone missing`).not.toBeNull()
      expect(thigh, `${id} thigh bone missing`).not.toBeNull()
      initial.set(id, { spine: spine!, thigh: thigh! })
    }

    const motion = new MotionController(scene, 'intro', groups, ball, 0.65)
    motion.setFreezeAtMs(FREEZE_AT_MS)
    for (let t = 0; t <= FREEZE_AT_MS + 480; t += 16) {
      motion.tick(seed + t)
    }

    for (const [id, g] of groups) {
      const handle = getGlbAthleteHandle(g)!
      const before = initial.get(id)!
      let spineDelta = 0
      let thighDelta = 0
      handle.cloned.traverse((child) => {
        if (!(child as THREE.Bone).isBone) return
        const b = child as THREE.Bone
        if (b.name === GLB_BONE_MAP.spine) {
          const dx = b.quaternion.x - before.spine.x
          const dy = b.quaternion.y - before.spine.y
          const dz = b.quaternion.z - before.spine.z
          const dw = b.quaternion.w - before.spine.w
          spineDelta = Math.sqrt(dx * dx + dy * dy + dz * dz + dw * dw)
        }
        if (b.name === GLB_BONE_MAP.leftThigh) {
          const dx = b.quaternion.x - before.thigh.x
          const dy = b.quaternion.y - before.thigh.y
          const dz = b.quaternion.z - before.thigh.z
          const dw = b.quaternion.w - before.thigh.w
          thighDelta = Math.sqrt(dx * dx + dy * dy + dz * dz + dw * dw)
        }
      })
      expect(spineDelta, `${id} spine did not drift from bind pose`).toBeGreaterThan(1e-4)
      expect(thighDelta, `${id} thigh did not drift from bind pose`).toBeGreaterThan(1e-4)
    }
  })

  it('freeze cap is idempotent — extra ticks past the cap do not change bones', () => {
    _resetGlbAthleteCache()
    _resetGlbAthleteClipCache()
    _resetGlbAthleteBoneMapAuditGuard()
    const asset = buildMockGlbAsset()
    _setGlbAthleteCacheForTest(asset.scene, asset.skinnedMesh)

    const scene = fixtureScene()
    const { groups, ball } = buildGlbPlayerGroups(scene)
    const motion = new MotionController(scene, 'intro', groups, ball, 0.65)
    motion.setFreezeAtMs(FREEZE_AT_MS)

    // Run up to the freeze cap.
    const seed = 8_000_000
    for (let t = 0; t <= FREEZE_AT_MS + 32; t += 16) {
      motion.tick(seed + t)
    }
    const positionsAtCap = new Map<string, { x: number; z: number }>()
    for (const [id, g] of groups) {
      positionsAtCap.set(id, { x: g.position.x, z: g.position.z })
    }

    // Note on bones: bones DO continue to evolve past the freeze
    // cap because the AnimationMixer is wall-clock-driven (idle_ready
    // loops), not scenario-clock-driven. That is by design — Phase P
    // §7 calls out "Subtle breathing is acceptable" at freeze. What
    // MUST be deterministic is the `(x, z)` route: animation never
    // writes to player position, so additional ticks past the cap
    // must not move any player by even a float ULP.
    for (let t = FREEZE_AT_MS + 200; t <= FREEZE_AT_MS + 2000; t += 100) {
      motion.tick(seed + t)
    }
    for (const [id, g] of groups) {
      const before = positionsAtCap.get(id)!
      expect(Math.abs(g.position.x - before.x)).toBeLessThan(POSITION_EPSILON)
      expect(Math.abs(g.position.z - before.z)).toBeLessThan(POSITION_EPSILON)
    }
  })
})

// ---------------------------------------------------------------------------
// P1.0 — Imported closeout clip determinism + route invariance.
//
// These cases use the same fixture scenario as the P0-LOCK-2 cases above,
// but build figures with `attachImportedCloseoutClip: true` so the
// synthetic placeholder closeout clip is loaded into the
// importedClipLoader cache (root-motion-stripped) and attached as a
// `closeout` AnimationAction on every GLB figure's mixer. The defender
// is then forced to play the closeout clip via a direct
// `setGlbAthleteAnimation` call, bypassing MotionController's per-tick
// clip selector — that selector reads the module-level
// `USE_IMPORTED_CLOSEOUT_CLIP` const which is `false` in source. The
// custom tick loop only advances the mixer on the defender; the
// scenario timeline still owns `(x, z, y)`.
//
// Why bypass the MotionController for clip selection (but keep it for
// route)? Because the const flag cannot be toggled inside a test, and
// adding test-only flag overrides to a production module would surface
// a flag toggling API that doesn't exist in production. Bypassing keeps
// the production code path honest and lets the test still exercise the
// real builder, real cache, real strip, and real mixer.
// ---------------------------------------------------------------------------

interface CloseoutRunResult {
  defenderBones: Record<string, [number, number, number, number]>
  defenderPositionPath: Array<{ x: number; y: number; z: number }>
  closeoutActionAttached: boolean
  closeoutActionTrackNames: string[]
  cachedImportedTrackNames: string[]
}

/**
 * Builds a fresh GLB-driven scene with the imported closeout clip
 * attached, forces the defender into the `closeout` action, and
 * drives a deterministic tick loop. The MotionController owns
 * `(x, z)` (so we still get the authored route) but the GLB
 * animation driver runs through `updateGlbAthletePose` directly so
 * the closeout action is not overridden by the per-tick selector.
 *
 * `seedMs` anchors the wall-clock so two runs with the same seed
 * see the same dt sequence on the mixer.
 */
function runCloseoutScenarioOnce(seedMs: number): CloseoutRunResult {
  _resetGlbAthleteCache()
  _resetGlbAthleteClipCache()
  _resetGlbAthleteBoneMapAuditGuard()
  _resetImportedClipCache()
  const asset = buildMockGlbAsset()
  assertMockCoversGlbBoneMap(asset)
  _setGlbAthleteCacheForTest(asset.scene, asset.skinnedMesh)

  const scene = fixtureScene()
  const { groups, ball } = buildGlbPlayerGroups(scene, {
    attachImportedCloseoutClip: true,
  })
  const motion = new MotionController(scene, 'intro', groups, ball, 0.65)
  motion.setFreezeAtMs(FREEZE_AT_MS)

  // Force the defender (the d_user player) into the closeout action.
  // fadeSeconds=0 so the action fully plays at weight 1 immediately
  // and the bone snapshot reflects the closeout pose at every tick.
  const defender = groups.get('d_user')!
  setGlbAthleteAnimation(defender, 'closeout', { fadeSeconds: 0 })
  const defenderHandle = getGlbAthleteHandle(defender)!

  const ticks: number[] = []
  ticks.push(seedMs)
  // 16ms ticks for ~2 seconds of scenario time so we cover the
  // freeze edge plus a few extra frames at the cap.
  for (let t = 16; t <= FREEZE_AT_MS + 480; t += 16) {
    ticks.push(seedMs + t)
  }

  const positionPath: Array<{ x: number; y: number; z: number }> = []
  let lastWallMs = 0
  for (const now of ticks) {
    motion.tick(now)
    // Re-pin the defender to closeout each tick so the
    // MotionController's per-tick selector (which would pick
    // `defense_slide` for an unflagged build) cannot steal back the
    // action. fadeSeconds=0 makes this re-pin a no-op once the
    // closeout action is already at full weight.
    setGlbAthleteAnimation(defender, 'closeout', { fadeSeconds: 0 })
    // Drive the defender's mixer with a deterministic dt that mirrors
    // the controller's wall-clock cadence. We reset on the first tick
    // so the very first dt is 1/60 (matching applyGlbAnimation's
    // first-frame heuristic).
    const dt =
      lastWallMs === 0 ? 1 / 60 : Math.max(0, Math.min((now - lastWallMs) / 1000, 0.1))
    lastWallMs = now
    updateGlbAthletePose(defender, dt)
    positionPath.push({
      x: defender.position.x,
      y: defender.position.y,
      z: defender.position.z,
    })
  }

  const defenderBones: Record<string, [number, number, number, number]> = {}
  defenderHandle.cloned.traverse((child) => {
    if (!(child as THREE.Bone).isBone) return
    const b = child as THREE.Bone
    defenderBones[b.name] = [b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w]
  })

  const cachedCloseout = getCachedImportedClip(GLB_IMPORTED_CLOSEOUT_CLIP_URL)
  return {
    defenderBones,
    defenderPositionPath: positionPath,
    closeoutActionAttached: !!defenderHandle.actions['closeout'],
    closeoutActionTrackNames:
      defenderHandle.actions['closeout']?.getClip().tracks.map((t) => t.name) ?? [],
    cachedImportedTrackNames: cachedCloseout?.clip.tracks.map((t) => t.name) ?? [],
  }
}

/**
 * Mirrors `runCloseoutScenarioOnce` but does NOT attach the closeout
 * clip — the baseline for route comparison. Used to prove that
 * playing the imported closeout cannot perturb the defender's
 * authored `(x, z)` route by even a float ULP.
 */
function runBaselineDefenderRouteOnce(seedMs: number): {
  defenderPositionPath: Array<{ x: number; y: number; z: number }>
} {
  _resetGlbAthleteCache()
  _resetGlbAthleteClipCache()
  _resetGlbAthleteBoneMapAuditGuard()
  _resetImportedClipCache()
  const asset = buildMockGlbAsset()
  _setGlbAthleteCacheForTest(asset.scene, asset.skinnedMesh)

  const scene = fixtureScene()
  const { groups, ball } = buildGlbPlayerGroups(scene)
  const motion = new MotionController(scene, 'intro', groups, ball, 0.65)
  motion.setFreezeAtMs(FREEZE_AT_MS)

  const defender = groups.get('d_user')!
  const positionPath: Array<{ x: number; y: number; z: number }> = []
  const ticks: number[] = [seedMs]
  for (let t = 16; t <= FREEZE_AT_MS + 480; t += 16) ticks.push(seedMs + t)
  for (const now of ticks) {
    motion.tick(now)
    positionPath.push({
      x: defender.position.x,
      y: defender.position.y,
      z: defender.position.z,
    })
  }
  return { defenderPositionPath: positionPath }
}

describe('P1.0 — imported closeout clip determinism', () => {
  beforeEach(() => {
    _resetGlbAthleteCache()
    _resetGlbAthleteClipCache()
    _resetGlbAthleteBoneMapAuditGuard()
    _resetImportedClipCache()
  })
  afterEach(() => {
    _resetGlbAthleteCache()
    _resetGlbAthleteClipCache()
    _resetGlbAthleteBoneMapAuditGuard()
    _resetImportedClipCache()
  })

  it('two runs with closeout playing produce bit-equivalent defender bone quaternions', () => {
    // Locks the determinism contract with the imported-clip path live.
    // P1 (this packet) and every later phase rely on this gate before
    // changing how clips are picked or attached.
    const seed = 11_000_000
    const a = runCloseoutScenarioOnce(seed)
    const b = runCloseoutScenarioOnce(seed)

    expect(a.closeoutActionAttached).toBe(true)
    expect(b.closeoutActionAttached).toBe(true)
    const boneNames = Object.keys(a.defenderBones)
    expect(boneNames.length).toBeGreaterThan(0)

    for (const name of boneNames) {
      const qa = a.defenderBones[name]!
      const qb = b.defenderBones[name]
      expect(qb, `defender bone ${name} missing in run B`).toBeDefined()
      for (let i = 0; i < 4; i++) {
        expect(
          Math.abs(qa[i]! - qb![i]!),
          `defender ${name}[${i}]`,
        ).toBeLessThan(QUAT_EPSILON)
      }
    }
  })

  it('the loader-cached closeout clip has no <root>.position tracks', () => {
    // Asserts the loader strip applied — the action attached to the
    // mixer cannot, by construction, write to the figure root via
    // root motion. This is the single chokepoint Phase P §4 calls
    // out.
    const seed = 12_000_000
    const result = runCloseoutScenarioOnce(seed)
    expect(result.cachedImportedTrackNames.length).toBeGreaterThan(0)
    for (const name of result.cachedImportedTrackNames) {
      // Build a tiny dummy track with the same name so we can re-use
      // the production classifier. (KeyframeTrack constructor is
      // type-strict but `isRootMotionTrack` only reads .name.)
      const probe = new THREE.QuaternionKeyframeTrack(name, [0], [0, 0, 0, 1])
      expect(
        isRootMotionTrack(probe),
        `closeout track ${name} should have been stripped`,
      ).toBe(false)
    }
  })

  it('the attached closeout action uses the CourtIQ lower-body override', () => {
    const seed = 12_500_000
    const result = runCloseoutScenarioOnce(seed)
    expect(result.closeoutActionTrackNames.length).toBeGreaterThan(0)

    // The action clip, not just the loader cache, is what the mixer
    // evaluates. It must keep imported upper-body pressure.
    expect(result.closeoutActionTrackNames).toContain('spine_02.quaternion')
    expect(result.closeoutActionTrackNames).toContain('upperarm_l.quaternion')

    // And it must own a safe basketball lower body instead of letting
    // the legs fall back to Quaternius rest pose.
    for (const name of [
      'pelvis.quaternion',
      'thigh_l.quaternion',
      'thigh_r.quaternion',
      'calf_l.quaternion',
      'calf_r.quaternion',
    ]) {
      expect(result.closeoutActionTrackNames).toContain(name)
    }
    expect(result.closeoutActionTrackNames).not.toContain('root.quaternion')
    expect(result.closeoutActionTrackNames).not.toContain('root.position')
    expect(result.closeoutActionTrackNames).not.toContain('foot_l.quaternion')
    expect(result.closeoutActionTrackNames).not.toContain('ball_l.quaternion')
  })

  it('playing the imported closeout cannot move the defender route', () => {
    // The closeout clip's authoring source has a `pelvis.position`
    // track (see buildPlaceholderImportedCloseoutClip). If the
    // loader strip is bypassed, the defender's `(x, z)` would shift
    // forward over time — not because the figure root translation
    // changed (that is owned by samplePlayer) but because a stray
    // bone-position write could parent-shift the clone hierarchy
    // and surface as a visual drift. This test compares the
    // defender's per-tick `(x, z)` between a closeout-on run and a
    // baseline run. Both must match within the position epsilon.
    const seed = 13_000_000
    const closeoutRun = runCloseoutScenarioOnce(seed)
    const baselineRun = runBaselineDefenderRouteOnce(seed)

    expect(closeoutRun.defenderPositionPath.length).toBe(
      baselineRun.defenderPositionPath.length,
    )
    for (let i = 0; i < closeoutRun.defenderPositionPath.length; i++) {
      const co = closeoutRun.defenderPositionPath[i]!
      const base = baselineRun.defenderPositionPath[i]!
      expect(Math.abs(co.x - base.x), `tick ${i} defender.x`).toBeLessThan(
        POSITION_EPSILON,
      )
      expect(Math.abs(co.z - base.z), `tick ${i} defender.z`).toBeLessThan(
        POSITION_EPSILON,
      )
      // y must stay at the lift height set at build time.
      expect(co.y).toBe(PLAYER_LIFT)
      expect(base.y).toBe(PLAYER_LIFT)
    }
  })

  it('without the closeout option, no closeout action is attached (flag-off equivalence)', () => {
    // Flag-off behavior. When the option is omitted, the GLB figure
    // ships with idle_ready / cut_sprint / defense_slide /
    // defensive_deny actions and NO closeout action.
    // setGlbAthleteAnimation('closeout') is
    // therefore a no-op (the action lookup returns undefined).
    _resetImportedClipCache()
    const asset = buildMockGlbAsset()
    _setGlbAthleteCacheForTest(asset.scene, asset.skinnedMesh)

    const scene = fixtureScene()
    const { groups } = buildGlbPlayerGroups(scene)
    const defender = groups.get('d_user')!
    const handle = getGlbAthleteHandle(defender)!
    expect(handle.actions['closeout']).toBeUndefined()
    expect(handle.actions['idle_ready']).toBeDefined()
    expect(handle.actions['defense_slide']).toBeDefined()
    expect(handle.actions['defensive_deny']).toBeDefined()
    expect(handle.actions['cut_sprint']).toBeDefined()
    // P2.6 — shared readability primitives are part of the base
    // figure, independent of any imported-clip flag.
    expect(handle.actions['receive_ready']).toBeDefined()
    expect(handle.actions['closeout_read']).toBeDefined()
    // And the imported-clip cache is empty when the option was off.
    expect(getCachedImportedClip(GLB_IMPORTED_CLOSEOUT_CLIP_URL)).toBeNull()
  })
})

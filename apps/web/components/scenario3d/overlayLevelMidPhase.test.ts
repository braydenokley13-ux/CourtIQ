/* @vitest-environment jsdom */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as THREE from 'three'

import { TeachingOverlayController } from './imperativeTeachingOverlay'
import type { Scene3D } from '@/lib/scenario3d/scene'
import type { OverlayPrimitive } from '@/lib/scenario3d/schema'
import {
  applyOverlayLevel,
  type OverlayLevel,
} from '@/lib/scenario3d/overlayLevel'

/**
 * FR-7 — overlayLevel-during-phase regression tests.
 *
 * Bug being guarded:
 *   Changing `overlayLevel` mid-phase (Pathways mode flip / QA dropdown)
 *   rebuilt the AuthoredOverlayBridge controller but did not reapply
 *   the current `replayPhase`. The new controller stayed at its
 *   default `'hidden'` phase, so authored overlays disappeared until
 *   the next phase transition.
 *
 * These tests cover two layers:
 *   1. The controller-level behavior the fix relies on — a fresh
 *      controller, after `setAuthoredOverlays` + `setPhase('pre')`,
 *      shows the pre-answer cluster regardless of what phase the
 *      previous (now-disposed) controller had.
 *   2. A source-level structural check on the bridge — the rebuild
 *      effect must publish a fresh "controller epoch" value that the
 *      phase-sync effect re-reads, otherwise the phase reapply can
 *      regress. We read the source rather than render the R3F
 *      component because the project does not pull in
 *      `@react-three/test-renderer`.
 */

function buildScene(): Scene3D {
  return {
    id: 'fr7_mid_phase_scene',
    court: 'half',
    camera: 'teaching_angle',
    decoderTag: 'BACKDOOR_WINDOW',
    players: [
      { id: 'user', team: 'offense', role: 'wing', start: { x: 18, z: 8 }, isUser: true },
      { id: 'pg', team: 'offense', role: 'ball_handler', start: { x: 0, z: 22 }, hasBall: true },
      { id: 'd_user', team: 'defense', role: 'wing_d', start: { x: 17, z: 12 } },
      { id: 'd_pg', team: 'defense', role: 'on_ball', start: { x: 0, z: 24 } },
    ],
    ball: { start: { x: 0, z: 22 }, holderId: 'pg' },
    movements: [],
    answerDemo: [],
    wrongDemos: [],
    acceptableDemos: [],
    preAnswerOverlays: [
      { kind: 'defender_vision_cone', playerId: 'd_user', targetId: 'pg' },
      { kind: 'defender_hip_arrow', playerId: 'd_user' },
      { kind: 'defender_hand_in_lane', playerId: 'd_user' },
    ],
    postAnswerOverlays: [
      { kind: 'open_space_region', anchor: { x: 0, z: 18 }, radiusFt: 4 },
      { kind: 'passing_lane_open', from: 'pg', to: 'user' },
    ],
    freezeAtMs: null,
    synthetic: false,
  }
}

function getSubGroup(c: TeachingOverlayController, name: string): THREE.Group {
  const found = c.group.children.find(
    (child) => (child as THREE.Object3D).name === name,
  ) as THREE.Group | undefined
  if (!found) throw new Error(`subgroup ${name} not present`)
  return found
}

/**
 * Simulates exactly what `AuthoredOverlayBridge` does for a given
 * `overlayLevel` while the replay is parked at a given phase. Mirrors
 * the production effect order: filter overlays → build new controller
 * → setAuthoredOverlays → setVisible → reapply current phase.
 */
function buildBridgeController(
  scene: Scene3D,
  level: OverlayLevel,
  phase: 'pre' | 'post' | 'hidden',
): { ctrl: TeachingOverlayController; root: THREE.Group } {
  const root = new THREE.Group()
  const filtered = applyOverlayLevel({
    preAnswer: scene.preAnswerOverlays,
    postAnswer: scene.postAnswerOverlays,
    level,
  })
  const ctrl = new TeachingOverlayController(scene, 'intro', root, {
    reduced: false,
    heuristic: false,
  })
  ctrl.setAuthoredOverlays(filtered.preAnswer, filtered.postAnswer)
  ctrl.setVisible(level !== 'none')
  // FR-7: this is the line under test. The bridge MUST reapply the
  // current phase after rebuilding the controller.
  ctrl.setPhase(phase)
  return { ctrl, root }
}

describe('FR-7 — overlayLevel changes mid-phase preserve overlays', () => {
  it('rebuilding controller mid-frozen leaves the pre-answer cluster visible', () => {
    const scene = buildScene()

    // Initial state: beginner level, replay parked in `frozen`.
    const first = buildBridgeController(scene, 'beginner', 'pre')
    const firstPre = getSubGroup(first.ctrl, 'authored-pre-answer-overlays')
    expect(firstPre.visible).toBe(true)
    expect(first.ctrl.getPhase()).toBe('pre')
    first.ctrl.dispose()

    // QA flips the dropdown to `intermediate` — bridge rebuilds the
    // controller. Phase did NOT transition (still frozen).
    const second = buildBridgeController(scene, 'intermediate', 'pre')
    const secondPre = getSubGroup(second.ctrl, 'authored-pre-answer-overlays')
    expect(second.ctrl.getPhase()).toBe('pre')
    expect(secondPre.visible).toBe(true)
    // Pre cluster is at most the level cap.
    expect(secondPre.children.length).toBeGreaterThan(0)
    second.ctrl.dispose()
  })

  it('rebuilding controller mid-replaying leaves the post-answer cluster visible', () => {
    const scene = buildScene()

    const first = buildBridgeController(scene, 'beginner', 'post')
    expect(getSubGroup(first.ctrl, 'authored-post-answer-overlays').visible).toBe(true)
    first.ctrl.dispose()

    // Pathways flips overlayLevel mid-replay (advanced → beginner).
    const second = buildBridgeController(scene, 'advanced', 'post')
    expect(second.ctrl.getPhase()).toBe('post')
    expect(getSubGroup(second.ctrl, 'authored-post-answer-overlays').visible).toBe(true)
    expect(getSubGroup(second.ctrl, 'authored-pre-answer-overlays').visible).toBe(false)
    second.ctrl.dispose()
  })

  it('Boss (none) keeps the controller hidden but does not crash phase reapply', () => {
    const scene = buildScene()
    // Frozen, but Boss mode — every authored primitive is dropped, the
    // overlay group is hidden, and reapplying setPhase('pre') is still
    // safe (no GPU resources to flip).
    const { ctrl } = buildBridgeController(scene, 'none', 'pre')
    expect(ctrl.group.visible).toBe(false)
    expect(ctrl.getPhase()).toBe('pre')
    const pre = getSubGroup(ctrl, 'authored-pre-answer-overlays')
    expect(pre.children).toHaveLength(0)
    ctrl.dispose()
  })

  it('QA dropdown sweep across every level mid-frozen never strands the overlay at "hidden"', () => {
    const scene = buildScene()
    const levels: OverlayLevel[] = [
      'beginner',
      'intermediate',
      'advanced',
      'review',
      'beginner',
      'intermediate',
    ]
    for (const level of levels) {
      const { ctrl } = buildBridgeController(scene, level, 'pre')
      expect(ctrl.getPhase()).toBe('pre')
      const pre = getSubGroup(ctrl, 'authored-pre-answer-overlays')
      // Boss (none) is the only level where pre.visible is allowed to
      // be false — and only because the entire overlay group is hidden.
      expect(pre.visible).toBe(true)
      ctrl.dispose()
    }
  })

  it('controller rebuild preserves the pre-answer cluster across consecutive level swaps without a phase change', () => {
    const scene = buildScene()
    // Open the rep at frozen with beginner.
    let prev = buildBridgeController(scene, 'beginner', 'pre')
    for (const level of ['intermediate', 'advanced', 'review', 'beginner'] as const) {
      // Simulate React effect cleanup → rebuild.
      prev.ctrl.dispose()
      const next = buildBridgeController(scene, level, 'pre')
      expect(next.ctrl.getPhase()).toBe('pre')
      expect(getSubGroup(next.ctrl, 'authored-pre-answer-overlays').visible).toBe(true)
      prev = next
    }
    prev.ctrl.dispose()
  })

  it('regression: setPhase() must be the explicit reapply mechanism — a fresh controller defaults to "hidden"', () => {
    // This documents the underlying contract the bridge fix relies on:
    // a freshly constructed controller does NOT inherit the previous
    // controller's phase. The bridge has to setPhase() explicitly.
    const scene = buildScene()
    const root = new THREE.Group()
    const filtered = applyOverlayLevel({
      preAnswer: scene.preAnswerOverlays,
      postAnswer: scene.postAnswerOverlays,
      level: 'beginner',
    })
    const ctrl = new TeachingOverlayController(scene, 'intro', root, {
      reduced: false,
      heuristic: false,
    })
    ctrl.setAuthoredOverlays(filtered.preAnswer, filtered.postAnswer)
    ctrl.setVisible(true)
    // Without setPhase('pre'), the pre cluster stays parked.
    const pre = getSubGroup(ctrl, 'authored-pre-answer-overlays')
    expect(pre.visible).toBe(false)
    expect(ctrl.getPhase()).toBe('hidden')
    ctrl.dispose()
  })
})

describe('FR-7 — AuthoredOverlayBridge wires phase reapply on controller rebuild', () => {
  const SOURCE = readFileSync(
    join(__dirname, 'ScenarioScene3D.tsx'),
    'utf-8',
  )

  it('rebuild effect bumps a controller-epoch state value', () => {
    // Source-level lock: the bridge must publish a fresh value when it
    // installs a new controller. We don't pin the exact name but we do
    // pin the shape: a useState integer counter and a setter call
    // inside the rebuild effect.
    expect(SOURCE).toMatch(/useState<number>\(0\)|useState\(0\)/)
    expect(SOURCE).toMatch(/setCtrlEpoch|setControllerEpoch|setOverlayCtrlEpoch/)
  })

  it('phase-sync effect depends on the controller-epoch so it re-runs on rebuild', () => {
    // Find the phase-sync effect's dependency array. It must include
    // the epoch counter alongside replayPhase + scene.
    const phaseSync = SOURCE.match(
      /\}, \[replayPhase, scene[^\]]*\]\)/,
    )
    expect(phaseSync).not.toBeNull()
    expect(phaseSync?.[0] ?? '').toMatch(/ctrlEpoch|controllerEpoch|overlayCtrlEpoch/)
  })

  it('rebuild effect calls the epoch setter so phase reapply is triggered', () => {
    // Scope the assertion to the rebuild effect — the fingerprint
    // we lock onto is the `[scene.id, filtered, overlayLevel]` deps,
    // which is the rebuild effect's signature.
    const rebuildEffectIdx = SOURCE.indexOf('[scene.id, filtered, overlayLevel,')
    expect(rebuildEffectIdx).toBeGreaterThan(0)
    // The setter call must appear somewhere before the deps array.
    const before = SOURCE.slice(0, rebuildEffectIdx)
    // The last `useEffect(` before this deps array starts the rebuild
    // effect. Slice from there to the deps array.
    const effectStart = before.lastIndexOf('useEffect(')
    expect(effectStart).toBeGreaterThan(0)
    const effectBody = SOURCE.slice(effectStart, rebuildEffectIdx)
    expect(effectBody).toMatch(/setCtrlEpoch|setControllerEpoch|setOverlayCtrlEpoch/)
  })

  it('rebuild effect also calls setVisible based on overlayLevel suppression', () => {
    // Locks the FR-5 contract: Boss / 'none' keeps the controller
    // mounted with the overlay group hidden. Without this, a Boss
    // user might see overlays when the bridge rebuilds.
    const rebuildEffectIdx = SOURCE.indexOf('[scene.id, filtered, overlayLevel,')
    const before = SOURCE.slice(0, rebuildEffectIdx)
    const effectStart = before.lastIndexOf('useEffect(')
    const effectBody = SOURCE.slice(effectStart, rebuildEffectIdx)
    expect(effectBody).toMatch(/setVisible\(\s*!isOverlaySuppressed\(overlayLevel\)\s*\)/)
  })
})

// Extra coverage — exercises the controller's `setAuthoredOverlays`
// determinism so the rebuild → reapply path is a faithful clone of
// the previous controller's overlay set when the level is unchanged.
describe('FR-7 — overlay primitive contents survive rebuild at the same level', () => {
  it('authored mesh count is identical across two rebuilds at the same level', () => {
    const scene = buildScene()
    const collect = (level: OverlayLevel) => {
      const { ctrl } = buildBridgeController(scene, level, 'pre')
      const pre = getSubGroup(ctrl, 'authored-pre-answer-overlays')
      const meshes: number[] = []
      pre.traverse((obj) => {
        const mesh = obj as THREE.Mesh
        if (mesh.isMesh) meshes.push(1)
      })
      ctrl.dispose()
      return meshes.length
    }
    // Same level twice → same authored mesh count.
    expect(collect('beginner')).toBe(collect('beginner'))
    expect(collect('intermediate')).toBe(collect('intermediate'))
  })

  it('beginner mounts at least as many meshes as advanced', () => {
    const scene = buildScene()
    const meshCount = (level: OverlayLevel) => {
      const { ctrl } = buildBridgeController(scene, level, 'pre')
      let count = 0
      getSubGroup(ctrl, 'authored-pre-answer-overlays').traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) count += 1
      })
      ctrl.dispose()
      return count
    }
    expect(meshCount('beginner')).toBeGreaterThanOrEqual(meshCount('advanced'))
  })

  // Builds against passing fixtures: when there is no preAnswer
  // primitive at all, the rebuild path still installs the post group
  // intact — which is what the fix relies on for `replayPhase=='post'`
  // mid-phase rebuilds.
  it('rebuild with empty pre cluster keeps post group intact mid-replay', () => {
    const scene: Scene3D = {
      ...buildScene(),
      preAnswerOverlays: [] as OverlayPrimitive[],
    }
    const { ctrl } = buildBridgeController(scene, 'beginner', 'post')
    const post = getSubGroup(ctrl, 'authored-post-answer-overlays')
    expect(post.visible).toBe(true)
    expect(post.children.length).toBeGreaterThan(0)
    ctrl.dispose()
  })
})

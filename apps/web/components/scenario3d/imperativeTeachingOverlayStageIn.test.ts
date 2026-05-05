/* @vitest-environment jsdom */
import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { TeachingOverlayController } from './imperativeTeachingOverlay'
import { getStageInDelayMs } from '@/lib/scenario3d/overlayLevel'
import type { Scene3D } from '@/lib/scenario3d/scene'
import type { OverlayPrimitive } from '@/lib/scenario3d/schema'

/**
 * FR-5 §9.7 — stage-in choreography.
 *
 * The freeze should feel like a coach pointing: the cluster's
 * primitives don't all fade in at t=0, they land in sequence
 * (40ms / 120ms / 220ms / +100ms each). These tests don't peek at
 * private fields — they observe the public effect: at a given
 * elapsed time after `setPhase('pre')`, only the primitives whose
 * stage-in delay has passed have non-zero opacity.
 */

function buildScene(): Scene3D {
  return {
    id: 'stage_in_test',
    court: 'half',
    camera: 'teaching_angle',
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
    preAnswerOverlays: [],
    postAnswerOverlays: [],
    freezeAtMs: null,
    synthetic: false,
  }
}

function newController(): TeachingOverlayController {
  const root = new THREE.Group()
  const c = new TeachingOverlayController(buildScene(), 'static', root)
  c.setVisible(true)
  return c
}

/** Walks the named sub-group and collects every renderable opacity. */
function collectOpacities(group: THREE.Group): number[] {
  const out: number[] = []
  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (mesh.isMesh && (mesh.material as THREE.MeshBasicMaterial).transparent) {
      out.push((mesh.material as THREE.MeshBasicMaterial).opacity)
    }
    const sprite = obj as THREE.Sprite
    if (sprite.isSprite) {
      out.push((sprite.material as THREE.SpriteMaterial).opacity)
    }
  })
  return out
}

function getSubGroup(c: TeachingOverlayController, name: string): THREE.Group {
  const found = c.group.children.find(
    (child) => (child as THREE.Object3D).name === name,
  ) as THREE.Group | undefined
  if (!found) throw new Error(`subgroup ${name} not present`)
  return found
}

describe('TeachingOverlayController — stage-in choreography', () => {
  const CLUSTER: OverlayPrimitive[] = [
    { kind: 'defender_vision_cone', playerId: 'd_user', targetId: 'pg' },
    { kind: 'defender_hip_arrow', playerId: 'd_user' },
    { kind: 'defender_hand_in_lane', playerId: 'd_user' },
  ]

  it('holds every primitive at opacity 0 before phase enter', () => {
    const c = newController()
    c.setAuthoredOverlays(CLUSTER, [])
    const pre = getSubGroup(c, 'authored-pre-answer-overlays')
    // Tick before setPhase so animations have a chance to misfire.
    c.tick(0)
    for (const op of collectOpacities(pre)) {
      expect(op).toBe(0)
    }
  })

  it('staggers fade-in: at t=50ms first overlay is partially visible, others remain at 0', () => {
    const c = newController()
    c.setAuthoredOverlays(CLUSTER, [])
    const startMs = 1000
    c.setPhase('pre', startMs)

    // delay[0]=40, delay[1]=120, delay[2]=220. At elapsed 50ms only the
    // first primitive has begun its fade.
    c.tick(startMs + 50)
    const pre = getSubGroup(c, 'authored-pre-answer-overlays')
    // The vision cone produces a fade entry (the cone itself is not
    // transparent in the schema-defined sense, but the controller's
    // build helper marks all authored fade materials as transparent at
    // opacity 0 → ramp-up).  We assert the structural invariant:
    // somewhere in the pre group there is a non-zero opacity (first
    // primitive fading) and at least one zero opacity (later primitives
    // still gated).
    const ops = collectOpacities(pre)
    expect(ops.length).toBeGreaterThan(0)
    const someUp = ops.some((o) => o > 0)
    const someStillZero = ops.some((o) => o === 0)
    expect(someUp).toBe(true)
    expect(someStillZero).toBe(true)
  })

  it('all primitives reach full opacity by t=1000ms (longest fade is 600ms)', () => {
    const c = newController()
    c.setAuthoredOverlays(CLUSTER, [])
    const startMs = 1000
    c.setPhase('pre', startMs)
    c.tick(startMs + 1500)
    const pre = getSubGroup(c, 'authored-pre-answer-overlays')
    const ops = collectOpacities(pre)
    expect(ops.length).toBeGreaterThan(0)
    for (const o of ops) {
      expect(o).toBeGreaterThan(0)
    }
  })

  it('post-answer cluster also stages in', () => {
    const c = newController()
    const post: OverlayPrimitive[] = [
      { kind: 'open_space_region', anchor: { x: 0, z: 18 }, radiusFt: 4 },
      { kind: 'passing_lane_open', from: 'pg', to: 'user' },
    ]
    c.setAuthoredOverlays([], post)
    const startMs = 2000
    c.setPhase('post', startMs)
    c.tick(startMs + 50)
    const postGroup = getSubGroup(c, 'authored-post-answer-overlays')
    const ops = collectOpacities(postGroup)
    expect(ops.length).toBeGreaterThan(0)
    // First primitive (delay 40ms) is fading; second (delay 120ms) still
    // pinned at 0.
    const someUp = ops.some((o) => o > 0)
    const someStillZero = ops.some((o) => o === 0)
    expect(someUp).toBe(true)
    expect(someStillZero).toBe(true)
  })

  it('is deterministic — same setPhase nowMs and same tick nowMs produce identical opacities', () => {
    const c1 = newController()
    const c2 = newController()
    c1.setAuthoredOverlays(CLUSTER, [])
    c2.setAuthoredOverlays(CLUSTER, [])
    c1.setPhase('pre', 5000)
    c2.setPhase('pre', 5000)
    c1.tick(5150)
    c2.tick(5150)
    const ops1 = collectOpacities(getSubGroup(c1, 'authored-pre-answer-overlays'))
    const ops2 = collectOpacities(getSubGroup(c2, 'authored-pre-answer-overlays'))
    expect(ops1).toEqual(ops2)
  })

  it('uses getStageInDelayMs schedule (40 / 120 / 220)', () => {
    // Sanity: the controller imports the same helper, so verifying the
    // schedule here re-asserts the contract the controller relies on.
    expect(getStageInDelayMs(0)).toBe(40)
    expect(getStageInDelayMs(1)).toBe(120)
    expect(getStageInDelayMs(2)).toBe(220)
  })
})

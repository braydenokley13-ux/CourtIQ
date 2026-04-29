/* @vitest-environment jsdom */
import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { TeachingOverlayController } from './imperativeTeachingOverlay'
import type { Scene3D } from '@/lib/scenario3d/scene'
import type { OverlayPrimitive } from '@/lib/scenario3d/schema'

function buildScene(): Scene3D {
  return {
    id: 'overlay_test',
    court: 'half',
    camera: 'teaching_angle',
    players: [
      { id: 'user', team: 'offense', role: 'wing', start: { x: 18, z: 8 }, isUser: true },
      { id: 'pg', team: 'offense', role: 'ball_handler', start: { x: 0, z: 22 }, hasBall: true },
      { id: 'corner', team: 'offense', role: 'corner', start: { x: -22, z: 1 } },
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

function makeController(): { controller: TeachingOverlayController; root: THREE.Group } {
  const root = new THREE.Group()
  // No movements / answerDemo so the heuristic builders are no-ops; we
  // exercise the authored-overlay path in isolation. Spacing labels
  // still get built but they live in the parent overlay group, not the
  // pre/post sub-groups.
  const controller = new TeachingOverlayController(buildScene(), 'static', root)
  controller.setVisible(true)
  return { controller, root }
}

describe('TeachingOverlayController — authored overlay primitives', () => {
  const PRIMITIVES: OverlayPrimitive[] = [
    { kind: 'defender_vision_cone', playerId: 'd_user' },
    { kind: 'defender_vision_cone', playerId: 'd_user', targetId: 'pg' },
    { kind: 'defender_hip_arrow', playerId: 'd_user' },
    { kind: 'defender_foot_arrow', playerId: 'd_user' },
    { kind: 'defender_chest_line', playerId: 'd_user' },
    { kind: 'defender_hand_in_lane', playerId: 'd_user' },
    { kind: 'open_space_region', anchor: { x: -22, z: 1 }, radiusFt: 4 },
    { kind: 'help_pulse', playerId: 'd_pg', role: 'tag' },
    { kind: 'help_pulse', playerId: 'd_pg', role: 'low_man' },
    { kind: 'help_pulse', playerId: 'd_pg', role: 'nail' },
    { kind: 'help_pulse', playerId: 'd_pg', role: 'overhelp' },
    {
      kind: 'drive_cut_preview',
      playerId: 'user',
      path: [
        { x: 18, z: 8 },
        { x: 6, z: 4 },
        { x: 0, z: 2 },
      ],
    },
    { kind: 'passing_lane_open', from: 'pg', to: 'corner' },
    { kind: 'passing_lane_blocked', from: 'pg', to: 'user' },
  ]

  it('mounts every authored primitive without throwing', () => {
    const { controller } = makeController()
    expect(() => controller.setAuthoredOverlays(PRIMITIVES, PRIMITIVES)).not.toThrow()
  })

  it('places authored primitives in the dedicated sub-groups, not the parent group', () => {
    const { controller } = makeController()
    controller.setAuthoredOverlays(PRIMITIVES, PRIMITIVES)
    const preGroup = controller.group.children.find(
      (c) => (c as THREE.Object3D).name === 'authored-pre-answer-overlays',
    )
    const postGroup = controller.group.children.find(
      (c) => (c as THREE.Object3D).name === 'authored-post-answer-overlays',
    )
    expect(preGroup).toBeDefined()
    expect(postGroup).toBeDefined()
    expect((preGroup as THREE.Group).children.length).toBeGreaterThan(0)
    expect((postGroup as THREE.Group).children.length).toBeGreaterThan(0)
  })

  it('setPhase visibility-flips between pre, post, and hidden without teardown', () => {
    const { controller } = makeController()
    controller.setAuthoredOverlays(PRIMITIVES, PRIMITIVES)
    const pre = controller.group.children.find(
      (c) => (c as THREE.Object3D).name === 'authored-pre-answer-overlays',
    ) as THREE.Group
    const post = controller.group.children.find(
      (c) => (c as THREE.Object3D).name === 'authored-post-answer-overlays',
    ) as THREE.Group
    const preChildCount = pre.children.length
    const postChildCount = post.children.length

    controller.setPhase('pre')
    expect(pre.visible).toBe(true)
    expect(post.visible).toBe(false)

    controller.setPhase('post')
    expect(pre.visible).toBe(false)
    expect(post.visible).toBe(true)

    controller.setPhase('hidden')
    expect(pre.visible).toBe(false)
    expect(post.visible).toBe(false)

    // Teardown discipline: child counts unchanged across the flip.
    expect(pre.children.length).toBe(preChildCount)
    expect(post.children.length).toBe(postChildCount)
  })

  it('rejects pre-answer overlays that reveal the answer at the schema layer', () => {
    // Schema-level enforcement is exercised by schema.test.ts; the
    // controller itself does not gate kinds — it just renders what it
    // is given. This documents the layering.
    const banned: OverlayPrimitive[] = [
      { kind: 'passing_lane_open', from: 'pg', to: 'corner' },
      {
        kind: 'drive_cut_preview',
        playerId: 'user',
        path: [
          { x: 18, z: 8 },
          { x: 0, z: 2 },
        ],
      },
    ]
    const { controller } = makeController()
    expect(() => controller.setAuthoredOverlays(banned, [])).not.toThrow()
  })

  it('animates fade-ins from 0 to target opacity over the authored duration', () => {
    const { controller } = makeController()
    controller.setAuthoredOverlays([{ kind: 'defender_chest_line', playerId: 'd_user' }], [])
    controller.setPhase('pre', 1000)
    // Before any tick after setPhase, opacity is still 0.
    const pre = controller.group.children.find(
      (c) => (c as THREE.Object3D).name === 'authored-pre-answer-overlays',
    ) as THREE.Group
    const lineMesh = pre.children[0] as THREE.Mesh
    const mat = lineMesh.material as THREE.MeshBasicMaterial
    expect(mat.opacity).toBe(0)

    // Half-way through the fade.
    controller.tick(1000 + 100)
    expect(mat.opacity).toBeGreaterThan(0)
    expect(mat.opacity).toBeLessThan(0.85)

    // Past the duration (200ms): pinned at target.
    controller.tick(1000 + 500)
    expect(mat.opacity).toBeCloseTo(0.85, 2)
  })

  it('drive_cut_preview reveals the arrowhead only after build-out completes', () => {
    const { controller } = makeController()
    controller.setAuthoredOverlays(
      [],
      [
        {
          kind: 'drive_cut_preview',
          playerId: 'user',
          path: [
            { x: 18, z: 8 },
            { x: 6, z: 4 },
            { x: 0, z: 2 },
          ],
        },
      ],
    )
    controller.setPhase('post', 2000)
    const post = controller.group.children.find(
      (c) => (c as THREE.Object3D).name === 'authored-post-answer-overlays',
    ) as THREE.Group
    // Two children: the tube + the arrowhead. The arrowhead is the
    // ConeGeometry one; it stays hidden until build-out completes.
    const arrowhead = post.children.find(
      (c) => (c as THREE.Mesh).geometry?.type === 'ConeGeometry',
    ) as THREE.Mesh | undefined
    expect(arrowhead).toBeDefined()
    expect(arrowhead!.visible).toBe(false)

    // Mid-build: arrowhead still hidden.
    controller.tick(2000 + 200)
    expect(arrowhead!.visible).toBe(false)

    // Past 600ms build window: arrowhead pops in.
    controller.tick(2000 + 1000)
    expect(arrowhead!.visible).toBe(true)
  })

  it('setAuthoredOverlays replaces prior overlays cleanly', () => {
    const { controller } = makeController()
    controller.setAuthoredOverlays([{ kind: 'defender_chest_line', playerId: 'd_user' }], [])
    const pre = controller.group.children.find(
      (c) => (c as THREE.Object3D).name === 'authored-pre-answer-overlays',
    ) as THREE.Group
    const firstChildCount = pre.children.length
    controller.setAuthoredOverlays(
      [
        { kind: 'defender_chest_line', playerId: 'd_user' },
        { kind: 'defender_hip_arrow', playerId: 'd_user' },
      ],
      [],
    )
    // Replacement, not append: prior overlay removed before the new
    // ones mount. New count should be 3 (chest_line=1 mesh +
    // hip_arrow=2 meshes).
    expect(pre.children.length).toBe(3)
    expect(pre.children.length).not.toBe(firstChildCount)
  })

  it('skips primitives whose playerId is not in the scene', () => {
    const { controller } = makeController()
    expect(() =>
      controller.setAuthoredOverlays(
        [{ kind: 'defender_chest_line', playerId: 'ghost' }],
        [],
      ),
    ).not.toThrow()
    const pre = controller.group.children.find(
      (c) => (c as THREE.Object3D).name === 'authored-pre-answer-overlays',
    ) as THREE.Group
    expect(pre.children.length).toBe(0)
  })

  it('resolves passing-lane endpoints to the literal "ball" id', () => {
    const { controller } = makeController()
    expect(() =>
      controller.setAuthoredOverlays(
        [],
        [{ kind: 'passing_lane_open', from: 'ball', to: 'corner' }],
      ),
    ).not.toThrow()
    const post = controller.group.children.find(
      (c) => (c as THREE.Object3D).name === 'authored-post-answer-overlays',
    ) as THREE.Group
    expect(post.children.length).toBe(1)
  })
})

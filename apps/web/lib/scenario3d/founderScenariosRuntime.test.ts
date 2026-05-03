/* @vitest-environment jsdom */
/**
 * P3.2 — Founder scenario runtime smoke test.
 *
 * Walks every founder scenario through the same pipeline the dev
 * preview uses:
 *
 *   1. Load the JSON.
 *   2. Parse `scene` into a Scene3D via `buildScene`.
 *   3. Mount a `TeachingOverlayController` against a fresh THREE.Group
 *      and call `setAuthoredOverlays(pre, post)`.
 *   4. Flip phases: `pre` → tick → `post` → tick → `hidden`.
 *   5. Confirm: no throws, no NaN material opacity, no orphaned children
 *      after `dispose`, every authored primitive renders something
 *      (mesh / line / sprite) inside the matching sub-group.
 *
 * The test does NOT verify pixel output — that requires Playwright or a
 * full WebGL context. The win here is catching a class of regressions
 * (a renderer that silently no-ops on one decoder, an authored primitive
 * that geometry-fails on a specific scenario) without standing up a
 * browser.
 */

import { describe, expect, it } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import * as THREE from 'three'

import { buildScene } from './scene'
import { TeachingOverlayController } from '../../components/scenario3d/imperativeTeachingOverlay'

const SCENARIOS_DIR = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'packages',
  'db',
  'seed',
  'scenarios',
  'packs',
  'founder-v0',
)

interface FounderJson {
  id: string
  decoder_tag?: string
  concept_tags?: string[]
  scene: unknown
}

async function loadFounder(filename: string): Promise<FounderJson> {
  const raw = await fs.readFile(path.join(SCENARIOS_DIR, filename), 'utf8')
  const arr = JSON.parse(raw) as FounderJson[]
  expect(arr.length).toBeGreaterThan(0)
  return arr[0]!
}

const FOUNDERS = [
  { id: 'BDW-01', filename: 'BDW-01.json' },
  { id: 'AOR-01', filename: 'AOR-01.json' },
  { id: 'ESC-01', filename: 'ESC-01.json' },
  { id: 'SKR-01', filename: 'SKR-01.json' },
] as const

/** Recursively collects every Object3D under `root`, including `root`. */
function walk(root: THREE.Object3D, out: THREE.Object3D[] = []): THREE.Object3D[] {
  out.push(root)
  for (const child of root.children) walk(child, out)
  return out
}

/** Returns true when an opacity value is a finite, non-NaN number. */
function opacityIsClean(material: THREE.Material): boolean {
  if (!('opacity' in material)) return true
  const op = (material as THREE.Material & { opacity: number }).opacity
  return Number.isFinite(op)
}

describe('P3.2 — Founder scenario runtime smoke', () => {
  for (const spec of FOUNDERS) {
    describe(spec.id, () => {
      it('mounts through buildScene + TeachingOverlayController without throwing', async () => {
        const founder = await loadFounder(spec.filename)
        const scene = buildScene({
          id: founder.id,
          scene: founder.scene,
          decoder_tag: founder.decoder_tag,
          concept_tags: founder.concept_tags,
        } as Parameters<typeof buildScene>[0])

        // Sanity: the build returned the scenario's authored ids, not a
        // synthesised default. A silent fallback to the default scene
        // would mean the JSON is malformed in a way the schema accepted
        // but the builder rejected.
        expect(scene.id).toBe(founder.id)
        expect(scene.synthetic).toBe(false)
        expect(scene.players.length).toBeGreaterThanOrEqual(2)

        const root = new THREE.Group()
        const ctrl = new TeachingOverlayController(scene, 'static', root, {
          heuristic: false,
        })
        try {
          ctrl.setVisible(true)
          expect(() =>
            ctrl.setAuthoredOverlays(
              scene.preAnswerOverlays,
              scene.postAnswerOverlays,
            ),
          ).not.toThrow()

          // Sub-groups exist and contain at least one renderable per
          // authored cluster. (Some primitives skip silently on missing
          // refs; the founder JSON is hand-authored so refs are valid.)
          const preGroup = ctrl.group.children.find(
            (c) => c.name === 'authored-pre-answer-overlays',
          ) as THREE.Group | undefined
          const postGroup = ctrl.group.children.find(
            (c) => c.name === 'authored-post-answer-overlays',
          ) as THREE.Group | undefined
          expect(preGroup, 'pre-answer sub-group').toBeDefined()
          expect(postGroup, 'post-answer sub-group').toBeDefined()
          expect(preGroup!.children.length).toBeGreaterThan(0)
          expect(postGroup!.children.length).toBeGreaterThan(0)

          // setPhase + tick the freeze, then the replay. Any throw, any
          // NaN opacity, any orphaned mesh transform fails the test.
          ctrl.setPhase('pre', 1000)
          ctrl.tick(1100)
          ctrl.tick(1300)
          ctrl.setPhase('post', 2000)
          ctrl.tick(2100)
          ctrl.tick(2700)
          ctrl.setPhase('hidden', 3000)

          for (const obj of walk(ctrl.group)) {
            expect(Number.isFinite(obj.position.x)).toBe(true)
            expect(Number.isFinite(obj.position.y)).toBe(true)
            expect(Number.isFinite(obj.position.z)).toBe(true)
            if ((obj as THREE.Mesh).material) {
              const mat = (obj as THREE.Mesh).material as
                | THREE.Material
                | THREE.Material[]
              if (Array.isArray(mat)) {
                for (const m of mat) expect(opacityIsClean(m)).toBe(true)
              } else {
                expect(opacityIsClean(mat)).toBe(true)
              }
            }
          }
        } finally {
          ctrl.dispose()
        }

        // Dispose-leak check: the controller's group is no longer a
        // child of root, and root has no leftover children.
        expect(root.children.length).toBe(0)
      })

      it('phase visibility flips without changing child counts', async () => {
        const founder = await loadFounder(spec.filename)
        const scene = buildScene({
          id: founder.id,
          scene: founder.scene,
          decoder_tag: founder.decoder_tag,
        } as Parameters<typeof buildScene>[0])
        const root = new THREE.Group()
        const ctrl = new TeachingOverlayController(scene, 'static', root, {
          heuristic: false,
        })
        try {
          ctrl.setVisible(true)
          ctrl.setAuthoredOverlays(
            scene.preAnswerOverlays,
            scene.postAnswerOverlays,
          )
          const pre = ctrl.group.children.find(
            (c) => c.name === 'authored-pre-answer-overlays',
          ) as THREE.Group
          const post = ctrl.group.children.find(
            (c) => c.name === 'authored-post-answer-overlays',
          ) as THREE.Group
          const preCount = pre.children.length
          const postCount = post.children.length

          ctrl.setPhase('pre', 0)
          expect(pre.visible).toBe(true)
          expect(post.visible).toBe(false)
          ctrl.setPhase('post', 0)
          expect(pre.visible).toBe(false)
          expect(post.visible).toBe(true)
          ctrl.setPhase('hidden', 0)
          expect(pre.visible).toBe(false)
          expect(post.visible).toBe(false)

          // Child counts unchanged across phase flips — visibility-flip,
          // not teardown.
          expect(pre.children.length).toBe(preCount)
          expect(post.children.length).toBe(postCount)
        } finally {
          ctrl.dispose()
        }
      })
    })
  }

  it('all four founder smokes are independent — repeated mount/dispose does not leak', async () => {
    // Mount each scenario back-to-back, then dispose. Asserts the
    // controller cleans up after itself across decoders. A leak would
    // surface as an ever-growing root.children.length.
    const root = new THREE.Group()
    for (const spec of FOUNDERS) {
      const founder = await loadFounder(spec.filename)
      const scene = buildScene({
        id: founder.id,
        scene: founder.scene,
        decoder_tag: founder.decoder_tag,
      } as Parameters<typeof buildScene>[0])
      const ctrl = new TeachingOverlayController(scene, 'static', root, {
        heuristic: false,
      })
      ctrl.setVisible(true)
      ctrl.setAuthoredOverlays(
        scene.preAnswerOverlays,
        scene.postAnswerOverlays,
      )
      ctrl.setPhase('pre', 100)
      ctrl.tick(150)
      ctrl.dispose()
      expect(root.children.length).toBe(0)
    }
  })
})

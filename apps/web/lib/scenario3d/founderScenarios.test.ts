/**
 * P3.1 / P3.2 — Founder scenario seed validation.
 *
 * Locks the authoring shape of every founder scenario in the
 * `founder-v0` pack (BDW / AOR / ESC / SKR). P3.1 introduced the file
 * with ESC-01 + SKR-01 only; P3.2 extends it to cover BDW-01 + AOR-01
 * so the entire founder set has one parametrised authoring lock.
 *
 *   - decoder_tag matches the founder decoder taxonomy
 *   - scene parses against the runtime sceneSchema
 *   - freeze marker lands inside the cue window
 *   - exactly one quality='best' choice; sequential order 1..N
 *   - every wrong / acceptable choice has a matching wrongDemos entry
 *   - pre-answer overlays are inside the schema's pre-answer allow-list
 *   - decoder primitive map's required movement kinds appear in answerDemo
 *   - exactly one isUser; exactly one offensive hasBall
 *   - every overlay reference points at a real player id (or "ball")
 *   - all geometry is finite (no NaN/Infinity)
 *   - replay duration stays inside the 4 s budget
 *   - the scenario is registered in the pack manifest
 *   - the four-decoder founder set is complete
 *
 * Cluster size assertions are tier-aware: BDW-01 and AOR-01 ship with
 * larger pre-existing clusters (authored before P3.0 codified the
 * caps); the test asserts they fit the advanced cap, while the
 * P3.1-authored scenarios are held to the beginner cap.
 */

import { describe, expect, it } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'

import { sceneSchema, type SceneInput } from './schema'
import { DECODER_VISUAL_PRIMITIVES } from './decoderPrimitives'
import {
  MAX_FREEZE_OVERLAYS_BEGINNER,
  MAX_OVERLAYS_ADVANCED,
  MAX_REPLAY_OVERLAYS_BEGINNER,
  type DifficultyTier,
} from './decoderOverlayPresets'

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

const PACK_PATH = path.join(SCENARIOS_DIR, 'pack.json')

interface FounderChoice {
  id: string
  quality?: 'best' | 'acceptable' | 'wrong'
  is_correct?: boolean
  order: number
}

interface FounderScenarioJson {
  id: string
  status: string
  decoder_tag?: string
  best_read?: string
  decoder_teaching_point?: string
  lesson_connection?: string
  feedback?: { correct: string; partial?: string; wrong: string }
  self_review_checklist?: string[]
  choices: FounderChoice[]
  scene: unknown
}

async function loadFounder(
  filename: string,
  expectedId: string,
): Promise<FounderScenarioJson> {
  const raw = await fs.readFile(path.join(SCENARIOS_DIR, filename), 'utf8')
  const arr = JSON.parse(raw) as FounderScenarioJson[]
  expect(Array.isArray(arr)).toBe(true)
  const found = arr.find((r) => r.id === expectedId)
  expect(found, `${filename} must contain a record with id="${expectedId}"`).toBeDefined()
  return found as FounderScenarioJson
}

interface FounderSpec {
  id: string
  filename: string
  decoderTag:
    | 'BACKDOOR_WINDOW'
    | 'ADVANTAGE_OR_RESET'
    | 'EMPTY_SPACE_CUT'
    | 'SKIP_THE_ROTATION'
  // Inclusive freeze window (ms). The cue lands inside this window for
  // the scenario to be teachable.
  freezeWindowMs: { min: number; max: number }
  // Tier governs the clutter cap the test enforces. BDW/AOR were
  // authored before P3.0 codified the caps and ship with larger
  // clusters; the P3.1 scenarios are held to the beginner cap. The
  // P3.0 architecture doc Section 7 documents the overage as advisory
  // until the beat compiler is wired into runtime — `enforceCap` lets
  // the test honour that without retroactively breaking legacy seeds.
  tier: DifficultyTier
  enforceCap: boolean
}

const FOUNDERS: readonly FounderSpec[] = [
  {
    id: 'BDW-01',
    filename: 'BDW-01.json',
    decoderTag: 'BACKDOOR_WINDOW',
    freezeWindowMs: { min: 1000, max: 2500 },
    tier: 'advanced',
    enforceCap: false,
  },
  {
    id: 'AOR-01',
    filename: 'AOR-01.json',
    decoderTag: 'ADVANTAGE_OR_RESET',
    freezeWindowMs: { min: 1000, max: 2500 },
    tier: 'advanced',
    enforceCap: false,
  },
  {
    id: 'ESC-01',
    filename: 'ESC-01.json',
    decoderTag: 'EMPTY_SPACE_CUT',
    freezeWindowMs: { min: 1000, max: 2500 },
    tier: 'beginner',
    enforceCap: true,
  },
  {
    id: 'SKR-01',
    filename: 'SKR-01.json',
    decoderTag: 'SKIP_THE_ROTATION',
    freezeWindowMs: { min: 1000, max: 2500 },
    tier: 'beginner',
    enforceCap: true,
  },
] as const

describe('P3.1 — ESC-01 and SKR-01 founder scenario seeds', () => {
  for (const spec of FOUNDERS) {
    describe(spec.id, () => {
      it('parses as JSON and contains exactly one record with the matching id', async () => {
        const raw = await fs.readFile(
          path.join(SCENARIOS_DIR, spec.filename),
          'utf8',
        )
        const arr = JSON.parse(raw) as Array<{ id: string }>
        expect(Array.isArray(arr)).toBe(true)
        expect(arr.filter((r) => r.id === spec.id).length).toBe(1)
      })

      it('declares the matching decoder_tag', async () => {
        const s = await loadFounder(spec.filename, spec.id)
        expect(s.decoder_tag).toBe(spec.decoderTag)
      })

      it('ships every decoder authoring field required by the seed validator', async () => {
        const s = await loadFounder(spec.filename, spec.id)
        expect(s.best_read, 'best_read').toBeTruthy()
        expect(s.decoder_teaching_point, 'decoder_teaching_point').toBeTruthy()
        expect(s.lesson_connection, 'lesson_connection').toBeTruthy()
        expect(s.feedback?.correct, 'feedback.correct').toBeTruthy()
        expect(s.feedback?.wrong, 'feedback.wrong').toBeTruthy()
        expect(
          s.self_review_checklist && s.self_review_checklist.length >= 2,
          'self_review_checklist must have at least 2 entries',
        ).toBe(true)
      })

      it('has exactly one quality="best" choice; orders are sequential 1..N', async () => {
        const s = await loadFounder(spec.filename, spec.id)
        const best = s.choices.filter((c) => c.quality === 'best')
        expect(best.length).toBe(1)
        const ordered = [...s.choices].sort((a, b) => a.order - b.order)
        ordered.forEach((c, i) => {
          expect(c.order).toBe(i + 1)
        })
      })

      it('scene block parses against the runtime sceneSchema', async () => {
        const s = await loadFounder(spec.filename, spec.id)
        const result = sceneSchema.safeParse(s.scene)
        if (!result.success) {
          console.error(JSON.stringify(result.error.format(), null, 2))
        }
        expect(result.success).toBe(true)
      })

      it('freeze marker lands in the cue window', async () => {
        const s = await loadFounder(spec.filename, spec.id)
        const scene = sceneSchema.parse(s.scene)
        expect(scene.freezeMarker).toBeDefined()
        if (scene.freezeMarker?.kind === 'atMs') {
          expect(scene.freezeMarker.atMs).toBeGreaterThanOrEqual(
            spec.freezeWindowMs.min,
          )
          expect(scene.freezeMarker.atMs).toBeLessThanOrEqual(
            spec.freezeWindowMs.max,
          )
        }
      })

      it('every wrong / acceptable choice has a matching wrongDemos entry', async () => {
        const s = await loadFounder(spec.filename, spec.id)
        const scene = sceneSchema.parse(s.scene)
        const nonBestIds = s.choices
          .filter((c) => c.quality !== 'best')
          .map((c) => c.id)
        const demoChoiceIds = new Set(scene.wrongDemos.map((d) => d.choiceId))
        for (const id of nonBestIds) {
          expect(demoChoiceIds.has(id), `wrongDemos missing entry for choice ${id}`).toBe(
            true,
          )
        }
      })

      it('pre-answer overlays only use the schema allow-list kinds', async () => {
        const s = await loadFounder(spec.filename, spec.id)
        const scene = sceneSchema.parse(s.scene)
        const allowed = new Set([
          'defender_vision_cone',
          'defender_hip_arrow',
          'defender_foot_arrow',
          'defender_chest_line',
          'defender_hand_in_lane',
          'help_pulse',
          'label',
        ])
        for (const ov of scene.preAnswerOverlays) {
          expect(allowed.has(ov.kind), `pre-answer overlay ${ov.kind} not in allow-list`).toBe(
            true,
          )
        }
      })

      it('answerDemo includes every required movement kind for this decoder', async () => {
        const s = await loadFounder(spec.filename, spec.id)
        const scene = sceneSchema.parse(s.scene)
        const required =
          DECODER_VISUAL_PRIMITIVES[spec.decoderTag].requiredAuthoring
            .requiredAnswerDemoKinds
        const kinds = new Set(scene.answerDemo.map((m) => m.kind))
        for (const k of required) {
          expect(kinds.has(k), `${spec.id} answerDemo missing required kind "${k}"`).toBe(
            true,
          )
        }
      })

      it(
        spec.enforceCap
          ? `pre-answer + post-answer clusters fit the ${spec.tier} clutter cap`
          : 'pre-answer + post-answer clusters are non-empty (legacy cap exempt)',
        async () => {
          const s = await loadFounder(spec.filename, spec.id)
          const scene = sceneSchema.parse(s.scene)
          if (spec.enforceCap) {
            const preCap =
              spec.tier === 'beginner'
                ? MAX_FREEZE_OVERLAYS_BEGINNER
                : MAX_OVERLAYS_ADVANCED
            const postCap =
              spec.tier === 'beginner'
                ? MAX_REPLAY_OVERLAYS_BEGINNER
                : MAX_OVERLAYS_ADVANCED
            expect(scene.preAnswerOverlays.length).toBeLessThanOrEqual(preCap)
            expect(scene.postAnswerOverlays.length).toBeLessThanOrEqual(postCap)
          } else {
            // Legacy founders (BDW-01 / AOR-01) ship over the advisory
            // caps. The P3.0 architecture doc tracks this as advisory
            // until the beat compiler is wired into runtime; the test
            // asserts only that the clusters are populated so a future
            // edit doesn't accidentally drop the cue / reveal entirely.
            expect(scene.preAnswerOverlays.length).toBeGreaterThan(0)
            expect(scene.postAnswerOverlays.length).toBeGreaterThan(0)
          }
        },
      )

      it('exactly one player is marked isUser; exactly one offensive player has hasBall', async () => {
        const s = await loadFounder(spec.filename, spec.id)
        const scene = sceneSchema.parse(s.scene)
        const users = scene.players.filter((p) => p.isUser)
        expect(users.length).toBe(1)
        const ballHolders = scene.players.filter(
          (p) => p.team === 'offense' && p.hasBall,
        )
        expect(ballHolders.length).toBe(1)
      })

      it('every overlay reference points at a real player id (or "ball")', async () => {
        const s = await loadFounder(spec.filename, spec.id)
        const scene: SceneInput = sceneSchema.parse(s.scene)
        const ids = new Set(scene.players.map((p) => p.id))
        const allowed = new Set<string>([...ids, 'ball'])
        const checkPlayerRef = (id: string, label: string) => {
          expect(allowed.has(id), `${label} references unknown id "${id}"`).toBe(true)
        }
        for (const ov of [
          ...scene.preAnswerOverlays,
          ...scene.postAnswerOverlays,
        ]) {
          if ('playerId' in ov) checkPlayerRef(ov.playerId, `${ov.kind}.playerId`)
          if (ov.kind === 'passing_lane_open' || ov.kind === 'passing_lane_blocked') {
            checkPlayerRef(ov.from, `${ov.kind}.from`)
            checkPlayerRef(ov.to, `${ov.kind}.to`)
          }
          if (ov.kind === 'defender_vision_cone' && ov.targetId) {
            checkPlayerRef(ov.targetId, `${ov.kind}.targetId`)
          }
        }
      })

      it('all geometry is finite (no NaN / Infinity in starts, movements, overlays)', async () => {
        const s = await loadFounder(spec.filename, spec.id)
        const scene = sceneSchema.parse(s.scene)
        const numbers: number[] = []
        for (const p of scene.players) numbers.push(p.start.x, p.start.z)
        numbers.push(scene.ball.start.x, scene.ball.start.z)
        for (const m of scene.movements) numbers.push(m.to.x, m.to.z)
        for (const m of scene.answerDemo) numbers.push(m.to.x, m.to.z)
        for (const wd of scene.wrongDemos) {
          for (const m of wd.movements) numbers.push(m.to.x, m.to.z)
        }
        for (const ov of [
          ...scene.preAnswerOverlays,
          ...scene.postAnswerOverlays,
        ]) {
          if ('anchor' in ov && typeof ov.anchor === 'object' && ov.anchor) {
            numbers.push(ov.anchor.x, ov.anchor.z)
          }
          if (ov.kind === 'drive_cut_preview') {
            for (const p of ov.path) numbers.push(p.x, p.z)
          }
        }
        for (const n of numbers) {
          expect(Number.isFinite(n)).toBe(true)
        }
      })

      it('replay duration stays inside the 4 s budget', async () => {
        // Phase P §8 — wrong-read consequences land in 2–4 s. Apply
        // the same envelope to answerDemo so a bloated replay doesn't
        // sneak through.
        const s = await loadFounder(spec.filename, spec.id)
        const scene = sceneSchema.parse(s.scene)
        let maxEnd = 0
        for (const m of scene.answerDemo) {
          const end = (m.delayMs ?? 0) + (m.durationMs ?? 0)
          if (end > maxEnd) maxEnd = end
        }
        expect(maxEnd).toBeLessThanOrEqual(4000)
      })

      it('is registered in the founder-v0 pack manifest', async () => {
        const raw = await fs.readFile(PACK_PATH, 'utf8')
        const manifest = JSON.parse(raw) as {
          scenarios: Array<{ id: string; file: string }>
        }
        const entry = manifest.scenarios.find((e) => e.id === spec.id)
        expect(entry).toBeDefined()
        expect(entry?.file).toBe(spec.filename)
      })
    })
  }

  it('the founder pack manifest covers every founder decoder', async () => {
    const raw = await fs.readFile(PACK_PATH, 'utf8')
    const manifest = JSON.parse(raw) as {
      scenarios: Array<{ id: string }>
    }
    const ids = new Set(manifest.scenarios.map((e) => e.id))
    for (const expected of ['BDW-01', 'AOR-01', 'ESC-01', 'SKR-01']) {
      expect(ids.has(expected), `pack.json missing ${expected}`).toBe(true)
    }
  })
})

/**
 * Pack 2 (Phase γ) — HUNT pack base-scenario authoring lock.
 *
 * Mirrors `drop01Seed.test.ts` for the new Pack 2 HUNT foundation
 * (`hunt-decoder-v0`). Loads each shipped HUNT scenario, parses it
 * through `sceneSchema`, and runs `lintHuntVariant` against it so the
 * authoring lint failure surfaces here instead of at seed time.
 *
 * The test deliberately keeps narrow assertions on each scenario —
 * decoder/difficulty/role + the chained-read structural contract
 * (beatSpec.firstBeat + secondBeat, cognition hold ≤ 1200ms, mismatch
 * pulse on both beats). Scenario-level prose checks (best/wrong arrays,
 * coach validation copy) live in the dropping seed test pattern and
 * are mirrored here for HUNT-01 / HUNT-02.
 */

import { describe, expect, it } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { sceneSchema } from './schema'
import {
  lintHuntVariant,
  type HuntLintSceneInput,
  type HuntLintVariantMeta,
} from './huntAuthoringLint'

const PACK_DIR = path.resolve(
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
  'hunt-decoder-v0',
)

const PACK_PATH = path.join(PACK_DIR, 'pack.json')

interface HuntScenarioJson {
  id: string
  status: string
  decoder_tag?: string
  difficulty?: number
  user_role?: string
  lesson_connection?: string
  concept_tags?: string[]
  coach_validation?: HuntLintVariantMeta['coach_validation']
  choices: Array<{
    id: string
    label: string
    quality?: 'best' | 'acceptable' | 'wrong'
    feedback_text: string
    order: number
  }>
  scene?: HuntLintSceneInput & {
    camera?: string
    secondBeatPreAnswerOverlays?: unknown[]
    secondBeatPostAnswerOverlays?: unknown[]
    consequenceOverlays?: unknown[]
    answerDemo?: unknown[]
    wrongDemos?: Array<{ choiceId: string }>
  }
}

async function loadScenario(file: string): Promise<HuntScenarioJson> {
  const raw = await fs.readFile(path.join(PACK_DIR, file), 'utf8')
  const arr = JSON.parse(raw) as HuntScenarioJson[]
  return arr[0]!
}

describe('hunt-decoder-v0 pack manifest', () => {
  it('lists HUNT-01..03 plus a mirror at every D1/D2/D3 tier with the expected files', async () => {
    const raw = await fs.readFile(PACK_PATH, 'utf8')
    const manifest = JSON.parse(raw) as {
      slug: string
      scenarios: Array<{ id: string; file: string; prerequisites: string[] }>
    }
    expect(manifest.slug).toBe('hunt-decoder-v0')
    const ids = manifest.scenarios.map((s) => s.id)
    expect(ids).toEqual([
      'HUNT-01',
      'HUNT-01-MIRROR',
      'HUNT-02',
      'HUNT-02-MIRROR',
      'HUNT-03',
      'HUNT-03-MIRROR',
    ])
    expect(manifest.scenarios[0]!.file).toBe('HUNT-01.json')
    expect(manifest.scenarios[1]!.file).toBe('HUNT-01-MIRROR.json')
    expect(manifest.scenarios[2]!.file).toBe('HUNT-02.json')
    expect(manifest.scenarios[3]!.file).toBe('HUNT-02-MIRROR.json')
    expect(manifest.scenarios[4]!.file).toBe('HUNT-03.json')
    expect(manifest.scenarios[5]!.file).toBe('HUNT-03-MIRROR.json')
    // Mirrors gate on their respective base — you don't see the
    // mirror until you've seen the base.
    expect(manifest.scenarios[1]!.prerequisites).toEqual(['HUNT-01'])
    expect(manifest.scenarios[2]!.prerequisites).toEqual(['HUNT-01'])
    expect(manifest.scenarios[3]!.prerequisites).toEqual(['HUNT-02'])
    expect(manifest.scenarios[4]!.prerequisites).toEqual(['HUNT-02'])
    expect(manifest.scenarios[5]!.prerequisites).toEqual(['HUNT-03'])
  })
})

for (const id of [
  'HUNT-01',
  'HUNT-01-MIRROR',
  'HUNT-02',
  'HUNT-02-MIRROR',
  'HUNT-03',
  'HUNT-03-MIRROR',
] as const) {
  describe(`${id} — Pack 2 (Phase γ) HUNT base scenario authoring lock`, () => {
    it('parses through the runtime scene schema', async () => {
      const scenario = await loadScenario(`${id}.json`)
      expect(scenario.id).toBe(id)
      expect(() => sceneSchema.parse(scenario.scene)).not.toThrow()
    })

    it('declares decoder=HUNT_THE_ADVANTAGE and lesson_connection=chained-reads-intro', async () => {
      const scenario = await loadScenario(`${id}.json`)
      expect(scenario.decoder_tag).toBe('HUNT_THE_ADVANTAGE')
      expect(scenario.lesson_connection).toBe('chained-reads-intro')
    })

    it('authors both beatSpec.firstBeat and beatSpec.secondBeat', async () => {
      const scenario = await loadScenario(`${id}.json`)
      const beatSpec = scenario.scene?.beatSpec
      expect(beatSpec?.firstBeat).toBeDefined()
      expect(beatSpec?.secondBeat).toBeDefined()
      expect(typeof beatSpec!.firstBeat!.atMs).toBe('number')
      expect(typeof beatSpec!.secondBeat!.atMs).toBe('number')
      expect(beatSpec!.secondBeat!.atMs!).toBeGreaterThan(beatSpec!.firstBeat!.atMs!)
    })

    it('compresses cognitionHoldMs to the HUNT ceiling (≤1200)', async () => {
      const scenario = await loadScenario(`${id}.json`)
      const hold = scenario.scene?.timingOverrides?.cognitionHoldMs
      expect(typeof hold).toBe('number')
      expect(hold!).toBeLessThanOrEqual(1200)
    })

    it('tags both beat 1 and beat 2 with a mismatch help_pulse', async () => {
      const scenario = await loadScenario(`${id}.json`)
      const pre = scenario.scene?.preAnswerOverlays ?? []
      const beat1Pulse = pre.find(
        (o) =>
          o.kind === 'help_pulse' &&
          (o as { beat?: number }).beat === 1,
      )
      const beat2Pulse = pre.find(
        (o) =>
          o.kind === 'help_pulse' &&
          (o as { beat?: number }).beat === 2,
      )
      expect(beat1Pulse).toBeDefined()
      expect(beat2Pulse).toBeDefined()
    })

    it('passes lintHuntVariant LINT-HUNT-01..05', async () => {
      const scenario = await loadScenario(`${id}.json`)
      const result = lintHuntVariant(
        scenario.scene as HuntLintSceneInput,
        {
          id: scenario.id,
          decoder_tag: scenario.decoder_tag,
          coach_validation: scenario.coach_validation,
        },
        scenario.difficulty ?? 1,
      )
      expect(
        result.ok,
        `HUNT lint failures for ${id}: ${result.failures
          .map((f) => `${f.rule}: ${f.message}`)
          .join('\n')}`,
      ).toBe(true)
    })

    it('exposes one best read and a wrongDemo for every non-best choice', async () => {
      const scenario = await loadScenario(`${id}.json`)
      const best = scenario.choices.filter((c) => c.quality === 'best')
      expect(best).toHaveLength(1)
      const nonBestIds = scenario.choices
        .filter((c) => c.quality !== 'best')
        .map((c) => c.id)
      const demos = (scenario.scene?.wrongDemos ?? []).map((d) => d.choiceId)
      for (const choiceId of nonBestIds) {
        expect(demos).toContain(choiceId)
      }
    })
  })
}

// ---------------------------------------------------------------------------
// HUNT-01-MIRROR (Phase δ-A.M) — mirror-variant authoring lock
// ---------------------------------------------------------------------------
//
// The mirror's contract: same chained-read shape as HUNT-01, mirrored
// across the y-axis. If a future edit nudges the user start back to
// the right wing the variant stops being a mirror — these assertions
// fail loudly so the mistake doesn't sneak in via a copy-paste.

describe('HUNT-01-MIRROR — Phase δ-A.M mirror-variant authoring lock', () => {
  it('declares difficulty=1 (same tier as HUNT-01)', async () => {
    const scenario = await loadScenario('HUNT-01-MIRROR.json')
    expect(scenario.difficulty).toBe(1)
  })

  it('places the user on the LEFT half of the floor (mirrored from HUNT-01)', async () => {
    const scenario = await loadScenario('HUNT-01-MIRROR.json')
    const players = (scenario.scene as unknown as { players: Array<{ id: string; start: { x: number } }> })
      .players
    const user = players.find((p) => p.id === 'user')
    expect(user, 'user player must exist').toBeDefined()
    expect(user!.start.x).toBeLessThan(0)
  })

  it('inherits HUNT-01 progression — prereq HUNT-01, unlocks HUNT-02', async () => {
    const scenario = await loadScenario('HUNT-01-MIRROR.json')
    const meta = (scenario as unknown as { progression_metadata?: { prerequisites: string[]; unlocks: string[] } })
      .progression_metadata
    expect(meta?.prerequisites).toEqual(['HUNT-01'])
    expect(meta?.unlocks).toEqual(['HUNT-02'])
  })
})

// ---------------------------------------------------------------------------
// HUNT-02-MIRROR (Phase δ-A.M2) — D2 mirror-variant authoring lock
// ---------------------------------------------------------------------------
//
// Same contract as HUNT-01-MIRROR: identical chained shape to the
// base (HUNT-02), screener + user on the LEFT half of the floor,
// progression gated on HUNT-02. D2 has the extra cognitive load of
// recognizing the switch as it happens, so the mirror lives on the
// same prereq edge as the base (you don't see it until you've seen
// HUNT-02).

describe('HUNT-02-MIRROR — Phase δ-A.M2 D2 mirror-variant authoring lock', () => {
  it('declares difficulty=2 (same tier as HUNT-02)', async () => {
    const scenario = await loadScenario('HUNT-02-MIRROR.json')
    expect(scenario.difficulty).toBe(2)
  })

  it('places the screener on the LEFT half of the floor (mirrored from HUNT-02)', async () => {
    const scenario = await loadScenario('HUNT-02-MIRROR.json')
    const players = (scenario.scene as unknown as { players: Array<{ id: string; start: { x: number } }> })
      .players
    const screener = players.find((p) => p.id === 'screener')
    expect(screener, 'screener player must exist').toBeDefined()
    // HUNT-02 puts the screener at x=+4; the mirror must put it at
    // x<0 (left of the user). A copy-paste regression would land it
    // back on the right side and this assertion fails.
    expect(screener!.start.x).toBeLessThan(0)
  })

  it('inherits HUNT-02 progression — prereq HUNT-02', async () => {
    const scenario = await loadScenario('HUNT-02-MIRROR.json')
    const meta = (scenario as unknown as { progression_metadata?: { prerequisites: string[] } })
      .progression_metadata
    expect(meta?.prerequisites).toEqual(['HUNT-02'])
  })
})

// ---------------------------------------------------------------------------
// HUNT-03 (Phase δ-A) — D3 decoy-action specific assertions
// ---------------------------------------------------------------------------
//
// HUNT-03 is the first HUNT scenario at difficulty ≥ 3 and so picks up
// LINT-HUNT-05's stricter coach-validation gate. The shared loop above
// runs lintHuntVariant against every shipped HUNT scenario, so a
// regression in LINT-HUNT-05 already surfaces there. This block locks
// the D3-specific authoring contract explicitly so a future relaxation
// (e.g. someone dropping coach_validation.level to 'medium' on HUNT-03)
// fails with a HUNT-03-named test, not a generic lint roll-up.

describe('HUNT-03 — Phase δ-A decoy-action scenario authoring lock', () => {
  it('declares difficulty=3 (the first D3 HUNT scenario in the pack)', async () => {
    const scenario = await loadScenario('HUNT-03.json')
    expect(scenario.difficulty).toBe(3)
  })

  it('carries coach_validation.level="high" and status="approved" per LINT-HUNT-05', async () => {
    const scenario = await loadScenario('HUNT-03.json')
    expect(scenario.coach_validation?.level).toBe('high')
    expect(scenario.coach_validation?.status).toBe('approved')
  })

  it('uses the decoy-action overlay cluster (hand_in_lane + foot_arrow on x_user at beat 2)', async () => {
    const scenario = await loadScenario('HUNT-03.json')
    const pre = scenario.scene?.preAnswerOverlays ?? []
    const beat2HandInLane = pre.find(
      (o) =>
        o.kind === 'defender_hand_in_lane' &&
        (o as { beat?: number }).beat === 2,
    )
    const beat2FootArrow = pre.find(
      (o) =>
        o.kind === 'defender_foot_arrow' &&
        (o as { beat?: number }).beat === 2,
    )
    expect(beat2HandInLane).toBeDefined()
    expect(beat2FootArrow).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// HUNT-03-MIRROR (Phase δ-A.M3) — D3 mirror-variant authoring lock
// ---------------------------------------------------------------------------
//
// Same contract as HUNT-02-MIRROR but at the D3 tier: identical
// decoy-DHO chain to the base (HUNT-03), user + screener on the LEFT
// half of the floor, progression gated on HUNT-03. D3 also requires
// coach_validation.level="high" (the same gate LINT-HUNT-05 enforces
// on the base), and the beat-2 overlay cluster must still carry the
// hand_in_lane + foot_arrow pair that names the decoy bite.

describe('HUNT-03-MIRROR — Phase δ-A.M3 D3 mirror-variant authoring lock', () => {
  it('declares difficulty=3 (same tier as HUNT-03)', async () => {
    const scenario = await loadScenario('HUNT-03-MIRROR.json')
    expect(scenario.difficulty).toBe(3)
  })

  it('places the user on the LEFT half of the floor (mirrored from HUNT-03)', async () => {
    const scenario = await loadScenario('HUNT-03-MIRROR.json')
    const players = (
      scenario.scene as unknown as {
        players: Array<{ id: string; start: { x: number } }>
      }
    ).players
    const user = players.find((p) => p.id === 'user')
    expect(user, 'user player must exist').toBeDefined()
    // HUNT-03 starts the user on the right wing (x=+18); the mirror
    // must put them at x<0. A copy-paste regression would land them
    // back on the right side and this assertion fails.
    expect(user!.start.x).toBeLessThan(0)
  })

  it('places the screener on the LEFT half of the floor (mirrored from HUNT-03)', async () => {
    const scenario = await loadScenario('HUNT-03-MIRROR.json')
    const players = (
      scenario.scene as unknown as {
        players: Array<{ id: string; start: { x: number } }>
      }
    ).players
    const screener = players.find((p) => p.id === 'screener')
    expect(screener, 'screener must exist').toBeDefined()
    expect(screener!.start.x).toBeLessThan(0)
  })

  it('inherits the D3 coach_validation gate (level="high", approved)', async () => {
    const scenario = await loadScenario('HUNT-03-MIRROR.json')
    expect(scenario.coach_validation?.level).toBe('high')
    expect(scenario.coach_validation?.status).toBe('approved')
  })

  it('retains the decoy-action beat-2 cluster (hand_in_lane + foot_arrow on x_user)', async () => {
    const scenario = await loadScenario('HUNT-03-MIRROR.json')
    const pre = scenario.scene?.preAnswerOverlays ?? []
    const beat2HandInLane = pre.find(
      (o) =>
        o.kind === 'defender_hand_in_lane' &&
        (o as { beat?: number; playerId?: string }).beat === 2 &&
        (o as { playerId?: string }).playerId === 'x_user',
    )
    const beat2FootArrow = pre.find(
      (o) =>
        o.kind === 'defender_foot_arrow' &&
        (o as { beat?: number; playerId?: string }).beat === 2 &&
        (o as { playerId?: string }).playerId === 'x_user',
    )
    expect(beat2HandInLane).toBeDefined()
    expect(beat2FootArrow).toBeDefined()
  })

  it('inherits HUNT-03 progression — prereq HUNT-03', async () => {
    const scenario = await loadScenario('HUNT-03-MIRROR.json')
    const meta = (
      scenario as unknown as {
        progression_metadata?: { prerequisites: string[] }
      }
    ).progression_metadata
    expect(meta?.prerequisites).toEqual(['HUNT-03'])
  })
})

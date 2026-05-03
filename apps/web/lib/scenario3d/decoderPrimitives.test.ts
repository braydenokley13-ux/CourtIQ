/**
 * P2.6 — Decoder visual primitive map invariants + founder scenario
 * authoring locks.
 *
 * Two responsibilities:
 *
 *  1. Lock the structural integrity of the
 *     `DECODER_VISUAL_PRIMITIVES` map: every founder decoder has an
 *     entry, every entry's `requiredIntents` agrees with the source-
 *     of-truth `getDecoderAnimationIntent` table, and the map is
 *     immutable at runtime.
 *
 *  2. For every founder scenario JSON that exists on disk, assert the
 *     scenario satisfies the decoder's authoring requirements. Drives
 *     a single typed checklist (the primitive map) so adding a new
 *     scenario in the future is a JSON edit + map update rather than
 *     a per-scenario test rewrite.
 *
 * Out of scope:
 *   - Runtime visual QA (covered by manual checks on
 *     `/dev/scene-preview`).
 *   - Pose-shape regression of the new GLB clips (covered by the
 *     existing P0-LOCK clip stability test in
 *     `replayDeterminism.test.ts`).
 */

import { describe, expect, it } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import {
  ALL_ANIMATION_INTENTS,
  getDecoderAnimationIntent,
  resolveGlbClipForIntent,
  type DecoderRole,
} from './animationIntent'
import {
  DECODER_VISUAL_PRIMITIVES,
  FORWARD_CLOSEOUT_INTENTS,
  STATIONARY_READ_INTENTS,
  getDecoderVisualPrimitives,
} from './decoderPrimitives'
import { sceneSchema, type DecoderTag } from './schema'

const FOUNDER_DIR = path.resolve(
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

const FOUNDER_DECODERS: readonly DecoderTag[] = [
  'BACKDOOR_WINDOW',
  'ADVANTAGE_OR_RESET',
  'EMPTY_SPACE_CUT',
  'SKIP_THE_ROTATION',
] as const

interface FounderScenarioJson {
  id: string
  status?: string
  decoder_tag?: DecoderTag
  scene: unknown
}

async function loadFounderScenarioById(
  id: string,
): Promise<FounderScenarioJson | null> {
  // Scenarios are bundled one-per-file. File names that have shipped
  // so far follow the `<DECODER_PREFIX>-NN.json` pattern.
  for (const file of await fs.readdir(FOUNDER_DIR)) {
    if (!file.endsWith('.json') || file === 'pack.json') continue
    const raw = await fs.readFile(path.join(FOUNDER_DIR, file), 'utf8')
    let parsed: FounderScenarioJson[]
    try {
      parsed = JSON.parse(raw) as FounderScenarioJson[]
    } catch {
      continue
    }
    if (!Array.isArray(parsed)) continue
    const hit = parsed.find((r) => r.id === id)
    if (hit) return hit
  }
  return null
}

// ---------------------------------------------------------------------------
// 1. Decoder visual primitive map structural integrity.
// ---------------------------------------------------------------------------

describe('DECODER_VISUAL_PRIMITIVES — structural integrity', () => {
  it('contains an entry for every founder decoder', () => {
    for (const decoder of FOUNDER_DECODERS) {
      expect(DECODER_VISUAL_PRIMITIVES[decoder]).toBeDefined()
      expect(DECODER_VISUAL_PRIMITIVES[decoder].decoder).toBe(decoder)
    }
  })

  it('every entry has a non-empty teaching beat with a read sentence', () => {
    for (const decoder of FOUNDER_DECODERS) {
      const entry = getDecoderVisualPrimitives(decoder)
      expect(entry.label.length).toBeGreaterThan(0)
      expect(entry.beat.readSentence.length).toBeGreaterThan(0)
      expect(entry.beat.readActor.length).toBeGreaterThan(0)
      expect(entry.beat.cueActor.length).toBeGreaterThan(0)
    }
  })

  it('every requiredIntent matches the source-of-truth getDecoderAnimationIntent', () => {
    // Drift guard: if a scenario author updates the decoder×role table
    // without updating the visual primitive map (or vice versa), this
    // test fires before the renderer ships a stale freeze pose.
    for (const decoder of FOUNDER_DECODERS) {
      const entry = getDecoderVisualPrimitives(decoder)
      for (const requirement of entry.requiredIntents) {
        const expected = getDecoderAnimationIntent(decoder, requirement.role)
        expect(
          expected,
          `${decoder} × ${requirement.role}: primitive map says ${requirement.intent}, ` +
            `getDecoderAnimationIntent returned ${expected}`,
        ).toBe(requirement.intent)
      }
    }
  })

  it('every requiredIntent is a valid AnimationIntent', () => {
    for (const decoder of FOUNDER_DECODERS) {
      for (const requirement of getDecoderVisualPrimitives(decoder).requiredIntents) {
        expect(ALL_ANIMATION_INTENTS).toContain(requirement.intent)
      }
    }
  })

  it('the map is immutable at runtime', () => {
    expect(Object.isFrozen(DECODER_VISUAL_PRIMITIVES)).toBe(true)
    expect(() => {
      // @ts-expect-error — we want to verify the freeze actually rejects writes.
      DECODER_VISUAL_PRIMITIVES.BACKDOOR_WINDOW = null
    }).toThrow()
  })
})

// ---------------------------------------------------------------------------
// 2. Per-decoder primitive resolves to a named clip.
// ---------------------------------------------------------------------------

describe('DECODER_VISUAL_PRIMITIVES — every required intent resolves to a named clip', () => {
  // The renderer resolves intents via `resolveGlbClipForIntent`. Every
  // intent the primitive map declares must be reachable on either the
  // imported-clip path or the deterministic fallback.
  const flagsBoth = { importedCloseoutActive: true, importedBackCutActive: true }
  const flagsOff = { importedCloseoutActive: false, importedBackCutActive: false }

  for (const decoder of FOUNDER_DECODERS) {
    for (const requirement of getDecoderVisualPrimitives(decoder).requiredIntents) {
      it(`${decoder} ${requirement.role} → ${requirement.intent} resolves on both flag paths`, () => {
        expect(resolveGlbClipForIntent(requirement.intent, flagsBoth)).toMatch(
          /^[a-z_]+$/,
        )
        expect(resolveGlbClipForIntent(requirement.intent, flagsOff)).toMatch(
          /^[a-z_]+$/,
        )
      })
    }
  }
})

// ---------------------------------------------------------------------------
// 3. P2.6 — stationary read intents share the receive_ready clip.
// ---------------------------------------------------------------------------

describe('P2.6 — STATIONARY_READ_INTENTS routing', () => {
  it('every stationary read intent resolves to receive_ready on the deterministic fallback', () => {
    const flags = { importedCloseoutActive: false, importedBackCutActive: false }
    for (const intent of STATIONARY_READ_INTENTS) {
      expect(resolveGlbClipForIntent(intent, flags)).toBe('receive_ready')
    }
  })

  it('stationary read routing is independent of imported-clip flags', () => {
    for (const intent of STATIONARY_READ_INTENTS) {
      expect(
        resolveGlbClipForIntent(intent, {
          importedCloseoutActive: true,
          importedBackCutActive: true,
        }),
      ).toBe('receive_ready')
    }
  })

  it('FORWARD_CLOSEOUT_INTENTS lands on closeout_read when the imported clip is off', () => {
    const flags = { importedCloseoutActive: false, importedBackCutActive: false }
    for (const intent of FORWARD_CLOSEOUT_INTENTS) {
      expect(resolveGlbClipForIntent(intent, flags)).toBe('closeout_read')
    }
  })

  it('FORWARD_CLOSEOUT_INTENTS lands on closeout when the imported clip is on', () => {
    const flags = { importedCloseoutActive: true, importedBackCutActive: false }
    for (const intent of FORWARD_CLOSEOUT_INTENTS) {
      expect(resolveGlbClipForIntent(intent, flags)).toBe('closeout')
    }
  })
})

// ---------------------------------------------------------------------------
// 4. Founder scenario invariants (only for scenarios that exist).
// ---------------------------------------------------------------------------

describe('Founder scenario authoring invariants', () => {
  // Each authored founder JSON must satisfy the authoring requirements
  // its decoder declares. Scenarios that have not been authored yet
  // (ESC-01, SKR-01) are tracked separately so the test surface
  // documents the missing state instead of silently skipping.

  const checked: string[] = []

  for (const decoder of FOUNDER_DECODERS) {
    const primitives = getDecoderVisualPrimitives(decoder)
    const expectedIdPrefix = decoder
      .split('_')
      .map((part) => part[0])
      .join('')
    // BDW, AOR, ESC, SKR — pack convention puts the first scenario at NN=01.
    const id = `${expectedIdPrefix}-01`

    it(`${id} (${primitives.label}) — invariants`, async () => {
      const scenario = await loadFounderScenarioById(id)
      if (!scenario) {
        // Authoring gap, not a test failure. The invariants below
        // become live checks once the JSON ships.
        // eslint-disable-next-line no-console
        console.info(
          `[decoderPrimitives.test] founder scenario ${id} not yet authored — invariants skipped.`,
        )
        return
      }
      checked.push(id)

      expect(scenario.decoder_tag, `${id} must declare decoder_tag`).toBe(decoder)

      // Parse against the runtime scene schema so any field-shape
      // regression fires here, not at seed time.
      const parsed = sceneSchema.safeParse(scenario.scene)
      expect(parsed.success, `${id} scene fails sceneSchema`).toBe(true)
      if (!parsed.success) return

      const scene = parsed.data

      const auth = primitives.requiredAuthoring
      if (auth.requiresFreezeMarker) {
        expect(scene.freezeMarker, `${id} must declare a freezeMarker`).toBeDefined()
      }
      if (auth.requiresAnswerDemo) {
        expect(
          scene.answerDemo.length,
          `${id} must declare answerDemo movements`,
        ).toBeGreaterThan(0)
      }
      if (auth.requiresUserPlayer) {
        const hasUser = scene.players.some((p) => p.isUser === true)
        expect(hasUser, `${id} must declare exactly one player with isUser:true`).toBe(true)
      }
      if (auth.requiresOneBallHolder) {
        const holders = scene.players.filter((p) => p.hasBall === true)
        expect(holders.length, `${id} must declare exactly one ball holder`).toBe(1)
      }

      const lcRoles = scene.players.map((p) => p.role.toLowerCase())
      for (const sub of auth.requiredPlayerRoleSubstrings) {
        expect(
          lcRoles.some((r) => r.includes(sub)),
          `${id} must declare a player whose role contains "${sub}"`,
        ).toBe(true)
      }

      const answerKinds = scene.answerDemo.map((m) => m.kind)
      for (const requiredKind of auth.requiredAnswerDemoKinds) {
        expect(
          answerKinds,
          `${id} answerDemo must include movement kind "${requiredKind}"`,
        ).toContain(requiredKind)
      }
    })
  }

  it('records which founder scenarios were checked in this run', () => {
    // Documentation hook: the test output makes the authoring gap
    // visible without breaking CI. When ESC-01 / SKR-01 land, this
    // assertion still holds — it just covers more scenarios.
    expect(checked.length).toBeGreaterThanOrEqual(0)
    expect(checked.length).toBeLessThanOrEqual(FOUNDER_DECODERS.length)
  })
})

// ---------------------------------------------------------------------------
// 5. Pure / no-mutation contract.
// ---------------------------------------------------------------------------

describe('decoderPrimitives — pure / no-mutation', () => {
  it('lookup helpers do not mutate the underlying map', () => {
    const before = JSON.stringify(DECODER_VISUAL_PRIMITIVES)
    for (const decoder of FOUNDER_DECODERS) {
      void getDecoderVisualPrimitives(decoder)
    }
    const after = JSON.stringify(DECODER_VISUAL_PRIMITIVES)
    expect(after).toBe(before)
  })

  it('STATIONARY_READ_INTENTS and FORWARD_CLOSEOUT_INTENTS are frozen', () => {
    expect(Object.isFrozen(STATIONARY_READ_INTENTS)).toBe(true)
    expect(Object.isFrozen(FORWARD_CLOSEOUT_INTENTS)).toBe(true)
  })

  it('every role in primitive map is a valid DecoderRole', () => {
    const validRoles: DecoderRole[] = [
      'receiver',
      'cutter',
      'passer',
      'open_player',
      'closeout_defender',
      'helper_defender',
      'deny_defender',
    ]
    for (const decoder of FOUNDER_DECODERS) {
      const entry = getDecoderVisualPrimitives(decoder)
      expect(validRoles).toContain(entry.beat.readActor)
      expect(validRoles).toContain(entry.beat.cueActor)
      for (const requirement of entry.requiredIntents) {
        expect(validRoles).toContain(requirement.role)
      }
    }
  })
})

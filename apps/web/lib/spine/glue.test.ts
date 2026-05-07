/**
 * Phase 9 — tests for the spine glue layer.
 *
 * The glue is pure: DB-shaped inputs in, spine-shaped outputs out.
 * The rest of the spine is already well-tested; these tests only need
 * to assert the shape mapping is correct (decoder grouping, sub-
 * concept parsing, freshness math).
 */
import { describe, expect, it } from 'vitest'
import type { Scenario, ScenarioChoice } from '@prisma/client'
import {
  ALL_DECODERS,
  buildDecoderConfidences,
  buildFirstSessionCatalog,
  buildReturnCatalog,
  recognitionReasonForReturnSlot,
  RETURN_FRESHNESS_DAYS,
  type AttemptWithScenario,
  type ScenarioWithChoices,
} from './glue'

const NOW = new Date('2026-05-07T12:00:00Z')

function makeScenarioRow(
  overrides: Partial<ScenarioWithChoices> = {},
): ScenarioWithChoices {
  const base: Scenario = {
    id: overrides.id ?? 'sc-1',
    version: 1,
    status: 'LIVE',
    category: 'OFFENSE',
    concept_tags: [],
    sub_concepts: [],
    difficulty: 1,
    court_state: {},
    scene: null,
    user_role: 'wing',
    prompt: '',
    explanation_md: '',
    xp_reward: 10,
    mastery_weight: 1,
    render_tier: 1,
    media_refs: [],
    decoder_tag: 'BACKDOOR_WINDOW',
    created_at: new Date('2026-05-01T00:00:00Z'),
    updated_at: new Date('2026-05-01T00:00:00Z'),
    ...overrides,
  } as Scenario
  const choices: ScenarioChoice[] = (overrides.choices as ScenarioChoice[] | undefined) ?? []
  return { ...base, choices } as ScenarioWithChoices
}

function makeAttempt(
  overrides: Partial<AttemptWithScenario> & {
    decoder_tag?: AttemptWithScenario['scenario']['decoder_tag']
    sub_concepts?: string[]
    difficulty?: number
  } = {},
): AttemptWithScenario {
  // Use `'decoder_tag' in overrides` so callers can pass null
  // explicitly without falling back to the default.
  const decoder_tag =
    'decoder_tag' in overrides ? overrides.decoder_tag ?? null : 'BACKDOOR_WINDOW'
  return {
    is_correct: overrides.is_correct ?? true,
    time_ms: overrides.time_ms ?? 3000,
    created_at: overrides.created_at ?? new Date('2026-05-06T00:00:00Z'),
    scenario: {
      decoder_tag,
      sub_concepts: overrides.sub_concepts ?? [],
      difficulty: overrides.difficulty ?? 1,
    },
  }
}

describe('buildDecoderConfidences', () => {
  it('returns an entry for every known decoder, even when the player has no attempts on it', () => {
    const result = buildDecoderConfidences([], NOW)
    expect(result.map((r) => r.decoderTag).sort()).toEqual([...ALL_DECODERS].sort())
    for (const r of result) {
      expect(r.band).toBe('untested')
    }
  })

  it('drops attempts whose decoder_tag is null (legacy fixtures)', () => {
    const attempts = [
      makeAttempt({ decoder_tag: null }),
      makeAttempt({ decoder_tag: 'BACKDOOR_WINDOW' }),
    ]
    const result = buildDecoderConfidences(attempts, NOW)
    const bdw = result.find((r) => r.decoderTag === 'BACKDOOR_WINDOW')!
    expect(bdw.evidence.attempts).toBe(1)
  })

  it('parses sub_concepts to read template + disguise + signature', () => {
    const attempts = [
      makeAttempt({
        decoder_tag: 'BACKDOOR_WINDOW',
        sub_concepts: ['tpl:BDW.denied-wing', 'sig:mirror|disg:moderate|x'],
      }),
      makeAttempt({
        decoder_tag: 'BACKDOOR_WINDOW',
        sub_concepts: ['tpl:BDW.other', 'sig:other|disg:none|x'],
        time_ms: 2500,
      }),
    ]
    const result = buildDecoderConfidences(attempts, NOW)
    const bdw = result.find((r) => r.decoderTag === 'BACKDOOR_WINDOW')!
    expect(bdw.evidence.attempts).toBe(2)
    // Two distinct templates should register as transferTemplates
    // when both attempts are recognized fast.
    expect(bdw.evidence.transferTemplates).toBeGreaterThanOrEqual(1)
  })

  it('uses daysSinceLastAttempt sentinel when the player has zero attempts on a decoder', () => {
    const attempts = [makeAttempt({ decoder_tag: 'BACKDOOR_WINDOW' })]
    const result = buildDecoderConfidences(attempts, NOW)
    const aor = result.find((r) => r.decoderTag === 'ADVANTAGE_OR_RESET')!
    // Untested → first-rep, not maintain.
    expect(aor.nextProbe).toBe('first-rep')
  })
})

describe('buildFirstSessionCatalog', () => {
  it('maps each scenario to a CatalogScenario, preserving id + decoderTag', () => {
    const result = buildFirstSessionCatalog([
      makeScenarioRow({
        id: 'sc-a',
        decoder_tag: 'BACKDOOR_WINDOW',
        sub_concepts: ['tpl:BDW.denied-wing', 'sig:mirror|disg:moderate|x'],
      }),
      makeScenarioRow({
        id: 'sc-b',
        decoder_tag: 'EMPTY_SPACE_CUT',
        sub_concepts: [],
      }),
    ])
    expect(result.map((r) => r.id)).toEqual(['sc-a', 'sc-b'])
    expect(result[0]).toMatchObject({
      decoderTag: 'BACKDOOR_WINDOW',
      templateId: 'BDW.denied-wing',
      disguise: 'moderate',
      mirror: true,
    })
    expect(result[1]).toMatchObject({
      decoderTag: 'EMPTY_SPACE_CUT',
      templateId: null,
      disguise: 'none',
      mirror: false,
    })
  })
})

describe('buildReturnCatalog', () => {
  it('flags scenarios newer than (lastSession - freshnessDays) as fresh', () => {
    const lastSessionAt = new Date('2026-05-07T00:00:00Z')
    const cutoff = new Date(
      lastSessionAt.getTime() - RETURN_FRESHNESS_DAYS * 24 * 60 * 60 * 1000,
    )
    const old = makeScenarioRow({
      id: 'old',
      created_at: new Date(cutoff.getTime() - 24 * 60 * 60 * 1000),
    })
    const fresh = makeScenarioRow({
      id: 'fresh',
      created_at: new Date(cutoff.getTime() + 24 * 60 * 60 * 1000),
    })
    const result = buildReturnCatalog([old, fresh], lastSessionAt)
    expect(result.find((r) => r.id === 'old')!.isFresh).toBe(false)
    expect(result.find((r) => r.id === 'fresh')!.isFresh).toBe(true)
  })

  it('treats nothing as fresh when lastSessionAt is null', () => {
    const result = buildReturnCatalog(
      [makeScenarioRow({ id: 'a' }), makeScenarioRow({ id: 'b' })],
      null,
    )
    expect(result.every((r) => r.isFresh === false)).toBe(true)
  })

  it('respects the optional freshnessDays override', () => {
    const lastSessionAt = new Date('2026-05-07T00:00:00Z')
    const sevenDaysAgo = new Date(lastSessionAt.getTime() - 7 * 24 * 60 * 60 * 1000)
    const result = buildReturnCatalog(
      [makeScenarioRow({ id: 'a', created_at: sevenDaysAgo })],
      lastSessionAt,
      3, // tighter window — 7d > 3d cutoff, so not fresh
    )
    expect(result[0]!.isFresh).toBe(false)
  })
})

describe('recognitionReasonForReturnSlot', () => {
  it('returns null for a null slot', () => {
    expect(recognitionReasonForReturnSlot(null, undefined)).toBeNull()
  })

  it('uses the transfer-probe copy for a transfer slot, regardless of decoder confidence', () => {
    const line = recognitionReasonForReturnSlot('transfer', undefined)
    expect(line).toBeTruthy()
    expect(line).not.toContain('First read')
  })

  it('falls back to maintain when no decoder confidence is supplied', () => {
    const line = recognitionReasonForReturnSlot('anchor', undefined)
    expect(line).toBeTruthy()
  })

  it('uses the per-decoder nextProbe for anchor slots when supplied', () => {
    const conf = {
      decoderTag: 'BACKDOOR_WINDOW',
      band: 'recognizing' as const,
      evidence: {
        attempts: 4,
        accuracyLastN: 0.75,
        p50LatencyMs: 2400,
        transferTemplates: 1,
        hardestDisguiseRecognized: 'none' as const,
        inadmissibleCount: 0,
      },
      nextProbe: 'disguise-up' as const,
    }
    // The disguise-up reason should be different from the maintain
    // fallback line we'd get without the conf.
    const withConf = recognitionReasonForReturnSlot('anchor', conf)
    const withoutConf = recognitionReasonForReturnSlot('anchor', undefined)
    expect(withConf).not.toBe(withoutConf)
  })
})

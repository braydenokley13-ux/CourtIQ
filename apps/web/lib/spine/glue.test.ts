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
  decoderTagsFromAttempts,
  decoderTagsInCatalog,
  recognitionReasonForReturnSlot,
  resolveChoiceQuality,
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
    choice_quality: 'choice_quality' in overrides ? overrides.choice_quality : undefined,
    replay_count: 'replay_count' in overrides ? overrides.replay_count : undefined,
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

  // ---- Phase 10 — choice_quality denormalization ----

  it('falls back to the legacy proxy when choice_quality is null (legacy rows)', () => {
    const attempts = [
      makeAttempt({
        decoder_tag: 'BACKDOOR_WINDOW',
        is_correct: true,
        choice_quality: null,
        time_ms: 2200,
      }),
    ]
    const result = buildDecoderConfidences(attempts, NOW)
    const bdw = result.find((r) => r.decoderTag === 'BACKDOOR_WINDOW')!
    // Correct + null quality → proxy maps to 'best'; the rep counts.
    expect(bdw.evidence.attempts).toBe(1)
  })

  it('falls back to the proxy when choice_quality is undefined (older callers)', () => {
    const attempts = [
      makeAttempt({
        decoder_tag: 'BACKDOOR_WINDOW',
        is_correct: false,
        // choice_quality omitted entirely
        time_ms: 6000,
      }),
    ]
    const result = buildDecoderConfidences(attempts, NOW)
    const bdw = result.find((r) => r.decoderTag === 'BACKDOOR_WINDOW')!
    expect(bdw.evidence.attempts).toBe(1)
  })

  // ---- Phase 11 — replay-view telemetry ----

  it('flips the next probe to mystery-mode when replay views accumulate (≥3 across the last 5 reps)', () => {
    // Build 5 mid-tier attempts to put the player at the
    // recognizing band, then load the last 3 with replay views.
    // The adaptive layer's mystery-mode rule wins over disguise-up
    // / transfer-probe, so the resulting nextProbe pings mystery.
    const fast = (i: number, replays = 0) =>
      makeAttempt({
        decoder_tag: 'BACKDOOR_WINDOW',
        is_correct: true,
        choice_quality: 'best',
        time_ms: 2400,
        replay_count: replays,
        sub_concepts: [`tpl:BDW.t${i % 2}`, 'sig:|disg:none|x'],
        created_at: new Date(NOW.getTime() - (10 - i) * 60_000),
      })
    const attempts = [
      fast(0),
      fast(1),
      fast(2, 1),
      fast(3, 1),
      fast(4, 2), // total = 4 replay views in the trailing 5
    ]
    const result = buildDecoderConfidences(attempts, NOW)
    const bdw = result.find((r) => r.decoderTag === 'BACKDOOR_WINDOW')!
    expect(bdw.nextProbe).toBe('mystery-mode')
  })

  it('treats missing replay_count as 0 so legacy rows do not spuriously trigger mystery-mode', () => {
    const attempts = Array.from({ length: 5 }, (_, i) =>
      makeAttempt({
        decoder_tag: 'BACKDOOR_WINDOW',
        is_correct: true,
        choice_quality: 'best',
        time_ms: 2400,
        // replay_count omitted entirely
        sub_concepts: ['tpl:BDW.t', 'sig:|disg:none|x'],
        created_at: new Date(NOW.getTime() - (10 - i) * 60_000),
      }),
    )
    const result = buildDecoderConfidences(attempts, NOW)
    const bdw = result.find((r) => r.decoderTag === 'BACKDOOR_WINDOW')!
    expect(bdw.nextProbe).not.toBe('mystery-mode')
  })

  it('only counts replay views from the trailing REPLAY_VIEW_WINDOW=5 attempts', () => {
    // Pile up replay views on OLD attempts (positions 1-5), then 5
    // clean ones at the end. The trailing window should sum to 0
    // and mystery-mode should NOT trigger.
    const old = (i: number) =>
      makeAttempt({
        decoder_tag: 'BACKDOOR_WINDOW',
        is_correct: true,
        choice_quality: 'best',
        time_ms: 2400,
        replay_count: 5,
        sub_concepts: ['tpl:BDW.t', 'sig:|disg:none|x'],
        created_at: new Date(NOW.getTime() - (20 - i) * 60_000),
      })
    const recent = (i: number) =>
      makeAttempt({
        decoder_tag: 'BACKDOOR_WINDOW',
        is_correct: true,
        choice_quality: 'best',
        time_ms: 2400,
        replay_count: 0,
        sub_concepts: [`tpl:BDW.t${i % 2}`, 'sig:|disg:none|x'],
        created_at: new Date(NOW.getTime() - (10 - i) * 60_000),
      })
    const attempts = [old(0), old(1), old(2), old(3), old(4), recent(5), recent(6), recent(7), recent(8), recent(9)]
    const result = buildDecoderConfidences(attempts, NOW)
    const bdw = result.find((r) => r.decoderTag === 'BACKDOOR_WINDOW')!
    expect(bdw.nextProbe).not.toBe('mystery-mode')
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

describe('resolveChoiceQuality', () => {
  // Phase 10 — the proxy fallback is the contract that lets
  // pre-migration Attempt rows keep classifying. Each branch is
  // exercised so a future refactor that drops the fallback (or
  // promotes the column to NOT NULL) gets caught here.
  it('uses the denormalized value when one of the three valid enum members is present', () => {
    expect(resolveChoiceQuality({ is_correct: false, choice_quality: 'best' })).toBe('best')
    expect(resolveChoiceQuality({ is_correct: false, choice_quality: 'acceptable' })).toBe('acceptable')
    expect(resolveChoiceQuality({ is_correct: true, choice_quality: 'wrong' })).toBe('wrong')
  })

  it("falls back to 'best' on a correct attempt with a null choice_quality", () => {
    expect(resolveChoiceQuality({ is_correct: true, choice_quality: null })).toBe('best')
  })

  it("falls back to 'wrong' on a wrong attempt with a null choice_quality", () => {
    expect(resolveChoiceQuality({ is_correct: false, choice_quality: null })).toBe('wrong')
  })

  it('falls back to the proxy when choice_quality is undefined (older callers)', () => {
    expect(resolveChoiceQuality({ is_correct: true })).toBe('best')
    expect(resolveChoiceQuality({ is_correct: false })).toBe('wrong')
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

// Pack 2 progression: the spine glue's `ALL_DECODERS` registry is
// the founder-only set on purpose — admitting Pack 2 decoders
// unconditionally would surface "ghost rings" on /home for founders
// who have never seen a `READ_THE_COVERAGE` / `HUNT_THE_ADVANTAGE`
// scenario. The two helpers below are the seam Pack 2 routing layers
// plug into: union ALL_DECODERS with one of these to pick up DROP /
// HUNT decoders only when they are actually in play.
describe('ALL_DECODERS registry', () => {
  it('is the four founder decoders only — Pack 2 tags are admitted via helpers, not the registry', () => {
    expect([...ALL_DECODERS].sort()).toEqual([
      'ADVANTAGE_OR_RESET',
      'BACKDOOR_WINDOW',
      'EMPTY_SPACE_CUT',
      'SKIP_THE_ROTATION',
    ])
    expect(ALL_DECODERS).not.toContain('READ_THE_COVERAGE')
    expect(ALL_DECODERS).not.toContain('HUNT_THE_ADVANTAGE')
  })
})

describe('decoderTagsFromAttempts', () => {
  it('returns an empty list when the player has no attempts', () => {
    expect(decoderTagsFromAttempts([])).toEqual([])
  })

  it('drops attempts whose scenario has a null decoder_tag (legacy fixtures)', () => {
    const attempts = [
      makeAttempt({ decoder_tag: null }),
      makeAttempt({ decoder_tag: 'BACKDOOR_WINDOW' }),
    ]
    expect(decoderTagsFromAttempts(attempts)).toEqual(['BACKDOOR_WINDOW'])
  })

  it('dedupes repeated decoders, preserving first-seen order', () => {
    const attempts = [
      makeAttempt({ decoder_tag: 'BACKDOOR_WINDOW' }),
      makeAttempt({ decoder_tag: 'EMPTY_SPACE_CUT' }),
      makeAttempt({ decoder_tag: 'BACKDOOR_WINDOW' }),
    ]
    expect(decoderTagsFromAttempts(attempts)).toEqual([
      'BACKDOOR_WINDOW',
      'EMPTY_SPACE_CUT',
    ])
  })

  it('admits Pack 2 decoders the moment a player attempts one (READ_THE_COVERAGE)', () => {
    const attempts = [
      makeAttempt({ decoder_tag: 'BACKDOOR_WINDOW' }),
      makeAttempt({ decoder_tag: 'READ_THE_COVERAGE' as AttemptWithScenario['scenario']['decoder_tag'] }),
    ]
    expect(decoderTagsFromAttempts(attempts)).toContain('READ_THE_COVERAGE')
  })

  it('admits Pack 2 decoders the moment a player attempts one (HUNT_THE_ADVANTAGE)', () => {
    const attempts = [
      makeAttempt({ decoder_tag: 'HUNT_THE_ADVANTAGE' as AttemptWithScenario['scenario']['decoder_tag'] }),
    ]
    expect(decoderTagsFromAttempts(attempts)).toEqual(['HUNT_THE_ADVANTAGE'])
  })
})

describe('decoderTagsInCatalog', () => {
  it('returns an empty list for an empty catalog', () => {
    expect(decoderTagsInCatalog([])).toEqual([])
  })

  it('drops scenarios whose decoder_tag is null (non-decoder fixtures)', () => {
    const result = decoderTagsInCatalog([
      makeScenarioRow({ id: 'a', decoder_tag: null }),
      makeScenarioRow({ id: 'b', decoder_tag: 'BACKDOOR_WINDOW' }),
    ])
    expect(result).toEqual(['BACKDOOR_WINDOW'])
  })

  it('dedupes repeated decoders, preserving first-seen order', () => {
    const result = decoderTagsInCatalog([
      makeScenarioRow({ id: 'a', decoder_tag: 'BACKDOOR_WINDOW' }),
      makeScenarioRow({ id: 'b', decoder_tag: 'BACKDOOR_WINDOW' }),
      makeScenarioRow({ id: 'c', decoder_tag: 'EMPTY_SPACE_CUT' }),
    ])
    expect(result).toEqual(['BACKDOOR_WINDOW', 'EMPTY_SPACE_CUT'])
  })

  it('admits Pack 2 decoders when LIVE Pack 2 scenarios exist in the catalog', () => {
    const result = decoderTagsInCatalog([
      makeScenarioRow({ id: 'bdw-1', decoder_tag: 'BACKDOOR_WINDOW' }),
      makeScenarioRow({
        id: 'rtc-1',
        decoder_tag: 'READ_THE_COVERAGE' as Scenario['decoder_tag'],
      }),
      makeScenarioRow({
        id: 'hta-1',
        decoder_tag: 'HUNT_THE_ADVANTAGE' as Scenario['decoder_tag'],
      }),
    ])
    expect(result).toContain('READ_THE_COVERAGE')
    expect(result).toContain('HUNT_THE_ADVANTAGE')
  })

  it('returns founder-only tags when the catalog has no Pack 2 LIVE scenarios — no ghost rings', () => {
    const result = decoderTagsInCatalog([
      makeScenarioRow({ id: 'a', decoder_tag: 'BACKDOOR_WINDOW' }),
      makeScenarioRow({ id: 'b', decoder_tag: 'EMPTY_SPACE_CUT' }),
    ])
    expect(result).not.toContain('READ_THE_COVERAGE')
    expect(result).not.toContain('HUNT_THE_ADVANTAGE')
  })
})

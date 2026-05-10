import { describe, expect, it } from 'vitest'
import {
  eligibleDifficultyForDecoder,
  ELIGIBILITY_LOW_ACCURACY_FLOOR,
  ELIGIBILITY_STRONG_ACCURACY_GATE,
} from './eligibility'
import type { DecoderConfidence } from './types'

function conf(partial: Partial<DecoderConfidence> & { decoderTag: string }): DecoderConfidence {
  return {
    decoderTag: partial.decoderTag,
    band: partial.band ?? 'untested',
    evidence: {
      attempts: 0,
      accuracyLastN: 0,
      p50LatencyMs: null,
      transferTemplates: 0,
      hardestDisguiseRecognized: null,
      inadmissibleCount: 0,
      ...(partial.evidence ?? {}),
    },
    nextProbe: partial.nextProbe ?? 'first-rep',
  }
}

describe('eligibleDifficultyForDecoder', () => {
  it('clamps untested / sparse decoders to D1 with sparse_data reason', () => {
    const r = eligibleDifficultyForDecoder(conf({ decoderTag: 'BACKDOOR_WINDOW' }))
    expect(r.maxDifficulty).toBe(1)
    expect(r.allowed).toEqual([1])
    expect(r.reasons).toContain('sparse_data')
    expect(r.readiness).toBe(0)
  })

  it('low confidence (recognizing band but accuracyLastN below floor) → D1, low_confidence', () => {
    const r = eligibleDifficultyForDecoder(
      conf({
        decoderTag: 'EMPTY_SPACE_CUT',
        band: 'recognizing',
        evidence: {
          attempts: 6,
          accuracyLastN: ELIGIBILITY_LOW_ACCURACY_FLOOR - 0.1,
          p50LatencyMs: 5000,
          transferTemplates: 1,
          hardestDisguiseRecognized: 'none',
          inadmissibleCount: 0,
        },
      }),
    )
    expect(r.maxDifficulty).toBe(1)
    expect(r.reasons).toContain('low_confidence')
  })

  it('emerging recognizing band caps at D2, never D3', () => {
    const r = eligibleDifficultyForDecoder(
      conf({
        decoderTag: 'SKIP_THE_ROTATION',
        band: 'recognizing',
        evidence: {
          attempts: 6,
          accuracyLastN: 0.65,
          p50LatencyMs: 5500,
          transferTemplates: 1,
          hardestDisguiseRecognized: 'light',
          inadmissibleCount: 0,
        },
      }),
    )
    expect(r.maxDifficulty).toBe(2)
    expect(r.allowed).toEqual([1, 2])
    expect(r.reasons).toContain('emerging')
  })

  it('strong reflexive decoder unlocks D4', () => {
    const r = eligibleDifficultyForDecoder(
      conf({
        decoderTag: 'ADVANTAGE_OR_RESET',
        band: 'reflexive',
        evidence: {
          attempts: 8,
          accuracyLastN: ELIGIBILITY_STRONG_ACCURACY_GATE + 0.05,
          p50LatencyMs: 4500,
          transferTemplates: 3,
          hardestDisguiseRecognized: 'light',
          inadmissibleCount: 0,
        },
      }),
    )
    expect(r.maxDifficulty).toBe(4)
    expect(r.allowed).toEqual([1, 2, 3, 4])
    expect(r.reasons).not.toContain('frustration_clamp')
    expect(r.readiness).toBeGreaterThan(0.7)
  })

  it('mastered band unlocks D5', () => {
    const r = eligibleDifficultyForDecoder(
      conf({
        decoderTag: 'BACKDOOR_WINDOW',
        band: 'mastered',
        evidence: {
          attempts: 10,
          accuracyLastN: 0.9,
          p50LatencyMs: 4000,
          transferTemplates: 4,
          hardestDisguiseRecognized: 'heavy',
          inadmissibleCount: 0,
        },
      }),
    )
    expect(r.maxDifficulty).toBe(5)
    expect(r.allowed).toEqual([1, 2, 3, 4, 5])
    expect(r.readiness).toBe(1)
  })

  it('frustration clamps a reflexive decoder by one difficulty', () => {
    const r = eligibleDifficultyForDecoder(
      conf({
        decoderTag: 'EMPTY_SPACE_CUT',
        band: 'reflexive',
        evidence: {
          attempts: 8,
          // Reflexive band but recent accuracy under the strong gate
          // (not low enough to fail the floor) → frustration clamp
          // drops the ceiling from D3 → D2.
          accuracyLastN: 0.6,
          p50LatencyMs: 5500,
          transferTemplates: 2,
          hardestDisguiseRecognized: 'light',
          inadmissibleCount: 0,
        },
      }),
    )
    expect(r.maxDifficulty).toBe(2)
    expect(r.reasons).toContain('frustration_clamp')
  })

  it('Pack 2 decoder runs through the same path as founder decoders', () => {
    const founder = eligibleDifficultyForDecoder(
      conf({
        decoderTag: 'BACKDOOR_WINDOW',
        band: 'reflexive',
        evidence: {
          attempts: 8,
          accuracyLastN: 0.85,
          p50LatencyMs: 4500,
          transferTemplates: 3,
          hardestDisguiseRecognized: 'light',
          inadmissibleCount: 0,
        },
      }),
    )
    const pack2 = eligibleDifficultyForDecoder(
      conf({
        decoderTag: 'READ_THE_COVERAGE',
        band: 'reflexive',
        evidence: {
          attempts: 8,
          accuracyLastN: 0.85,
          p50LatencyMs: 4500,
          transferTemplates: 3,
          hardestDisguiseRecognized: 'light',
          inadmissibleCount: 0,
        },
      }),
    )
    expect(pack2.maxDifficulty).toBe(founder.maxDifficulty)
    expect(pack2.allowed).toEqual(founder.allowed)
    expect(pack2.reasons).toEqual(founder.reasons)
  })

  it('is deterministic — same input twice returns the same output', () => {
    const input = conf({
      decoderTag: 'HUNT_THE_ADVANTAGE',
      band: 'recognizing',
      evidence: {
        attempts: 6,
        accuracyLastN: 0.7,
        p50LatencyMs: 5500,
        transferTemplates: 1,
        hardestDisguiseRecognized: 'none',
        inadmissibleCount: 0,
      },
    })
    const a = eligibleDifficultyForDecoder(input)
    const b = eligibleDifficultyForDecoder(input)
    expect(a).toEqual(b)
  })

  it('always allows D1 — never returns an empty allowed list', () => {
    const r = eligibleDifficultyForDecoder(conf({ decoderTag: 'SKIP_THE_ROTATION' }))
    expect(r.allowed.length).toBeGreaterThanOrEqual(1)
    expect(r.allowed[0]).toBe(1)
  })
})

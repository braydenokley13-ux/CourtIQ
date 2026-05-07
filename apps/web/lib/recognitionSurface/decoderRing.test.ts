import { describe, it, expect } from 'vitest'
import { decoderRingData, decoderRingStrip } from './decoderRing'
import type { DecoderConfidence } from '../adaptive/types'

const conf = (over: Partial<DecoderConfidence> = {}): DecoderConfidence => ({
  decoderTag: 'BACKDOOR_WINDOW',
  band: 'untested',
  evidence: {
    attempts: 0,
    accuracyLastN: 0,
    p50LatencyMs: null,
    transferTemplates: 0,
    hardestDisguiseRecognized: null,
    inadmissibleCount: 0,
  },
  nextProbe: 'first-rep',
  ...over,
})

describe('decoderRingData', () => {
  it('untested + 0 attempts → all unlit, no progress', () => {
    const r = decoderRingData(conf())
    expect(r.segments).toEqual({
      recognizing: 'unlit',
      reflexive: 'unlit',
      mastered: 'unlit',
    })
  })

  it('untested + 1 attempt → recognizing shows progress', () => {
    const r = decoderRingData(
      conf({
        evidence: {
          attempts: 1,
          accuracyLastN: 0,
          p50LatencyMs: 4000,
          transferTemplates: 0,
          hardestDisguiseRecognized: null,
          inadmissibleCount: 0,
        },
      }),
    )
    expect(r.segments.recognizing).toBe('progress')
  })

  it('recognizing band → recognizing lit, reflexive may show progress with evidence', () => {
    const r = decoderRingData(
      conf({
        band: 'recognizing',
        evidence: {
          attempts: 5,
          accuracyLastN: 0.7,
          p50LatencyMs: 3400,
          transferTemplates: 1,
          hardestDisguiseRecognized: 'none',
          inadmissibleCount: 0,
        },
      }),
    )
    expect(r.segments.recognizing).toBe('lit')
    expect(r.segments.reflexive).toBe('progress')
    expect(r.segments.mastered).toBe('unlit')
  })

  it('reflexive band → recognizing + reflexive lit; mastered honest', () => {
    const noDisguise = decoderRingData(
      conf({
        band: 'reflexive',
        evidence: {
          attempts: 8,
          accuracyLastN: 0.85,
          p50LatencyMs: 2800,
          transferTemplates: 2,
          hardestDisguiseRecognized: 'none',
          inadmissibleCount: 0,
        },
      }),
    )
    expect(noDisguise.segments.recognizing).toBe('lit')
    expect(noDisguise.segments.reflexive).toBe('lit')
    // mastered shows progress only with disguise≥light recognized
    expect(noDisguise.segments.mastered).toBe('unlit')

    const lightCleared = decoderRingData(
      conf({
        band: 'reflexive',
        evidence: {
          attempts: 10,
          accuracyLastN: 0.85,
          p50LatencyMs: 2700,
          transferTemplates: 2,
          hardestDisguiseRecognized: 'light',
          inadmissibleCount: 0,
        },
      }),
    )
    expect(lightCleared.segments.mastered).toBe('progress')
  })

  it('mastered band → all three lit', () => {
    const r = decoderRingData(
      conf({
        band: 'mastered',
        evidence: {
          attempts: 12,
          accuracyLastN: 0.9,
          p50LatencyMs: 2400,
          transferTemplates: 3,
          hardestDisguiseRecognized: 'heavy',
          inadmissibleCount: 0,
        },
      }),
    )
    expect(r.segments.recognizing).toBe('lit')
    expect(r.segments.reflexive).toBe('lit')
    expect(r.segments.mastered).toBe('lit')
  })

  it('aria label combines label, status, and evidence', () => {
    const r = decoderRingData(
      conf({
        band: 'recognizing',
        evidence: {
          attempts: 5,
          accuracyLastN: 0.7,
          p50LatencyMs: 3400,
          transferTemplates: 0,
          hardestDisguiseRecognized: 'none',
          inadmissibleCount: 0,
        },
      }),
    )
    expect(r.ariaLabel).toContain('Backdoor Window')
    expect(r.ariaLabel).toContain('Reading it')
  })
})

describe('decoderRingStrip', () => {
  it('returns empty array when ALL decoders are untested', () => {
    expect(
      decoderRingStrip([
        conf({ decoderTag: 'BACKDOOR_WINDOW' }),
        conf({ decoderTag: 'ADVANTAGE_OR_RESET' }),
      ]),
    ).toEqual([])
  })

  it('returns ring data for every decoder when at least one is in progress', () => {
    const r = decoderRingStrip([
      conf({ decoderTag: 'BACKDOOR_WINDOW', band: 'recognizing' }),
      conf({ decoderTag: 'ADVANTAGE_OR_RESET' }),
    ])
    expect(r).toHaveLength(2)
    expect(r[0]!.label).toBe('Backdoor Window')
    expect(r[1]!.label).toBe('Advantage or Reset')
  })
})

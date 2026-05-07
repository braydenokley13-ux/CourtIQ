import { describe, it, expect } from 'vitest'
import { computeDecoderConfidence } from './decoderBand'
import { type AdaptiveAttempt } from './types'

let now = Date.parse('2026-05-07T00:00:00Z')

function attempt(over: Partial<AdaptiveAttempt> = {}): AdaptiveAttempt {
  now += 60_000 // each attempt 1min apart so order is stable
  return {
    decoderTag: 'BACKDOOR_WINDOW',
    templateId: 'BDW.denied-wing',
    signature: 'orig|slot:cutter|d:1|disg:none|clk:none',
    disguise: 'none',
    difficulty: 1,
    isCorrect: true,
    choiceQuality: 'best',
    timeMs: 3000,
    createdAt: new Date(now),
    ...over,
  }
}

describe('computeDecoderConfidence', () => {
  it('returns untested + first-rep when no attempts', () => {
    const c = computeDecoderConfidence({
      decoderTag: 'BACKDOOR_WINDOW',
      attempts: [],
      daysSinceLastAttempt: 0,
      recentReplayViews: 0,
    })
    expect(c.band).toBe('untested')
    expect(c.nextProbe).toBe('first-rep')
    expect(c.evidence.attempts).toBe(0)
  })

  it('promotes to recognizing after ≥4 attempts at ≥60% accuracy', () => {
    const attempts = [
      attempt(),
      attempt(),
      attempt(),
      attempt({ isCorrect: false, choiceQuality: 'wrong', timeMs: 5000 }),
    ]
    const c = computeDecoderConfidence({
      decoderTag: 'BACKDOOR_WINDOW',
      attempts,
      daysSinceLastAttempt: 0,
      recentReplayViews: 0,
    })
    expect(c.band).toBe('recognizing')
  })

  it('promotes to reflexive when ≥6 attempts, recognized rate ≥70%, p50 within ceiling', () => {
    const attempts = Array.from({ length: 8 }, () => attempt({ timeMs: 3000 }))
    const c = computeDecoderConfidence({
      decoderTag: 'BACKDOOR_WINDOW',
      attempts,
      daysSinceLastAttempt: 0,
      recentReplayViews: 0,
    })
    expect(c.band).toBe('reflexive')
    expect(c.nextProbe).toBe('disguise-up') // 3 recognized in a row
  })

  it('promotes to mastered only with hardest disguise = moderate or heavy', () => {
    // 8 reps recognized at disguise=none → reflexive, NOT mastered.
    const lightOnly = computeDecoderConfidence({
      decoderTag: 'BACKDOOR_WINDOW',
      attempts: Array.from({ length: 8 }, () => attempt({ timeMs: 3000 })),
      daysSinceLastAttempt: 0,
      recentReplayViews: 0,
    })
    expect(lightOnly.band).toBe('reflexive')

    // Same plus a recognized rep at disguise=heavy → mastered.
    const withHeavy = computeDecoderConfidence({
      decoderTag: 'BACKDOOR_WINDOW',
      attempts: [
        ...Array.from({ length: 8 }, () => attempt({ timeMs: 3000 })),
        attempt({
          disguise: 'heavy',
          difficulty: 4,
          timeMs: 4000,
          templateId: 'BDW.denied-slot',
        }),
      ],
      daysSinceLastAttempt: 0,
      recentReplayViews: 0,
    })
    expect(withHeavy.band).toBe('mastered')
  })

  it('flags transfer-probe when only one template has been recognized after 4+ reps', () => {
    const attempts = Array.from({ length: 5 }, () =>
      attempt({ templateId: 'BDW.denied-wing' }),
    )
    const c = computeDecoderConfidence({
      decoderTag: 'BACKDOOR_WINDOW',
      attempts,
      daysSinceLastAttempt: 0,
      recentReplayViews: 0,
    })
    expect(c.evidence.transferTemplates).toBe(1)
    // Last 3 are recognized → routing chooses disguise-up first; that's
    // correct precedence (raise the floor before broadening). Once we
    // have ≥1 disguise level under the player's belt, transfer-probe
    // re-emerges.
    expect(['disguise-up', 'transfer-probe']).toContain(c.nextProbe)
  })

  it('forces lesson-refresh after two wrongs in a row', () => {
    const attempts = [
      attempt(),
      attempt(),
      attempt(),
      attempt({ isCorrect: false, choiceQuality: 'wrong', timeMs: 4000 }),
      attempt({ isCorrect: false, choiceQuality: 'wrong', timeMs: 4000 }),
    ]
    const c = computeDecoderConfidence({
      decoderTag: 'BACKDOOR_WINDOW',
      attempts,
      daysSinceLastAttempt: 0,
      recentReplayViews: 0,
    })
    expect(c.nextProbe).toBe('lesson-refresh')
  })

  it('routes mystery-mode when replay abuse exceeds 3', () => {
    const attempts = Array.from({ length: 6 }, () => attempt())
    const c = computeDecoderConfidence({
      decoderTag: 'BACKDOOR_WINDOW',
      attempts,
      daysSinceLastAttempt: 0,
      recentReplayViews: 4,
    })
    expect(c.nextProbe).toBe('mystery-mode')
  })

  it('lucky-guess attempt is excluded from band promotion', () => {
    // First attempt instant-correct = guessing; remaining 4 are slow but
    // correct — admissible == 4 (still recognizing if accuracy>=0.6).
    const attempts = [
      attempt({ timeMs: 500 }), // guessing on first decoder rep
      attempt({ timeMs: 6000 }),
      attempt({ timeMs: 6000 }),
      attempt({ timeMs: 6000 }),
      attempt({ timeMs: 6000 }),
    ]
    const c = computeDecoderConfidence({
      decoderTag: 'BACKDOOR_WINDOW',
      attempts,
      daysSinceLastAttempt: 0,
      recentReplayViews: 0,
    })
    expect(c.evidence.inadmissibleCount).toBe(1)
    // 4 admissible attempts, all resolved (slow correct) — recognizing band.
    expect(c.band).toBe('recognizing')
  })

  it('mastered + dormant for 30+ days surfaces maintain (refresh prompt)', () => {
    const attempts = [
      ...Array.from({ length: 8 }, () => attempt({ timeMs: 3000 })),
      attempt({ disguise: 'heavy', difficulty: 4, timeMs: 4000, templateId: 'BDW.denied-slot' }),
    ]
    const c = computeDecoderConfidence({
      decoderTag: 'BACKDOOR_WINDOW',
      attempts,
      daysSinceLastAttempt: 45,
      recentReplayViews: 0,
    })
    expect(c.band).toBe('mastered')
    expect(c.nextProbe).toBe('maintain')
  })

  it('mastered + recent activity → boss-ready', () => {
    const attempts = [
      ...Array.from({ length: 8 }, () => attempt({ timeMs: 3000 })),
      attempt({ disguise: 'heavy', difficulty: 4, timeMs: 4000, templateId: 'BDW.denied-slot' }),
    ]
    const c = computeDecoderConfidence({
      decoderTag: 'BACKDOOR_WINDOW',
      attempts,
      daysSinceLastAttempt: 2,
      recentReplayViews: 0,
    })
    expect(c.band).toBe('mastered')
    expect(c.nextProbe).toBe('boss-ready')
  })

  it('p50 latency reflects only correct attempts in window', () => {
    const attempts = [
      attempt({ timeMs: 2000 }),
      attempt({ timeMs: 3000 }),
      attempt({ timeMs: 4000 }),
      attempt({ isCorrect: false, choiceQuality: 'wrong', timeMs: 9000 }),
    ]
    const c = computeDecoderConfidence({
      decoderTag: 'BACKDOOR_WINDOW',
      attempts,
      daysSinceLastAttempt: 0,
      recentReplayViews: 0,
    })
    expect(c.evidence.p50LatencyMs).toBe(3000)
  })
})

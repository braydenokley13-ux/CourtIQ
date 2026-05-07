import { describe, it, expect } from 'vitest'
import { classifyAttempt } from './classifyAttempt'
import { type AdaptiveAttempt } from './types'

const baseAttempt: AdaptiveAttempt = {
  decoderTag: 'BACKDOOR_WINDOW',
  templateId: 'BDW.denied-wing',
  signature: 'orig|slot:cutter|d:1|disg:none|clk:none',
  disguise: 'none',
  difficulty: 1,
  isCorrect: true,
  choiceQuality: 'best',
  timeMs: 3000,
  createdAt: new Date('2026-05-01T00:00:00Z'),
}

describe('classifyAttempt', () => {
  it('classifies fast correct as recognized', () => {
    const r = classifyAttempt({ ...baseAttempt, timeMs: 3000 })
    expect(r.class).toBe('recognized')
    expect(r.inadmissibleForPromotion).toBe(false)
  })

  it('classifies slow correct as resolved', () => {
    const r = classifyAttempt({ ...baseAttempt, timeMs: 7000 })
    expect(r.class).toBe('resolved')
  })

  it('classifies acceptable miss separately from wrong', () => {
    const r = classifyAttempt({
      ...baseAttempt,
      isCorrect: false,
      choiceQuality: 'acceptable',
      timeMs: 4000,
    })
    expect(r.class).toBe('missed_acceptable')
  })

  it('classifies fast wrong as missed_wrong (impulsive)', () => {
    const r = classifyAttempt({
      ...baseAttempt,
      isCorrect: false,
      choiceQuality: 'wrong',
      timeMs: 1500,
    })
    expect(r.class).toBe('missed_wrong')
  })

  it('classifies very slow wrong as stuck', () => {
    const r = classifyAttempt({
      ...baseAttempt,
      isCorrect: false,
      choiceQuality: 'wrong',
      timeMs: 9000, // > threshold (4500) * HESITATION_FACTOR (1.4) = 6300
    })
    expect(r.class).toBe('stuck')
  })

  it('flags lucky guess on first-ever decoder attempt', () => {
    const r = classifyAttempt(
      { ...baseAttempt, timeMs: 800 }, // < threshold 4500 * 0.4 = 1800
      { decoderAttemptsBefore: 0 },
    )
    expect(r.class).toBe('guessing')
    expect(r.inadmissibleForPromotion).toBe(true)
  })

  it('does NOT flag lucky guess once decoder has prior attempts', () => {
    const r = classifyAttempt(
      { ...baseAttempt, timeMs: 800 },
      { decoderAttemptsBefore: 5 },
    )
    expect(r.class).toBe('recognized') // earned through prior reps
    expect(r.inadmissibleForPromotion).toBe(false)
  })

  it('uses difficulty-scaled thresholds', () => {
    // 7000ms on D1 (threshold 4500) is "resolved" (slow).
    expect(classifyAttempt({ ...baseAttempt, difficulty: 1, timeMs: 7000 }).class).toBe('resolved')
    // Same 7000ms on D5 (threshold 8500) is "recognized" (within band).
    expect(classifyAttempt({ ...baseAttempt, difficulty: 5, timeMs: 7000 }).class).toBe('recognized')
  })
})

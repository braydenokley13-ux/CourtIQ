import { describe, it, expect } from 'vitest'
import { fasterCallout, latencyWindow } from './fasterCallout'
import type { AdaptiveAttempt } from '../adaptive/types'

describe('fasterCallout', () => {
  it('returns null when either window has < 8 attempts', () => {
    const r = fasterCallout({
      recent: { p50LatencyMs: 3000, count: 5 },
      prior: { p50LatencyMs: 4000, count: 9 },
    })
    expect(r.line).toBeNull()
  })

  it('returns null when delta is below 200ms threshold', () => {
    const r = fasterCallout({
      recent: { p50LatencyMs: 3950, count: 10 },
      prior: { p50LatencyMs: 4000, count: 10 },
    })
    expect(r.line).toBeNull()
  })

  it('NEVER surfaces a "got slower" line', () => {
    const r = fasterCallout({
      recent: { p50LatencyMs: 4500, count: 10 },
      prior: { p50LatencyMs: 4000, count: 10 },
    })
    expect(r.line).toBeNull()
    // improvedMs may be negative; the LINE is still null.
    expect(r.improvedMs).toBeLessThan(0)
  })

  it('surfaces a generic line when no decoder is named', () => {
    const r = fasterCallout({
      recent: { p50LatencyMs: 3000, count: 10 },
      prior: { p50LatencyMs: 3500, count: 10 },
    })
    expect(r.line).toBe('You read the floor 0.5s faster this week.')
  })

  it('names the decoder when provided', () => {
    const r = fasterCallout({
      recent: { p50LatencyMs: 2800, count: 12 },
      prior: { p50LatencyMs: 3400, count: 12 },
      decoderTag: 'BACKDOOR_WINDOW',
    })
    expect(r.line).toBe('You read Backdoor Window 0.6s faster this week.')
  })

  it('returns improvedMs even when the line is null (analytics)', () => {
    const r = fasterCallout({
      recent: { p50LatencyMs: 4500, count: 10 },
      prior: { p50LatencyMs: 4000, count: 10 },
    })
    expect(r.improvedMs).toBe(-500)
  })
})

describe('latencyWindow', () => {
  const att = (over: Partial<AdaptiveAttempt> = {}): AdaptiveAttempt => ({
    decoderTag: 'BACKDOOR_WINDOW',
    templateId: 'BDW.denied-wing',
    signature: 'orig|slot:cutter|d:1|disg:none|clk:none',
    disguise: 'none',
    difficulty: 1,
    isCorrect: true,
    choiceQuality: 'best',
    timeMs: 3000,
    createdAt: new Date('2026-05-01T00:00:00Z'),
    ...over,
  })

  it('returns null p50 when no attempts in range', () => {
    const r = latencyWindow([], new Date('2026-05-01'), new Date('2026-05-08'))
    expect(r.p50LatencyMs).toBeNull()
    expect(r.count).toBe(0)
  })

  it('filters to correct attempts in date range', () => {
    const attempts: AdaptiveAttempt[] = [
      att({ timeMs: 3000, createdAt: new Date('2026-05-01') }),
      att({ timeMs: 4000, createdAt: new Date('2026-05-03') }),
      att({ timeMs: 5000, createdAt: new Date('2026-05-05') }),
      // Out of range
      att({ timeMs: 1000, createdAt: new Date('2026-04-25') }),
      att({ timeMs: 9000, createdAt: new Date('2026-05-10') }),
      // Wrong (excluded)
      att({ timeMs: 6000, isCorrect: false, createdAt: new Date('2026-05-02') }),
    ]
    const r = latencyWindow(attempts, new Date('2026-05-01'), new Date('2026-05-08'))
    expect(r.count).toBe(3)
    expect(r.p50LatencyMs).toBe(4000)
  })
})

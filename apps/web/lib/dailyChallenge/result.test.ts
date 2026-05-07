import { describe, it, expect } from 'vitest'
import { buildDailyResult, inAppResultLines } from './result'
import type { AdaptiveAttempt } from '../adaptive/types'

const att = (over: Partial<AdaptiveAttempt> = {}): AdaptiveAttempt => ({
  decoderTag: 'BACKDOOR_WINDOW',
  templateId: 'BDW.denied-wing',
  signature: 'orig|slot:cutter|d:1|disg:none|clk:none',
  disguise: 'none',
  difficulty: 1,
  isCorrect: true,
  choiceQuality: 'best',
  timeMs: 3000,
  createdAt: new Date('2026-05-07T00:00:00Z'),
  ...over,
})

describe('buildDailyResult', () => {
  it('counts hits as recognized + resolved (any correct)', () => {
    const attempts: AdaptiveAttempt[] = [
      att({ timeMs: 3000 }), // recognized
      att({ timeMs: 7000 }), // resolved (slow correct on D1)
      att({ isCorrect: false, choiceQuality: 'wrong', timeMs: 4000 }), // miss
      att({ timeMs: 3500 }), // recognized
      att({ isCorrect: false, choiceQuality: 'acceptable', timeMs: 5000 }), // miss
    ]
    const r = buildDailyResult({ date: '2026-05-07', attempts })
    expect(r.hits).toBe(3)
    expect(r.total).toBe(5)
    expect(r.dots.map((d) => d.hit)).toEqual([true, true, false, true, false])
  })

  it('share string includes month + day + dots + score + time', () => {
    const r = buildDailyResult({
      date: '2026-05-07',
      attempts: [att(), att(), att(), att(), att()],
    })
    expect(r.shareString).toContain('CourtIQ Daily — May 7')
    expect(r.shareString).toContain('5/5')
    expect(r.shareString).toContain('🟢🟢🟢🟢🟢')
    expect(r.shareString).toContain('15.0s')
  })

  it('share string uses BLACK circle for misses', () => {
    const r = buildDailyResult({
      date: '2026-05-07',
      attempts: [
        att(),
        att({ isCorrect: false, choiceQuality: 'wrong', timeMs: 4000 }),
        att(),
        att({ isCorrect: false, choiceQuality: 'wrong', timeMs: 4000 }),
        att(),
      ],
    })
    expect(r.shareString).toContain('🟢⚫🟢⚫🟢')
    expect(r.shareString).toContain('3/5')
  })

  it('totalTimeMs sums attempt time_ms', () => {
    const r = buildDailyResult({
      date: '2026-05-07',
      attempts: [att({ timeMs: 1000 }), att({ timeMs: 2000 }), att({ timeMs: 3000 })],
    })
    expect(r.totalTimeMs).toBe(6000)
  })
})

describe('inAppResultLines', () => {
  it('uses no emoji and no exclamation marks', () => {
    const r = buildDailyResult({
      date: '2026-05-07',
      attempts: [att(), att(), att(), att(), att()],
    })
    const lines = inAppResultLines(r)
    expect(lines.headline).not.toMatch(/[🟢⚫!]/)
    expect(lines.sub).not.toMatch(/[🟢⚫!]/)
    expect(lines.headline).toContain('5 of 5')
  })
})

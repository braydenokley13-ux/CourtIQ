import { describe, it, expect } from 'vitest'
import { tickDailyStreak } from './streak'

describe('tickDailyStreak', () => {
  it('first-ever completion → 1', () => {
    const r = tickDailyStreak({
      previous: 0,
      lastCompletedDate: null,
      todayDate: '2026-05-07',
    })
    expect(r.current).toBe(1)
    expect(r.extended).toBe(true)
    expect(r.reset).toBe(false)
  })

  it('completing on the next consecutive day → previous + 1', () => {
    const r = tickDailyStreak({
      previous: 4,
      lastCompletedDate: '2026-05-06',
      todayDate: '2026-05-07',
    })
    expect(r.current).toBe(5)
    expect(r.extended).toBe(true)
  })

  it('completing twice on the same day → no-op', () => {
    const r = tickDailyStreak({
      previous: 4,
      lastCompletedDate: '2026-05-07',
      todayDate: '2026-05-07',
    })
    expect(r.current).toBe(4)
    expect(r.idempotent).toBe(true)
    expect(r.extended).toBe(false)
  })

  it('skipping a day → reset to 1', () => {
    const r = tickDailyStreak({
      previous: 7,
      lastCompletedDate: '2026-05-04',
      todayDate: '2026-05-07',
    })
    expect(r.current).toBe(1)
    expect(r.reset).toBe(true)
    expect(r.extended).toBe(false)
  })

  it('skipping multiple days → reset to 1 (today still counts)', () => {
    const r = tickDailyStreak({
      previous: 30,
      lastCompletedDate: '2026-04-15',
      todayDate: '2026-05-07',
    })
    expect(r.current).toBe(1)
    expect(r.reset).toBe(true)
  })

  it('a 0/5 score still extends the streak (completion-based, strategy §4)', () => {
    // The streak module doesn't see scores — it sees completion events.
    // The caller (the API route) decides whether to call tickDailyStreak.
    // This test pins the contract: any call to tickDailyStreak with a
    // valid completion ticks the streak, regardless of score.
    const r = tickDailyStreak({
      previous: 3,
      lastCompletedDate: '2026-05-06',
      todayDate: '2026-05-07',
    })
    expect(r.current).toBe(4)
  })
})

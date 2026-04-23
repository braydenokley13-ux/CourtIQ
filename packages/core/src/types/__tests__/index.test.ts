import { describe, expect, it } from 'vitest'
import { iq, xp, mastery, streak, level } from '../index'

describe('iq.applyAttempt', () => {
  it('awards positive delta for a correct answer at fast speed', () => {
    const result = iq.applyAttempt({ difficulty: 3 }, { isCorrect: true }, 2500, 500)
    expect(result.delta).toBeGreaterThan(0)
    expect(result.after).toBe(500 + result.delta)
    expect(result.before).toBe(500)
    expect(result.speedMultiplier).toBe(1.2)
  })

  it('penalizes incorrect answers', () => {
    const result = iq.applyAttempt({ difficulty: 3 }, { isCorrect: false }, 4000, 500)
    expect(result.delta).toBeLessThan(0)
    expect(result.after).toBeLessThan(500)
  })

  it('scales reward with difficulty', () => {
    const easy = iq.applyAttempt({ difficulty: 1 }, { isCorrect: true }, 4000, 500)
    const hard = iq.applyAttempt({ difficulty: 5 }, { isCorrect: true }, 4000, 500)
    expect(hard.delta).toBeGreaterThan(easy.delta)
  })

  it('clamps floor at 0', () => {
    const result = iq.applyAttempt({ difficulty: 5 }, { isCorrect: false }, 20000, 3)
    expect(result.after).toBeGreaterThanOrEqual(0)
  })

  it('clamps ceiling at 2000', () => {
    const result = iq.applyAttempt({ difficulty: 5 }, { isCorrect: true }, 1000, 1999)
    expect(result.after).toBeLessThanOrEqual(2000)
  })

  it('uses 1.0x speed multiplier in the 3-7s window', () => {
    const mid = iq.applyAttempt({ difficulty: 3 }, { isCorrect: true }, 5000, 500)
    expect(mid.speedMultiplier).toBe(1)
  })

  it('reduces multiplier for slow answers', () => {
    const slow = iq.applyAttempt({ difficulty: 3 }, { isCorrect: true }, 20000, 500)
    expect(slow.speedMultiplier).toBe(0.75)
  })
})

describe('xp.award', () => {
  it('returns the base amount at difficulty 3', () => {
    expect(xp.award(10, 3)).toBe(10)
  })

  it('scales with difficulty', () => {
    expect(xp.award(10, 1)).toBeLessThan(xp.award(10, 5))
  })

  it('falls back to 1.0 multiplier for unknown difficulty', () => {
    expect(xp.award(10, 99)).toBe(10)
  })
})

describe('mastery.update', () => {
  it('updates rolling accuracy for a correct attempt', () => {
    const result = mastery.update({ attempts: 0, accuracy: 0 }, true)
    expect(result.attempts).toBe(1)
    expect(result.accuracy).toBe(1)
  })

  it('averages rolling accuracy over multiple attempts', () => {
    let current = { attempts: 0, accuracy: 0 }
    current = mastery.update(current, true)
    current = mastery.update(current, false)
    current = mastery.update(current, true)
    current = mastery.update(current, true)
    expect(current.attempts).toBe(4)
    expect(current.accuracy).toBeCloseTo(0.75, 5)
  })

  it('decreases accuracy on incorrect attempts', () => {
    const result = mastery.update({ attempts: 3, accuracy: 1 }, false)
    expect(result.attempts).toBe(4)
    expect(result.accuracy).toBe(0.75)
  })
})

describe('streak.tick', () => {
  const yesterday = new Date('2026-01-01T00:00:00.000Z')
  const today = new Date('2026-01-02T00:00:00.000Z')
  const sameDay = new Date('2026-01-02T18:00:00.000Z')
  const twoDaysAway = new Date('2026-01-04T00:00:00.000Z')

  it('starts a streak at 1 when there is no history', () => {
    const result = streak.tick(null, today, 0)
    expect(result.current).toBe(1)
    expect(result.extended).toBe(true)
    expect(result.broken).toBe(false)
    expect(result.unchanged).toBe(false)
  })

  it('extends streak when last activity was yesterday', () => {
    const result = streak.tick(yesterday, today, 5)
    expect(result.current).toBe(6)
    expect(result.extended).toBe(true)
    expect(result.broken).toBe(false)
  })

  it('is a no-op when already trained today', () => {
    const result = streak.tick(today, sameDay, 6)
    expect(result.current).toBe(6)
    expect(result.extended).toBe(false)
    expect(result.unchanged).toBe(true)
  })

  it('breaks the streak when a day was missed', () => {
    const result = streak.tick(yesterday, twoDaysAway, 5)
    expect(result.current).toBe(1)
    expect(result.broken).toBe(true)
    expect(result.extended).toBe(false)
  })

  it('emits an ISO date key in UTC', () => {
    const result = streak.tick(null, new Date('2026-01-02T23:30:00.000Z'), 0)
    expect(result.dateKey).toBe('2026-01-02')
  })
})

describe('level.fromXp', () => {
  it('returns 1 for 0 XP', () => {
    expect(level.fromXp(0)).toBe(1)
  })

  it('returns 1 for 99 XP (below threshold)', () => {
    expect(level.fromXp(99)).toBe(1)
  })

  it('returns 2 at 100 XP', () => {
    expect(level.fromXp(100)).toBe(2)
  })

  it('clamps to 50 at the cap', () => {
    expect(level.fromXp(1_000_000)).toBe(50)
  })

  it('clamps to 1 for negative XP', () => {
    expect(level.fromXp(-5)).toBe(1)
  })
})

describe('level.rankLabel', () => {
  it('maps low levels to Rookie', () => {
    expect(level.rankLabel(1)).toBe('Rookie')
    expect(level.rankLabel(5)).toBe('Rookie')
  })

  it('maps 6-15 to Starter', () => {
    expect(level.rankLabel(6)).toBe('Starter')
    expect(level.rankLabel(15)).toBe('Starter')
  })

  it('maps top levels to Maestro', () => {
    expect(level.rankLabel(46)).toBe('Maestro')
    expect(level.rankLabel(50)).toBe('Maestro')
  })
})

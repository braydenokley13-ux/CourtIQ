import { describe, it, expect } from 'vitest'
import { classifyReturn, returnBanner } from './classifyReturn'

describe('classifyReturn', () => {
  it('zero lifetime attempts → fresh-cold (regardless of days)', () => {
    expect(classifyReturn({ lifetimeAttempts: 0, daysSinceLastSession: null })).toBe('fresh-cold')
    expect(classifyReturn({ lifetimeAttempts: 0, daysSinceLastSession: 0 })).toBe('fresh-cold')
    expect(classifyReturn({ lifetimeAttempts: 0, daysSinceLastSession: 5 })).toBe('fresh-cold')
  })

  it('null daysSinceLastSession → fresh-cold even with attempts (defensive)', () => {
    expect(classifyReturn({ lifetimeAttempts: 5, daysSinceLastSession: null })).toBe('fresh-cold')
  })

  it('same day → next-session-same-day', () => {
    expect(classifyReturn({ lifetimeAttempts: 5, daysSinceLastSession: 0 })).toBe(
      'next-session-same-day',
    )
  })

  it('1–2 days → next-day', () => {
    expect(classifyReturn({ lifetimeAttempts: 5, daysSinceLastSession: 1 })).toBe('next-day')
    expect(classifyReturn({ lifetimeAttempts: 5, daysSinceLastSession: 2 })).toBe('next-day')
  })

  it('3–7 days → within-week', () => {
    expect(classifyReturn({ lifetimeAttempts: 5, daysSinceLastSession: 3 })).toBe('within-week')
    expect(classifyReturn({ lifetimeAttempts: 5, daysSinceLastSession: 7 })).toBe('within-week')
  })

  it('8–14 days → lapsed', () => {
    expect(classifyReturn({ lifetimeAttempts: 5, daysSinceLastSession: 8 })).toBe('lapsed')
    expect(classifyReturn({ lifetimeAttempts: 5, daysSinceLastSession: 14 })).toBe('lapsed')
  })

  it('15–29 days → long-lapsed', () => {
    expect(classifyReturn({ lifetimeAttempts: 5, daysSinceLastSession: 15 })).toBe('long-lapsed')
    expect(classifyReturn({ lifetimeAttempts: 5, daysSinceLastSession: 29 })).toBe('long-lapsed')
  })

  it('30+ days → dormant', () => {
    expect(classifyReturn({ lifetimeAttempts: 5, daysSinceLastSession: 30 })).toBe('dormant')
    expect(classifyReturn({ lifetimeAttempts: 5, daysSinceLastSession: 365 })).toBe('dormant')
  })
})

describe('returnBanner', () => {
  it('fresh-cold + dormant return null (handled by other surfaces)', () => {
    expect(returnBanner('fresh-cold')).toBeNull()
    expect(returnBanner('dormant')).toBeNull()
  })

  it('every other context has a single short coach line', () => {
    const ctxs = [
      'next-session-same-day',
      'next-day',
      'within-week',
      'lapsed',
      'long-lapsed',
    ] as const
    for (const ctx of ctxs) {
      const line = returnBanner(ctx)
      expect(line).not.toBeNull()
      expect(line!.length).toBeLessThan(60)
      expect(line!).not.toMatch(/!/)
    }
  })

  it('lapsed copy promises a recognition anchor', () => {
    expect(returnBanner('lapsed')).toMatch(/already know|read three/i)
  })
})

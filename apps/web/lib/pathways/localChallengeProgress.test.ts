/**
 * Tests for localStorage-backed boss/mixed progress (PTH-3).
 *
 * Covers: pass/fail thresholding, best-attempt-wins behavior, safe
 * JSON parse on corrupt storage, and graceful fallback when
 * localStorage is unavailable.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  challengeStorageKey,
  clearAllChallengeAttempts,
  getChallengeAttempt,
  hasClearedChallenge,
  isPassingAttempt,
  recordChallengeAttempt,
} from './localChallengeProgress'

const KEY = {
  pathwaySlug: 'complete-iq-foundation',
  chapterSlug: 'read-the-denial',
  mode: 'boss-challenge' as const,
  challengeSlug: 'denial-reader',
}

class MemoryStorage implements Storage {
  private data = new Map<string, string>()
  get length() {
    return this.data.size
  }
  clear() {
    this.data.clear()
  }
  getItem(k: string) {
    return this.data.has(k) ? this.data.get(k)! : null
  }
  key(i: number) {
    return Array.from(this.data.keys())[i] ?? null
  }
  removeItem(k: string) {
    this.data.delete(k)
  }
  setItem(k: string, v: string) {
    this.data.set(k, v)
  }
}

beforeEach(() => {
  // jsdom usually provides localStorage; reset between cases.
  if (typeof window !== 'undefined') {
    window.localStorage.clear()
  } else {
    // Provide a minimal global so the helper can probe + write.
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { localStorage: new MemoryStorage() },
    })
  }
})

afterEach(() => {
  clearAllChallengeAttempts()
})

describe('isPassingAttempt', () => {
  it('uses passRatio when provided', () => {
    expect(isPassingAttempt(4, 5, 0.8)).toBe(true)
    expect(isPassingAttempt(3, 5, 0.8)).toBe(false)
  })

  it('falls back to "any correct" when ratio missing', () => {
    expect(isPassingAttempt(1, 5, null)).toBe(true)
    expect(isPassingAttempt(0, 5, null)).toBe(false)
  })

  it('rejects zero-total attempts', () => {
    expect(isPassingAttempt(0, 0, 0.8)).toBe(false)
  })
})

describe('challengeStorageKey', () => {
  it('joins all four key fields with pipes', () => {
    expect(challengeStorageKey(KEY)).toBe(
      'complete-iq-foundation|read-the-denial|boss-challenge|denial-reader',
    )
  })
})

describe('recordChallengeAttempt + getChallengeAttempt', () => {
  it('persists pass/fail and metadata', () => {
    const stored = recordChallengeAttempt({
      ...KEY,
      bestCount: 4,
      total: 5,
      scenarioIds: ['BDW-01', 'BDW-02', 'BDW-03', 'BDW-04', 'BDW-05'],
      passRatio: 0.8,
      attemptedAt: '2025-01-01T00:00:00.000Z',
    })
    expect(stored.passed).toBe(true)
    expect(stored.attemptedAt).toBe('2025-01-01T00:00:00.000Z')
    expect(stored.scenarioIds).toEqual(['BDW-01', 'BDW-02', 'BDW-03', 'BDW-04', 'BDW-05'])

    const fetched = getChallengeAttempt(KEY)
    expect(fetched).not.toBeNull()
    expect(fetched!.passed).toBe(true)
    expect(hasClearedChallenge(KEY)).toBe(true)
  })

  it('keeps a previous pass when the next run misses', () => {
    recordChallengeAttempt({
      ...KEY,
      bestCount: 5,
      total: 5,
      scenarioIds: ['BDW-01'],
      passRatio: 0.8,
    })
    recordChallengeAttempt({
      ...KEY,
      bestCount: 2,
      total: 5,
      scenarioIds: ['BDW-01'],
      passRatio: 0.8,
    })
    const fetched = getChallengeAttempt(KEY)
    expect(fetched!.passed).toBe(true)
    expect(fetched!.bestCount).toBe(5)
  })

  it('overwrites with a higher passing score', () => {
    recordChallengeAttempt({
      ...KEY,
      bestCount: 4,
      total: 5,
      scenarioIds: ['BDW-01'],
      passRatio: 0.8,
    })
    recordChallengeAttempt({
      ...KEY,
      bestCount: 5,
      total: 5,
      scenarioIds: ['BDW-01'],
      passRatio: 0.8,
    })
    expect(getChallengeAttempt(KEY)!.bestCount).toBe(5)
  })

  it('records a fail when nothing prior exists', () => {
    const stored = recordChallengeAttempt({
      ...KEY,
      bestCount: 2,
      total: 5,
      scenarioIds: ['BDW-01'],
      passRatio: 0.8,
    })
    expect(stored.passed).toBe(false)
    expect(getChallengeAttempt(KEY)!.passed).toBe(false)
    expect(hasClearedChallenge(KEY)).toBe(false)
  })
})

describe('robustness', () => {
  it('returns null for an unknown key', () => {
    expect(
      getChallengeAttempt({
        ...KEY,
        challengeSlug: 'never-attempted',
      }),
    ).toBeNull()
  })

  it('survives corrupt JSON in storage', () => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem('courtiq.pathways.challengeProgress.v1', '{not json')
    expect(getChallengeAttempt(KEY)).toBeNull()
    // Subsequent writes should still succeed.
    const stored = recordChallengeAttempt({
      ...KEY,
      bestCount: 5,
      total: 5,
      scenarioIds: ['BDW-01'],
      passRatio: 0.8,
    })
    expect(stored.passed).toBe(true)
  })
})

import { beforeEach, describe, expect, it } from 'vitest'
import { InMemoryRateLimitStore } from './slidingWindow'

describe('InMemoryRateLimitStore', () => {
  let store: InMemoryRateLimitStore
  const config = { windowMs: 60_000, max: 3 }

  beforeEach(() => {
    store = new InMemoryRateLimitStore()
  })

  it('admits requests up to the cap', () => {
    const a = store.check('k', config, 1_000)
    const b = store.check('k', config, 1_100)
    const c = store.check('k', config, 1_200)
    expect(a.ok).toBe(true)
    expect(b.ok).toBe(true)
    expect(c.ok).toBe(true)
    expect(a.remaining).toBe(2)
    expect(b.remaining).toBe(1)
    expect(c.remaining).toBe(0)
  })

  it('rejects the request that would exceed the cap', () => {
    store.check('k', config, 1_000)
    store.check('k', config, 1_100)
    store.check('k', config, 1_200)
    const fourth = store.check('k', config, 1_300)
    expect(fourth.ok).toBe(false)
    expect(fourth.remaining).toBe(0)
    expect(fourth.retryAfterMs).toBeGreaterThan(0)
  })

  it('reports retryAfterMs anchored on the earliest live hit', () => {
    store.check('k', config, 1_000)
    store.check('k', config, 5_000)
    store.check('k', config, 10_000)
    const rejected = store.check('k', config, 20_000)
    expect(rejected.ok).toBe(false)
    // earliest = 1_000, window = 60_000 → resetAt = 61_000, now = 20_000
    expect(rejected.resetAt).toBe(61_000)
    expect(rejected.retryAfterMs).toBe(41_000)
  })

  it('evicts expired hits as the window slides', () => {
    store.check('k', config, 1_000)
    store.check('k', config, 1_100)
    store.check('k', config, 1_200)
    // 60s later — all three should have fallen out of the window.
    const next = store.check('k', config, 61_500)
    expect(next.ok).toBe(true)
    expect(next.remaining).toBe(2)
    expect(store._size('k')).toBe(1)
  })

  it('isolates keys', () => {
    store.check('a', config, 1_000)
    store.check('a', config, 1_100)
    store.check('a', config, 1_200)
    const aRejected = store.check('a', config, 1_300)
    const bAdmitted = store.check('b', config, 1_300)
    expect(aRejected.ok).toBe(false)
    expect(bAdmitted.ok).toBe(true)
  })

  it('does not record a hit when the request is rejected', () => {
    store.check('k', config, 1_000)
    store.check('k', config, 1_100)
    store.check('k', config, 1_200)
    expect(store._size('k')).toBe(3)
    store.check('k', config, 1_300) // rejected
    expect(store._size('k')).toBe(3)
  })

  it('handles boundary: hits exactly windowMs old are evicted', () => {
    // Boundary is exclusive on the floor — a hit at t=1000 with
    // windowMs=60000 should fall out at now=61000.
    store.check('k', config, 1_000)
    const atBoundary = store.check('k', { windowMs: 60_000, max: 1 }, 61_000)
    expect(atBoundary.ok).toBe(true)
  })

  it('reset() clears a single key', () => {
    store.check('a', config, 1_000)
    store.check('b', config, 1_000)
    store.reset('a')
    expect(store._size('a')).toBe(0)
    expect(store._size('b')).toBe(1)
  })

  it('reset() with no arg clears everything', () => {
    store.check('a', config, 1_000)
    store.check('b', config, 1_000)
    store.reset()
    expect(store._size('a')).toBe(0)
    expect(store._size('b')).toBe(0)
  })

  it('resetAt for an admitted request equals earliestLiveHit + windowMs', () => {
    const first = store.check('k', config, 1_000)
    const second = store.check('k', config, 2_000)
    expect(first.resetAt).toBe(61_000)
    expect(second.resetAt).toBe(61_000)
  })
})

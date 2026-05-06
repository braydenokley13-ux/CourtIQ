/**
 * V2-H — Frame pacing tracker tests.
 *
 * Locks:
 *  1. Empty tracker reports zeros, never NaN.
 *  2. record() drops negative + non-finite deltas without crashing.
 *  3. count caps at the buffer size (ring-buffer behaviour).
 *  4. summary() returns finite, monotonic-where-expected values.
 *  5. p50 / p95 / max / avg agree with manually-computed values for
 *     a small known sequence.
 *  6. avgFps clamps below 240fps to keep the badge UI sane.
 *  7. reset() returns the tracker to the empty state.
 *  8. Same recorded sequence → identical summary every time.
 */

import { describe, it, expect } from 'vitest'
import { FramePacingTracker } from './framePacing'

describe('FramePacingTracker', () => {
  it('reports zeros across the board on an empty tracker', () => {
    const t = new FramePacingTracker()
    const s = t.summary()
    expect(s.count).toBe(0)
    expect(s.lastMs).toBe(0)
    expect(s.p50Ms).toBe(0)
    expect(s.p95Ms).toBe(0)
    expect(s.maxMs).toBe(0)
    expect(s.avgMs).toBe(0)
    expect(s.avgFps).toBe(0)
    expect(s.slowFrames).toBe(0)
  })

  it('drops negative and non-finite deltas', () => {
    const t = new FramePacingTracker()
    t.record(-5)
    t.record(Number.NaN)
    t.record(Number.POSITIVE_INFINITY)
    expect(t.summary().count).toBe(0)
  })

  it('caps count at the buffer size', () => {
    const t = new FramePacingTracker({ bufferSize: 5 })
    for (let i = 0; i < 12; i++) t.record(16)
    expect(t.summary().count).toBe(5)
  })

  it('returns finite values for non-empty buffers', () => {
    const t = new FramePacingTracker({ bufferSize: 8 })
    t.record(10)
    t.record(12)
    t.record(8)
    t.record(20)
    const s = t.summary()
    expect(Number.isFinite(s.p50Ms)).toBe(true)
    expect(Number.isFinite(s.p95Ms)).toBe(true)
    expect(Number.isFinite(s.maxMs)).toBe(true)
    expect(Number.isFinite(s.avgMs)).toBe(true)
    expect(Number.isFinite(s.avgFps)).toBe(true)
    expect(s.maxMs).toBe(20)
  })

  it('computes p50/p95/avg correctly for a known sequence', () => {
    // 16 frames @ 16ms with one 50ms outlier. p50 should be 16,
    // p95 should be 50 (one in-twenty pick exits the high tail).
    const t = new FramePacingTracker({ bufferSize: 32 })
    for (let i = 0; i < 19; i++) t.record(16)
    t.record(50)
    const s = t.summary()
    expect(s.count).toBe(20)
    expect(s.p50Ms).toBe(16)
    expect(s.p95Ms).toBe(50)
    expect(s.maxMs).toBe(50)
    // avg = (19*16 + 50)/20 = 17.7
    expect(s.avgMs).toBeCloseTo(17.7, 5)
  })

  it('clamps avgFps below 240', () => {
    const t = new FramePacingTracker({ bufferSize: 8 })
    // 1ms frames would compute as 1000fps without the clamp.
    for (let i = 0; i < 8; i++) t.record(1)
    expect(t.summary().avgFps).toBe(240)
  })

  it('tracks slowFrames against the configured threshold', () => {
    const t = new FramePacingTracker({ bufferSize: 8, slowFrameMs: 20 })
    t.record(10)
    t.record(15)
    t.record(25)
    t.record(40)
    t.record(8)
    const s = t.summary()
    expect(s.slowFrames).toBe(2)
  })

  it('resets cleanly', () => {
    const t = new FramePacingTracker({ bufferSize: 8 })
    for (let i = 0; i < 8; i++) t.record(16)
    t.reset()
    expect(t.summary().count).toBe(0)
    expect(t.summary().avgMs).toBe(0)
  })

  it('produces deterministic summaries for the same sequence', () => {
    const a = new FramePacingTracker({ bufferSize: 16 })
    const b = new FramePacingTracker({ bufferSize: 16 })
    const seq = [16, 17, 19, 22, 16, 18, 33, 20, 15, 17]
    for (const v of seq) {
      a.record(v)
      b.record(v)
    }
    expect(a.summary()).toEqual(b.summary())
  })

  it('reports the most recently recorded delta as lastMs', () => {
    const t = new FramePacingTracker({ bufferSize: 4 })
    t.record(16)
    t.record(20)
    expect(t.summary().lastMs).toBe(20)
    t.record(33)
    expect(t.summary().lastMs).toBe(33)
  })
})

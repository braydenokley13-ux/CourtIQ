/**
 * V2-H — Frame Pacing Tracker.
 *
 * Pure ring-buffer that records the last N frame deltas (ms) and
 * exposes p50 / p95 / max / slow-frame statistics so a future debug
 * overlay or telemetry probe can read frame pacing without poking the
 * renderer's internal FPS guard state.
 *
 * The renderer's existing FPS guard already counts frames > 33ms to
 * decide when to drop to a lower quality tier. That guard is a single
 * boolean signal — "should we degrade?" — and discards the underlying
 * distribution. The pacing tracker keeps the distribution in a tiny
 * 120-slot ring so:
 *
 *   - QA can see a p95 frame time of, say, 19ms even though no
 *     individual frame crossed the 33ms slow threshold.
 *   - A future Sentry tag can capture pacing telemetry without an
 *     extra rAF loop.
 *
 * Pure: zero allocations per frame after construction. No DOM, no
 * THREE. SSR-safe (works in node).
 *
 * Hard contract:
 *   - `record(deltaMs)` runs in O(1). Negative or non-finite deltas
 *     are silently dropped (clock skew on tab focus return, etc.).
 *   - `summary()` returns finite numbers for every field; an empty
 *     buffer reports zeros across the board, never NaN.
 *   - Same recorded sequence → identical summary every time.
 */

const DEFAULT_BUFFER_SIZE = 120
/** Frame deltas slower than this read as "slow" — same threshold the
 *  imperative scene's FPS guard uses for tier degradation, kept in
 *  sync so tools that surface both numbers don't disagree. */
const SLOW_FRAME_MS_DEFAULT = 33

export interface FramePacingSummary {
  /** Number of frames currently in the ring (capped at buffer size). */
  count: number
  /** Last recorded delta (ms). 0 when no frames have been recorded. */
  lastMs: number
  /** Median frame delta (ms). 0 on empty buffer. */
  p50Ms: number
  /** 95th percentile frame delta (ms). 0 on empty buffer. */
  p95Ms: number
  /** Max frame delta in the window (ms). 0 on empty buffer. */
  maxMs: number
  /** Average frame delta in the window (ms). 0 on empty buffer. */
  avgMs: number
  /** Count of frames > slowFrameMs in the window. */
  slowFrames: number
  /** Inverse of `avgMs` expressed as fps; clamped to [0, 240]. */
  avgFps: number
}

const EMPTY_SUMMARY: FramePacingSummary = Object.freeze({
  count: 0,
  lastMs: 0,
  p50Ms: 0,
  p95Ms: 0,
  maxMs: 0,
  avgMs: 0,
  slowFrames: 0,
  avgFps: 0,
})

export interface FramePacingOptions {
  bufferSize?: number
  slowFrameMs?: number
}

export class FramePacingTracker {
  private readonly buffer: Float64Array
  private readonly slowFrameMs: number
  private writeIndex = 0
  private filled = 0
  private lastMs = 0

  constructor(options: FramePacingOptions = {}) {
    const size =
      options.bufferSize !== undefined &&
      Number.isFinite(options.bufferSize) &&
      options.bufferSize >= 4
        ? Math.floor(options.bufferSize)
        : DEFAULT_BUFFER_SIZE
    this.buffer = new Float64Array(size)
    this.slowFrameMs =
      options.slowFrameMs !== undefined && Number.isFinite(options.slowFrameMs)
        ? Math.max(1, options.slowFrameMs)
        : SLOW_FRAME_MS_DEFAULT
  }

  /**
   * Records a single frame delta. Negative or non-finite deltas are
   * dropped so a tab-focus clock skew (or a stuttered first frame
   * after a pause) does not pollute the buffer.
   */
  record(deltaMs: number): void {
    if (!Number.isFinite(deltaMs) || deltaMs < 0) return
    this.buffer[this.writeIndex] = deltaMs
    this.writeIndex = (this.writeIndex + 1) % this.buffer.length
    if (this.filled < this.buffer.length) this.filled += 1
    this.lastMs = deltaMs
  }

  /** Resets the buffer. */
  reset(): void {
    this.writeIndex = 0
    this.filled = 0
    this.lastMs = 0
    this.buffer.fill(0)
  }

  /**
   * Returns a snapshot summary. Allocates a fresh object each call so
   * the returned struct is immutable from the caller's perspective.
   */
  summary(): FramePacingSummary {
    if (this.filled === 0) {
      return EMPTY_SUMMARY
    }
    // Copy the active slice into a sortable array. The buffer is at
    // most 120 entries by default — a clone here is negligible.
    const active = new Float64Array(this.filled)
    for (let i = 0; i < this.filled; i++) {
      active[i] = this.buffer[i]!
    }
    let sum = 0
    let max = 0
    let slow = 0
    for (let i = 0; i < active.length; i++) {
      const v = active[i]!
      sum += v
      if (v > max) max = v
      if (v > this.slowFrameMs) slow += 1
    }
    const avg = sum / active.length

    // Sort a copy for percentile calculation. JS's Array#sort is
    // O(n log n); for 120 entries this is well under 0.1ms.
    const sorted = Array.from(active).sort((a, b) => a - b)
    const p50 = pickPercentile(sorted, 0.5)
    const p95 = pickPercentile(sorted, 0.95)

    const avgFps = avg > 0 ? Math.min(240, 1000 / avg) : 0

    return {
      count: this.filled,
      lastMs: this.lastMs,
      p50Ms: p50,
      p95Ms: p95,
      maxMs: max,
      avgMs: avg,
      slowFrames: slow,
      avgFps,
    }
  }
}

function pickPercentile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0
  // Nearest-rank percentile — trivial, deterministic, sufficient for
  // a 120-sample debug surface.
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor(q * sorted.length)),
  )
  return sorted[idx]!
}

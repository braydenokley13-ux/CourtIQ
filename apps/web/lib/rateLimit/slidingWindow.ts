/**
 * Sliding-window rate limiter — pure, in-memory, dependency-free.
 *
 * This is the math + storage primitive. Higher layers (the Next.js
 * helper in `./middleware.ts`) wrap it with request-keying logic.
 *
 * Algorithm: we keep a deque of UNIX-ms timestamps per key, evict
 * everything older than `windowMs`, then compare the remaining size
 * to `max`. The cost per check is O(evicted) amortized O(1); the
 * memory cost is bounded by `max` per active key.
 *
 * Why sliding instead of fixed buckets:
 *   - Fixed-bucket limiters allow 2× burst at the bucket boundary
 *     (e.g. 10/min lets 20 requests through if 10 land at :59 and 10
 *     at :00). The auth + session-start surfaces don't tolerate
 *     that — they're login + paid-action endpoints.
 *   - Token-bucket is fine but harder to reason about for SREs
 *     reading the dashboard. Sliding window matches the human prompt
 *     ("max N per M seconds") exactly.
 *
 * Why in-memory:
 *   - Vercel serverless functions are short-lived but warm instances
 *     share state across requests. For the rate caps we want
 *     (10/min per user on a paid action), single-instance memory is
 *     accurate enough to be useful. The `RateLimitStore` interface
 *     below lets us swap to Upstash Redis when we outgrow this — the
 *     callsites do not need to change.
 *
 * Time injection: every public function takes an explicit `now`
 * timestamp. Tests can drive the clock without `vi.useFakeTimers`.
 */

export interface RateLimitConfig {
  /** Window length in milliseconds. */
  windowMs: number
  /** Maximum allowed events inside the window (inclusive). */
  max: number
}

export interface RateLimitResult {
  /** True when the event was admitted; false when the cap was hit. */
  ok: boolean
  /** Remaining allowance after this attempt (0 on rejection). */
  remaining: number
  /** UNIX-ms when the limit will reset to full availability. */
  resetAt: number
  /** Number of ms the client should wait before retrying. Always ≥0. */
  retryAfterMs: number
}

export interface RateLimitStore {
  check(key: string, config: RateLimitConfig, now: number): RateLimitResult
  /** Test-only escape hatch. Optional. */
  reset?(key?: string): void
}

/**
 * In-memory store. Keyed map of arrays of ms timestamps.
 *
 * The map has soft GC: stale keys (last timestamp older than the
 * window) are dropped whenever they're checked. Keys that are never
 * checked again live until the process restarts; that's fine on
 * Vercel where instances cycle within minutes.
 */
export class InMemoryRateLimitStore implements RateLimitStore {
  private hits: Map<string, number[]> = new Map()

  check(key: string, config: RateLimitConfig, now: number): RateLimitResult {
    const windowStart = now - config.windowMs
    const existing = this.hits.get(key) ?? []
    // Evict in-place from the front. The list is append-only so the
    // oldest entries are at index 0.
    let evictUpTo = 0
    while (evictUpTo < existing.length && existing[evictUpTo] <= windowStart) {
      evictUpTo += 1
    }
    const live = evictUpTo === 0 ? existing : existing.slice(evictUpTo)

    if (live.length >= config.max) {
      // Capped — do not record this hit. The earliest live timestamp
      // is what gates the next admission.
      const earliest = live[0]
      const resetAt = earliest + config.windowMs
      const retryAfterMs = Math.max(0, resetAt - now)
      this.hits.set(key, live)
      return { ok: false, remaining: 0, resetAt, retryAfterMs }
    }

    live.push(now)
    this.hits.set(key, live)
    const remaining = config.max - live.length
    // resetAt is when the OLDEST live timestamp falls out of the
    // window — that's when remaining bumps up by one.
    const resetAt = live[0] + config.windowMs
    return { ok: true, remaining, resetAt, retryAfterMs: 0 }
  }

  reset(key?: string) {
    if (key === undefined) {
      this.hits.clear()
    } else {
      this.hits.delete(key)
    }
  }

  /** Test introspection — current live-hit count for a key. */
  _size(key: string): number {
    return this.hits.get(key)?.length ?? 0
  }
}

/**
 * Module-level singleton. Importers SHOULD use this rather than
 * instantiating their own store — that's how request handlers share
 * counters across invocations on the same warm instance.
 */
export const defaultStore: InMemoryRateLimitStore = new InMemoryRateLimitStore()

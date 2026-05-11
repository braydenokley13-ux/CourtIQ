/**
 * Next.js rate-limit helper.
 *
 * Wraps the pure store from `./slidingWindow` with two
 * production-shaped concerns:
 *   1. Key extraction. Authenticated requests key on the user id;
 *      anonymous requests key on the best-available client IP.
 *   2. Response shaping. On rejection we return a 429 with the
 *      standard `Retry-After` header (seconds, per RFC 6585) plus
 *      `X-RateLimit-*` debug headers. Admitted requests get the same
 *      X-RateLimit-* headers attached to the eventual response so
 *      clients can self-throttle.
 *
 * Designed to be called at the top of a route handler:
 *
 *   const gate = await enforceRateLimit(req, {
 *     bucket: 'session_start',
 *     limit: { windowMs: 60_000, max: 30 },
 *     userId,
 *   })
 *   if (!gate.ok) return gate.response
 *   ...
 *   return gate.decorate(NextResponse.json(payload))
 */
import { NextResponse, type NextRequest } from 'next/server'
import {
  defaultStore,
  type RateLimitConfig,
  type RateLimitResult,
  type RateLimitStore,
} from './slidingWindow'

export interface EnforceArgs {
  /** Logical bucket name — separates counters across endpoints. */
  bucket: string
  /** Window + cap. */
  limit: RateLimitConfig
  /**
   * Authenticated user id, if known. When present we key on the
   * user; when absent we fall back to the request IP. Mixing user
   * ids with IPs in the same bucket would let one signed-in attacker
   * exhaust an IP's anonymous quota.
   */
  userId?: string | null
  /** Override the clock — test seam. Defaults to Date.now. */
  now?: () => number
  /** Override the store — test seam. Defaults to the module singleton. */
  store?: RateLimitStore
}

export interface AdmittedGate {
  ok: true
  result: RateLimitResult
  /** Attach rate-limit debug headers to the route's success response. */
  decorate<T extends NextResponse>(res: T): T
}

export interface RejectedGate {
  ok: false
  result: RateLimitResult
  response: NextResponse
}

export type Gate = AdmittedGate | RejectedGate

/**
 * Best-effort client IP. Trusts the standard Vercel + Cloudflare
 * forward headers; falls back to a stable sentinel so unknown
 * clients still share a quota (better than skipping the limit).
 */
export function extractClientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  const realIp = req.headers.get('x-real-ip')
  if (realIp) return realIp.trim()
  const vercel = req.headers.get('x-vercel-forwarded-for')
  if (vercel) {
    const first = vercel.split(',')[0]?.trim()
    if (first) return first
  }
  return 'unknown'
}

function buildKey(bucket: string, userId: string | null | undefined, ip: string): string {
  if (userId && userId.length > 0) return `${bucket}:u:${userId}`
  return `${bucket}:ip:${ip}`
}

function rateLimitHeaders(limit: RateLimitConfig, result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(limit.max),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
  }
}

export function enforceRateLimit(req: NextRequest, args: EnforceArgs): Gate {
  const now = (args.now ?? Date.now)()
  const store = args.store ?? defaultStore
  const ip = extractClientIp(req)
  const key = buildKey(args.bucket, args.userId, ip)
  const result = store.check(key, args.limit, now)

  if (!result.ok) {
    const retryAfterSec = Math.max(1, Math.ceil(result.retryAfterMs / 1000))
    const headers: Record<string, string> = {
      ...rateLimitHeaders(args.limit, result),
      'Retry-After': String(retryAfterSec),
    }
    const response = NextResponse.json(
      {
        error: 'Too Many Requests',
        retry_after_s: retryAfterSec,
      },
      { status: 429, headers },
    )
    return { ok: false, result, response }
  }

  const headers = rateLimitHeaders(args.limit, result)
  return {
    ok: true,
    result,
    decorate<T extends NextResponse>(res: T): T {
      for (const [k, v] of Object.entries(headers)) {
        res.headers.set(k, v)
      }
      return res
    },
  }
}

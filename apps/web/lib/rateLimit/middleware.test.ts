import { beforeEach, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { enforceRateLimit, extractClientIp } from './middleware'
import { InMemoryRateLimitStore } from './slidingWindow'

function req(url: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(url, { method: 'POST', headers })
}

describe('extractClientIp', () => {
  it('prefers the first entry of x-forwarded-for', () => {
    const r = req('http://x/api/x', {
      'x-forwarded-for': '203.0.113.7, 70.41.3.18, 150.172.238.178',
    })
    expect(extractClientIp(r)).toBe('203.0.113.7')
  })

  it('falls back to x-real-ip when xff is absent', () => {
    expect(extractClientIp(req('http://x/api/x', { 'x-real-ip': '203.0.113.9' }))).toBe('203.0.113.9')
  })

  it('falls back to x-vercel-forwarded-for', () => {
    expect(
      extractClientIp(req('http://x/api/x', { 'x-vercel-forwarded-for': '203.0.113.10' })),
    ).toBe('203.0.113.10')
  })

  it('returns "unknown" when no header is present', () => {
    expect(extractClientIp(req('http://x/api/x'))).toBe('unknown')
  })
})

describe('enforceRateLimit', () => {
  let store: InMemoryRateLimitStore
  const limit = { windowMs: 60_000, max: 2 }

  beforeEach(() => {
    store = new InMemoryRateLimitStore()
  })

  it('admits up to the cap and rejects beyond it', () => {
    const r = req('http://x/api/session/start', { 'x-forwarded-for': '1.1.1.1' })
    const a = enforceRateLimit(r, { bucket: 'b', limit, now: () => 1_000, store })
    const b = enforceRateLimit(r, { bucket: 'b', limit, now: () => 1_100, store })
    const c = enforceRateLimit(r, { bucket: 'b', limit, now: () => 1_200, store })
    expect(a.ok).toBe(true)
    expect(b.ok).toBe(true)
    expect(c.ok).toBe(false)
  })

  it('emits a 429 with Retry-After + standard X-RateLimit-* headers', async () => {
    const r = req('http://x/api/session/start', { 'x-forwarded-for': '1.1.1.1' })
    enforceRateLimit(r, { bucket: 'b', limit, now: () => 1_000, store })
    enforceRateLimit(r, { bucket: 'b', limit, now: () => 1_100, store })
    const gate = enforceRateLimit(r, { bucket: 'b', limit, now: () => 1_200, store })
    expect(gate.ok).toBe(false)
    if (gate.ok) return
    expect(gate.response.status).toBe(429)
    expect(gate.response.headers.get('Retry-After')).toBeDefined()
    expect(Number(gate.response.headers.get('Retry-After'))).toBeGreaterThanOrEqual(1)
    expect(gate.response.headers.get('X-RateLimit-Limit')).toBe('2')
    expect(gate.response.headers.get('X-RateLimit-Remaining')).toBe('0')
    expect(gate.response.headers.get('X-RateLimit-Reset')).toBeDefined()
    const body = await gate.response.json()
    expect(body).toMatchObject({ error: 'Too Many Requests' })
    expect(body.retry_after_s).toBeGreaterThanOrEqual(1)
  })

  it('decorate() attaches X-RateLimit-* headers to admitted responses', () => {
    const r = req('http://x/api/session/start', { 'x-forwarded-for': '1.1.1.1' })
    const gate = enforceRateLimit(r, { bucket: 'b', limit, now: () => 1_000, store })
    expect(gate.ok).toBe(true)
    if (!gate.ok) return
    const { NextResponse } = require('next/server') as typeof import('next/server')
    const decorated = gate.decorate(NextResponse.json({ hi: 'there' }))
    expect(decorated.headers.get('X-RateLimit-Limit')).toBe('2')
    expect(decorated.headers.get('X-RateLimit-Remaining')).toBe('1')
  })

  it('separates anonymous IP counters from user counters', () => {
    const r = req('http://x/api/session/start', { 'x-forwarded-for': '1.1.1.1' })
    // Use up the IP quota.
    enforceRateLimit(r, { bucket: 'b', limit, now: () => 1_000, store })
    enforceRateLimit(r, { bucket: 'b', limit, now: () => 1_100, store })
    // The same IP signed in as user U should still have full quota.
    const gate = enforceRateLimit(r, {
      bucket: 'b',
      limit,
      userId: 'U',
      now: () => 1_200,
      store,
    })
    expect(gate.ok).toBe(true)
  })

  it('separates buckets', () => {
    const r = req('http://x/api/session/start', { 'x-forwarded-for': '1.1.1.1' })
    enforceRateLimit(r, { bucket: 'a', limit, now: () => 1_000, store })
    enforceRateLimit(r, { bucket: 'a', limit, now: () => 1_100, store })
    const bGate = enforceRateLimit(r, { bucket: 'b', limit, now: () => 1_200, store })
    expect(bGate.ok).toBe(true)
  })

  it('falls back to "unknown" key when no IP header is set', () => {
    const r1 = req('http://x/api/session/start')
    const r2 = req('http://x/api/session/start')
    enforceRateLimit(r1, { bucket: 'b', limit, now: () => 1_000, store })
    enforceRateLimit(r2, { bucket: 'b', limit, now: () => 1_100, store })
    // Both anonymous requests share the "unknown" bucket → next one
    // is rejected.
    const rejected = enforceRateLimit(r1, { bucket: 'b', limit, now: () => 1_200, store })
    expect(rejected.ok).toBe(false)
  })

  it('Retry-After is at least 1 second even when reset is imminent', () => {
    const r = req('http://x/api/session/start', { 'x-forwarded-for': '1.1.1.1' })
    enforceRateLimit(r, { bucket: 'b', limit: { windowMs: 1_000, max: 1 }, now: () => 1_000, store })
    const gate = enforceRateLimit(r, {
      bucket: 'b',
      limit: { windowMs: 1_000, max: 1 },
      now: () => 1_999, // 1ms before reset
      store,
    })
    expect(gate.ok).toBe(false)
    if (gate.ok) return
    expect(Number(gate.response.headers.get('Retry-After'))).toBeGreaterThanOrEqual(1)
  })
})

/**
 * Tests for POST /api/session/start focused on the rate-limit gate.
 *
 * The session bundle generator and analytics are stubbed; this file
 * exercises the auth + rate-limit + decoration plumbing only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    user: { upsert: vi.fn(async () => undefined) },
    scenario: { count: vi.fn(async () => 50) },
  },
}))
vi.mock('@/lib/services/scenarioService', () => ({
  generateSessionBundle: vi.fn(),
  InvalidScenarioIdsError: class InvalidScenarioIdsError extends Error {
    invalidIds: string[]
    constructor(invalidIds: string[]) {
      super('invalid')
      this.invalidIds = invalidIds
    }
  },
}))
vi.mock('@/lib/services/academyService', () => ({
  listValidConcepts: vi.fn(async () => new Set<string>()),
}))
vi.mock('@/lib/analytics/serverEvents', () => ({ captureServerEvent: vi.fn() }))

const mockSupabaseUser = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockSupabaseUser },
  })),
}))

import { NextRequest } from 'next/server'
import { generateSessionBundle } from '@/lib/services/scenarioService'
import { defaultStore } from '@/lib/rateLimit/slidingWindow'
import { POST } from './route'

type MockedFn = ReturnType<typeof vi.fn>

function buildReq(body: Record<string, unknown> = {}, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://x/api/session/start', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '1.2.3.4', ...headers },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  defaultStore.reset()
  mockSupabaseUser.mockResolvedValue({
    data: { user: { id: 'user-1', email: 'p@x.com', user_metadata: {} } },
  })
  ;(generateSessionBundle as MockedFn).mockResolvedValue({
    session_run_id: 'sess-1',
    scenarios: [],
    meta: { user_iq: 500, streak: 0, daily_goal_progress: 0 },
  })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/session/start — rate limit', () => {
  it('returns 401 when unauthenticated', async () => {
    mockSupabaseUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(buildReq())
    expect(res.status).toBe(401)
  })

  it('attaches X-RateLimit headers on a successful response', async () => {
    const res = await POST(buildReq())
    expect(res.status).toBe(200)
    expect(res.headers.get('X-RateLimit-Limit')).toBe('30')
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('29')
  })

  it('returns 429 once the per-user cap is exhausted', async () => {
    for (let i = 0; i < 30; i++) {
      const res = await POST(buildReq())
      expect(res.status).toBe(200)
    }
    const blocked = await POST(buildReq())
    expect(blocked.status).toBe(429)
    expect(blocked.headers.get('Retry-After')).toBeDefined()
    const body = await blocked.json()
    expect(body).toMatchObject({ error: 'Too Many Requests' })
  })
})

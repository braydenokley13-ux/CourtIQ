/**
 * Phase 11 — tests for POST /api/session/[id]/replay.
 *
 * Auth, ownership, missing-attempt soft-fail, and the increment math.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    sessionRun: { findUnique: vi.fn() },
    attempt: { findFirst: vi.fn(), update: vi.fn() },
  },
}))

import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/db/prisma'
import { POST } from './route'

type MockedFn = ReturnType<typeof vi.fn>

const params = (id: string) => ({ params: Promise.resolve({ id }) })

function authedSupabase(userId = 'user-1') {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: userId } } }),
    },
  }
}
function unauthedSupabase() {
  return { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) } }
}

function reqWith(body: Record<string, unknown>) {
  return new Request('http://x/api/session/sess/replay', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/session/[id]/replay', () => {
  afterEach(() => {
    vi.resetAllMocks()
  })

  it('returns 401 when unauthenticated', async () => {
    ;(createClient as MockedFn).mockResolvedValue(unauthedSupabase())
    const res = await POST(reqWith({ scenarioId: 'sc-1' }), params('sess'))
    expect(res.status).toBe(401)
  })

  it('returns 400 when scenarioId is missing', async () => {
    ;(createClient as MockedFn).mockResolvedValue(authedSupabase())
    const res = await POST(reqWith({}), params('sess'))
    expect(res.status).toBe(400)
  })

  it('returns 404 when the session belongs to another user', async () => {
    ;(createClient as MockedFn).mockResolvedValue(authedSupabase('user-1'))
    ;(prisma.sessionRun.findUnique as MockedFn).mockResolvedValue({ user_id: 'user-2' })
    const res = await POST(reqWith({ scenarioId: 'sc-1' }), params('sess'))
    expect(res.status).toBe(404)
  })

  it('returns 204 (soft-fail) when no attempt exists yet for the scenario', async () => {
    ;(createClient as MockedFn).mockResolvedValue(authedSupabase())
    ;(prisma.sessionRun.findUnique as MockedFn).mockResolvedValue({ user_id: 'user-1' })
    ;(prisma.attempt.findFirst as MockedFn).mockResolvedValue(null)
    const res = await POST(reqWith({ scenarioId: 'sc-1' }), params('sess'))
    expect(res.status).toBe(204)
    expect(prisma.attempt.update).not.toHaveBeenCalled()
  })

  it('increments replay_count on the most recent attempt and returns the new value', async () => {
    ;(createClient as MockedFn).mockResolvedValue(authedSupabase())
    ;(prisma.sessionRun.findUnique as MockedFn).mockResolvedValue({ user_id: 'user-1' })
    ;(prisma.attempt.findFirst as MockedFn).mockResolvedValue({ id: 'att-1' })
    ;(prisma.attempt.update as MockedFn).mockResolvedValue({ replay_count: 3 })
    const res = await POST(reqWith({ scenarioId: 'sc-1' }), params('sess'))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.replay_count).toBe(3)
    const updateCall = (prisma.attempt.update as MockedFn).mock.calls[0]?.[0]
    expect(updateCall?.where?.id).toBe('att-1')
    expect(updateCall?.data?.replay_count).toEqual({ increment: 1 })
  })
})

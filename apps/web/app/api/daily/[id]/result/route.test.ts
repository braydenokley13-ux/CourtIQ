/**
 * Phase 9 — tests for the GET /api/daily/[id]/result route.
 *
 * Covers auth, ownership, mode validation, idempotent close-out,
 * share-string presence, and daily-streak math.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    sessionRun: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  },
}))
vi.mock('@/lib/analytics/serverEvents', () => ({
  captureServerEvent: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/db/prisma'
import { GET } from './route'

type MockedFn = ReturnType<typeof vi.fn>

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

function makeAttempt(opts: {
  isCorrect: boolean
  timeMs?: number
  decoder?: string
}) {
  return {
    is_correct: opts.isCorrect,
    time_ms: opts.timeMs ?? 3000,
    created_at: new Date('2026-05-07T10:00:00Z'),
    scenario: {
      decoder_tag: opts.decoder ?? 'BACKDOOR_WINDOW',
      sub_concepts: ['tpl:t', 'sig:|disg:none|x'],
      difficulty: 1,
    },
  }
}

const params = (id: string) => ({ params: Promise.resolve({ id }) })

describe('GET /api/daily/[id]/result', () => {
  afterEach(() => {
    vi.resetAllMocks()
  })

  it('returns 401 when unauthenticated', async () => {
    ;(createClient as MockedFn).mockResolvedValue(unauthedSupabase())
    const res = await GET(new Request('http://x/api/daily/abc/result'), params('abc'))
    expect(res.status).toBe(401)
  })

  it('returns 404 when the session does not exist', async () => {
    ;(createClient as MockedFn).mockResolvedValue(authedSupabase())
    ;(prisma.sessionRun.findUnique as MockedFn).mockResolvedValue(null)
    const res = await GET(new Request('http://x/api/daily/none/result'), params('none'))
    expect(res.status).toBe(404)
  })

  it('returns 404 when the session belongs to a different user', async () => {
    ;(createClient as MockedFn).mockResolvedValue(authedSupabase('user-1'))
    ;(prisma.sessionRun.findUnique as MockedFn).mockResolvedValue({
      id: 'sess',
      user_id: 'user-2',
      mode: 'daily_challenge',
      attempts: [],
      started_at: new Date('2026-05-07T00:00:00Z'),
      ended_at: null,
    })
    const res = await GET(new Request('http://x/api/daily/sess/result'), params('sess'))
    expect(res.status).toBe(404)
  })

  it('returns 400 when the session is not a daily_challenge mode', async () => {
    ;(createClient as MockedFn).mockResolvedValue(authedSupabase())
    ;(prisma.sessionRun.findUnique as MockedFn).mockResolvedValue({
      id: 'sess',
      user_id: 'user-1',
      mode: 'training',
      attempts: [],
      started_at: new Date('2026-05-07T00:00:00Z'),
      ended_at: null,
    })
    const res = await GET(new Request('http://x/api/daily/sess/result'), params('sess'))
    expect(res.status).toBe(400)
  })

  it('returns the share-string + closes the session on first call', async () => {
    ;(createClient as MockedFn).mockResolvedValue(authedSupabase())
    ;(prisma.sessionRun.findUnique as MockedFn).mockResolvedValue({
      id: 'sess',
      user_id: 'user-1',
      mode: 'daily_challenge',
      started_at: new Date('2026-05-07T00:00:00Z'),
      ended_at: null,
      attempts: [
        makeAttempt({ isCorrect: true, timeMs: 2200 }),
        makeAttempt({ isCorrect: true, timeMs: 3100 }),
        makeAttempt({ isCorrect: false, timeMs: 5000 }),
        makeAttempt({ isCorrect: true, timeMs: 2700 }),
        makeAttempt({ isCorrect: true, timeMs: 2900 }),
      ],
    })
    ;(prisma.sessionRun.findFirst as MockedFn).mockResolvedValue(null) // no prior daily
    ;(prisma.sessionRun.findMany as MockedFn).mockResolvedValue([])
    ;(prisma.sessionRun.update as MockedFn).mockResolvedValue({})

    const res = await GET(new Request('http://x/api/daily/sess/result'), params('sess'))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.share_string).toContain('CourtIQ Daily')
    expect(body.share_string).toContain('🟢')
    expect(body.hits).toBe(4)
    expect(body.total).toBe(5)
    // First-ever completion → streak.current = 1.
    expect(body.streak.current).toBe(1)
    expect(body.streak.extended).toBe(true)
    expect(body.dots).toHaveLength(5)

    // Session is closed.
    expect(prisma.sessionRun.update).toHaveBeenCalled()
  })

  it('does not re-update a session that was already ended (idempotent)', async () => {
    ;(createClient as MockedFn).mockResolvedValue(authedSupabase())
    ;(prisma.sessionRun.findUnique as MockedFn).mockResolvedValue({
      id: 'sess',
      user_id: 'user-1',
      mode: 'daily_challenge',
      started_at: new Date('2026-05-07T00:00:00Z'),
      ended_at: new Date('2026-05-07T01:00:00Z'),
      attempts: [
        makeAttempt({ isCorrect: true }),
        makeAttempt({ isCorrect: true }),
        makeAttempt({ isCorrect: true }),
        makeAttempt({ isCorrect: true }),
        makeAttempt({ isCorrect: false }),
      ],
    })
    ;(prisma.sessionRun.findFirst as MockedFn).mockResolvedValue(null)
    ;(prisma.sessionRun.findMany as MockedFn).mockResolvedValue([])

    const res = await GET(new Request('http://x/api/daily/sess/result'), params('sess'))
    expect(res.status).toBe(200)
    // ended_at was already non-null → update is skipped.
    expect(prisma.sessionRun.update).not.toHaveBeenCalled()
  })
})

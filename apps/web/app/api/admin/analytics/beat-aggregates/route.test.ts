/**
 * Phase delta-Telemetry (WS-T) — tests for GET
 * /api/admin/analytics/beat-aggregates. Auth is open under vitest's
 * default NODE_ENV (not 'production'), so the tests exercise the
 * filter + aggregation glue directly. The pure math is covered by
 * features/scenarios/beatAnalytics.test.ts.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    attempt: { findMany: vi.fn() },
    scenario: { findMany: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
  })),
}))

import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { GET } from './route'

type MockedFn = ReturnType<typeof vi.fn>

function buildReq(url: string): NextRequest {
  return new NextRequest(url, { method: 'GET' })
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/admin/analytics/beat-aggregates', () => {
  it('returns empty aggregates when no attempts exist', async () => {
    ;(prisma.attempt.findMany as MockedFn).mockResolvedValue([])
    const res = await GET(buildReq('http://x/api/admin/analytics/beat-aggregates'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      n: 0,
      latencyByBeat: [],
      confusion: { n: 0, confusionRate: 0 },
    })
  })

  it('aggregates latency and confusion across mixed rows', async () => {
    ;(prisma.attempt.findMany as MockedFn).mockResolvedValue([
      // confused: beat 0 wrong on a 2-beat scenario
      { beat_results: [
        { beatIndex: 0, correct: false, firstActionMs: 1500 },
        { beatIndex: 1, correct: true, firstActionMs: 2000 },
      ] },
      // not confused: beat 1 (final) wrong, beat 0 right
      { beat_results: [
        { beatIndex: 0, correct: true, firstActionMs: 900 },
        { beatIndex: 1, correct: false, firstActionMs: 2400 },
      ] },
      // single-beat — never confused, contributes one beat-0 sample
      { beat_results: null },
    ])
    const res = await GET(buildReq('http://x/api/admin/analytics/beat-aggregates'))
    const body = await res.json()
    expect(body.n).toBe(3)
    expect(body.latencyByBeat).toHaveLength(2)
    expect(body.latencyByBeat[0]).toMatchObject({ beatIndex: 0, n: 2 })
    expect(body.latencyByBeat[1]).toMatchObject({ beatIndex: 1, n: 2 })
    // 1 of 3 rows is confused
    expect(body.confusion).toEqual({ n: 3, confusionRate: 1 / 3 })
  })

  it('passes scenarioId through to the where clause', async () => {
    ;(prisma.attempt.findMany as MockedFn).mockResolvedValue([])
    await GET(buildReq('http://x/api/admin/analytics/beat-aggregates?scenarioId=sc-7'))
    const call = (prisma.attempt.findMany as MockedFn).mock.calls[0][0]
    expect(call.where).toEqual({ scenario_id: 'sc-7' })
    expect(call.take).toBe(1000)
    expect(call.orderBy).toEqual({ created_at: 'desc' })
  })

  it('resolves decoderTag to scenario ids then filters attempts', async () => {
    ;(prisma.scenario.findMany as MockedFn).mockResolvedValue([
      { id: 'sc-a' },
      { id: 'sc-b' },
    ])
    ;(prisma.attempt.findMany as MockedFn).mockResolvedValue([])
    await GET(buildReq('http://x/api/admin/analytics/beat-aggregates?decoderTag=HUNT_THE_ADVANTAGE'))
    expect((prisma.scenario.findMany as MockedFn).mock.calls[0][0]).toEqual({
      where: { decoder_tag: 'HUNT_THE_ADVANTAGE' },
      select: { id: true },
    })
    const call = (prisma.attempt.findMany as MockedFn).mock.calls[0][0]
    expect(call.where).toEqual({ scenario_id: { in: ['sc-a', 'sc-b'] } })
  })

  it('short-circuits when decoderTag matches no scenarios', async () => {
    ;(prisma.scenario.findMany as MockedFn).mockResolvedValue([])
    const res = await GET(buildReq('http://x/api/admin/analytics/beat-aggregates?decoderTag=HUNT_THE_ADVANTAGE'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ n: 0, latencyByBeat: [], confusion: { n: 0, confusionRate: 0 } })
    expect((prisma.attempt.findMany as MockedFn)).not.toHaveBeenCalled()
  })

  it('short-circuits when scenarioId is not in the decoderTag set', async () => {
    ;(prisma.scenario.findMany as MockedFn).mockResolvedValue([{ id: 'sc-a' }])
    const res = await GET(buildReq('http://x/api/admin/analytics/beat-aggregates?scenarioId=sc-other&decoderTag=HUNT_THE_ADVANTAGE'))
    const body = await res.json()
    expect(body).toEqual({ n: 0, latencyByBeat: [], confusion: { n: 0, confusionRate: 0 } })
    expect((prisma.attempt.findMany as MockedFn)).not.toHaveBeenCalled()
  })

  it('combines scenarioId + decoderTag when scenarioId is in the set', async () => {
    ;(prisma.scenario.findMany as MockedFn).mockResolvedValue([{ id: 'sc-a' }, { id: 'sc-b' }])
    ;(prisma.attempt.findMany as MockedFn).mockResolvedValue([])
    await GET(buildReq('http://x/api/admin/analytics/beat-aggregates?scenarioId=sc-a&decoderTag=HUNT_THE_ADVANTAGE'))
    const call = (prisma.attempt.findMany as MockedFn).mock.calls[0][0]
    expect(call.where).toEqual({ scenario_id: 'sc-a' })
  })

  it('ignores malformed decoderTag values', async () => {
    ;(prisma.attempt.findMany as MockedFn).mockResolvedValue([])
    await GET(buildReq('http://x/api/admin/analytics/beat-aggregates?decoderTag=NOT_A_REAL_DECODER'))
    expect((prisma.scenario.findMany as MockedFn)).not.toHaveBeenCalled()
    const call = (prisma.attempt.findMany as MockedFn).mock.calls[0][0]
    expect(call.where).toEqual({})
  })

  it('ignores empty scenarioId values', async () => {
    ;(prisma.attempt.findMany as MockedFn).mockResolvedValue([])
    await GET(buildReq('http://x/api/admin/analytics/beat-aggregates?scenarioId='))
    const call = (prisma.attempt.findMany as MockedFn).mock.calls[0][0]
    expect(call.where).toEqual({})
  })

  it('returns 403 in production without admin credentials', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ADMIN_API_SECRET', '')
    try {
      const res = await GET(buildReq('http://x/api/admin/analytics/beat-aggregates'))
      expect(res.status).toBe(403)
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('allows access in production with a matching ADMIN_API_SECRET bearer', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ADMIN_API_SECRET', 'shh')
    ;(prisma.attempt.findMany as MockedFn).mockResolvedValue([])
    try {
      const req = new NextRequest('http://x/api/admin/analytics/beat-aggregates', {
        method: 'GET',
        headers: { authorization: 'Bearer shh' },
      })
      const res = await GET(req)
      expect(res.status).toBe(200)
    } finally {
      vi.unstubAllEnvs()
    }
  })
})

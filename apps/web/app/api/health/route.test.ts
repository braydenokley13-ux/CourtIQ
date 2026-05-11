import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $queryRaw: vi.fn(),
  },
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

describe('GET /api/health', () => {
  it('returns 200 with ok:true on shallow probe', async () => {
    const res = await GET(buildReq('http://x/api/health'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.db).toBeNull()
    expect(typeof body.uptime_s).toBe('number')
    expect(typeof body.commit).toBe('string')
    expect(prisma.$queryRaw).not.toHaveBeenCalled()
  })

  it('returns 200 with db.ok:true when deep probe succeeds', async () => {
    ;(prisma.$queryRaw as MockedFn).mockResolvedValue([{ '?column?': 1 }])
    const res = await GET(buildReq('http://x/api/health?deep=1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.db).toMatchObject({ ok: true })
    expect(typeof body.db.latency_ms).toBe('number')
  })

  it('returns 503 with db.ok:false when deep probe fails', async () => {
    ;(prisma.$queryRaw as MockedFn).mockRejectedValue(new Error('boom'))
    const res = await GET(buildReq('http://x/api/health?deep=1'))
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.db).toEqual({ ok: false, latency_ms: null })
  })

  it('treats any non-"1" value as shallow', async () => {
    const res = await GET(buildReq('http://x/api/health?deep=true'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.db).toBeNull()
    expect(prisma.$queryRaw).not.toHaveBeenCalled()
  })
})

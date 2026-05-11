/**
 * /api/health — production liveness + readiness probe.
 *
 * Two modes, controlled by `?deep=1`:
 *   - default (liveness):  no I/O. Just confirms the route handler is
 *     reachable. Cheap enough for a 1Hz uptime check.
 *   - deep (readiness):    pings the database via Prisma. Confirms the
 *     pooler URL is wired and the schema is reachable.
 *
 * Response shape is stable; uptime monitors should key off the
 * top-level `ok` boolean.
 *
 * Returns 200 when healthy, 503 when the deep check fails.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/lib/db/prisma'

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface HealthBody {
  ok: boolean
  uptime_s: number
  commit: string
  // Present only on deep checks. `null` on shallow checks so the
  // shape stays stable for downstream consumers.
  db: { ok: boolean; latency_ms: number | null } | null
}

const startedAt = Date.now()

export async function GET(req: NextRequest) {
  const deep = req.nextUrl.searchParams.get('deep') === '1'

  const body: HealthBody = {
    ok: true,
    uptime_s: Math.round((Date.now() - startedAt) / 1000),
    commit: process.env.NEXT_PUBLIC_COMMIT_SHA ?? 'local',
    db: null,
  }

  if (!deep) {
    return NextResponse.json(body, { status: 200 })
  }

  const dbStart = Date.now()
  try {
    await prisma.$queryRaw`SELECT 1`
    body.db = { ok: true, latency_ms: Date.now() - dbStart }
    return NextResponse.json(body, { status: 200 })
  } catch {
    body.ok = false
    body.db = { ok: false, latency_ms: null }
    return NextResponse.json(body, { status: 503 })
  }
}

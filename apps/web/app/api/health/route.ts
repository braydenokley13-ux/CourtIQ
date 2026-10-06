import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const startedAt = Date.now()

/** Process liveness only; the browser-local product has no backend readiness check. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    uptime_s: Math.round((Date.now() - startedAt) / 1000),
    commit: process.env.NEXT_PUBLIC_COMMIT_SHA ?? 'local',
  }, { headers: { 'Cache-Control': 'no-store' } })
}

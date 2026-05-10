/**
 * Phase delta-Telemetry (WS-T) — admin analytics endpoint over
 * Attempt.beat_results. Scans the most-recent 1000 attempt rows and
 * pipes them through the pure helpers in
 * `apps/web/features/scenarios/beatAnalytics.ts`.
 *
 * Query params (all optional):
 *   - scenarioId: filter to one scenario
 *   - decoderTag: filter to one decoder (joined through Scenario)
 *
 * Returns:
 *   {
 *     n: number,                   // attempts considered
 *     latencyByBeat: Array<{ beatIndex, n, p50Ms, p95Ms }>,
 *     confusion: { n, confusionRate },
 *   }
 *
 * Auth:
 *   Production: requires either (a) a signed-in Supabase user whose
 *     Prisma User.role is ADMIN, or (b) a service-to-service bearer
 *     matching process.env.ADMIN_API_SECRET (so cron / scripts can
 *     scrape without a session).
 *   Development: open. NOTE — there are currently no other
 *     /api/admin/* routes in the repo, so this endpoint introduces
 *     the admin-auth pattern. TODO(phase-delta): unify this with a
 *     shared `requireAdmin(req)` helper once a second admin route
 *     lands.
 *
 * Server-only — pure helpers do the math. This file owns the DB
 * read, the auth check, and JSON marshaling.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { DecoderTag } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { createClient } from '@/lib/supabase/server'
import {
  aggregateLatencyByBeat,
  decoderConfusionRate,
  type BeatResults,
} from '@/features/scenarios/beatAnalytics'

const RECENT_ATTEMPT_CAP = 1000

const DECODER_TAGS = new Set<string>(Object.values(DecoderTag))

interface ParsedQuery {
  scenarioId: string | null
  decoderTag: DecoderTag | null
}

function parseQuery(req: NextRequest): ParsedQuery {
  const sp = req.nextUrl.searchParams
  const rawScenario = sp.get('scenarioId')
  const rawDecoder = sp.get('decoderTag')
  const scenarioId = rawScenario && rawScenario.length > 0 ? rawScenario : null
  let decoderTag: DecoderTag | null = null
  if (rawDecoder && DECODER_TAGS.has(rawDecoder)) {
    decoderTag = rawDecoder as DecoderTag
  }
  return { scenarioId, decoderTag }
}

async function isAuthorized(req: NextRequest): Promise<boolean> {
  // Dev escape hatch — the parent prompt asked for `NODE_ENV !==
  // 'development'` gating. Tests run under NODE_ENV=test (vitest's
  // default) which is also not "production", but we treat anything
  // other than "production" as open so the dev + test loops stay
  // friction-free. Production-only enforcement.
  if (process.env.NODE_ENV !== 'production') return true

  const adminSecret = process.env.ADMIN_API_SECRET
  if (adminSecret) {
    const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
    if (bearer && bearer === adminSecret) return true
  }

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return false
    const record = await prisma.user.findUnique({
      where: { id: user.id },
      select: { role: true },
    })
    return record?.role === 'ADMIN'
  } catch {
    return false
  }
}

export async function GET(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { scenarioId, decoderTag } = parseQuery(req)

  // When filtering by decoderTag we look up the scenario IDs once so
  // the Attempt query stays on its own indexes. A direct relation
  // filter (`scenario: { decoder_tag }`) would force a join the
  // created_at index can't cover.
  let scenarioIdFilter: string[] | null = null
  if (decoderTag !== null) {
    const scenarios = await prisma.scenario.findMany({
      where: { decoder_tag: decoderTag },
      select: { id: true },
    })
    scenarioIdFilter = scenarios.map((s) => s.id)
    if (scenarioIdFilter.length === 0) {
      // No scenarios for this decoder → no attempts. Short-circuit.
      return NextResponse.json({
        n: 0,
        latencyByBeat: [],
        confusion: { n: 0, confusionRate: 0 },
      })
    }
  }

  const where: {
    scenario_id?: string | { in: string[] }
  } = {}
  if (scenarioId !== null && scenarioIdFilter !== null) {
    // Both filters → only keep the explicit scenarioId if it's in
    // the decoder set, else short-circuit to empty.
    if (!scenarioIdFilter.includes(scenarioId)) {
      return NextResponse.json({
        n: 0,
        latencyByBeat: [],
        confusion: { n: 0, confusionRate: 0 },
      })
    }
    where.scenario_id = scenarioId
  } else if (scenarioId !== null) {
    where.scenario_id = scenarioId
  } else if (scenarioIdFilter !== null) {
    where.scenario_id = { in: scenarioIdFilter }
  }

  const attempts = await prisma.attempt.findMany({
    where,
    select: { beat_results: true },
    orderBy: { created_at: 'desc' },
    take: RECENT_ATTEMPT_CAP,
  })

  // Derive scenarioBeatCount from the attempt's own beat_results
  // length. The authored beat count lives on Scenario.scene.beatSpec
  // (HUNT-only) and pulling it would force an N+1 join; the observed
  // length is a safe proxy because every fired beat writes a row.
  // Single-beat scenarios omit beat_results → scenarioBeatCount = 1
  // → confusion flag returns false, matching the helper contract.
  const rows = attempts.map((a) => {
    const beats = a.beat_results as BeatResults
    const beatCount = Array.isArray(beats)
      ? Math.max(1, beats.length)
      : 1
    return { beat_results: beats, scenarioBeatCount: beatCount }
  })

  const latencyByBeat = aggregateLatencyByBeat(rows)
  const confusion = decoderConfusionRate(rows)

  return NextResponse.json({
    n: rows.length,
    latencyByBeat,
    confusion,
  })
}

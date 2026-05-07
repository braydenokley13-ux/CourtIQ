import { NextResponse } from 'next/server'
import {
  InvalidScenarioIdsError,
  generateSessionBundle,
} from '@/lib/services/scenarioService'
import { listValidConcepts } from '@/lib/services/academyService'
import { prisma } from '@/lib/db/prisma'
import { captureServerEvent } from '@/lib/analytics/serverEvents'
import { createClient } from '@/lib/supabase/server'

function parseScenarioIds(raw: unknown): string[] | null {
  if (Array.isArray(raw)) {
    const cleaned = raw
      .filter((v): v is string => typeof v === 'string')
      .map((v) => v.trim())
      .filter((v) => v.length > 0)
    return cleaned.length > 0 ? cleaned : null
  }
  if (typeof raw === 'string' && raw.trim().length > 0) {
    const cleaned = raw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
    return cleaned.length > 0 ? cleaned : null
  }
  return null
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json().catch(() => ({}))) as {
    n?: number
    concept?: string
    scenarioId?: string
    scenarioIds?: string[] | string
  }
  const url = new URL(request.url)
  const conceptRaw = body.concept ?? url.searchParams.get('concept') ?? null
  const concept = conceptRaw && conceptRaw.trim().length > 0 ? conceptRaw.trim() : null
  const scenarioIdRaw = body.scenarioId ?? url.searchParams.get('scenario') ?? null
  const scenarioId =
    scenarioIdRaw && scenarioIdRaw.trim().length > 0 ? scenarioIdRaw.trim() : null
  const scenarioIds =
    parseScenarioIds(body.scenarioIds) ?? parseScenarioIds(url.searchParams.get('scenarioIds'))

  await prisma.user.upsert({
    where: { id: user.id },
    create: {
      id: user.id,
      email: user.email ?? `${user.id}@courtiq.local`,
      username: user.user_metadata?.username ?? user.id,
      recovery_email: user.user_metadata?.recovery_email ?? null,
      display_name: user.user_metadata?.display_name ?? user.user_metadata?.full_name ?? null,
    },
    update: {
      email: user.email ?? undefined,
    },
  })

  if (concept) {
    const valid = await listValidConcepts()
    if (!valid.has(concept)) {
      return NextResponse.json(
        { error: 'INVALID_CONCEPT', message: 'That lesson was not found.' },
        { status: 400 },
      )
    }
  }

  const liveCount = await prisma.scenario.count({
    where: { status: 'LIVE', ...(concept ? { concept_tags: { has: concept } } : {}) },
  })
  if (liveCount === 0) {
    captureServerEvent('session_start_blocked', { reason: 'CONTENT_NOT_LOADED' })
    return NextResponse.json(
      {
        error: 'CONTENT_NOT_LOADED',
        message: 'Training is loading. Try again in a few seconds.',
      },
      { status: 503 },
    )
  }

  // Determine the requested session size. When scenarioIds is set, we
  // honor the list length up to a reasonable cap so a Pathway-driven
  // pinned session always returns exactly the requested reps.
  const requestedSize = scenarioIds
    ? Math.min(scenarioIds.length, 25)
    : scenarioId
      ? 1
      : (body.n ?? 5)

  let bundle: Awaited<ReturnType<typeof generateSessionBundle>>
  try {
    bundle = await generateSessionBundle(user.id, requestedSize, {
      concept,
      scenarioId,
      scenarioIds,
    })
  } catch (err) {
    if (err instanceof InvalidScenarioIdsError) {
      return NextResponse.json(
        {
          error: 'INVALID_SCENARIO_IDS',
          message: 'None of the requested scenarios are available right now.',
          invalidIds: err.invalidIds,
        },
        { status: 400 },
      )
    }
    throw err
  }

  captureServerEvent('session_started', {
    session_run_id: bundle.session_run_id,
    scenario_count: bundle.scenarios.length,
    user_iq: bundle.meta.user_iq,
  })

  bundle.scenarios.forEach((scenario, index) => {
    captureServerEvent('scenario_presented', {
      session_run_id: bundle.session_run_id,
      scenario_id: scenario.id,
      difficulty: scenario.difficulty,
      concept_tags: scenario.concept_tags,
      order: index + 1,
    })
  })

  return NextResponse.json(bundle)
}

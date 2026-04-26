import { NextResponse } from 'next/server'
import { generateSessionBundle } from '@/lib/services/scenarioService'
import { listValidConcepts } from '@/lib/services/academyService'
import { prisma } from '@/lib/db/prisma'
import { captureServerEvent } from '@/lib/analytics/serverEvents'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({})) as { n?: number; concept?: string }
  const url = new URL(request.url)
  const conceptRaw = body.concept ?? url.searchParams.get('concept') ?? null
  const concept = conceptRaw && conceptRaw.trim().length > 0 ? conceptRaw.trim() : null

  await prisma.user.upsert({
    where: { id: user.id },
    create: {
      id: user.id,
      email: user.email ?? `${user.id}@courtiq.local`,
      display_name: user.user_metadata?.full_name ?? null,
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

  const bundle = await generateSessionBundle(user.id, body.n ?? 5, { concept })

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

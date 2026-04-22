import { NextResponse } from 'next/server'
import { generateSessionBundle } from '@/lib/services/scenarioService'
import { prisma } from '@/lib/db/prisma'
import { captureServerEvent } from '@/lib/analytics/serverEvents'
import { getDatabaseErrorMessage } from '@/lib/api/databaseError'

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { userId?: string; n?: number }

  if (!body.userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 })
  }

  try {
    await prisma.user.upsert({
      where: { id: body.userId },
      create: { id: body.userId, email: `${body.userId}@courtiq.local` },
      update: {},
    })

    const bundle = await generateSessionBundle(body.userId, body.n ?? 5)

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
  } catch (error) {
    const dbMessage = getDatabaseErrorMessage(error)

    if (dbMessage) {
      return NextResponse.json({ error: dbMessage }, { status: 503 })
    }

    console.error('[api/session/start] unexpected error', error)
    return NextResponse.json({ error: 'Failed to start session' }, { status: 500 })
  }
}

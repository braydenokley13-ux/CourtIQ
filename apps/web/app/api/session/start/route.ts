import { NextResponse } from 'next/server'
import { generateSessionBundle } from '@/lib/services/scenarioService'
import { prisma } from '@/lib/db/prisma'
import { captureServerEvent } from '@/lib/analytics/serverEvents'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({})) as { n?: number }

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

  const bundle = await generateSessionBundle(user.id, body.n ?? 5)

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

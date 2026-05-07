import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/session/[id]/replay
 *
 * Increments `replay_count` on the most recent Attempt the player
 * has logged for `{ scenarioId }` in this session. Drives the
 * Phase 4 `mystery-mode` probe: when a player rewatches the demo
 * 3+ times across the last 5 reps, the next session prefers a
 * Mystery Mode rep so they have to read the freeze instead of the
 * demo.
 *
 * Best-effort: a missing attempt (race between submit + replay
 * click) returns 204 No Content rather than an error so the
 * client never sees a failure on a UI nicety.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: sessionId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json().catch(() => ({}))) as {
    scenarioId?: string
  }
  if (!body.scenarioId) {
    return NextResponse.json({ error: 'scenarioId is required' }, { status: 400 })
  }

  // Confirm session ownership before mutating any of its rows.
  const session = await prisma.sessionRun.findUnique({
    where: { id: sessionId },
    select: { user_id: true },
  })
  if (!session || session.user_id !== user.id) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  // Most-recent attempt the player logged for this scenario in this
  // session. The player can only have one — the attempt route
  // creates exactly one row per (scenario, session) — but ordering
  // by created_at desc is cheap insurance against future duplicate
  // writes.
  const last = await prisma.attempt.findFirst({
    where: {
      user_id: user.id,
      session_run_id: sessionId,
      scenario_id: body.scenarioId,
    },
    orderBy: { created_at: 'desc' },
    select: { id: true },
  })
  if (!last) {
    return new NextResponse(null, { status: 204 })
  }

  const updated = await prisma.attempt.update({
    where: { id: last.id },
    data: { replay_count: { increment: 1 } },
    select: { replay_count: true },
  })

  return NextResponse.json({ replay_count: updated.replay_count })
}

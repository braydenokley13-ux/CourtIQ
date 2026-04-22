import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { captureServerEvent } from '@/lib/analytics/serverEvents'
import { sendEmail } from '@/lib/email/sender'
import { sessionCompleteEmail } from '@/lib/email/templates/session-complete'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: sessionId } = await params
  const body = await request.json().catch(() => ({})) as { userId?: string }

  if (!body.userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 })
  }

  const session = await prisma.sessionRun.findUnique({ where: { id: sessionId } })
  if (!session || session.user_id !== body.userId) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  const ended = await prisma.sessionRun.update({
    where: { id: sessionId },
    data: { ended_at: new Date() },
  })

  const durationMs = ended.ended_at
    ? ended.ended_at.getTime() - ended.started_at.getTime()
    : 0

  captureServerEvent('session_completed', {
    session_run_id: sessionId,
    correct_count: ended.correct_count,
    total: ended.scenario_ids.length,
    xp_earned: ended.xp_earned,
    iq_delta: ended.iq_delta,
    duration_ms: durationMs,
  })

  // Fire session summary email (non-blocking)
  void (async () => {
    try {
      const userRecord = await prisma.user.findUnique({
        where: { id: body.userId! },
        select: { email: true, display_name: true, profile: { select: { iq_score: true, current_streak: true } } },
      })
      if (!userRecord) return
      const { subject, html } = sessionCompleteEmail({
        name: userRecord.display_name ?? userRecord.email.split('@')[0],
        email: userRecord.email,
        correctCount: ended.correct_count,
        totalScenarios: ended.scenario_ids.length,
        xpEarned: ended.xp_earned,
        iqDelta: ended.iq_delta,
        iqAfter: userRecord.profile?.iq_score ?? 500,
        streakDays: userRecord.profile?.current_streak ?? 0,
      })
      await sendEmail({ to: userRecord.email, subject, html })
    } catch (err) {
      console.error('[email/session-complete]', err)
    }
  })()

  return NextResponse.json({
    session_run_id: sessionId,
    correct_count: ended.correct_count,
    total: ended.scenario_ids.length,
    xp_earned: ended.xp_earned,
    iq_delta: ended.iq_delta,
    duration_ms: durationMs,
  })
}

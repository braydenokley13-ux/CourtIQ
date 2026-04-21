import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { applyAttempt } from '@/lib/services/iqService'
import { award } from '@/lib/services/xpService'
import { update as updateMastery } from '@/lib/services/masteryService'
import { captureServerEvent } from '@/lib/analytics/serverEvents'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: sessionId } = await params
  const body = await request.json().catch(() => ({})) as { userId?: string; scenarioId?: string; choiceId?: string; timeMs?: number }

  if (!body.userId || !body.scenarioId || !body.choiceId) {
    return NextResponse.json({ error: 'userId, scenarioId, and choiceId are required' }, { status: 400 })
  }

  const session = await prisma.sessionRun.findUnique({ where: { id: sessionId } })
  if (!session || session.user_id !== body.userId) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  if (!session.scenario_ids.includes(body.scenarioId)) {
    return NextResponse.json({ error: 'Scenario not in this session' }, { status: 400 })
  }

  const scenario = await prisma.scenario.findUnique({
    where: { id: body.scenarioId },
    include: { choices: true },
  })

  if (!scenario) {
    return NextResponse.json({ error: 'Scenario not found' }, { status: 404 })
  }

  const selectedChoice = scenario.choices.find((choice) => choice.id === body.choiceId)
  const correctChoice = scenario.choices.find((choice) => choice.is_correct)

  if (!selectedChoice || !correctChoice) {
    return NextResponse.json({ error: 'Invalid choice' }, { status: 400 })
  }

  const timeMs = Math.max(0, body.timeMs ?? 8000)
  const result = await prisma.$transaction(async (tx) => {
    const iq = await applyAttempt(tx, {
      userId: body.userId!,
      scenario,
      isCorrect: selectedChoice.is_correct,
      timeMs,
    })
    const xp = await award(tx, {
      userId: body.userId!,
      isCorrect: selectedChoice.is_correct,
      xpReward: scenario.xp_reward,
    })

    await tx.attempt.create({
      data: {
        user_id: body.userId!,
        scenario_id: scenario.id,
        choice_id: selectedChoice.id,
        is_correct: selectedChoice.is_correct,
        time_ms: timeMs,
        iq_before: iq.iqBefore,
        iq_after: iq.iqAfter,
        session_run_id: sessionId,
      },
    })

    await tx.sessionRun.update({
      where: { id: sessionId },
      data: {
        correct_count: { increment: selectedChoice.is_correct ? 1 : 0 },
        xp_earned: { increment: xp.xpDelta },
        iq_delta: { increment: iq.iqDelta },
      },
    })

    await updateMastery(tx, {
      userId: body.userId!,
      conceptIds: scenario.concept_tags,
      isCorrect: selectedChoice.is_correct,
    })

    return {
      iq,
      xp,
    }
  })

  captureServerEvent('scenario_answered', {
    session_run_id: sessionId,
    scenario_id: scenario.id,
    choice_id: selectedChoice.id,
    is_correct: selectedChoice.is_correct,
    time_ms: timeMs,
    iq_delta: result.iq.iqDelta,
    xp_delta: result.xp.xpDelta,
  })

  return NextResponse.json({
    scenario_id: scenario.id,
    choice_id: selectedChoice.id,
    is_correct: selectedChoice.is_correct,
    feedback_text: selectedChoice.feedback_text,
    explanation_md: scenario.explanation_md,
    correct_choice_id: correctChoice.id,
    iq_delta: result.iq.iqDelta,
    xp_delta: result.xp.xpDelta,
    iq_after: result.iq.iqAfter,
    xp_total: result.xp.xpTotal,
    level: result.xp.levelAfter,
  })
}

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { applyAttempt } from '@/lib/services/iqService'
import { award } from '@/lib/services/xpService'
import { update as updateMastery } from '@/lib/services/masteryService'
import { tick as tickStreak } from '@/lib/services/streakService'
import { checkAndAward } from '@/lib/services/badgeService'
import { captureServerEvent } from '@/lib/analytics/serverEvents'
import { sendEmail } from '@/lib/email/sender'
import { badgeEarnedEmail } from '@/lib/email/templates/badge-earned'

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
      choice: selectedChoice,
      timeMs,
    })
    const xp = await award(tx, {
      userId: body.userId!,
      amount: selectedChoice.is_correct ? 10 : 0,
      difficulty: scenario.difficulty,
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

    const streak = await tickStreak(tx, { userId: body.userId! })
    const badges = await checkAndAward(tx, { userId: body.userId!, sessionId })

    return {
      iq,
      xp,
      streak,
      badges,
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

  captureServerEvent('iq_updated', {
    iq_before: result.iq.iqBefore,
    iq_after: result.iq.iqAfter,
    delta: result.iq.iqDelta,
    source: 'scenario',
  })

  if (result.xp.levelAfter > result.xp.levelBefore) {
    captureServerEvent('level_up', {
      level_before: result.xp.levelBefore,
      level_after: result.xp.levelAfter,
      xp_total: result.xp.xpTotal,
    })
  }

  if (result.streak.extended) {
    captureServerEvent('streak_extended', {
      streak_current: result.streak.current,
    })
  }

  if (result.streak.broken) {
    captureServerEvent('streak_broken', {
      streak_previous: result.streak.previous,
    })
  }

  for (const badge of result.badges) {
    captureServerEvent('badge_earned', {
      badge_slug: badge.slug,
      family: badge.family,
    })
  }

  // Fire badge emails without blocking the response
  if (result.badges.length > 0) {
    const userRecord = await prisma.user.findUnique({
      where: { id: body.userId! },
      select: { email: true, display_name: true, profile: { select: { iq_score: true } } },
    })
    if (userRecord) {
      for (const badge of result.badges) {
        const { subject, html } = badgeEarnedEmail({
          name: userRecord.display_name ?? userRecord.email.split('@')[0],
          email: userRecord.email,
          badgeName: badge.slug.split('-').slice(1).map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
          badgeSlug: badge.slug,
          badgeFamily: badge.family,
          currentIQ: result.iq.iqAfter,
        })
        sendEmail({ to: userRecord.email, subject, html }).catch(err => console.error('[email/badge]', err))
      }
    }
  }

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
    streak: result.streak.current,
    badges_awarded: result.badges,
  })
}

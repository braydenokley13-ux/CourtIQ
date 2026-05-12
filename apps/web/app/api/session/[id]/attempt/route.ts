import { NextResponse, type NextRequest } from 'next/server'
import { SessionMode } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { applyAttempt } from '@/lib/services/iqService'
import { award } from '@/lib/services/xpService'
import { update as updateMastery } from '@/lib/services/masteryService'
import { tick as tickStreak } from '@/lib/services/streakService'
import { checkAndAward } from '@/lib/services/badgeService'
import { captureServerEvent } from '@/lib/analytics/serverEvents'
import { sendEmail } from '@/lib/email/sender'
import { badgeEarnedEmail } from '@/lib/email/templates/badge-earned'
import { enforceRateLimit } from '@/lib/rateLimit/middleware'
import { parseBeatResults } from './beatResults'

// Attempt submit is the highest-leverage user-write path: each call
// runs IQ, XP, mastery, streak, badges, and email side effects inside
// one transaction. A real session caps at ~5 attempts/3 minutes
// (~1.7/min). 120/min/user is ~70x that — enough headroom for a
// fast-clicking kid + dev tools, low enough to stop a scripted hammer
// from flooding the badge engine.
const ATTEMPT_LIMIT = { windowMs: 60_000, max: 120 }

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: sessionId } = await params
  const body = await request.json().catch(() => ({})) as {
    userId?: string
    scenarioId?: string
    choiceId?: string
    timeMs?: number
    beatResults?: unknown
  }

  if (!body.userId || !body.scenarioId || !body.choiceId) {
    return NextResponse.json({ error: 'userId, scenarioId, and choiceId are required' }, { status: 400 })
  }

  const gate = enforceRateLimit(request, {
    bucket: 'session_attempt',
    limit: ATTEMPT_LIMIT,
    userId: body.userId,
  })
  if (!gate.ok) return gate.response

  // HUNT-only — non-HUNT scenarios omit this and the column stays null.
  const beatResults = parseBeatResults(body.beatResults)

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
  // Phase 8 — daily-challenge sessions skip mastery + training-streak
  // + badge side effects so a Mystery-Mode rep can't drive band
  // promotion or extend a streak the player didn't earn through
  // training. Attempt + XP + IQ rows still write for analytics +
  // share-string honesty.
  const isDaily = session.mode === SessionMode.daily_challenge
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
        // Phase 10 — denormalize the choice's authored quality so the
        // spine glue (buildDecoderConfidences) can drive band logic
        // off the real `best | acceptable | wrong` signal. Historical
        // rows stay null and the glue falls back to its proxy.
        choice_quality: selectedChoice.quality,
        // Phase γ (HUNT) — per-beat correctness for chained two-beat
        // scenarios. Undefined → column stays null for single-beat
        // scenarios; the replay teaching layer falls back to the
        // legacy correct / wrong cadences when this is null.
        ...(beatResults !== undefined ? { beat_results: beatResults } : {}),
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

    if (!isDaily) {
      await updateMastery(tx, {
        userId: body.userId!,
        conceptIds: scenario.concept_tags,
        decoderTag: scenario.decoder_tag,
        isCorrect: selectedChoice.is_correct,
      })
    }

    const streak = isDaily
      ? { current: 0, previous: 0, extended: false, broken: false }
      : await tickStreak(tx, { userId: body.userId! })
    const badges = isDaily
      ? []
      : await checkAndAward(tx, { userId: body.userId!, sessionId })

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
      select: { email: true, display_name: true, email_unsubscribed: true, profile: { select: { iq_score: true } } },
    })
    if (userRecord && !userRecord.email_unsubscribed) {
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

  return gate.decorate(NextResponse.json({
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
  }))
}

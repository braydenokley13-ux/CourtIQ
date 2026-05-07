import { NextResponse } from 'next/server'
import { SessionMode } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { createClient } from '@/lib/supabase/server'
import { captureServerEvent } from '@/lib/analytics/serverEvents'
import {
  buildDailyResult,
  inAppResultLines,
  tickDailyStreak,
} from '@/lib/dailyChallenge'
import { parseScenarioVariantTags } from '@/lib/firstSession'
import type { AdaptiveAttempt } from '@/lib/adaptive'

/**
 * GET /api/daily/[id]/result
 *
 * Marks the Mystery-Mode daily session complete (idempotent), ticks
 * the daily-challenge streak, and returns the player-facing result
 * card + share string. Mastery + training-streak side effects are
 * intentionally NOT applied here — see /api/session/[id]/attempt
 * which now reads SessionRun.mode and skips them for daily sessions.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: sessionId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const session = await prisma.sessionRun.findUnique({
    where: { id: sessionId },
    include: {
      attempts: {
        orderBy: { created_at: 'asc' },
        include: { scenario: true },
      },
    },
  })
  if (!session || session.user_id !== user.id) {
    return NextResponse.json({ error: 'Daily session not found' }, { status: 404 })
  }
  if (session.mode !== SessionMode.daily_challenge) {
    return NextResponse.json(
      { error: 'Session is not a daily challenge' },
      { status: 400 },
    )
  }

  // Compute the result against the *user's* attempts (the share string
  // is honest about what they actually answered, even if their slot 3
  // was swapped by the transfer-probe personalization).
  const adaptiveAttempts: AdaptiveAttempt[] = session.attempts.map((a) => {
    const v = parseScenarioVariantTags(a.scenario.sub_concepts ?? [])
    return {
      decoderTag: a.scenario.decoder_tag ?? '',
      templateId: v.templateId,
      signature: v.signature,
      disguise: v.disguise,
      difficulty: a.scenario.difficulty,
      isCorrect: a.is_correct,
      choiceQuality: a.is_correct ? 'best' : 'wrong',
      timeMs: a.time_ms,
      createdAt: a.created_at,
    }
  })

  const dateKey = session.started_at.toISOString().slice(0, 10)
  const result = buildDailyResult({ date: dateKey, attempts: adaptiveAttempts })
  const inApp = inAppResultLines(result)

  // Tick the daily streak — independent of the training streak. We
  // store the last completed date in Profile.streak_freeze_count?
  // No: we already have a bespoke "daily streak" lookup pattern via
  // the latest completed daily session. Compute by querying the most
  // recent already-ended daily session BEFORE today.
  const lastCompletedSession = await prisma.sessionRun.findFirst({
    where: {
      user_id: user.id,
      mode: SessionMode.daily_challenge,
      ended_at: { not: null },
      id: { not: sessionId },
    },
    orderBy: { ended_at: 'desc' },
    select: { ended_at: true, started_at: true },
  })
  const previousStreak = await dailyStreakSize(user.id, dateKey)
  const lastDate = lastCompletedSession?.started_at
    ? lastCompletedSession.started_at.toISOString().slice(0, 10)
    : null

  const streak = tickDailyStreak({
    previous: previousStreak,
    lastCompletedDate: lastDate,
    todayDate: dateKey,
  })

  // Mark the session ended (idempotent — re-completing a daily later
  // in the day is a no-op for the streak math).
  if (!session.ended_at) {
    await prisma.sessionRun.update({
      where: { id: sessionId },
      data: {
        ended_at: new Date(),
        correct_count: result.hits,
      },
    })
    captureServerEvent(
      'daily_completed',
      {
        session_run_id: sessionId,
        date: dateKey,
        hits: result.hits,
        total: result.total,
        total_time_ms: result.totalTimeMs,
        streak_current: streak.current,
        streak_extended: streak.extended,
        streak_reset: streak.reset,
      },
      user.id,
    )
  }

  return NextResponse.json({
    session_run_id: sessionId,
    date: dateKey,
    headline: inApp.headline,
    sub: inApp.sub,
    hits: result.hits,
    total: result.total,
    total_time_ms: result.totalTimeMs,
    dots: result.dots,
    share_string: result.shareString,
    streak: {
      current: streak.current,
      extended: streak.extended,
      reset: streak.reset,
      idempotent: streak.idempotent,
    },
  })
}

/**
 * Walk back from `todayDate` over consecutive UTC days that have a
 * completed daily session. Stops at the first gap. Excludes today
 * (today's tick is computed separately by tickDailyStreak).
 */
async function dailyStreakSize(userId: string, todayDate: string): Promise<number> {
  const completed = await prisma.sessionRun.findMany({
    where: {
      user_id: userId,
      mode: SessionMode.daily_challenge,
      ended_at: { not: null },
    },
    orderBy: { started_at: 'desc' },
    select: { started_at: true },
    take: 60,
  })
  const days = new Set(
    completed.map((s) => s.started_at.toISOString().slice(0, 10)),
  )

  let count = 0
  let cursor = new Date(`${todayDate}T00:00:00Z`)
  cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000)
  while (days.has(cursor.toISOString().slice(0, 10))) {
    count++
    cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000)
  }
  return count
}

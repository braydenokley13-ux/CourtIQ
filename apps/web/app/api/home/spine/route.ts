import { NextResponse } from 'next/server'
import { SessionMode } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { createClient } from '@/lib/supabase/server'
import {
  decoderRingStrip,
  fasterCallout,
  latencyWindow,
  todaysFocusLine,
} from '@/lib/recognitionSurface'
import { strongestDecoder } from '@/lib/returnLoop'
import { buildDecoderConfidences } from '@/lib/spine/glue'
import { parseScenarioVariantTags } from '@/lib/firstSession'
import type { AdaptiveAttempt } from '@/lib/adaptive'

const MIN_LIVE_FOR_DAILY = 20

/** Phase 9 — fasterCallout windows. We compare the median latency on
 *  correct attempts in the last 7 days against the 7 days before that.
 *  Confidence-gated by the callout itself (≥ 8 attempts per window). */
const FASTER_RECENT_DAYS = 7
const FASTER_PRIOR_DAYS = 14

/**
 * GET /api/home/spine
 *
 * Single aggregator endpoint that gives /home the Phase 6 + Phase 7
 * surface data: the decoder ring strip, today's focus line, and the
 * daily-challenge status. Read-only — never mutates state, so /home
 * can call it on every visit without side effects.
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const todayKey = utcDateKey(now)
  const todayUtc = new Date(`${todayKey}T00:00:00Z`)
  const tomorrowUtc = new Date(todayUtc.getTime() + 24 * 60 * 60 * 1000)

  const [attemptsDescBounded, liveCount, todaySession, recentDailyDates] = await Promise.all([
    // Phase 10 — bound the unbounded attempts query. The adaptive
    // band logic only inspects the most recent RECOGNITION_WINDOW=10
    // admissible attempts per decoder; 200 global rows is ~50 per
    // decoder which is well past the band-promotion ceiling. Sort
    // desc + take, then reverse below so the glue still sees
    // oldest-first (computeDecoderConfidence's slice(-N) depends on
    // the ordering).
    //
    // Phase 11.1 — exclude daily-challenge attempts. Daily reps are
    // intentional Mystery-Mode side-mode reads; promoting decoder
    // bands off them would contradict the strategy that daily attempts
    // do NOT update mastery. The decoder ring + focus line on /home
    // must reflect training history only. The `OR session_run_id is
    // null` branch keeps pre-Phase-8 attempts visible.
    prisma.attempt.findMany({
      where: {
        user_id: user.id,
        OR: [
          { session_run_id: null },
          { session_run: { is: { mode: { not: SessionMode.daily_challenge } } } },
        ],
      },
      orderBy: { created_at: 'desc' },
      take: 200,
      include: { scenario: true },
    }),
    prisma.scenario.count({ where: { status: 'LIVE' } }),
    prisma.sessionRun.findFirst({
      where: {
        user_id: user.id,
        mode: SessionMode.daily_challenge,
        started_at: { gte: todayUtc, lt: tomorrowUtc },
      },
      select: { id: true, ended_at: true },
    }),
    // Phase 11.1 — drop the 60-row cap on the streak history. The
    // walkback below stops at the first gap; a hard row limit silently
    // truncates streaks > 60 days. Row count is bounded by the user's
    // lifetime daily completions (≤ ~365 per year) and the projection
    // is just `started_at`, so materializing all of them is cheap.
    prisma.sessionRun.findMany({
      where: {
        user_id: user.id,
        mode: SessionMode.daily_challenge,
        ended_at: { not: null },
      },
      orderBy: { started_at: 'desc' },
      select: { started_at: true },
    }),
  ])

  const attempts = [...attemptsDescBounded].reverse()
  const decoders = buildDecoderConfidences(attempts, now)
  const ring = decoderRingStrip(decoders)
  const focusLine = todaysFocusLine(decoders)

  // Phase 9 — fasterCallout. The strongest in-progress decoder is
  // named so the line reads as personal ("you read Backdoor Window
  // 0.4s faster"). The callout itself is confidence-gated; if either
  // window has < 8 attempts the line comes back null and /home
  // renders nothing.
  const adaptiveAttempts: AdaptiveAttempt[] = attempts.map((a) => {
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
  const recentStart = new Date(now.getTime() - FASTER_RECENT_DAYS * 24 * 60 * 60 * 1000)
  const priorStart = new Date(now.getTime() - FASTER_PRIOR_DAYS * 24 * 60 * 60 * 1000)
  const strongest = strongestDecoder(decoders)
  const callout = fasterCallout({
    recent: latencyWindow(adaptiveAttempts, recentStart, now),
    prior: latencyWindow(adaptiveAttempts, priorStart, recentStart),
    decoderTag: strongest?.decoderTag ?? null,
  })

  // Daily streak — count consecutive UTC days strictly before today
  // that have a completed daily.
  const completedDays = new Set(
    recentDailyDates.map((s) => utcDateKey(s.started_at)),
  )
  let dailyStreak = todaySession?.ended_at ? 1 : 0
  let cursor = new Date(todayUtc.getTime() - 24 * 60 * 60 * 1000)
  while (completedDays.has(utcDateKey(cursor))) {
    dailyStreak += 1
    cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000)
  }

  return NextResponse.json({
    decoderConfidences: decoders,
    decoderRing: ring,
    focusLine,
    fasterCallout: {
      line: callout.line,
      improvedMs: callout.improvedMs,
    },
    daily: {
      available: liveCount >= MIN_LIVE_FOR_DAILY,
      date: todayKey,
      session_run_id: todaySession?.id ?? null,
      completed_today: !!todaySession?.ended_at,
      started_today: !!todaySession,
      streak: dailyStreak,
    },
  })
}

function utcDateKey(d: Date): string {
  const year = d.getUTCFullYear()
  const month = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

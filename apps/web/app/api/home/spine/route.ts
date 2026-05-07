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

  const [attempts, liveCount, todaySession, recentDailyDates] = await Promise.all([
    prisma.attempt.findMany({
      where: { user_id: user.id },
      orderBy: { created_at: 'asc' },
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
    prisma.sessionRun.findMany({
      where: {
        user_id: user.id,
        mode: SessionMode.daily_challenge,
        ended_at: { not: null },
      },
      orderBy: { started_at: 'desc' },
      select: { started_at: true },
      take: 60,
    }),
  ])

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

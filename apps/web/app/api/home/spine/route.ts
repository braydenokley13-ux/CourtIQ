import { NextResponse } from 'next/server'
import { SessionMode } from '@prisma/client'
import type { DecoderTag } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { createClient } from '@/lib/supabase/server'
import {
  type AdaptiveAttempt,
  type DecoderConfidence,
  computeDecoderConfidence,
} from '@/lib/adaptive'
import { parseScenarioVariantTags } from '@/lib/firstSession'
import {
  decoderRingStrip,
  todaysFocusLine,
} from '@/lib/recognitionSurface'

const ALL_DECODERS: DecoderTag[] = [
  'BACKDOOR_WINDOW',
  'EMPTY_SPACE_CUT',
  'SKIP_THE_ROTATION',
  'ADVANTAGE_OR_RESET',
] as DecoderTag[]

const MIN_LIVE_FOR_DAILY = 20

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

function buildDecoderConfidences(
  attempts: ReadonlyArray<{
    scenario: { decoder_tag: DecoderTag | null; sub_concepts: string[]; difficulty: number }
    is_correct: boolean
    time_ms: number
    created_at: Date
  }>,
  now: Date,
): DecoderConfidence[] {
  const byDecoder = new Map<string, AdaptiveAttempt[]>()
  for (const a of attempts) {
    const tag = a.scenario.decoder_tag
    if (!tag) continue
    const v = parseScenarioVariantTags(a.scenario.sub_concepts ?? [])
    const list = byDecoder.get(tag) ?? []
    list.push({
      decoderTag: tag,
      templateId: v.templateId,
      signature: v.signature,
      disguise: v.disguise,
      difficulty: a.scenario.difficulty,
      isCorrect: a.is_correct,
      choiceQuality: a.is_correct ? 'best' : 'wrong',
      timeMs: a.time_ms,
      createdAt: a.created_at,
    })
    byDecoder.set(tag, list)
  }
  return ALL_DECODERS.map((tag) => {
    const decoderAttempts = byDecoder.get(tag) ?? []
    const last = decoderAttempts[decoderAttempts.length - 1]
    const days = last
      ? Math.floor((now.getTime() - last.createdAt.getTime()) / (24 * 60 * 60 * 1000))
      : 9999
    return computeDecoderConfidence({
      decoderTag: tag,
      attempts: decoderAttempts,
      daysSinceLastAttempt: days,
      recentReplayViews: 0,
    })
  })
}

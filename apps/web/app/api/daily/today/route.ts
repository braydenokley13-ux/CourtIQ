import { NextResponse } from 'next/server'
import { SessionMode } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { createClient } from '@/lib/supabase/server'
import { captureServerEvent } from '@/lib/analytics/serverEvents'
import {
  composeDailyChallenge,
  type DailyCatalogScenario,
} from '@/lib/dailyChallenge'
import { parseScenarioVariantTags } from '@/lib/firstSession'
import { buildDecoderConfidences } from '@/lib/spine/glue'

/** UTC midnight today — used both for the daily seed and to scope
 *  "did the player already start today's daily?" lookups. */
function utcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

/**
 * POST /api/daily/today
 *
 * Creates (or rehydrates) a Phase 7 Mystery-Mode daily-challenge
 * session for the current player. Same 5 reps for everyone on the
 * same UTC day, modulo the single transfer-probe personalization
 * the composer allows. Idempotent: a second call on the same UTC
 * day reuses the existing SessionRun.
 */
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const todayUtc = utcMidnight(now)
  const tomorrowUtc = new Date(todayUtc.getTime() + 24 * 60 * 60 * 1000)

  // Idempotency — if the user already has an open daily for today,
  // return the same SessionRun. Distinguishes daily from training by
  // SessionRun.mode.
  const existing = await prisma.sessionRun.findFirst({
    where: {
      user_id: user.id,
      mode: SessionMode.daily_challenge,
      started_at: { gte: todayUtc, lt: tomorrowUtc },
    },
    orderBy: { started_at: 'desc' },
  })

  if (existing) {
    const scenarios = await loadOrderedScenarios(existing.scenario_ids)
    return NextResponse.json({
      session_run_id: existing.id,
      date: todayUtc.toISOString().slice(0, 10),
      scenarios,
      already_completed: existing.ended_at !== null,
      mystery_mode: true,
    })
  }

  // Compose today's daily.
  const [allLive, attemptsDesc] = await Promise.all([
    prisma.scenario.findMany({
      where: { status: 'LIVE' },
      include: { choices: true },
    }),
    // Phase 10 — bound to the last 200 attempts. The daily composer's
    // transfer-probe swap reads decoder confidences which only need
    // the recent admissible window per decoder, not lifetime history.
    prisma.attempt.findMany({
      where: { user_id: user.id },
      orderBy: { created_at: 'desc' },
      take: 200,
      include: { scenario: true },
    }),
  ])
  const attempts = [...attemptsDesc].reverse()

  const dailyCatalog: DailyCatalogScenario[] = allLive.map((s) => {
    const v = parseScenarioVariantTags(s.sub_concepts ?? [])
    return {
      id: s.id,
      decoderTag: s.decoder_tag,
      templateId: v.templateId,
      disguise: v.disguise,
      difficulty: s.difficulty,
      isLive: true,
    }
  })

  const decoderConfidences = buildDecoderConfidences(attempts, now)

  const bundle = composeDailyChallenge({
    utcDate: todayUtc,
    catalog: dailyCatalog,
    decoderConfidences,
  })

  if (!bundle.available) {
    captureServerEvent('daily_unavailable', { reason: 'CATALOG_TOO_THIN' })
    return NextResponse.json(
      {
        error: 'DAILY_UNAVAILABLE',
        message: "Today's daily isn't ready yet — try again later.",
      },
      { status: 503 },
    )
  }

  await prisma.user.upsert({
    where: { id: user.id },
    create: {
      id: user.id,
      email: user.email ?? `${user.id}@courtiq.local`,
      display_name: user.user_metadata?.full_name ?? null,
    },
    update: { email: user.email ?? undefined },
  })

  const session = await prisma.sessionRun.create({
    data: {
      user_id: user.id,
      scenario_ids: bundle.scenarioIds,
      mode: SessionMode.daily_challenge,
    },
  })

  captureServerEvent('daily_started', {
    session_run_id: session.id,
    date: bundle.date,
    seed_key: bundle.seedKey,
    catalog_incomplete: bundle.catalogIncomplete,
    swapped_slot_index: bundle.swappedSlotIndex,
  })

  const scenarios = await loadOrderedScenarios(bundle.scenarioIds)

  return NextResponse.json({
    session_run_id: session.id,
    date: bundle.date,
    scenarios,
    already_completed: false,
    mystery_mode: true,
  })
}

async function loadOrderedScenarios(scenarioIds: string[]) {
  const live = await prisma.scenario.findMany({
    where: { id: { in: scenarioIds } },
    include: { choices: true },
  })
  const byId = new Map(live.map((s) => [s.id, s]))
  return scenarioIds
    .map((id) => byId.get(id))
    .filter((s): s is NonNullable<typeof s> => Boolean(s))
    .map((s) => ({
      id: s.id,
      difficulty: s.difficulty,
      prompt: s.prompt,
      court_state: s.court_state,
      scene: s.scene,
      user_role: s.user_role,
      concept_tags: s.concept_tags,
      // Mystery Mode — the decoder noun is hidden until the daily ends.
      decoder_tag: null,
      render_tier: s.render_tier,
      recognition_reason: null,
      choices: [...s.choices]
        .sort((a, b) => a.order - b.order)
        .map((c) => ({ id: c.id, label: c.label, order: c.order })),
    }))
}

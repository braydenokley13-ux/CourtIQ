import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { sendEmail } from '@/lib/email/sender'
import { weeklyDigestEmail } from '@/lib/email/templates/weekly-digest'

// Called by Vercel cron every Sunday at 10:00 UTC.
export async function GET(request: Request) {
  const secret = request.headers.get('authorization')?.replace('Bearer ', '')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)
  weekAgo.setUTCHours(0, 0, 0, 0)

  const users = await prisma.user.findMany({
    where: { email_unsubscribed: false },
    select: {
      email: true,
      display_name: true,
      profile: { select: { iq_score: true, current_streak: true } },
      session_runs: {
        where: { started_at: { gte: weekAgo }, ended_at: { not: null } },
        select: { correct_count: true, scenario_ids: true, xp_earned: true, iq_delta: true },
      },
      masteries: {
        orderBy: { last_seen_at: 'desc' },
        take: 3,
        select: { concept_id: true },
      },
    },
  })

  // Leaderboard for rank lookup
  const leaderboard = await prisma.leaderboardEntry.findMany({
    where: { week_start: { gte: weekAgo } },
    orderBy: { xp_week: 'desc' },
    take: 200,
  })

  let sent = 0
  for (const user of users) {
    try {
      const sessions = user.session_runs
      if (sessions.length === 0) continue // skip inactive users

      let xpEarned = 0, totalCorrect = 0, totalScenarios = 0, iqDelta = 0
      for (const r of sessions) {
        xpEarned += r.xp_earned
        totalCorrect += r.correct_count
        totalScenarios += r.scenario_ids.length
        iqDelta += r.iq_delta
      }
      const iqEnd = user.profile?.iq_score ?? 500
      const iqStart = iqEnd - iqDelta
      const accuracy = totalScenarios > 0 ? totalCorrect / totalScenarios : 0
      const weeklyRank = leaderboard.findIndex((e) => e.user_id === user.email) + 1

      const { subject, html } = weeklyDigestEmail({
        name: user.display_name ?? user.email.split('@')[0],
        email: user.email,
        iqStart,
        iqEnd,
        sessionsCompleted: sessions.length,
        xpEarned,
        accuracy,
        streakDays: user.profile?.current_streak ?? 0,
        weeklyRank: weeklyRank > 0 ? weeklyRank : undefined,
        topConcepts: user.masteries.map((m) => m.concept_id),
      })
      await sendEmail({ to: user.email, subject, html })
      sent++
    } catch (err) {
      console.error('[cron/weekly-digest] failed for', user.email, err)
    }
  }

  return NextResponse.json({ ok: true, sent, total: users.length })
}

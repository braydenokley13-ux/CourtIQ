import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { sendEmail } from '@/lib/email/sender'
import { streakAtRiskEmail } from '@/lib/email/templates/streak-at-risk'

// Called by Vercel cron every day at 19:00 UTC.
// Sends streak-at-risk emails to users who have an active streak but haven't trained today.
export async function GET(request: Request) {
  const secret = request.headers.get('authorization')?.replace('Bearer ', '')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const todayStart = new Date()
  todayStart.setUTCHours(0, 0, 0, 0)

  // Users with a streak > 0 who have no StreakEvent for today
  const usersAtRisk = await prisma.user.findMany({
    where: {
      email_unsubscribed: false,
      profile: { current_streak: { gt: 0 } },
      streaks: {
        none: { date: { gte: todayStart } },
      },
    },
    select: {
      email: true,
      display_name: true,
      profile: { select: { current_streak: true } },
    },
  })

  let sent = 0
  for (const user of usersAtRisk) {
    try {
      const { subject, html } = streakAtRiskEmail({
        name: user.display_name ?? user.email.split('@')[0],
        email: user.email,
        streakDays: user.profile?.current_streak ?? 1,
      })
      await sendEmail({ to: user.email, subject, html })
      sent++
    } catch (err) {
      console.error('[cron/streak-check] failed for', user.email, err)
    }
  }

  return NextResponse.json({ ok: true, sent, total: usersAtRisk.length })
}

import { NextResponse } from 'next/server'
import { MasteryDimension } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { level } from '@courtiq/core'
import { listDecodersForUser } from '@/lib/services/academyService'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const userId = searchParams.get('userId')

  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 })
  }

  const [profile, attempts, masteries, badges, decoders] = await Promise.all([
    prisma.profile.findUnique({ where: { user_id: userId } }),
    prisma.attempt.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'asc' },
      select: { created_at: true, iq_after: true, is_correct: true },
    }),
    prisma.mastery.findMany({
      where: { user_id: userId, dimension: MasteryDimension.concept },
      orderBy: { rolling_accuracy: 'desc' },
      take: 6,
    }),
    prisma.userBadge.findMany({ where: { user_id: userId }, include: { badge: true }, orderBy: { earned_at: 'desc' } }),
    listDecodersForUser(userId),
  ])

  const rankLabel = level.rankLabel(profile?.level ?? 1)

  return NextResponse.json({
    profile,
    iqHistory30d: attempts.slice(-30).map((a) => ({ date: a.created_at.toISOString(), iq: a.iq_after })),
    mastery: masteries,
    decoders,
    badges: badges.map((b) => ({
      slug: b.badge.slug,
      name: b.badge.name,
      family: b.badge.family,
      icon_ref: b.badge.icon_ref,
      earned_at: b.earned_at,
    })),
    rankLabel,
    accuracy: attempts.length ? attempts.filter((a) => a.is_correct).length / attempts.length : 0,
    attemptsCount: attempts.length,
  })
}

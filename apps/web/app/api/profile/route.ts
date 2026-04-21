import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { level } from '@courtiq/core'

type AttemptHistoryPoint = {
  created_at: Date
  iq_after: number
  is_correct: boolean
}

type UserBadgeRow = {
  badge: {
    slug: string
    name: string
    family: string
    icon_ref: string
  }
  earned_at: Date
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const userId = searchParams.get('userId')

  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 })
  }

  const [profile, attempts, masteries, badges] = await Promise.all([
    prisma.profile.findUnique({ where: { user_id: userId } }),
    prisma.attempt.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'asc' },
      select: { created_at: true, iq_after: true, is_correct: true },
    }),
    prisma.mastery.findMany({ where: { user_id: userId }, orderBy: { rolling_accuracy: 'desc' }, take: 6 }),
    prisma.userBadge.findMany({ where: { user_id: userId }, include: { badge: true }, orderBy: { earned_at: 'desc' } }),
  ])

  const typedAttempts = attempts as AttemptHistoryPoint[]
  const typedBadges = badges as UserBadgeRow[]

  const rankLabel = level.rankLabel(profile?.level ?? 1)

  return NextResponse.json({
    profile,
    iqHistory30d: typedAttempts.slice(-30).map((attempt: AttemptHistoryPoint) => ({
      date: attempt.created_at.toISOString(),
      iq: attempt.iq_after,
    })),
    mastery: masteries,
    badges: typedBadges.map((userBadge: UserBadgeRow) => ({
      slug: userBadge.badge.slug,
      name: userBadge.badge.name,
      family: userBadge.badge.family,
      icon_ref: userBadge.badge.icon_ref,
      earned_at: userBadge.earned_at,
    })),
    rankLabel,
    accuracy: typedAttempts.length
      ? typedAttempts.filter((attempt: AttemptHistoryPoint) => attempt.is_correct).length / typedAttempts.length
      : 0,
    attemptsCount: typedAttempts.length,
  })
}

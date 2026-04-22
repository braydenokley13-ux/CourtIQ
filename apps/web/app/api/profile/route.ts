import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getDatabaseErrorMessage } from '@/lib/api/databaseError'


function rankLabel(level: number) {
  if (level >= 40) return 'Hall of Fame'
  if (level >= 30) return 'All-Star'
  if (level >= 20) return 'Starter'
  if (level >= 10) return 'Rotation'
  return 'Rookie'
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const userId = searchParams.get('userId')

  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 })
  }

  try {
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

    const rank = rankLabel(profile?.level ?? 1)

    return NextResponse.json({
      profile,
      iqHistory30d: attempts.slice(-30).map((a: { created_at: Date; iq_after: number }) => ({
        date: a.created_at.toISOString(),
        iq: a.iq_after,
      })),
      mastery: masteries,
      badges: badges.map((b: { badge: { slug: string; name: string; family: string; icon_ref: string | null }; earned_at: Date }) => ({
        slug: b.badge.slug,
        name: b.badge.name,
        family: b.badge.family,
        icon_ref: b.badge.icon_ref,
        earned_at: b.earned_at,
      })),
      rankLabel: rank,
      accuracy: attempts.length
        ? attempts.filter((a: { is_correct: boolean }) => a.is_correct).length / attempts.length
        : 0,
      attemptsCount: attempts.length,
    })
  } catch (error) {
    const dbMessage = getDatabaseErrorMessage(error)

    if (dbMessage) {
      return NextResponse.json(
        {
          profile: null,
          iqHistory30d: [],
          mastery: [],
          badges: [],
          rankLabel: rankLabel(1),
          accuracy: 0,
          attemptsCount: 0,
          warning: dbMessage,
        },
        { status: 200 },
      )
    }

    console.error('[api/profile] unexpected error', error)
    return NextResponse.json({ error: 'Failed to load profile' }, { status: 500 })
  }
}

import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { enforceRateLimit } from '@/lib/rateLimit/middleware'

const RECENT_SESSIONS_LIMIT = { windowMs: 60_000, max: 60 }

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const userId = searchParams.get('userId')

  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 })
  }

  const gate = enforceRateLimit(request, {
    bucket: 'sessions_recent',
    limit: RECENT_SESSIONS_LIMIT,
    userId,
  })
  if (!gate.ok) return gate.response

  const sessions = await prisma.sessionRun.findMany({
    where: { user_id: userId, ended_at: { not: null } },
    orderBy: { started_at: 'desc' },
    take: 5,
    select: {
      id: true,
      started_at: true,
      ended_at: true,
      correct_count: true,
      scenario_ids: true,
      xp_earned: true,
      iq_delta: true,
    },
  })

  return gate.decorate(NextResponse.json(sessions))
}

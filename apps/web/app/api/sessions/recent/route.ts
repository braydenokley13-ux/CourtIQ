import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getDatabaseErrorMessage } from '@/lib/api/databaseError'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const userId = searchParams.get('userId')

  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 })
  }

  try {
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

    return NextResponse.json(sessions)
  } catch (error) {
    const dbMessage = getDatabaseErrorMessage(error)

    if (dbMessage) {
      return NextResponse.json([], { status: 200 })
    }

    console.error('[api/sessions/recent] unexpected error', error)
    return NextResponse.json({ error: 'Failed to load recent sessions' }, { status: 500 })
  }
}

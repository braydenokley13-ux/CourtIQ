import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { createClient } from '@/lib/supabase/server'
import type { Position, SkillLevel } from '@prisma/client'

const VALID_POSITIONS: Position[] = ['PG', 'SG', 'SF', 'PF', 'C', 'ALL']
const VALID_SKILL_LEVELS: SkillLevel[] = ['ROOKIE', 'VARSITY', 'ELITE']

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({})) as {
    birthdate?: string | null
    position?: string
    skill_level?: string
    goal?: string
  }

  const position = VALID_POSITIONS.includes(body.position as Position) ? (body.position as Position) : null
  const skill_level = VALID_SKILL_LEVELS.includes(body.skill_level as SkillLevel) ? (body.skill_level as SkillLevel) : null

  if (!position || !skill_level) {
    return NextResponse.json({ error: 'position and skill_level are required' }, { status: 400 })
  }

  let birthdate: Date | null = null
  if (body.birthdate && typeof body.birthdate === 'string') {
    const d = new Date(body.birthdate)
    if (!Number.isNaN(d.getTime())) birthdate = d
  }

  await prisma.user.upsert({
    where: { id: user.id },
    create: {
      id: user.id,
      email: user.email ?? `${user.id}@courtiq.local`,
      display_name: user.user_metadata?.full_name ?? null,
      birthdate,
      position,
      skill_level,
    },
    update: {
      email: user.email ?? undefined,
      display_name: user.user_metadata?.full_name ?? undefined,
      birthdate,
      position,
      skill_level,
    },
  })

  // Ensure a Profile row exists so subsequent Profile reads don't 404-equivalent.
  await prisma.profile.upsert({
    where: { user_id: user.id },
    create: { user_id: user.id },
    update: {},
  })

  return NextResponse.json({ ok: true })
}

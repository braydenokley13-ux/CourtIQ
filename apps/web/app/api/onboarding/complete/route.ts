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
  // Phase δ-C — stamp `calibrated_at` here. The onboarding wizard
  // posts to this endpoint immediately after the calibration session
  // resolves (5-scenario IQ calibration on step 5 of the wizard), so
  // this is the canonical "user finished calibration" moment. The
  // value replaces the prior `User.created_at` proxy in the HUNT
  // eligibility gate (see lib/scenario3d/huntSessionGates.ts). We
  // overwrite on update so a user who replays calibration (e.g. a
  // future "reset calibration" flow) gets a fresh window.
  const calibratedAt = new Date()
  await prisma.profile.upsert({
    where: { user_id: user.id },
    create: { user_id: user.id, calibrated_at: calibratedAt },
    update: { calibrated_at: calibratedAt },
  })

  return NextResponse.json({ ok: true })
}

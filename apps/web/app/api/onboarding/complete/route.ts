import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/db'
import { computeCalibrationIQ } from '@/features/onboarding/calibration-scenarios'
import type { Position, SkillLevel } from '@courtiq/core'

interface CompleteBody {
  age: number | 'hidden' | null
  position: Position
  skill_level: SkillLevel
  goal: string
  starting_iq: number
  calibration_attempts: Array<{ scenario_id: string; choice_id: string; is_correct: boolean; time_ms: number }>
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: CompleteBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { age, position, skill_level, calibration_attempts } = body

  // Recompute starting IQ server-side for safety
  const starting_iq = computeCalibrationIQ(calibration_attempts)

  // Ensure User row exists, then update it with onboarding data
  await prisma.user.upsert({
    where: { id: user.id },
    create: {
      id: user.id,
      email: user.email!,
      display_name: user.user_metadata?.full_name ?? null,
      birthdate: typeof age === 'number' ? new Date(new Date().getFullYear() - age, 0, 1) : null,
      position,
      skill_level,
    },
    update: {
      position,
      skill_level,
      birthdate: typeof age === 'number' ? new Date(new Date().getFullYear() - age, 0, 1) : undefined,
    },
  })

  // Update Profile with the calibrated starting IQ
  await prisma.profile.upsert({
    where: { user_id: user.id },
    create: {
      user_id: user.id,
      iq_score: starting_iq,
      xp_total: 0,
      level: 1,
      current_streak: 0,
      longest_streak: 0,
      streak_freeze_count: 0,
    },
    update: {
      iq_score: starting_iq,
    },
  })

  return NextResponse.json({ success: true, starting_iq })
}

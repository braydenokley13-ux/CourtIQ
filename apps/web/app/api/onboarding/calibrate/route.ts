import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { CALIBRATION_SCENARIOS } from '@/features/onboarding/calibration-scenarios'

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Return calibration scenarios without the answer (is_correct stripped)
  const scenarios = CALIBRATION_SCENARIOS.map((s) => ({
    id: s.id,
    difficulty: s.difficulty,
    prompt: s.prompt,
    user_role: s.user_role,
    court_state: s.court_state,
    choices: s.choices.map(({ id, label, order }) => ({ id, label, order })),
  }))

  return NextResponse.json({ scenarios })
}

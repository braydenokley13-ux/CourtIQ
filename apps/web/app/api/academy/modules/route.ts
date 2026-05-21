import { NextResponse, type NextRequest } from 'next/server'
import { listModulesForUser } from '@/lib/services/academyService'
import { createClient } from '@/lib/supabase/server'
import { enforceRateLimit } from '@/lib/rateLimit/middleware'

const ACADEMY_MODULES_LIMIT = { windowMs: 60_000, max: 60 }

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const gate = enforceRateLimit(request, {
    bucket: 'academy_modules',
    limit: ACADEMY_MODULES_LIMIT,
    userId: user?.id ?? null,
  })
  if (!gate.ok) return gate.response

  const modules = await listModulesForUser(user?.id ?? null)
  return gate.decorate(NextResponse.json({ modules }))
}

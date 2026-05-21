import { NextResponse, type NextRequest } from 'next/server'
import { getModuleBySlug } from '@/lib/services/academyService'
import { createClient } from '@/lib/supabase/server'
import { enforceRateLimit } from '@/lib/rateLimit/middleware'

const ACADEMY_MODULE_DETAIL_LIMIT = { windowMs: 60_000, max: 60 }

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const gate = enforceRateLimit(request, {
    bucket: 'academy_module_detail',
    limit: ACADEMY_MODULE_DETAIL_LIMIT,
    userId: user?.id ?? null,
  })
  if (!gate.ok) return gate.response

  const detail = await getModuleBySlug(slug, user?.id ?? null)
  if (!detail) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  }
  return gate.decorate(NextResponse.json(detail))
}

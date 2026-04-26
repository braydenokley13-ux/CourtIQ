import { NextResponse } from 'next/server'
import { getModuleBySlug } from '@/lib/services/academyService'
import { createClient } from '@/lib/supabase/server'

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const detail = await getModuleBySlug(slug, user?.id ?? null)
  if (!detail) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  }
  return NextResponse.json(detail)
}

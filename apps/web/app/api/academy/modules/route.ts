import { NextResponse } from 'next/server'
import { listModulesForUser } from '@/lib/services/academyService'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const modules = await listModulesForUser(user?.id ?? null)
  return NextResponse.json({ modules })
}

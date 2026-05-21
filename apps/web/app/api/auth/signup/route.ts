import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { enforceRateLimit } from '@/lib/rateLimit/middleware'

export const runtime = 'nodejs'

// Signup is a public, unauthenticated write that admin-creates a
// Supabase user. Strict IP cap so a single source can't fan out
// accounts (and indirectly send the welcome email) faster than a
// human could plausibly intend. 5 / 15min is well above the "I
// mistyped my password twice" case and far below scripted abuse.
const SIGNUP_LIMIT = { windowMs: 15 * 60_000, max: 5 }

interface SignupBody {
  name?: string
  email?: string
  password?: string
}

export async function POST(request: NextRequest) {
  const gate = enforceRateLimit(request, {
    bucket: 'auth_signup',
    limit: SIGNUP_LIMIT,
  })
  if (!gate.ok) return gate.response

  const body = (await request.json().catch(() => ({}))) as SignupBody
  const name = body.name?.trim() ?? ''
  const email = body.email?.trim().toLowerCase() ?? ''
  const password = body.password ?? ''

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[auth/signup] Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL')
    return NextResponse.json({ error: 'Signup is temporarily unavailable.' }, { status: 500 })
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name, onboarded: false },
  })

  if (error) {
    // Supabase's admin.createUser wraps the real postgres error
    // behind a generic "Database error creating new user" string
    // (status 500, code "unexpected_failure"). Log the full payload
    // so Vercel runtime logs surface the real trigger / FK / NOT NULL
    // failure for debugging.
    console.error('[auth/signup] admin.createUser failed', {
      message: error.message,
      status: error.status,
      code: (error as { code?: string }).code ?? null,
      name: error.name,
    })
    const lower = error.message.toLowerCase()
    const isConflict = /already|registered|exists/.test(lower)
    const isDbError = /database error/.test(lower)
    const status = isConflict ? 409 : isDbError ? 500 : 400
    const clientMessage = isDbError
      ? 'Signup is temporarily unavailable. Please try again shortly.'
      : error.message
    return NextResponse.json({ error: clientMessage }, { status })
  }

  return gate.decorate(NextResponse.json({ ok: true, userId: data.user?.id }))
}

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,30}$/

function validateUsername(value: string): string | null {
  if (!USERNAME_RE.test(value)) {
    if (value.length < 3) return 'Username must be at least 3 characters.'
    if (value.length > 30) return 'Username must be 30 characters or fewer.'
    return 'Only letters, numbers, and . _ - are allowed.'
  }
  if (/^[._-]|[._-]$/.test(value)) return 'Username cannot start or end with . _ -'
  if (value.includes('..') || value.includes('--') || value.includes('__')) {
    return 'Username cannot contain consecutive special characters.'
  }
  return null
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as {
    username?: string
    password?: string
    displayName?: string
    recoveryEmail?: string
  }

  const username = (body.username ?? '').trim()
  const password = body.password ?? ''
  const displayName = (body.displayName ?? '').trim()
  const recoveryEmail = (body.recoveryEmail ?? '').trim().toLowerCase()

  const usernameError = validateUsername(username)
  if (usernameError) {
    return NextResponse.json({ error: usernameError }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })
  }

  const normalizedUsername = username.toLowerCase()
  const syntheticEmail = `${normalizedUsername}@users.courtiq.app`

  const admin = createAdminClient()
  const { data, error } = await admin.auth.admin.createUser({
    email: syntheticEmail,
    password,
    email_confirm: true,
    user_metadata: {
      username: normalizedUsername,
      display_name: displayName || undefined,
      recovery_email: recoveryEmail || undefined,
      onboarded: false,
    },
  })

  if (error) {
    const msg = error.message || ''
    if (msg.includes('already') || msg.includes('exists') || msg.includes('registered')) {
      return NextResponse.json({ error: 'Username already taken. Please choose a different one.' }, { status: 409 })
    }
    console.error('[api/auth/signup] createUser failed', error)
    return NextResponse.json({ error: 'Could not create account. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, userId: data.user?.id, email: syntheticEmail })
}

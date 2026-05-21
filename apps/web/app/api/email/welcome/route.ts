import { NextResponse, type NextRequest } from 'next/server'
import { sendEmail } from '@/lib/email/sender'
import { welcomeEmail } from '@/lib/email/templates/welcome'
import { enforceRateLimit } from '@/lib/rateLimit/middleware'

// Public unauthenticated endpoint that triggers an outbound email.
// Hard IP cap so the route can't be turned into a spam relay.
const WELCOME_LIMIT = { windowMs: 60 * 60_000, max: 10 }

export async function POST(request: NextRequest) {
  const gate = enforceRateLimit(request, {
    bucket: 'email_welcome',
    limit: WELCOME_LIMIT,
  })
  if (!gate.ok) return gate.response

  const body = await request.json().catch(() => ({})) as { name?: string; email?: string; startingIQ?: number }

  if (!body.name || !body.email) {
    return NextResponse.json({ error: 'name and email are required' }, { status: 400 })
  }

  try {
    const { subject, html } = welcomeEmail({ name: body.name, email: body.email, startingIQ: body.startingIQ })
    await sendEmail({ to: body.email, subject, html })
    return gate.decorate(NextResponse.json({ ok: true }))
  } catch (err) {
    console.error('[email/welcome]', err)
    return NextResponse.json({ error: 'Failed to send' }, { status: 500 })
  }
}

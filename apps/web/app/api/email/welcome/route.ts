import { NextResponse } from 'next/server'
import { sendEmail } from '@/lib/email/sender'
import { welcomeEmail } from '@/lib/email/templates/welcome'

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { name?: string; email?: string; startingIQ?: number }

  if (!body.name || !body.email) {
    return NextResponse.json({ error: 'name and email are required' }, { status: 400 })
  }

  try {
    const { subject, html } = welcomeEmail({ name: body.name, email: body.email, startingIQ: body.startingIQ })
    await sendEmail({ to: body.email, subject, html })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[email/welcome]', err)
    return NextResponse.json({ error: 'Failed to send' }, { status: 500 })
  }
}

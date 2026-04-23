import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({})) as {
    display_name?: string | null
    email_unsubscribed?: boolean
  }

  const update: { display_name?: string | null; email_unsubscribed?: boolean } = {}
  if (typeof body.display_name === 'string') {
    const trimmed = body.display_name.trim()
    update.display_name = trimmed.length > 0 ? trimmed : null
  }
  if (typeof body.email_unsubscribed === 'boolean') {
    update.email_unsubscribed = body.email_unsubscribed
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No updatable fields provided' }, { status: 400 })
  }

  await prisma.user.upsert({
    where: { id: user.id },
    create: {
      id: user.id,
      email: user.email ?? `${user.id}@courtiq.local`,
      display_name: update.display_name ?? null,
      email_unsubscribed: update.email_unsubscribed ?? false,
    },
    update,
  })

  return NextResponse.json({ ok: true })
}

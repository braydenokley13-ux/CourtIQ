import { prisma } from '@/lib/db/prisma'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SettingsClient } from './SettingsClient'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  await prisma.user.upsert({
    where: { id: user.id },
    create: {
      id: user.id,
      email: user.email ?? `${user.id}@courtiq.local`,
      display_name: user.user_metadata?.full_name ?? null,
    },
    update: {
      email: user.email ?? `${user.id}@courtiq.local`,
    },
  })

  const record = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      email: true,
      display_name: true,
      email_unsubscribed: true,
      position: true,
      skill_level: true,
    },
  })

  return (
    <SettingsClient
      email={record?.email ?? user.email ?? ''}
      displayName={record?.display_name ?? ''}
      emailUnsubscribed={record?.email_unsubscribed ?? false}
      position={record?.position ?? null}
      skillLevel={record?.skill_level ?? null}
    />
  )
}

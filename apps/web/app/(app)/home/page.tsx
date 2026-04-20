import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/db'
import { Card } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { Icon } from '@/components/ui/Icon'
import { StreakFlame } from '@/components/ui/StreakFlame'

export const metadata: Metadata = { title: 'Home' }

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const profile = await prisma.profile.findUnique({
    where: { user_id: user.id },
    select: {
      iq_score: true,
      xp_total: true,
      level: true,
      current_streak: true,
      user: { select: { display_name: true, position: true, skill_level: true } },
    },
  })

  if (!profile) redirect('/onboarding')

  const displayName = profile.user.display_name ?? user.email?.split('@')[0] ?? 'Baller'

  return (
    <main className="max-w-[430px] mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="font-ui text-[13px] text-foreground-mute uppercase tracking-[0.5px]">
            Welcome back
          </p>
          <h1 className="font-display font-bold text-[24px] tracking-[-0.3px] text-foreground mt-0.5">
            {displayName}
          </h1>
        </div>
        {profile.current_streak > 0 && (
          <div className="flex items-center gap-2">
            <StreakFlame streak={profile.current_streak} />
            <div className="text-right">
              <p className="font-mono text-[18px] font-bold text-heat">{profile.current_streak}</p>
              <p className="font-ui text-[11px] text-foreground-mute uppercase tracking-[0.3px]">streak</p>
            </div>
          </div>
        )}
      </div>

      {/* IQ Score card */}
      <Card pad="p-5">
        <div className="flex items-center justify-between mb-3">
          <Chip color="var(--iq)">IQ Score</Chip>
          <Icon name="stats" size={16} color="var(--iq)" />
        </div>
        <div className="flex items-end gap-3">
          <span className="font-display font-bold text-[52px] leading-none tracking-[-2px] text-iq">
            {profile.iq_score}
          </span>
          <div className="pb-1">
            <p className="font-ui text-[12px] text-foreground-mute">Level {profile.level}</p>
          </div>
        </div>
        <p className="mt-3 font-ui text-[13px] text-foreground-dim">
          Complete sessions to raise your IQ and climb the leaderboard.
        </p>
      </Card>

      {/* Train CTA */}
      <Card variant="elevated" pad="p-5" className="border-brand/20">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-brand/10 flex items-center justify-center flex-shrink-0">
            <Icon name="play" size={22} color="var(--brand)" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-display font-bold text-[17px] text-foreground">Today's Session</p>
            <p className="font-ui text-[13px] text-foreground-dim mt-0.5">5 scenarios · ~4 minutes</p>
          </div>
          <Icon name="chevron-right" size={20} color="var(--brand)" />
        </div>
      </Card>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3">
        <Card pad="p-4">
          <Icon name="bolt" size={18} color="var(--xp)" />
          <p className="font-display font-bold text-[24px] text-xp mt-2">{profile.xp_total.toLocaleString()}</p>
          <p className="font-ui text-[12px] text-foreground-mute mt-0.5 uppercase tracking-[0.3px]">Total XP</p>
        </Card>
        <Card pad="p-4">
          <Icon name="target" size={18} color="var(--brand)" />
          <p className="font-display font-bold text-[24px] text-foreground mt-2">{profile.level}</p>
          <p className="font-ui text-[12px] text-foreground-mute mt-0.5 uppercase tracking-[0.3px]">Level</p>
        </Card>
      </div>
    </main>
  )
}

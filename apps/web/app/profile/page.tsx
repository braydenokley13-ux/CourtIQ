'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, Chip, StreakFlame } from '@/components/ui'

interface ProfilePayload {
  profile: {
    iq_score: number
    level: number
    current_streak: number
  } | null
  iqHistory30d: Array<{ date: string; iq: number }>
  mastery: Array<{ concept_id: string; rolling_accuracy: number }>
  badges: Array<{ slug: string; name: string; family: string }>
  rankLabel: string
}

function Sparkline({ values }: { values: number[] }) {
  const safe = values.length ? values : [500, 510, 520, 530, 540]
  const min = Math.min(...safe)
  const max = Math.max(...safe)
  const range = Math.max(1, max - min)

  const points = safe.map((v, i) => {
    const x = (i / Math.max(1, safe.length - 1)) * 340
    const y = 46 - ((v - min) / range) * 40
    return `${x},${y}`
  }).join(' ')

  return (
    <svg width="100%" height="56" viewBox="0 0 340 56" preserveAspectRatio="none">
      <polyline fill="none" stroke="var(--brand)" strokeWidth="2" points={points} />
      <polyline fill="none" stroke="rgba(59,227,131,0.18)" strokeWidth="6" points={points} />
    </svg>
  )
}

function Radar({ data }: { data: Array<{ label: string; value: number }> }) {
  const size = 160
  const center = size / 2
  const radius = 58
  const points = data.map((d, i) => {
    const angle = (Math.PI * 2 * i) / data.length - Math.PI / 2
    const r = radius * d.value
    return `${center + r * Math.cos(angle)},${center + r * Math.sin(angle)}`
  }).join(' ')

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {[0.25, 0.5, 0.75, 1].map((ring) => (
        <circle key={ring} cx={center} cy={center} r={radius * ring} fill="none" stroke="rgba(255,255,255,0.08)" />
      ))}
      <polygon points={points} fill="rgba(139,124,255,0.25)" stroke="var(--iq)" strokeWidth="2" />
    </svg>
  )
}

export default function ProfilePage() {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [data, setData] = useState<ProfilePayload | null>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        window.location.href = '/login'
        return
      }

      try {
        const res = await fetch(`/api/profile?userId=${user.id}`)
        if (!res.ok) throw new Error('profile_load_failed')
        setData(await res.json() as ProfilePayload)
      } catch (error) {
        console.error('[profile/page] load failed', error)
        setLoadError('We could not load your profile right now. Try again in a moment.')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  const iqHistory = data?.iqHistory30d.map((point) => point.iq) ?? []
  const profile = data?.profile
  const strengthData = (data?.mastery.length ? data.mastery : [
    { concept_id: 'help_defense_basics', rolling_accuracy: 0.68 },
    { concept_id: 'transition_stop_ball', rolling_accuracy: 0.76 },
    { concept_id: 'closeouts', rolling_accuracy: 0.62 },
    { concept_id: 'low_man_rotation', rolling_accuracy: 0.72 },
    { concept_id: 'spacing_fundamentals', rolling_accuracy: 0.81 },
  ]).slice(0, 5).map((m) => ({ label: m.concept_id.replaceAll('_', ' '), value: m.rolling_accuracy }))

  return (
    <main className="min-h-dvh bg-bg-0 text-text p-5 pb-24">
      <div className="mx-auto max-w-xl space-y-4">
        <Card pad="p-0" className="overflow-hidden border-hairline-2 bg-gradient-to-br from-bg-1 to-[#0F1622]">
          <div className="p-5 pb-2">
            <p className="text-[11px] uppercase tracking-[1.5px] text-text-dim">Basketball IQ</p>
            <div className="mt-1 flex items-start justify-between">
              <div>
                <div className="font-display text-5xl font-bold tracking-tight">{(profile?.iq_score ?? 500).toLocaleString()}</div>
                <Chip className="mt-2" color="var(--brand)">30 DAY TREND</Chip>
              </div>
              <div className="text-right">
                <p className="text-[11px] uppercase tracking-[1.5px] text-text-dim">Rank</p>
                <p className="mt-1 font-display text-xl font-bold">{data?.rankLabel ?? 'Rookie'}</p>
                <p className="font-mono text-[11px] text-brand">{loading ? 'Loading…' : 'ACTIVE'}</p>
              </div>
            </div>
          </div>
          <div className="px-4 pb-4">
            <Sparkline values={iqHistory} />
          </div>
        </Card>

        <div className="grid grid-cols-2 gap-3">
          <Card>
            <p className="text-xs uppercase tracking-wide text-text-dim">Streak</p>
            <div className="mt-2"><StreakFlame streak={profile?.current_streak ?? 0} active={(profile?.current_streak ?? 0) > 0} /></div>
          </Card>
          <Card>
            <p className="text-xs uppercase tracking-wide text-text-dim">Level</p>
            <p className="mt-2 font-display text-2xl font-bold">{profile?.level ?? 1}</p>
            <p className="text-xs text-brand">{data?.rankLabel ?? 'Rookie'}</p>
          </Card>
        </div>

        <Card>
          <p className="text-xs uppercase tracking-wide text-text-dim">Concept Strength Radar</p>
          <div className="mt-3 flex items-center justify-center"><Radar data={strengthData} /></div>
        </Card>

        {loadError ? (
          <Card>
            <p className="text-sm text-heat">{loadError}</p>
          </Card>
        ) : null}

        <Card>
          <p className="text-xs uppercase tracking-wide text-text-dim">Badges</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {data?.badges.length ? data.badges.map((badge) => (
              <div key={badge.slug} className="rounded-xl border border-hairline bg-bg-2 p-2 text-center">
                <p className="text-[11px] text-brand">{badge.family}</p>
                <p className="mt-1 text-xs font-semibold">{badge.name}</p>
              </div>
            )) : <p className="col-span-3 text-sm text-text-dim">No badges yet. Keep training.</p>}
          </div>
        </Card>
      </div>
    </main>
  )
}

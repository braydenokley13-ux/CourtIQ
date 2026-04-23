import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db/prisma'
import { createClient } from '@/lib/supabase/server'
import { level } from '@courtiq/core'
import { LeaderboardViewBeacon } from './LeaderboardViewBeacon'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type Row = {
  userId: string
  name: string
  xp: number
  iq: number
  rank: number
}

function dayName(d: Date) {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

export default async function LeaderboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)

  const grouped = await prisma.sessionRun.groupBy({
    by: ['user_id'],
    where: { started_at: { gte: weekAgo }, ended_at: { not: null } },
    _sum: { xp_earned: true },
    orderBy: { _sum: { xp_earned: 'desc' } },
    take: 50,
  })

  const topUserIds = grouped.map(g => g.user_id)
  const meIncluded = topUserIds.includes(user.id)
  const idsToLoad = meIncluded ? topUserIds : [...topUserIds, user.id]

  const [users, profiles] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: idsToLoad } },
      select: { id: true, display_name: true, email: true },
    }),
    prisma.profile.findMany({
      where: { user_id: { in: idsToLoad } },
      select: { user_id: true, iq_score: true, level: true },
    }),
  ])

  const userMap = new Map(users.map(u => [u.id, u]))
  const profileMap = new Map(profiles.map(p => [p.user_id, p]))

  const rows: Row[] = grouped.map((g, idx) => {
    const u = userMap.get(g.user_id)
    const p = profileMap.get(g.user_id)
    return {
      userId: g.user_id,
      name: u?.display_name ?? u?.email?.split('@')[0] ?? 'Player',
      xp: g._sum.xp_earned ?? 0,
      iq: p?.iq_score ?? 500,
      rank: idx + 1,
    }
  })

  let myRank: number | null = null
  let myXp = 0
  const myRow = rows.find(r => r.userId === user.id)
  if (myRow) {
    myRank = myRow.rank
    myXp = myRow.xp
  } else {
    // User is outside top 50 — compute their weekly XP directly
    const mine = await prisma.sessionRun.aggregate({
      where: { user_id: user.id, started_at: { gte: weekAgo }, ended_at: { not: null } },
      _sum: { xp_earned: true },
    })
    myXp = mine._sum.xp_earned ?? 0
  }

  const now = new Date()
  const myProfile = profileMap.get(user.id)
  const myIq = myProfile?.iq_score ?? 500
  const myLevel = myProfile?.level ?? 1

  return (
    <main className="min-h-dvh bg-bg-0 text-text">
      <LeaderboardViewBeacon />
      <div className="mx-auto max-w-xl px-5 pb-24 pt-10">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[1.5px] text-text-dim">Leaderboard · Weekly</p>
            <h1 className="mt-1 font-display text-[28px] font-black tracking-tight">
              Top <span className="text-brand">XP</span> earners
            </h1>
            <p className="mt-1 text-[12px] text-text-mute">{dayName(weekAgo)} → {dayName(now)}</p>
          </div>
          <Link href="/home" className="text-sm text-text-dim hover:text-text">← Home</Link>
        </header>

        <section className="mb-5 rounded-2xl border border-hairline-2 bg-gradient-to-br from-bg-1 to-[#0F1622] p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-text-dim">Your week</p>
              <p className="mt-1 font-display text-[28px] font-black tracking-tight">
                {myRank ? `#${myRank}` : 'Unranked'}
              </p>
              <p className="mt-0.5 text-[12px] text-text-mute">
                {level.rankLabel(myLevel)} · IQ {myIq.toLocaleString()}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px] uppercase tracking-wide text-text-dim">XP this week</p>
              <p className="mt-1 font-display text-[28px] font-black tracking-tight text-[color:var(--xp)]">
                {myXp.toLocaleString()}
              </p>
              {!myRank && (
                <p className="mt-0.5 text-[11px] text-text-mute">Train to climb the board.</p>
              )}
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-hairline-2 bg-bg-1">
          {rows.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="text-[13px] text-text-dim">Nobody has trained this week yet.</p>
              <Link href="/train" className="mt-3 inline-block rounded-xl bg-brand px-4 py-2 text-[13px] font-bold text-brand-ink">
                Be the first →
              </Link>
            </div>
          ) : (
            <ol className="divide-y divide-hairline">
              {rows.map(r => {
                const isMe = r.userId === user.id
                return (
                  <li
                    key={r.userId}
                    className={`flex items-center gap-3 px-4 py-3 ${isMe ? 'bg-[rgba(59,227,131,0.06)]' : ''}`}
                  >
                    <div className={`w-8 text-center font-display text-[14px] font-bold ${r.rank <= 3 ? 'text-brand' : 'text-text-dim'}`}>
                      {r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : r.rank}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-[14px] font-semibold">
                        {r.name}
                        {isMe && <span className="ml-2 rounded-full bg-brand/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand">You</span>}
                      </p>
                      <p className="text-[11px] text-text-mute">IQ {r.iq.toLocaleString()}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-display text-[16px] font-bold text-[color:var(--xp)]">{r.xp.toLocaleString()}</p>
                      <p className="text-[10px] uppercase tracking-wide text-text-mute">XP</p>
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
        </section>

        <p className="mt-4 text-center text-[11px] text-text-mute">
          Rankings reset every Monday. Keep training to keep climbing.
        </p>
      </div>
    </main>
  )
}

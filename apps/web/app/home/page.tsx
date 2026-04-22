'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

const ease = [0.22, 1, 0.36, 1]

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease, delay: i * 0.08 },
  }),
}

interface ProfileData {
  profile: {
    iq_score: number
    current_streak: number
    longest_streak: number
    level: number
    xp_total: number
  } | null
  rankLabel: string
  accuracy: number
  attemptsCount: number
}

interface RecentSession {
  id: string
  started_at: string
  ended_at: string | null
  correct_count: number
  scenario_ids: string[]
  xp_earned: number
  iq_delta: number
}

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function IQDeltaBadge({ delta }: { delta: number }) {
  const up = delta >= 0
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-bold"
      style={{
        background: up ? 'rgba(59,227,131,0.12)' : 'rgba(248,113,113,0.12)',
        color: up ? '#3BE383' : '#F87171',
        border: `1px solid ${up ? 'rgba(59,227,131,0.25)' : 'rgba(248,113,113,0.25)'}`,
      }}
    >
      {up ? '▲' : '▼'} {Math.abs(delta)}
    </span>
  )
}

function StatCard({ label, value, sub, accent = '#3BE383', delay = 0 }: {
  label: string
  value: string | number
  sub?: string
  accent?: string
  delay?: number
}) {
  return (
    <motion.div
      custom={delay}
      initial="hidden"
      animate="show"
      variants={fadeUp}
      className="flex flex-col gap-1 rounded-2xl border border-[#1F2937] bg-[#111827] p-4"
    >
      <p className="text-[11px] uppercase tracking-[1.5px] text-[#6B7280]">{label}</p>
      <p className="font-display text-3xl font-black tracking-tight" style={{ color: accent }}>
        {value}
      </p>
      {sub && <p className="text-[11px] text-[#4B5563]">{sub}</p>}
    </motion.div>
  )
}

function CourtLines() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.03]"
      viewBox="0 0 600 400"
      preserveAspectRatio="xMidYMid slice"
      fill="none"
      aria-hidden
    >
      <circle cx="300" cy="200" r="80" stroke="white" strokeWidth="1" />
      <circle cx="300" cy="200" r="3" fill="white" />
      <path d="M 100 360 L 100 260 A 200 200 0 0 1 500 260 L 500 360" stroke="white" strokeWidth="1" />
      <rect x="200" y="240" width="200" height="160" stroke="white" strokeWidth="1" />
      <circle cx="300" cy="240" r="60" stroke="white" strokeWidth="1" />
      <line x1="60" y1="360" x2="540" y2="360" stroke="white" strokeWidth="1" />
    </svg>
  )
}

export default function HomePage() {
  const [userName, setUserName] = useState<string | null>(null)
  const [data, setData] = useState<ProfileData | null>(null)
  const [sessions, setSessions] = useState<RecentSession[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        window.location.href = '/login'
        return
      }

      const name = user.user_metadata?.full_name ?? user.email?.split('@')[0] ?? 'Player'
      setUserName(name)

      // Fetch profile + recent sessions in parallel
      const [profileRes, sessionsRes] = await Promise.all([
        fetch(`/api/profile?userId=${user.id}`),
        fetch(`/api/sessions/recent?userId=${user.id}`),
      ])

      if (profileRes.ok) {
        setData(await profileRes.json())
      }
      if (sessionsRes.ok) {
        setSessions(await sessionsRes.json())
      }
      setLoading(false)
    }
    load()
  }, [])

  const iq = data?.profile?.iq_score ?? 500
  const streak = data?.profile?.current_streak ?? 0
  const level = data?.profile?.level ?? 1
  const accuracyPct = Math.round((data?.accuracy ?? 0) * 100)

  return (
    <div className="relative min-h-dvh overflow-hidden bg-[#09111E]">
      {/* Background glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(59,227,131,0.08) 0%, transparent 70%)',
        }}
      />
      <CourtLines />

      <div className="relative z-10 mx-auto max-w-lg px-4 pb-24 pt-10">

        {/* Greeting */}
        <motion.div
          custom={0}
          initial="hidden"
          animate="show"
          variants={fadeUp}
          className="mb-8"
        >
          <p className="text-[13px] text-[#6B7280]">
            {greeting()}{userName ? `, ${userName.split(' ')[0]}` : ''} 👋
          </p>
          <h1 className="mt-1 font-display text-[28px] font-black tracking-tight text-[#F9FAFB]">
            Your Basketball <span style={{ color: '#3BE383' }}>IQ</span>
          </h1>
        </motion.div>

        {/* Big IQ number */}
        <motion.div
          custom={1}
          initial="hidden"
          animate="show"
          variants={fadeUp}
          className="relative mb-5 overflow-hidden rounded-3xl border border-[#1F2937] bg-gradient-to-br from-[#111827] to-[#0D1B2A] p-6"
          style={{ boxShadow: '0 0 40px rgba(59,227,131,0.06), 0 1px 0 rgba(255,255,255,0.04) inset' }}
        >
          <p className="mb-1 text-[11px] uppercase tracking-[2px] text-[#6B7280]">Basketball IQ</p>
          {loading ? (
            <div className="h-16 w-32 animate-pulse rounded-xl bg-[#1F2937]" />
          ) : (
            <p
              className="font-display text-[64px] font-black leading-none tracking-[-3px]"
              style={{ color: '#3BE383', textShadow: '0 0 40px rgba(59,227,131,0.4)' }}
            >
              {iq.toLocaleString()}
            </p>
          )}
          <p className="mt-2 text-[13px] text-[#4B5563]">{data?.rankLabel ?? 'Rookie'} · Level {level}</p>

          {/* Decorative glow ring */}
          <div
            className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(59,227,131,0.12) 0%, transparent 70%)' }}
          />
        </motion.div>

        {/* Stat grid */}
        <div className="mb-5 grid grid-cols-3 gap-3">
          <StatCard
            label="Streak"
            value={streak > 0 ? `${streak} 🔥` : '0'}
            sub={streak === 1 ? 'day' : 'days'}
            accent="#F59E0B"
            delay={2}
          />
          <StatCard
            label="Accuracy"
            value={`${accuracyPct}%`}
            sub="all-time"
            accent={accuracyPct >= 75 ? '#3BE383' : '#F59E0B'}
            delay={3}
          />
          <StatCard
            label="Sessions"
            value={data?.attemptsCount ? Math.ceil(data.attemptsCount / 5) : 0}
            sub="completed"
            accent="#8B7CF8"
            delay={4}
          />
        </div>

        {/* Train CTA */}
        <motion.div custom={5} initial="hidden" animate="show" variants={fadeUp} className="mb-5">
          <Link
            href="/train"
            className="group flex items-center justify-between rounded-2xl p-5 transition-transform active:scale-[0.98]"
            style={{
              background: 'linear-gradient(135deg, #3BE383 0%, #22C55E 100%)',
              boxShadow: '0 0 32px rgba(59,227,131,0.35), 0 1px 0 rgba(255,255,255,0.2) inset',
            }}
          >
            <div>
              <p className="font-display text-[18px] font-black tracking-tight text-[#09111E]">
                🏀 Start Today&apos;s Session
              </p>
              <p className="mt-0.5 text-[13px] font-medium text-[#065F46]">5 scenarios · ~3 min</p>
            </div>
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#09111E"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0 transition-transform group-hover:translate-x-1"
            >
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </Link>
        </motion.div>

        {/* Recent Sessions */}
        <motion.div custom={6} initial="hidden" animate="show" variants={fadeUp}>
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[1.5px] text-[#6B7280]">
            Recent Sessions
          </p>
          <div className="rounded-2xl border border-[#1F2937] bg-[#111827] overflow-hidden">
            {loading ? (
              <div className="space-y-0 divide-y divide-[#1F2937]">
                {[0, 1, 2].map(i => (
                  <div key={i} className="flex items-center justify-between px-4 py-3">
                    <div className="h-4 w-28 animate-pulse rounded bg-[#1F2937]" />
                    <div className="h-4 w-12 animate-pulse rounded bg-[#1F2937]" />
                  </div>
                ))}
              </div>
            ) : sessions.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-[13px] text-[#4B5563]">No sessions yet — start your first one above.</p>
              </div>
            ) : (
              <div className="divide-y divide-[#1F2937]">
                {sessions.slice(0, 5).map((s) => {
                  const date = new Date(s.started_at)
                  const now = new Date()
                  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000)
                  const dateLabel =
                    diffDays === 0 ? 'Today'
                    : diffDays === 1 ? 'Yesterday'
                    : `${diffDays}d ago`
                  const total = s.scenario_ids.length
                  const acc = total > 0 ? Math.round((s.correct_count / total) * 100) : 0

                  return (
                    <div key={s.id} className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="text-[12px] text-[#6B7280]">{dateLabel}</span>
                        <span className="text-[12px] text-[#4B5563]">
                          {s.correct_count}/{total} · {acc}%
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <IQDeltaBadge delta={s.iq_delta} />
                        <span className="text-[11px] text-[#3BE383]">+{s.xp_earned} XP</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </motion.div>

        {/* Nav links */}
        <motion.div custom={7} initial="hidden" animate="show" variants={fadeUp} className="mt-5 grid grid-cols-2 gap-3">
          {[
            { href: '/profile', label: '📊 Profile & Stats' },
            { href: '/academy', label: '🎓 IQ Academy' },
          ].map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center justify-center rounded-2xl border border-[#1F2937] bg-[#111827] px-4 py-3 text-[13px] font-semibold text-[#9CA3AF] transition-colors hover:border-[#374151] hover:text-[#F9FAFB]"
            >
              {label}
            </Link>
          ))}
        </motion.div>
      </div>
    </div>
  )
}

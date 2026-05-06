'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { NumberTicker } from '@/components/ui/NumberTicker'
import { XPBar } from '@/components/ui/XPBar'
import {
  IntroCardsModal,
  hasDismissedIntro,
  clearIntroDismissal,
} from '@/features/onboarding/IntroCards'
import { INTRO_HOME_BANNER } from '@/lib/onboarding/introCopy'

const ease = [0.22, 1, 0.36, 1]

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease, delay: i * 0.08 },
  }),
}

interface DecoderProgress {
  tag: string
  title: string
  state: 'new' | 'in_progress' | 'mastered'
  attempts: number
  rolling_accuracy: number
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
  decoders: DecoderProgress[]
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

/** Minimal shape we read off /api/pathways/:slug/progress. */
interface PathwayProgressLite {
  pathwayProgress: number
  pathwayMastered: boolean
  recommendedNext: { trainHref: string; label: string } | null
}

const FOUNDATION_DETAIL_HREF = '/pathways/complete-iq-foundation'

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

/**
 * V3 P4 — Pathway-driven home primary CTA.
 *
 * Combines the Pathway hero card and the "Start Today's Session" CTA
 * into a single action surface so the home page always has exactly
 * one obvious next step:
 *   - cold-start (0 attempts) → "Start Foundation" → drops into the
 *     first recommended train.
 *   - mid-pathway → "Continue: <chapter>" → drops into recommendedNext.
 *   - mastered → "Run it back" → links to detail page.
 *
 * Falls back to a hero-detail link only while the pathway progress is
 * still loading.
 */
function PathwayPrimaryCard({
  pathway,
  loading,
  attempts,
}: {
  pathway: PathwayProgressLite | null
  loading: boolean
  attempts: number
}) {
  const progressPct = Math.round((pathway?.pathwayProgress ?? 0) * 100)
  const mastered = pathway?.pathwayMastered === true
  const hasRecommendation = !!pathway?.recommendedNext?.trainHref

  let eyebrow: string
  let primaryLabel: string
  let primarySubline: string
  let primaryHref: string

  if (loading) {
    eyebrow = 'Your Pathway'
    primaryLabel = 'Loading…'
    primarySubline = 'Pulling your next read.'
    primaryHref = FOUNDATION_DETAIL_HREF
  } else if (mastered) {
    eyebrow = 'Pathway mastered'
    primaryLabel = 'Run it back'
    primarySubline = 'Re-run a chapter to keep the reads sharp.'
    primaryHref = FOUNDATION_DETAIL_HREF
  } else if (attempts === 0 || !hasRecommendation) {
    eyebrow = 'Start here'
    primaryLabel = 'Start Foundation'
    primarySubline = 'Build your reads from the ground up. ~25 min total.'
    primaryHref = pathway?.recommendedNext?.trainHref ?? FOUNDATION_DETAIL_HREF
  } else {
    eyebrow = 'Continue training'
    primaryLabel = pathway!.recommendedNext!.label
    primarySubline = `Pathway · Complete IQ Foundation · ${progressPct}%`
    primaryHref = pathway!.recommendedNext!.trainHref
  }

  return (
    <div
      className="relative overflow-hidden rounded-2xl border-2 border-[#3BE383]/30 bg-gradient-to-br from-[#0F1F1A] to-[#091812] p-4"
      style={{ boxShadow: '0 0 32px rgba(59,227,131,0.10), 0 1px 0 rgba(255,255,255,0.04) inset' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[1.5px] text-[#3BE383]">
            {eyebrow}
          </p>
          <p className="mt-1 font-display text-[18px] font-black leading-tight text-[#F9FAFB]">
            Complete IQ Foundation
          </p>
          <p className="mt-0.5 text-[12px] text-[#9CA3AF]">{primarySubline}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end">
          <p className="font-display text-[20px] font-black leading-none text-[#3BE383]">
            {progressPct}%
          </p>
          <p className="text-[10px] uppercase tracking-[1.2px] text-[#4B5563]">progress</p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
        <Link
          href={primaryHref}
          className="ciq-press flex items-center justify-center gap-2 rounded-xl px-5 py-3 font-display text-[14px] font-black uppercase tracking-[0.5px]"
          style={{
            background: 'linear-gradient(135deg, #3BE383 0%, #22C55E 100%)',
            color: '#09111E',
            boxShadow: '0 0 24px rgba(59,227,131,0.35), 0 1px 0 rgba(255,255,255,0.18) inset',
          }}
          data-testid="home-pathway-primary"
        >
          {primaryLabel}
          <span aria-hidden>→</span>
        </Link>
        <Link
          href={FOUNDATION_DETAIL_HREF}
          className="ciq-press-soft flex items-center justify-center rounded-xl border border-[#1F2937] bg-[#0E1B16] px-4 py-3 font-display text-[12px] font-semibold uppercase tracking-[1.5px] text-[#9CA3AF] transition-colors hover:text-[#F9FAFB]"
        >
          See chapters
        </Link>
      </div>
    </div>
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
  const [pathway, setPathway] = useState<PathwayProgressLite | null>(null)
  const [loading, setLoading] = useState(true)
  // V3 P2 — first-time intro modal. Auto-opens for cold-start players;
  // subsequent loads reopen only when the player explicitly taps the
  // "Show me" banner (or "Replay walkthrough" link in the nav grid).
  const [introOpen, setIntroOpen] = useState(false)
  const [introDismissed, setIntroDismissed] = useState(true)

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

      // Fetch profile + recent sessions + foundation pathway progress
      // in parallel. Pathway endpoint is auth-cookie-based; failing it
      // shouldn't block the rest of the home dashboard.
      const [profileRes, sessionsRes, pathwayRes] = await Promise.all([
        fetch(`/api/profile?userId=${user.id}`),
        fetch(`/api/sessions/recent?userId=${user.id}`),
        fetch(`/api/pathways/complete-iq-foundation/progress`),
      ])

      if (profileRes.ok) {
        setData(await profileRes.json())
      }
      if (sessionsRes.ok) {
        setSessions(await sessionsRes.json())
      }
      if (pathwayRes.ok) {
        setPathway(await pathwayRes.json())
      }
      setLoading(false)
    }
    load()
  }, [])

  // V3 P2 — auto-open the intro the first time a brand-new player lands
  // on /home (zero attempts, never dismissed). Dismissal persists in
  // localStorage; we hydrate the flag client-side so SSR doesn't flash
  // the modal for returning players.
  useEffect(() => {
    if (loading) return
    const dismissed = hasDismissedIntro()
    setIntroDismissed(dismissed)
    if (!dismissed && (data?.attemptsCount ?? 0) === 0) {
      setIntroOpen(true)
    }
  }, [loading, data?.attemptsCount])

  const iq = data?.profile?.iq_score ?? 500
  const streak = data?.profile?.current_streak ?? 0
  const level = data?.profile?.level ?? 1
  const xpTotal = data?.profile?.xp_total ?? 0
  const xpInLevel = xpTotal % 100
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

      <IntroCardsModal
        open={introOpen}
        onClose={() => {
          setIntroOpen(false)
          setIntroDismissed(true)
        }}
        startHref={FOUNDATION_DETAIL_HREF}
      />

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

        {/* V3 P2 — first-run banner. Only renders when the player has
            zero recorded attempts AND has explicitly skipped the intro
            modal (or the modal closed without seeing every card). The
            banner gives them a one-tap path back into the walkthrough
            so the explanation is never lost. */}
        {!loading && (data?.attemptsCount ?? 0) === 0 && introDismissed && !introOpen ? (
          <motion.button
            type="button"
            onClick={() => {
              clearIntroDismissal()
              setIntroDismissed(false)
              setIntroOpen(true)
            }}
            custom={0.2}
            initial="hidden"
            animate="show"
            variants={fadeUp}
            data-testid="home-intro-banner"
            className="ciq-lift mb-5 flex w-full items-center justify-between gap-3 rounded-2xl border border-[#1F2937] bg-[#0E1B16] px-4 py-3 text-left transition-colors hover:border-[#3BE383]/40"
          >
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-[1.5px] text-[#3BE383]">
                {INTRO_HOME_BANNER.eyebrow}
              </p>
              <p className="mt-0.5 font-display text-[14px] font-bold text-[#F9FAFB]">
                {INTRO_HOME_BANNER.title}
              </p>
              <p className="mt-0.5 text-[12px] text-[#9CA3AF]">
                {INTRO_HOME_BANNER.body}
              </p>
            </div>
            <span className="rounded-full border border-[#3BE383]/40 bg-[#3BE383]/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[1px] text-[#3BE383]">
              {INTRO_HOME_BANNER.ctaLabel} →
            </span>
          </motion.button>
        ) : null}

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
            <div
              className="font-display text-[64px] font-black leading-none tracking-[-3px]"
              style={{ color: '#3BE383', textShadow: '0 0 40px rgba(59,227,131,0.4)' }}
            >
              <NumberTicker value={iq} format={(n) => Math.round(n).toLocaleString()} />
            </div>
          )}
          <p className="mt-2 text-[13px] text-[#4B5563]">{data?.rankLabel ?? 'Rookie'} · Level {level}</p>

          {!loading && (
            <div className="mt-4">
              <XPBar xp={xpInLevel} xpForNextLevel={100} level={level} />
            </div>
          )}

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

        {/* V3 P4 — single primary action, Pathway-driven.
            The card combines the Pathway context (title, % progress)
            with the actionable "what comes next" /train deep-link the
            recommendedNext API already provides. New users see "Start
            Foundation"; mid-pathway users see "Continue: [chapter]";
            mastered users get a "Run it back" review affordance. The
            small "see chapters" link gives a one-tap path to the map
            for anyone who wants to browse before training. */}
        <motion.div custom={4.5} initial="hidden" animate="show" variants={fadeUp} className="mb-3">
          <PathwayPrimaryCard pathway={pathway} loading={loading} attempts={data?.attemptsCount ?? 0} />
        </motion.div>

        {/* V3 P4 — Quick rep secondary action. Demoted from the green
            slab so it no longer competes with the Pathway CTA, but
            kept reachable for impatient players who want a random 5-
            pack outside the Pathway flow. Empty-state hides it for
            cold-start users so the page focuses on the one action. */}
        {!loading && (data?.attemptsCount ?? 0) > 0 ? (
          <motion.div
            custom={5}
            initial="hidden"
            animate="show"
            variants={fadeUp}
            className="mb-5"
          >
            <Link
              href="/train"
              className="ciq-press-soft flex items-center justify-between rounded-2xl border border-[#1F2937] bg-[#111827] px-4 py-3 transition-colors hover:border-[#374151]"
            >
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[1.5px] text-[#9CA3AF]">
                  Quick rep
                </p>
                <p className="mt-0.5 text-[13px] font-semibold text-[#F9FAFB]">
                  Run 5 random plays · ~3 min
                </p>
              </div>
              <span aria-hidden className="text-[18px] text-[#3BE383]">→</span>
            </Link>
          </motion.div>
        ) : null}

        {/* Decoder Mastery */}
        {!loading && (data?.decoders?.some((d) => d.attempts > 0) ?? false) && (
          <motion.div custom={5.5} initial="hidden" animate="show" variants={fadeUp} className="mb-5">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-[1.5px] text-[#6B7280]">
                Decoder Mastery
              </p>
              <Link href="/academy" className="text-[11px] font-semibold text-[#3BE383]">
                Academy →
              </Link>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {data!.decoders
                .filter((d) => d.attempts > 0)
                .map((d) => {
                  const pct = Math.round(d.rolling_accuracy * 100)
                  const mastered = d.state === 'mastered'
                  return (
                    <div
                      key={d.tag}
                      className="flex flex-col gap-2 rounded-2xl border border-[#1F2937] bg-[#111827] p-3"
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-[13px] font-semibold text-[#F9FAFB]">{d.title}</p>
                        <span
                          className="text-[10px] font-bold uppercase tracking-wide"
                          style={{ color: mastered ? '#3BE383' : '#F59E0B' }}
                        >
                          {mastered ? '✅ Mastered' : `${pct}%`}
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-[#1F2937]">
                        <div
                          className="h-full transition-all"
                          style={{
                            width: `${mastered ? 100 : pct}%`,
                            background: mastered ? '#3BE383' : '#F59E0B',
                          }}
                        />
                      </div>
                      <p className="text-[10px] text-[#4B5563]">
                        {d.attempts} {d.attempts === 1 ? 'rep' : 'reps'}
                      </p>
                    </div>
                  )
                })}
            </div>
          </motion.div>
        )}

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
            { href: '/pathways', label: '🧭 Pathways' },
            { href: '/academy', label: '🎓 IQ Academy' },
            { href: '/profile', label: '📊 Profile & Stats' },
            { href: '/leaderboard', label: '🏆 Leaderboard' },
            { href: '/settings', label: '⚙️ Settings' },
          ].map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center justify-center rounded-2xl border border-[#1F2937] bg-[#111827] px-4 py-3 text-[13px] font-semibold text-[#9CA3AF] transition-colors hover:border-[#374151] hover:text-[#F9FAFB]"
            >
              {label}
            </Link>
          ))}
          {/* V3 P2 — replay the walkthrough at any time. Lives in the
              nav grid so it's always one tap away once dismissed. */}
          <button
            type="button"
            onClick={() => {
              clearIntroDismissal()
              setIntroDismissed(false)
              setIntroOpen(true)
            }}
            data-testid="home-intro-replay"
            className="col-span-2 flex items-center justify-center rounded-2xl border border-[#1F2937] bg-[#111827] px-4 py-3 text-[12px] font-semibold uppercase tracking-[1.5px] text-[#9CA3AF] transition-colors hover:border-[#374151] hover:text-[#F9FAFB]"
          >
            ↺ Replay walkthrough
          </button>
        </motion.div>
      </div>
    </div>
  )
}

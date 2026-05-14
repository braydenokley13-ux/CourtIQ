'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { XPBar } from '@/components/ui/XPBar'
import {
  IntroCardsModal,
  hasDismissedIntro,
  clearIntroDismissal,
} from '@/features/onboarding/IntroCards'
import { INTRO_HOME_BANNER } from '@/lib/onboarding/introCopy'
import { pickHomePathwayCta } from '@/lib/retention/homePathwayCta'
import { deriveJourneyState } from '@/lib/journey/journeyStep'
import { JourneyMap } from '@/components/JourneyMap'

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

/** Minimal shape we read off /api/pathways/:slug/progress. */
interface PathwayProgressLite {
  pathwayProgress: number
  pathwayMastered: boolean
  recommendedNext: { trainHref: string; label: string } | null
}

/** Payload from /api/home/spine. The redesigned home page only reads
 *  the daily-challenge slice; the older recognition ring, today's
 *  focus, and faster-callout fields are still returned by the
 *  endpoint but no longer surfaced here. */
interface HomeSpine {
  daily: {
    available: boolean
    date: string
    session_run_id: string | null
    completed_today: boolean
    started_today: boolean
    streak: number
  }
}

const FOUNDATION_DETAIL_HREF = '/pathways/complete-iq-foundation'

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
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
 * Redesign note: the primary button is now huge — a 6-year-old should
 * recognise it as the one obvious thing to tap from across the room.
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
  const cta = pickHomePathwayCta({ pathway, attempts, loading })
  const { eyebrow, primaryLabel, primarySubline, primaryHref } = cta
  const progressPct = Math.round((pathway?.pathwayProgress ?? 0) * 100)
  const isColdStart = attempts === 0

  return (
    <div
      className="relative overflow-hidden rounded-3xl border-2 border-[#3BE383]/30 bg-gradient-to-br from-[#0F1F1A] to-[#091812] p-5"
      style={{ boxShadow: '0 0 36px rgba(59,227,131,0.14), 0 1px 0 rgba(255,255,255,0.04) inset' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[1.5px] text-[#3BE383]">
            {eyebrow}
          </p>
          <p className="mt-1 font-display text-[20px] font-black leading-tight text-[#F9FAFB]">
            {isColdStart ? 'Your first play' : 'Keep going'}
          </p>
          <p className="mt-1 text-[13px] leading-snug text-[#9CA3AF]">{primarySubline}</p>
        </div>
        {!isColdStart && (
          <div className="flex shrink-0 flex-col items-end">
            <p className="font-display text-[24px] font-black leading-none text-[#3BE383]">
              {progressPct}%
            </p>
            <p className="text-[10px] uppercase tracking-[1.2px] text-[#4B5563]">done</p>
          </div>
        )}
      </div>

      <Link
        href={primaryHref}
        className="ciq-press mt-4 flex w-full items-center justify-center gap-3 rounded-2xl py-5 font-display text-[20px] font-black uppercase tracking-[1px]"
        style={{
          background: 'linear-gradient(135deg, #3BE383 0%, #22C55E 100%)',
          color: '#09111E',
          boxShadow: '0 0 28px rgba(59,227,131,0.40), 0 1px 0 rgba(255,255,255,0.18) inset',
        }}
        data-testid="home-pathway-primary"
      >
        {isColdStart ? '▶ Play' : primaryLabel}
        <span aria-hidden>→</span>
      </Link>

      <Link
        href={FOUNDATION_DETAIL_HREF}
        className="mt-2 block text-center text-[12px] font-semibold uppercase tracking-[1.5px] text-[#6B7280] transition-colors hover:text-[#F9FAFB]"
      >
        See all the chapters
      </Link>
    </div>
  )
}

/** Phase 8 — Daily Challenge card. Independent from training —
 *  hits the daily ritual streak, not the training streak. */
function DailyChallengeCard({
  daily,
}: {
  daily: HomeSpine['daily']
}) {
  if (!daily.available) {
    return (
      <motion.div
        custom={3}
        initial="hidden"
        animate="show"
        variants={fadeUp}
        className="mb-3 rounded-2xl border border-[#1F2937] bg-[#0E1B16] px-4 py-3"
        data-testid="home-daily-card"
      >
        <p className="text-[10px] font-bold uppercase tracking-[1.5px] text-[#6B7280]">
          Daily — coming soon
        </p>
        <p className="mt-0.5 text-[12px] text-[#9CA3AF]">
          Library is still loading. Check back later.
        </p>
      </motion.div>
    )
  }

  const completed = daily.completed_today
  const started = daily.started_today && !completed
  const eyebrow = completed
    ? `🔥 ${daily.streak}-day daily streak`
    : started
      ? "Today's daily — keep going"
      : "Today's daily — 5 plays"
  const title = completed
    ? 'See how you did.'
    : started
      ? 'Pick up where you left off.'
      : '5 mystery plays. No hints.'
  const ctaHref = completed && daily.session_run_id
    ? `/daily/result?id=${daily.session_run_id}`
    : '/daily'

  return (
    <motion.div
      custom={3}
      initial="hidden"
      animate="show"
      variants={fadeUp}
      className="mb-4"
      data-testid="home-daily-card"
    >
      <Link
        href={ctaHref}
        className="ciq-lift flex items-center justify-between gap-3 rounded-2xl border border-[#1F2937] bg-[#0E1B16] px-4 py-3 transition-colors hover:border-[#3BE383]/40"
      >
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[1.5px] text-[#3BE383]">
            {eyebrow}
          </p>
          <p className="mt-0.5 font-display text-[14px] font-bold text-[#F9FAFB]">
            {title}
          </p>
        </div>
        <span aria-hidden className="text-[18px] text-[#3BE383]">
          →
        </span>
      </Link>
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

/**
 * StatusStrip — kid-friendly status row. Streak + level + IQ in three
 * pill-style cells, plus a slim XP-to-next-level bar underneath.
 * Hidden during cold-start (no attempts) so a brand-new player doesn't
 * see a meaningless "500 IQ · Level 1" badge before they've played.
 */
function StatusStrip({
  streak,
  level,
  xpInLevel,
  iq,
}: {
  streak: number
  level: number
  xpInLevel: number
  iq: number
}) {
  return (
    <div
      className="mb-4 rounded-2xl border border-[#1F2937] bg-[#111827] p-3"
      data-testid="home-status-strip"
    >
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="font-display text-[20px] font-black leading-none text-[#3BE383]">
            🔥 {streak}
          </p>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-[1.2px] text-[#6B7280]">
            day streak
          </p>
        </div>
        <div className="border-x border-[#1F2937]">
          <p className="font-display text-[20px] font-black leading-none text-[#F9FAFB]">
            Lv {level}
          </p>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-[1.2px] text-[#6B7280]">
            level
          </p>
        </div>
        <div>
          <p className="font-display text-[20px] font-black leading-none text-[#F9FAFB]">
            {iq}
          </p>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-[1.2px] text-[#6B7280]">
            IQ
          </p>
        </div>
      </div>
      <div className="mt-3">
        <XPBar xp={xpInLevel} xpForNextLevel={100} level={level} />
      </div>
    </div>
  )
}

export default function HomePage() {
  const [userName, setUserName] = useState<string | null>(null)
  const [data, setData] = useState<ProfileData | null>(null)
  const [pathway, setPathway] = useState<PathwayProgressLite | null>(null)
  const [spine, setSpine] = useState<HomeSpine | null>(null)
  const [loading, setLoading] = useState(true)
  // V3 P2 — first-time intro modal. Auto-opens for cold-start players;
  // subsequent loads reopen only when the player explicitly taps the
  // "Show me" banner (or the "How CourtIQ works" link in the footer).
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

      // Fetch profile + foundation pathway progress + daily spine in
      // parallel. The redesigned home page no longer surfaces recent
      // sessions, so /api/sessions/recent is intentionally dropped.
      const [profileRes, pathwayRes, spineRes] = await Promise.all([
        fetch(`/api/profile?userId=${user.id}`),
        fetch(`/api/pathways/complete-iq-foundation/progress`),
        fetch(`/api/home/spine`),
      ])

      if (profileRes.ok) {
        setData(await profileRes.json())
      }
      if (pathwayRes.ok) {
        setPathway(await pathwayRes.json())
      }
      if (spineRes.ok) {
        setSpine(await spineRes.json())
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
  const attempts = data?.attemptsCount ?? 0
  const isColdStart = attempts === 0
  const firstName = userName ? userName.split(' ')[0] : null

  return (
    <div className="relative min-h-dvh overflow-hidden bg-[#09111E]">
      {/* Background glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 80% 55% at 50% -5%, rgba(59,227,131,0.12) 0%, transparent 70%)',
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
        {/* Greeting — small, kid-friendly. The h1 below is the headline.
            Cold-start gets a one-line explanation; returning players
            just see "Let's play." so the page jumps to the big button. */}
        <motion.div
          custom={0}
          initial="hidden"
          animate="show"
          variants={fadeUp}
          className="mb-5"
        >
          <p className="text-[13px] text-[#6B7280]">
            {greeting()}{firstName ? `, ${firstName}` : ''} 👋
          </p>
          <h1 className="mt-1 font-display text-[32px] font-black leading-tight tracking-tight text-[#F9FAFB]">
            {isColdStart ? (
              <>Welcome to <span style={{ color: '#3BE383' }}>CourtIQ</span>.</>
            ) : (
              <>Let&apos;s <span style={{ color: '#3BE383' }}>play</span>.</>
            )}
          </h1>
          {isColdStart ? (
            <p className="mt-2 text-[14px] leading-relaxed text-[#9CA3AF]">
              Watch a play. Pick what you would do. We tell you if you
              got it. That&apos;s the whole app.
            </p>
          ) : null}
        </motion.div>

        {/* V3 P2 — first-run banner. Only renders when the player has
            zero recorded attempts AND has explicitly skipped the intro
            modal (or the modal closed without seeing every card). One
            tap reopens the walkthrough so the explanation is never
            lost. */}
        {!loading && isColdStart && introDismissed && !introOpen ? (
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
            className="ciq-lift mb-4 flex w-full items-center justify-between gap-3 rounded-2xl border border-[#1F2937] bg-[#0E1B16] px-4 py-3 text-left transition-colors hover:border-[#3BE383]/40"
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

        {/* THE BUTTON — single primary action, intentionally large.
            A six-year-old should land on this page and have no question
            about what to tap next. Everything below this card is
            supporting context, not competing actions. */}
        <motion.div custom={1} initial="hidden" animate="show" variants={fadeUp} className="mb-4">
          <PathwayPrimaryCard pathway={pathway} loading={loading} attempts={attempts} />
        </motion.div>

        {/* Status strip — streak + level + IQ. Cold-start hides it so
            a brand-new player isn't greeted with a "500 IQ · Level 1"
            badge before they've played a single rep. */}
        {!loading && !isColdStart ? (
          <motion.div custom={1.5} initial="hidden" animate="show" variants={fadeUp}>
            <StatusStrip streak={streak} level={level} xpInLevel={xpInLevel} iq={iq} />
          </motion.div>
        ) : null}

        {/* Daily Challenge — separate streak surface for the daily
            ritual. Rendered for everyone (cold-start included) so the
            second-ever play has a reason to come back. */}
        {!loading && spine ? <DailyChallengeCard daily={spine.daily} /> : null}

        {/* Journey Map — the 4-step spine (Learn → Train → Test →
            Master). Already lives off `deriveJourneyState`; copy is
            kid-readable. Sits below the action so a returning player
            who just wants to tap PLAY doesn't have to scroll past it. */}
        {!loading ? (
          <motion.div
            custom={2}
            initial="hidden"
            animate="show"
            variants={fadeUp}
            className="mb-4"
          >
            <JourneyMap
              state={deriveJourneyState({
                attemptsCount: attempts,
                decoders: data?.decoders ?? [],
                pathway,
              })}
            />
          </motion.div>
        ) : null}

        {/* Slim nav — three core destinations + a hairline footer. The
            footer keeps the "How CourtIQ works" replay reachable for
            anyone who wants the orientation again. */}
        <motion.div custom={3} initial="hidden" animate="show" variants={fadeUp} className="mt-5 space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <Link
              href="/pathways"
              className="flex flex-col items-center justify-center gap-0.5 rounded-2xl border border-[#1F2937] bg-[#111827] px-3 py-3 text-center transition-colors hover:border-[#374151]"
            >
              <span aria-hidden className="text-[20px]">🗺️</span>
              <span className="text-[11px] font-bold uppercase tracking-[1.2px] text-[#F9FAFB]">
                Paths
              </span>
            </Link>
            <Link
              href="/academy"
              className="flex flex-col items-center justify-center gap-0.5 rounded-2xl border border-[#1F2937] bg-[#111827] px-3 py-3 text-center transition-colors hover:border-[#374151]"
            >
              <span aria-hidden className="text-[20px]">📚</span>
              <span className="text-[11px] font-bold uppercase tracking-[1.2px] text-[#F9FAFB]">
                Lessons
              </span>
            </Link>
            <Link
              href="/profile"
              className="flex flex-col items-center justify-center gap-0.5 rounded-2xl border border-[#1F2937] bg-[#111827] px-3 py-3 text-center transition-colors hover:border-[#374151]"
            >
              <span aria-hidden className="text-[20px]">⭐</span>
              <span className="text-[11px] font-bold uppercase tracking-[1.2px] text-[#F9FAFB]">
                You
              </span>
            </Link>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 pt-2 text-[11px] font-semibold uppercase tracking-[1.5px] text-[#6B7280]">
            <button
              type="button"
              onClick={() => {
                clearIntroDismissal()
                setIntroDismissed(false)
                setIntroOpen(true)
              }}
              data-testid="home-intro-replay"
              className="font-semibold uppercase tracking-[1.5px] text-[#3BE383]/80 transition-colors hover:text-[#3BE383]"
            >
              How CourtIQ works
            </button>
            <span aria-hidden className="text-[#374151]">·</span>
            <Link href="/leaderboard" className="transition-colors hover:text-[#F9FAFB]">
              Leaderboard
            </Link>
            <span aria-hidden className="text-[#374151]">·</span>
            <Link href="/settings" className="transition-colors hover:text-[#F9FAFB]">
              Settings
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  )
}

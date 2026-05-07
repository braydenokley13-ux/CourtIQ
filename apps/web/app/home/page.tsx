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
import { deriveReturnFocus, type ReturnFocus } from '@/lib/retention/todayFocus'
import { pickHomePathwayCta } from '@/lib/retention/homePathwayCta'

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


/**
 * V3 P6 — Return-loop chip.
 *
 * Single coaching line that names the player's current focus in
 * basketball-IQ terms ("Close on Skip the Rotation. A few sharp reads
 * from mastery."). Tap target falls through to the recommendedNext
 * train if available, otherwise renders as static copy.
 *
 * The chip is visually small — it is NOT another CTA. The Pathway
 * primary card below it owns the action. This chip exists to tell the
 * returning player WHY they should tap that card.
 */
function ReturnFocusChip({ focus }: { focus: ReturnFocus | null }) {
  if (!focus) return null

  const accent =
    focus.band === 'mastered'
      ? '#3BE383'
      : focus.band === 'close-to-mastery'
        ? '#3BE383'
        : focus.band === 'in-progress'
          ? '#8B7CFF'
          : '#5AC8FF'

  const eyebrow =
    focus.band === 'mastered'
      ? 'Pathway mastered'
      : focus.band === 'close-to-mastery'
        ? "You're close"
        : focus.band === 'in-progress'
          ? "Today's focus"
          : 'Pick up where you left off'

  const Wrapper = focus.href
    ? ({ children }: { children: React.ReactNode }) => (
        <Link
          href={focus.href!}
          data-testid="home-return-focus"
          className="ciq-lift block rounded-2xl border border-[#1F2937] bg-[#0E1B16] p-3 transition-colors hover:border-[#3BE383]/40"
        >
          {children}
        </Link>
      )
    : ({ children }: { children: React.ReactNode }) => (
        <div
          data-testid="home-return-focus"
          className="rounded-2xl border border-[#1F2937] bg-[#0E1B16] p-3"
        >
          {children}
        </div>
      )

  return (
    <motion.div
      custom={1.5}
      initial="hidden"
      animate="show"
      variants={fadeUp}
      className="mb-4"
    >
      <Wrapper>
        <p
          className="text-[10px] font-bold uppercase tracking-[1.5px]"
          style={{ color: accent }}
        >
          {eyebrow}
        </p>
        <p className="mt-0.5 font-display text-[14px] font-bold leading-snug text-[#F9FAFB]">
          {focus.headline}
        </p>
        {focus.sub ? (
          <p className="mt-0.5 text-[12px] leading-snug text-[#9CA3AF]">
            {focus.sub}
          </p>
        ) : null}
      </Wrapper>
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
  // V3 P8 — banding extracted to lib/retention/homePathwayCta.ts so
  // the cold-start / continue / mastered split is unit-testable.
  const cta = pickHomePathwayCta({ pathway, attempts, loading })
  const { eyebrow, primaryLabel, primarySubline, primaryHref } = cta
  const progressPct = Math.round((pathway?.pathwayProgress ?? 0) * 100)

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

        {/* V3 P11 P1 — IQ hero, toned down. The 64px / heavy-glow Vegas
            treatment reads as XP-leaderboard; we keep the number but
            give it a quieter premium frame so /home reads as a training
            space, not a high-score screen. */}
        <motion.div
          custom={1}
          initial="hidden"
          animate="show"
          variants={fadeUp}
          className="relative mb-4 overflow-hidden rounded-3xl border border-[#1F2937] bg-gradient-to-br from-[#111827] to-[#0D1B2A] p-5"
          style={{ boxShadow: '0 0 28px rgba(59,227,131,0.04), 0 1px 0 rgba(255,255,255,0.04) inset' }}
        >
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[1.8px] text-[#6B7280]">Basketball IQ</p>
          {loading ? (
            <div className="h-12 w-24 animate-pulse rounded-xl bg-[#1F2937]" />
          ) : (
            <div
              className="font-display text-[48px] font-black leading-none tracking-[-2px]"
              style={{ color: '#3BE383' }}
            >
              <NumberTicker value={iq} format={(n) => Math.round(n).toLocaleString()} />
            </div>
          )}
          <p className="mt-2 text-[12px] text-[#6B7280]">
            {data?.rankLabel ?? 'Rookie'}
            {!loading && (data?.attemptsCount ?? 0) > 0 ? (
              <>
                <span className="px-1.5 text-[#374151]">·</span>
                {streak > 0
                  ? `${streak}-day streak`
                  : `${accuracyPct}% reads`}
              </>
            ) : null}
          </p>

          {!loading && (
            <div className="mt-3">
              <XPBar xp={xpInLevel} xpForNextLevel={100} level={level} />
            </div>
          )}
        </motion.div>

        {/* V3 P6 — return-loop chip. ONE coaching line that names what
            the player is becoming better at, derived from the data we
            already fetch. Cold-start (no attempts) hides the chip; the
            home Pathway CTA does the work for those users. */}
        {!loading ? (
          <ReturnFocusChip
            focus={deriveReturnFocus({
              attemptsCount: data?.attemptsCount ?? 0,
              decoders: data?.decoders ?? [],
              pathway,
            })}
          />
        ) : null}

        {/* V3 P11 P1 — the previous 3-card stat grid (Streak / Accuracy
            / Sessions) was the loudest dashboard energy on /home. The
            ReturnFocusChip above already names what the player is
            training, and the IQ hero now folds streak/accuracy into a
            calm subtitle, so the grid is gone. Drop a hairline so the
            Pathway primary card sits in its own breathing room. */}
        {!loading && (data?.attemptsCount ?? 0) > 0 ? (
          <div aria-hidden className="mb-4 h-px bg-[#1F2937]/60" />
        ) : null}

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
                <p className="text-[10px] font-semibold uppercase tracking-[1.5px] text-[#9CA3AF]">
                  Off the clock
                </p>
                <p className="mt-0.5 text-[13px] font-semibold text-[#F9FAFB]">
                  Five quick reads. No path. ~3 min.
                </p>
              </div>
              <span aria-hidden className="text-[18px] text-[#3BE383]">→</span>
            </Link>
          </motion.div>
        ) : null}

        {/* V3 P7 — "Your reads" — renamed from "Decoder Mastery" so the
            section reads in the player's voice. The section still
            mirrors per-decoder accuracy + mastery, but the title and
            mastered tag are pure-text (no checkmark emoji) so the
            block feels premium, not gamified. */}
        {!loading && (data?.decoders?.some((d) => d.attempts > 0) ?? false) && (
          <motion.div custom={5.5} initial="hidden" animate="show" variants={fadeUp} className="mb-5">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-[1.5px] text-[#6B7280]">
                Your reads
              </p>
              <Link
                href="/pathways/complete-iq-foundation/progress"
                className="text-[11px] font-semibold text-[#3BE383]"
              >
                Progress →
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
                          {mastered ? 'Mastered' : `${pct}%`}
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

        {/* V3 P11 P1 — Recent Sessions reframed as coaching narrative.
            Was a log table (date · X/Y · IQ delta · XP); now a small
            list of past sets in basketball voice. The IQ delta + XP
            are gone from the line — those are P4 reward surfaces and
            shouldn't dominate the daily return moment. */}
        {!loading && sessions.length > 0 ? (
          <motion.div custom={6} initial="hidden" animate="show" variants={fadeUp}>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[1.5px] text-[#6B7280]">
              Last few sets
            </p>
            <div className="space-y-1.5">
              {sessions.slice(0, 4).map((s) => {
                const date = new Date(s.started_at)
                const now = new Date()
                const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000)
                const dateLabel =
                  diffDays === 0 ? 'Today'
                  : diffDays === 1 ? 'Yesterday'
                  : `${diffDays} days ago`
                const total = s.scenario_ids.length
                const acc = total > 0 ? Math.round((s.correct_count / total) * 100) : 0
                const summary =
                  acc >= 90
                    ? 'cleanly read'
                    : acc >= 70
                      ? 'sharp set'
                      : acc >= 50
                        ? 'mixed reads'
                        : acc > 0
                          ? 'tough set'
                          : 'reset'
                return (
                  <div
                    key={s.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-transparent px-1 py-1.5"
                  >
                    <p className="min-w-0 flex-1 truncate text-[13px] text-[#9CA3AF]">
                      <span className="text-[#F9FAFB]">{dateLabel}</span>
                      <span className="px-1.5 text-[#374151]">·</span>
                      <span>{summary}</span>
                    </p>
                    <span className="shrink-0 text-[12px] tabular-nums text-[#6B7280]">
                      {s.correct_count}/{total}
                    </span>
                  </div>
                )
              })}
            </div>
          </motion.div>
        ) : null}

        {/* V3 P7 — slim nav. Two primary tiles (Pathways, Progress) are
            the daily destinations; everything else collapses into a
            single hairline footer strip so /home reads as a coaching
            page, not a menu of pages. Replay walkthrough sits in the
            footer too — discoverable, not loud. */}
        <motion.div custom={7} initial="hidden" animate="show" variants={fadeUp} className="mt-5 space-y-2">
          <div className="grid grid-cols-2 gap-3">
            <Link
              href="/pathways"
              className="flex flex-col items-center justify-center gap-0.5 rounded-2xl border border-[#1F2937] bg-[#111827] px-4 py-3 transition-colors hover:border-[#374151]"
            >
              <span className="text-[10px] font-bold uppercase tracking-[1.5px] text-[#3BE383]">
                Pathways
              </span>
              <span className="text-[12px] text-[#9CA3AF]">Your training route</span>
            </Link>
            <Link
              href="/pathways/complete-iq-foundation/progress"
              className="flex flex-col items-center justify-center gap-0.5 rounded-2xl border border-[#1F2937] bg-[#111827] px-4 py-3 transition-colors hover:border-[#374151]"
            >
              <span className="text-[10px] font-bold uppercase tracking-[1.5px] text-[#3BE383]">
                Progress
              </span>
              <span className="text-[12px] text-[#9CA3AF]">Strengths & gaps</span>
            </Link>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 pt-2 text-[11px] font-semibold uppercase tracking-[1.5px] text-[#6B7280]">
            <Link href="/academy" className="transition-colors hover:text-[#F9FAFB]">
              Academy
            </Link>
            <span aria-hidden className="text-[#374151]">·</span>
            <Link href="/profile" className="transition-colors hover:text-[#F9FAFB]">
              Profile
            </Link>
            <span aria-hidden className="text-[#374151]">·</span>
            <Link href="/leaderboard" className="transition-colors hover:text-[#F9FAFB]">
              Leaderboard
            </Link>
            <span aria-hidden className="text-[#374151]">·</span>
            <Link href="/settings" className="transition-colors hover:text-[#F9FAFB]">
              Settings
            </Link>
            <span aria-hidden className="text-[#374151]">·</span>
            <button
              type="button"
              onClick={() => {
                clearIntroDismissal()
                setIntroDismissed(false)
                setIntroOpen(true)
              }}
              data-testid="home-intro-replay"
              className="font-semibold uppercase tracking-[1.5px] text-[#6B7280] transition-colors hover:text-[#F9FAFB]"
            >
              Replay walkthrough
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  )
}

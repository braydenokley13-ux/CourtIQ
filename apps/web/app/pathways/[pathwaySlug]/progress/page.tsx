/**
 * /pathways/[pathwaySlug]/progress — Player Progress & Performance (PTH-6).
 *
 * A player-facing view that answers three questions:
 *   1. What am I good at?            → decoder strength breakdown
 *   2. What am I struggling with?    → single weakness insight
 *   3. What should I do next?        → recommendedNext + reason copy
 *
 * Reuses `getPathwayProgress` + the new pure `derivePlayerInsights` so
 * PTH-6 adds no new fetches, no new tables, and does not modify the
 * PTH-5 progress logic.
 */

import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ProgressRing } from '@/components/ui'
import { createClient } from '@/lib/supabase/server'
import {
  buildPathwayDetailHref,
  getAccentColor,
  getDecoderAccent,
  getPathwayBySlug,
} from '@/lib/pathways/helpers'
import {
  derivePlayerInsights,
  type DecoderInsight,
  type DecoderStrengthGroup,
  type FinalMixStatus,
  type NextActionInsight,
  type PlayerInsights,
  type RecentChallengeRow,
  type WeaknessInsight,
} from '@/lib/pathways/playerProgressInsights'
import { getPathwayProgress } from '@/lib/pathways/progressService'
import type { PathwayConfig } from '@/lib/pathways/types'
import {
  getDecoderExplanation,
  getDecoderOneLiner,
} from '@/lib/decoders/explanations'

export const dynamic = 'force-dynamic'

const GROUP_COPY: Record<DecoderStrengthGroup, { label: string; tone: string }> = {
  strong: { label: 'Strong', tone: 'text-brand' },
  improving: { label: 'Improving', tone: 'text-info' },
  'needs-work': { label: 'Needs work', tone: 'text-heat' },
  untested: { label: 'No reps yet', tone: 'text-text-mute' },
}

const FINAL_MIX_COPY: Record<FinalMixStatus, { label: string; tone: string }> = {
  none: { label: '—', tone: 'text-text-mute' },
  not_started: { label: 'Not started', tone: 'text-text-dim' },
  attempted: { label: 'Keep going', tone: 'text-iq' },
  cleared: { label: 'Cleared', tone: 'text-brand' },
}

export default async function PlayerProgressPage({
  params,
}: {
  params: Promise<{ pathwaySlug: string }>
}) {
  const { pathwaySlug } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const pathway = getPathwayBySlug(pathwaySlug)
  if (!pathway) notFound()

  // Coming-soon pathways have no chapters to derive against — bounce
  // back to the detail page rather than rendering an empty progress
  // view.
  if (pathway.comingSoon) {
    redirect(buildPathwayDetailHref(pathway.slug))
  }

  const summary = await getPathwayProgress(user.id, pathway.slug)
  const insights = derivePlayerInsights(pathway, summary)

  return <ProgressView pathway={pathway} insights={insights} />
}

function ProgressView({
  pathway,
  insights,
}: {
  pathway: PathwayConfig
  insights: PlayerInsights
}) {
  const accent = getAccentColor(pathway.accentToken ?? 'brand')
  const detailHref = buildPathwayDetailHref(pathway.slug)

  return (
    <main className="min-h-dvh bg-bg-0 p-5 text-text">
      <div className="mx-auto max-w-2xl space-y-6">
        <Link
          href={detailHref}
          className="text-[11px] uppercase tracking-[1.5px] text-text-dim hover:text-text"
        >
          ← Back to pathway
        </Link>

        <CoreSummary pathway={pathway} insights={insights} accent={accent} />

        <NextAction insights={insights} />

        <WeaknessCallout weakness={insights.weakness} />

        <DecoderBreakdown decoders={insights.decoders} />

        <RecentRuns recent={insights.recent} />

        <FooterNav detailHref={detailHref} />
      </div>
    </main>
  )
}

// ---------------------------------------------------------------------------
// Packet 2 — Core performance summary.
// ---------------------------------------------------------------------------

function CoreSummary({
  pathway,
  insights,
  accent,
}: {
  pathway: PathwayConfig
  insights: PlayerInsights
  accent: string
}) {
  const progressPct = Math.round(insights.pathwayProgress * 100)
  const finalMixCopy = FINAL_MIX_COPY[insights.finalMixStatus]
  const lastActivity = formatLastActivity(insights.lastActivityAt)

  return (
    <header
      className="relative overflow-hidden rounded-3xl border-2 border-brand/40 bg-gradient-to-br from-bg-1 to-bg-2 p-6"
      style={{ boxShadow: `0 0 40px ${accent}1f, 0 1px 0 rgba(255,255,255,0.04) inset` }}
    >
      <p className="text-[11px] font-bold uppercase tracking-[1.5px] text-text-mute">
        Your progress
      </p>
      <div className="mt-2 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-[26px] font-bold leading-tight text-text">
            {pathway.title}
          </h1>
          <p className="mt-1 text-[13px] text-text-dim">{pathway.subtitle}</p>
        </div>
        <ProgressRing value={progressPct} max={100} size={84} stroke={6} color={accent}>
          <div className="text-center">
            <p
              className="font-display text-[18px] font-bold leading-none"
              style={{ color: accent }}
            >
              {progressPct}%
            </p>
            <p className="text-[9px] uppercase tracking-[1.2px] text-text-mute">progress</p>
          </div>
        </ProgressRing>
      </div>

      <dl className="mt-5 grid grid-cols-3 gap-2">
        <SummaryStat
          label="Chapters"
          value={`${insights.chaptersMastered}/${insights.chaptersTotal}`}
          caption="mastered"
        />
        <SummaryStat
          label="Bosses"
          value={`${insights.bossesCleared}/${insights.bossesTotal}`}
          caption="cleared"
        />
        <SummaryStat
          label="Final Mix"
          value={finalMixCopy.label}
          caption={insights.finalMixStatus === 'cleared' ? 'real game mix' : 'capstone'}
          tone={finalMixCopy.tone}
        />
      </dl>

      {lastActivity ? (
        <p className="mt-4 text-[11px] text-text-mute">Last challenge run · {lastActivity}</p>
      ) : null}
    </header>
  )
}

function SummaryStat({
  label,
  value,
  caption,
  tone,
}: {
  label: string
  value: string
  caption: string
  tone?: string
}) {
  return (
    <div className="rounded-2xl border border-hairline-2 bg-bg-2 p-3">
      <p className="text-[10px] font-bold uppercase tracking-[1.5px] text-text-mute">{label}</p>
      <p className={`mt-1 font-display text-[18px] font-bold leading-none ${tone ?? 'text-text'}`}>
        {value}
      </p>
      <p className="mt-1 text-[10px] uppercase tracking-[1px] text-text-mute">{caption}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Packet 5 — Next action (most important section, surfaced second so
// the headline summary still anchors the page).
// ---------------------------------------------------------------------------

function NextAction({ insights }: { insights: PlayerInsights }) {
  const action: NextActionInsight = insights.next
  if (!action.recommendation) {
    if (insights.pathwayMastered) {
      return (
        <section className="rounded-2xl border border-brand/40 bg-bg-1 p-4 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[1.5px] text-brand">
            Pathway mastered
          </p>
          <p className="mt-2 font-display text-[18px] font-bold leading-tight">
            You cleared every chapter and the Final Mix.
          </p>
          <p className="mt-2 text-[13px] text-text-dim">
            Re-run a chapter to keep the reads sharp, or pick a new pathway.
          </p>
        </section>
      )
    }
    return null
  }

  const { recommendation, reasonCopy } = action
  return (
    <section className="rounded-2xl border-2 border-brand/40 bg-gradient-to-br from-bg-1 to-bg-2 p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[1.5px] text-brand">
        Do this next
      </p>
      <p className="mt-2 font-display text-[20px] font-bold leading-tight text-text">
        {recommendation.label}
      </p>
      {reasonCopy ? (
        <p className="mt-1 text-[13px] leading-snug text-text-dim">{reasonCopy}</p>
      ) : null}
      <Link
        href={recommendation.trainHref}
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-3.5 font-display text-[14px] font-bold uppercase tracking-[0.5px] text-brand-ink shadow-brand-sm transition-transform active:scale-[0.99]"
      >
        Start
        <span aria-hidden>→</span>
      </Link>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Packet 6 — Lightweight weakness insight.
// ---------------------------------------------------------------------------

function WeaknessCallout({ weakness }: { weakness: WeaknessInsight | null }) {
  if (!weakness) return null
  const tagAccent = getAccentColor(getDecoderAccent(weakness.tag))
  const accuracyPct = Math.round(weakness.accuracy * 100)
  // V3 P3 — pull the canonical "what to watch" coaching line so the
  // weakness callout actually tells the player what to look for next
  // rep, not just that they're behind. If the tag isn't covered (e.g.
  // a future decoder), fall back to the generated message alone.
  const explanation = (() => {
    try {
      return getDecoderExplanation(weakness.tag)
    } catch {
      return null
    }
  })()
  return (
    <section className="rounded-2xl border border-heat/40 bg-heat/[0.06] p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[1.5px] text-heat">
          Watch this
        </p>
        <span
          className="rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[1px]"
          style={{ color: tagAccent, borderColor: `${tagAccent}55` }}
        >
          {weakness.label}
        </span>
      </div>
      <p className="mt-2 text-[13px] leading-snug text-text">{weakness.message}</p>
      {explanation ? (
        <p className="mt-2 text-[12px] italic leading-snug text-text-dim">
          <span className="font-bold not-italic uppercase tracking-[1.4px] text-text-mute">
            Watch ·
          </span>{' '}
          {explanation.watch}
        </p>
      ) : null}
      <p className="mt-2 text-[10px] uppercase tracking-[1.5px] text-text-mute">
        {accuracyPct}% accuracy · {weakness.attempts} reps
      </p>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Packet 3 — Decoder strength breakdown.
// ---------------------------------------------------------------------------

function DecoderBreakdown({ decoders }: { decoders: readonly DecoderInsight[] }) {
  if (decoders.length === 0) return null
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[1.5px] text-text-dim">
          Strengths & gaps
        </p>
        <p className="text-[10px] uppercase tracking-[1px] text-text-mute">by decoder</p>
      </div>
      <ul className="space-y-2">
        {decoders.map((d) => (
          <DecoderRow key={d.tag} insight={d} />
        ))}
      </ul>
    </section>
  )
}

function DecoderRow({ insight }: { insight: DecoderInsight }) {
  const tagAccent = getAccentColor(getDecoderAccent(insight.tag))
  const groupCopy = GROUP_COPY[insight.group]
  const accuracyPct =
    insight.accuracy === null ? null : Math.max(0, Math.min(100, Math.round(insight.accuracy * 100)))
  const fillPct = accuracyPct ?? 0
  // When no reps yet, render a faint hairline track instead of a fill —
  // keeps the row visually consistent without overstating effort.
  const fillColor = insight.group === 'untested' ? 'rgba(255,255,255,0.08)' : tagAccent
  // V3 P3 — surface the canonical one-liner under the label so the
  // player can ground the bar in plain language without leaving the
  // page. Falls back gracefully if the tag isn't covered yet (it
  // always is in v1; the runtime guard keeps the page resilient if
  // a future decoder ships with progress before its copy lands).
  const oneLiner = (() => {
    try {
      return getDecoderOneLiner(insight.tag)
    } catch {
      return null
    }
  })()

  return (
    <li className="rounded-2xl border border-hairline-2 bg-bg-1 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-display text-[14px] font-semibold leading-tight text-text">
            {insight.label}
          </p>
          {oneLiner ? (
            <p className="mt-0.5 text-[11px] leading-snug text-text-dim">{oneLiner}</p>
          ) : null}
        </div>
        <span className={`shrink-0 text-[10px] font-bold uppercase tracking-[1px] ${groupCopy.tone}`}>
          {groupCopy.label}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-bg-2">
        <div
          className="h-full transition-all"
          style={{ width: `${fillPct}%`, background: fillColor }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between text-[10px] uppercase tracking-[1px] text-text-mute">
        <span>{accuracyPct === null ? 'No reps' : `${accuracyPct}% accuracy`}</span>
        <span>
          {insight.attempts} {insight.attempts === 1 ? 'rep' : 'reps'}
        </span>
      </div>
    </li>
  )
}

// ---------------------------------------------------------------------------
// Packet 4 — Recent performance.
// ---------------------------------------------------------------------------

function RecentRuns({ recent }: { recent: readonly RecentChallengeRow[] }) {
  if (recent.length === 0) return null
  return (
    <section className="space-y-3">
      <p className="text-[11px] font-semibold uppercase tracking-[1.5px] text-text-dim">
        Recent runs
      </p>
      <ul className="space-y-2">
        {recent.map((row) => (
          <RecentRow key={`${row.chapterSlug}-${row.mode}-${row.attemptedAt}`} row={row} />
        ))}
      </ul>
    </section>
  )
}

function RecentRow({ row }: { row: RecentChallengeRow }) {
  const modeLabel = row.mode === 'mixed-reads' ? 'Final Mix' : 'Boss'
  const resultTone = row.passed ? 'text-brand' : 'text-heat'
  const resultLabel = row.passed ? 'Cleared' : 'Run it back'
  return (
    <li className="flex items-center justify-between rounded-2xl border border-hairline-2 bg-bg-1 p-3">
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-[1.5px] text-text-mute">
          {modeLabel}
        </p>
        <p className="font-display text-[14px] font-semibold leading-tight text-text">
          {row.chapterTitle}
        </p>
        <p className="mt-1 text-[10px] uppercase tracking-[1px] text-text-mute">
          {row.bestCount}/{row.total} best · {formatLastActivity(row.attemptedAt)}
        </p>
      </div>
      <span className={`text-[11px] font-bold uppercase tracking-[1px] ${resultTone}`}>
        {resultLabel}
      </span>
    </li>
  )
}

function FooterNav({ detailHref }: { detailHref: string }) {
  return (
    <div className="flex gap-2 pt-2">
      <Link
        href={detailHref}
        className="rounded-xl bg-bg-2 px-5 py-3 font-display text-[13px] font-semibold text-text-dim"
      >
        Pathway map
      </Link>
      <Link
        href="/home"
        className="rounded-xl bg-bg-2 px-5 py-3 font-display text-[13px] font-semibold text-text-dim"
      >
        Home
      </Link>
    </div>
  )
}

function formatLastActivity(iso: string | null): string | null {
  if (!iso) return null
  const ms = new Date(iso).getTime()
  if (!Number.isFinite(ms)) return null
  const diffMs = Date.now() - ms
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour
  if (diffMs < hour) {
    const mins = Math.max(1, Math.floor(diffMs / minute))
    return `${mins} min ago`
  }
  if (diffMs < day) {
    const hrs = Math.max(1, Math.floor(diffMs / hour))
    return `${hrs} ${hrs === 1 ? 'hr' : 'hrs'} ago`
  }
  const days = Math.max(1, Math.floor(diffMs / day))
  if (days < 14) return `${days} ${days === 1 ? 'day' : 'days'} ago`
  return new Date(iso).toLocaleDateString()
}

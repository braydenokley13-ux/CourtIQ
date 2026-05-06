/**
 * /pathways — the Pathway Hub (PTH-1).
 *
 * Server component, mirrors the /academy page pattern: pulls auth via
 * the server Supabase client, fetches progress for the active pathway
 * once per request, and renders an active card + a coming-soon
 * catalog grid.
 *
 * Pathway → /train links are built via `buildPathwayTrainHref` so the
 * query-param shape lives in one place.
 */

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ProgressRing } from '@/components/ui'
import {
  buildPathwayTrainHref,
  getAccentColor,
  getActivePathways,
  getArchetypeLabel,
  getComingSoonPathways,
  getDecoderLabel,
} from '@/lib/pathways/helpers'
import { getPathwayProgress } from '@/lib/pathways/progressService'
import type { PathwayConfig } from '@/lib/pathways/types'

export const dynamic = 'force-dynamic'

export default async function PathwaysHubPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const active = getActivePathways()
  const comingSoon = getComingSoonPathways()

  // Fetch progress for every active pathway. v1 has just one
  // (Foundation), so this is a single round-trip — no need for fancy
  // caching.
  const activeProgress = await Promise.all(
    active.map(async (p) => ({ pathway: p, progress: await getPathwayProgress(user.id, p.slug) })),
  )

  return (
    <main className="min-h-dvh bg-bg-0 p-5 text-text">
      <div className="mx-auto max-w-2xl space-y-6">
        <header className="space-y-2">
          <Link
            href="/home"
            className="text-[11px] uppercase tracking-[1.5px] text-text-dim hover:text-text"
          >
            ← Home
          </Link>
          <h1 className="font-display text-[28px] font-bold leading-tight">Pathways</h1>
          <p className="text-sm text-text-dim">
            A Pathway is your training route. Each one teaches a small set of
            reads — chapter by chapter — and ends with a Boss and a Final Mix
            where you read the play without any hints on screen.
          </p>
        </header>

        {/* V3 P4 — at-a-glance "how this works" strip. Three small
            tiles ground the player in the vocabulary the rest of the
            hub uses (decoder / chapter / boss + final mix) before any
            CTA. Mounted above the active Pathway card so a returning
            user has the option to skip past it visually but a brand-
            new user gets the language baked in. */}
        <section className="grid grid-cols-1 gap-2 sm:grid-cols-3" aria-label="How Pathways work">
          <HowItWorksTile
            step="1"
            label="Decoders"
            body="Patterns you learn to spot. Backdoor, empty space, advantage, skip."
          />
          <HowItWorksTile
            step="2"
            label="Chapters"
            body="One decoder per chapter. Watch, freeze, pick the read."
          />
          <HowItWorksTile
            step="3"
            label="Boss & Final Mix"
            body="No decoder label on screen. You have to read the play yourself."
          />
        </section>

        {/* Active pathways */}
        <section className="ciq-stage-in ciq-stage-in-1 space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-[1.5px] text-text-dim">
            Your Pathway
          </p>
          {activeProgress.map(({ pathway, progress }) => (
            <ActivePathwayCard
              key={pathway.slug}
              pathway={pathway}
              progressPct={Math.round((progress?.pathwayProgress ?? 0) * 100)}
              recommendedLabel={progress?.recommendedNext?.label ?? 'Start your foundation'}
              recommendedHref={
                progress?.recommendedNext?.trainHref ??
                buildPathwayTrainHref({
                  scenarioIds: pathway.chapters[0]?.skillNodes[0]?.scenarioIds ?? [],
                  pathwaySlug: pathway.slug,
                  chapterSlug: pathway.chapters[0]?.slug ?? null,
                  nodeSlug: pathway.chapters[0]?.skillNodes[0]?.slug ?? null,
                })
              }
              detailHref={`/pathways/${pathway.slug}`}
            />
          ))}
        </section>

        {/* Coming-soon catalog */}
        <section className="ciq-stage-in ciq-stage-in-2 space-y-3">
          <div className="flex items-end justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-[1.5px] text-text-dim">
              Coming soon
            </p>
            <p className="text-[11px] text-text-mute">
              {comingSoon.length} more {comingSoon.length === 1 ? 'track' : 'tracks'} in the works
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {comingSoon.map((p) => (
              <ComingSoonCard key={p.slug} pathway={p} />
            ))}
          </div>
        </section>

        {/* V3 P4 — secondary actions. Quick rep is demoted from a
            brand-fill primary so it doesn't compete with the active
            Pathway CTA above; it's still one tap away for players who
            want a random 5-pack outside the Pathway flow. */}
        <div className="flex gap-2 pt-2">
          <Link
            href="/train"
            className="ciq-press-soft flex-1 rounded-xl border border-hairline-2 bg-bg-1 py-3 text-center font-display text-[13px] font-semibold uppercase tracking-[1.5px] text-text-dim transition-colors hover:text-text"
          >
            Quick 5 plays
          </Link>
          <Link
            href="/home"
            className="ciq-press-soft rounded-xl bg-bg-2 px-5 py-3 font-display text-[13px] font-semibold uppercase tracking-[1.5px] text-text-dim"
          >
            Home
          </Link>
        </div>
      </div>
    </main>
  )
}

function ActivePathwayCard({
  pathway,
  progressPct,
  recommendedLabel,
  recommendedHref,
  detailHref,
}: {
  pathway: PathwayConfig
  progressPct: number
  recommendedLabel: string
  recommendedHref: string
  detailHref: string
}) {
  const accent = getAccentColor(pathway.accentToken ?? 'brand')
  const archetypeLabel = getArchetypeLabel(pathway.targetArchetype)
  const isStart = progressPct === 0

  return (
    <div
      className="ciq-stage-in relative overflow-hidden rounded-3xl border-2 border-brand/40 bg-gradient-to-br from-bg-1 to-bg-2 p-5 shadow-brand-sm"
      style={{ boxShadow: `0 0 32px ${accent}1f, 0 1px 0 rgba(255,255,255,0.04) inset` }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p
            className="text-[11px] font-semibold uppercase tracking-[1.5px]"
            style={{ color: accent }}
          >
            Active Pathway · Trains the {archetypeLabel}
          </p>
          <Link href={detailHref} className="block">
            <h2 className="mt-2 font-display text-[22px] font-bold leading-tight text-text hover:underline">
              {pathway.title}
            </h2>
          </Link>
          <p className="mt-1 text-[13px] text-text-dim">{pathway.subtitle}</p>
        </div>
        <ProgressRing value={progressPct} max={100} size={72} stroke={6} color={accent}>
          <div className="text-center">
            <p
              className="font-display text-[16px] font-bold leading-none"
              style={{ color: accent }}
            >
              {progressPct}%
            </p>
            <p className="text-[9px] uppercase tracking-[1.2px] text-text-mute">progress</p>
          </div>
        </ProgressRing>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {pathway.decoderTags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1.5 rounded-full border border-hairline-2 bg-bg-2 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[1px] text-text-dim"
          >
            {getDecoderLabel(tag)}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5 rounded-full border border-hairline-2 bg-bg-2 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[1px] text-text-mute">
          ~{pathway.estimatedMinutes} min
        </span>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
        <Link
          href={recommendedHref}
          className="ciq-press flex items-center justify-center gap-2 rounded-xl bg-brand py-3 font-display text-[14px] font-bold uppercase tracking-[0.5px] text-brand-ink shadow-brand-sm"
        >
          {isStart ? 'Start Pathway' : recommendedLabel}
          <span aria-hidden>→</span>
        </Link>
        <Link
          href={detailHref}
          className="ciq-press-soft flex items-center justify-center rounded-xl border border-hairline-2 bg-bg-2 px-4 py-3 font-display text-[13px] font-semibold text-text-dim transition-colors hover:text-text"
        >
          See chapters
        </Link>
      </div>
    </div>
  )
}

/**
 * V3 P4 — small "how this works" tile used in the Pathways hub strip.
 * Numbered eyebrow + bold label + one-sentence explanation; small
 * enough to fit three across on desktop and stack on mobile without
 * stealing attention from the active Pathway card.
 */
function HowItWorksTile({
  step,
  label,
  body,
}: {
  step: string
  label: string
  body: string
}) {
  return (
    <div className="rounded-2xl border border-hairline-2 bg-bg-1 p-3">
      <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[1.5px] text-text-mute">
        <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-bg-2 text-[10px] font-black text-brand">
          {step}
        </span>
        {label}
      </p>
      <p className="mt-1.5 text-[12px] leading-snug text-text">{body}</p>
    </div>
  )
}

function ComingSoonCard({ pathway }: { pathway: PathwayConfig }) {
  const accent = getAccentColor(pathway.accentToken ?? 'brand')
  const archetypeLabel = getArchetypeLabel(pathway.targetArchetype)

  return (
    <Link
      href={`/pathways/${pathway.slug}`}
      className="ciq-lift group relative flex h-full flex-col gap-3 overflow-hidden rounded-2xl border border-hairline-2 bg-bg-1 p-4 transition-colors hover:border-hairline"
    >
      <div className="flex items-center justify-between text-[10px] uppercase tracking-[1.5px]">
        <span style={{ color: accent }} className="font-bold">
          {archetypeLabel}
        </span>
        <span className="rounded-full border border-hairline bg-bg-2 px-2 py-0.5 font-bold text-text-mute">
          Coming soon
        </span>
      </div>

      <div>
        <p className="font-display text-[16px] font-bold leading-tight text-text">{pathway.title}</p>
        <p className="mt-1 text-[12px] leading-snug text-text-dim">{pathway.subtitle}</p>
      </div>

      <p className="text-[11px] leading-snug text-text-mute">{pathway.basketballProblem}</p>

      <div className="mt-auto flex flex-wrap gap-1.5">
        {pathway.decoderTags.slice(0, 3).map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full border border-hairline px-2 py-0.5 text-[9px] font-bold uppercase tracking-[1px] text-text-mute"
          >
            {getDecoderLabel(tag)}
          </span>
        ))}
      </div>

      <span
        className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-40 blur-xl transition-opacity group-hover:opacity-60"
        style={{ background: `${accent}33` }}
      />
    </Link>
  )
}

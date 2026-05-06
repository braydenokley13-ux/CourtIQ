/**
 * /pathways/[pathwaySlug] — Pathway detail / chapter map (PTH-1).
 *
 * Two render modes:
 *   1. Active pathway (Foundation in v1): hero, progress, recommended-
 *      next CTA, chapter list with skill nodes and decoder lessons.
 *   2. Coming-soon pathway: hero, parent/coach summary, decoder set,
 *      "Notify me" stub. Never crashes for an unknown active slug —
 *      404 instead.
 *
 * All /train links go through buildPathwayTrainHref.
 */

import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ProgressRing } from '@/components/ui'
import {
  buildBossChallengeTrainHref,
  buildMixedReadsTrainHref,
  buildSkillNodeTrainHref,
  countChapterScenarios,
  getAccentColor,
  getArchetypeLabel,
  getDecoderAccent,
  getDecoderLabel,
  getPathwayBySlug,
} from '@/lib/pathways/helpers'
import { BossChallengeRow, MixedReadsRow } from './BossMixedRows'
import { getPathwayProgress } from '@/lib/pathways/progressService'
import {
  pickPathwayCta,
  summarisePathwayProgress,
} from '@/lib/pathways/pathwayCta'
import {
  deriveMilestone,
  type PathwayMilestone,
  type PathwayMilestoneTone,
} from '@/lib/pathways/pathwayMilestones'
import type {
  PathwayChallengeAttemptSummary,
  PathwayChapterConfig,
  PathwayChapterProgress,
  PathwayConfig,
  PathwayProgressSummary,
  PathwaySkillNodeProgress,
  SkillNodeConfig,
  SkillNodeState,
} from '@/lib/pathways/types'

export const dynamic = 'force-dynamic'

const NODE_STATE_COPY: Record<SkillNodeState, { label: string; tone: string }> = {
  locked: { label: 'Locked', tone: 'text-text-mute' },
  unlocked: { label: 'Ready', tone: 'text-text-dim' },
  in_progress: { label: 'In progress', tone: 'text-iq' },
  completed: { label: 'Done', tone: 'text-info' },
  mastered: { label: 'Mastered', tone: 'text-brand' },
}

const CHAPTER_STATE_COPY: Record<SkillNodeState, { label: string; tone: string; emoji: string }> = {
  locked: { label: 'Locked', tone: 'text-text-mute', emoji: '🔒' },
  unlocked: { label: 'Start here', tone: 'text-text-dim', emoji: '⭐' },
  in_progress: { label: 'In progress', tone: 'text-iq', emoji: '🟢' },
  completed: { label: 'Done', tone: 'text-info', emoji: '✓' },
  mastered: { label: 'Mastered', tone: 'text-brand', emoji: '✅' },
}

export default async function PathwayDetailPage({
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

  // Coming-soon pathways skip the progress fetch since chapters[] is
  // empty.
  const progress = await getPathwayProgress(user.id, pathway.slug)

  if (pathway.comingSoon) {
    return <ComingSoonView pathway={pathway} />
  }

  return <ActivePathwayView pathway={pathway} progress={progress} />
}

function ComingSoonView({ pathway }: { pathway: PathwayConfig }) {
  const accent = getAccentColor(pathway.accentToken ?? 'brand')
  const archetypeLabel = getArchetypeLabel(pathway.targetArchetype)

  return (
    <main className="min-h-dvh bg-bg-0 p-5 text-text">
      <div className="mx-auto max-w-2xl space-y-6">
        <Link
          href="/pathways"
          className="text-[11px] uppercase tracking-[1.5px] text-text-dim hover:text-text"
        >
          ← All Pathways
        </Link>

        <header className="space-y-3 rounded-3xl border border-hairline-2 bg-gradient-to-br from-bg-1 to-bg-2 p-6">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[1.5px]"
              style={{ color: accent, borderColor: `${accent}55` }}
            >
              {archetypeLabel}
            </span>
            <span className="rounded-full border border-hairline bg-bg-2 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[1.5px] text-text-mute">
              Coming soon
            </span>
          </div>
          <h1 className="font-display text-[28px] font-bold leading-tight">{pathway.title}</h1>
          <p className="text-[14px] text-text-dim">{pathway.subtitle}</p>
          <p className="text-[13px] leading-relaxed text-text-dim">{pathway.description}</p>
        </header>

        <section className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-[1.5px] text-text-dim">
            What this Pathway solves
          </p>
          <p className="rounded-2xl border border-hairline-2 bg-bg-1 p-4 text-[14px] leading-relaxed text-text">
            {pathway.basketballProblem}
          </p>
        </section>

        <section className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-[1.5px] text-text-dim">
            Decoders trained
          </p>
          <div className="flex flex-wrap gap-2">
            {pathway.decoderTags.map((tag) => {
              const tagAccent = getAccentColor(getDecoderAccent(tag))
              return (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1.5 rounded-full border bg-bg-2 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[1px]"
                  style={{ color: tagAccent, borderColor: `${tagAccent}55` }}
                >
                  {getDecoderLabel(tag)}
                </span>
              )
            })}
          </div>
        </section>

        <section className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-[1.5px] text-text-dim">
            For coaches & parents
          </p>
          <p className="rounded-2xl border border-hairline-2 bg-bg-1 p-4 text-[13px] leading-relaxed text-text-dim">
            {pathway.coachSummary}
          </p>
        </section>

        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            disabled
            className="rounded-xl border border-hairline-2 bg-bg-2 py-3 font-display text-[13px] font-semibold uppercase tracking-[0.5px] text-text-mute"
          >
            Notify me
          </button>
          <Link
            href="/pathways/complete-iq-foundation"
            className="rounded-xl bg-brand py-3 text-center font-display text-[13px] font-bold uppercase tracking-[0.5px] text-brand-ink"
          >
            Train Foundation now
          </Link>
        </div>
      </div>
    </main>
  )
}

function ActivePathwayView({
  pathway,
  progress,
}: {
  pathway: PathwayConfig
  progress: PathwayProgressSummary | null
}) {
  const accent = getAccentColor(pathway.accentToken ?? 'brand')
  const archetypeLabel = getArchetypeLabel(pathway.targetArchetype)
  const progressPct = Math.round((progress?.pathwayProgress ?? 0) * 100)
  const recommended = progress?.recommendedNext ?? null
  const weakest = progress?.weakestDecoder ?? null
  // V1 Premiumization — central CTA + progress breakdown.
  const cta = pickPathwayCta({ pathway, progress, recommended })
  const breakdown = summarisePathwayProgress(pathway, progress, (tag) =>
    tag ? getDecoderLabel(tag) : null,
  )
  const hasAnyProgress = progressPct > 0 || progress?.pathwayMastered === true
  // V2-F — emotional milestone copy. Surfaced just under the hero so
  // every player lands on a clear "what matters next" beat that is
  // less abstract than the percentage ring.
  const milestone = deriveMilestone(pathway, progress ?? null)

  return (
    <main className="min-h-dvh bg-bg-0 p-5 text-text">
      <div className="mx-auto max-w-2xl space-y-6">
        <Link
          href="/pathways"
          className="text-[11px] uppercase tracking-[1.5px] text-text-dim hover:text-text"
        >
          ← All Pathways
        </Link>

        {/* Hero */}
        <header
          className="relative overflow-hidden rounded-3xl border-2 border-brand/40 bg-gradient-to-br from-bg-1 to-bg-2 p-6"
          style={{ boxShadow: `0 0 40px ${accent}1f, 0 1px 0 rgba(255,255,255,0.04) inset` }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[1.5px]"
              style={{ color: accent, borderColor: `${accent}55` }}
            >
              Trains the {archetypeLabel}
            </span>
            <span className="rounded-full border border-hairline-2 bg-bg-2 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[1.5px] text-text-mute">
              ~{pathway.estimatedMinutes} min
            </span>
            <span className="rounded-full border border-hairline-2 bg-bg-2 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[1.5px] text-text-mute">
              Difficulty {pathway.difficultyRange[0]}–{pathway.difficultyRange[1]}
            </span>
          </div>

          <div className="mt-4 flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-[28px] font-bold leading-tight text-text">
                {pathway.title}
              </h1>
              <p className="mt-1 text-[14px] text-text-dim">{pathway.subtitle}</p>
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

          {/* V2-F P3 — chapter timeline strip. Each chapter is a
              segment whose width represents authored rep count and
              whose fill represents server progress. The recommended
              chapter gets a brand outline + pulse so the eye lands
              on it before scrolling the chapter map. */}
          <div className="mt-4 grid auto-cols-fr grid-flow-col gap-1.5">
            {pathway.chapters.map((chapter, i) => {
              const chProgress = progress?.chapters[i]
              const tag = chapter.decoderTag
              const dotAccent = tag ? getAccentColor(getDecoderAccent(tag)) : accent
              const isMastered = chProgress?.state === 'mastered'
              const isInProgress =
                chProgress?.state === 'in_progress' ||
                chProgress?.state === 'completed' ||
                chProgress?.state === 'unlocked'
              const isRecommended = recommended?.chapterSlug === chapter.slug
              const fillPct = chProgress
                ? Math.max(
                    isMastered ? 100 : 0,
                    Math.round((chProgress.progress ?? 0) * 100),
                  )
                : 0
              const isLocked = !chProgress || chProgress.state === 'locked'
              return (
                <div
                  key={chapter.slug}
                  className={`relative h-2.5 overflow-hidden rounded-full bg-white/[0.06] ${
                    isRecommended ? 'ciq-pulse-attn' : ''
                  }`}
                  style={{
                    boxShadow: isRecommended
                      ? `inset 0 0 0 1px ${accent}88`
                      : undefined,
                  }}
                  aria-label={`Chapter ${chapter.order}${
                    isLocked
                      ? ' (locked)'
                      : isMastered
                        ? ' (mastered)'
                        : isRecommended
                          ? ' (recommended)'
                          : isInProgress
                            ? ' (in progress)'
                            : ''
                  }`}
                  title={`${chapter.title}${
                    isMastered ? ' — Mastered' : isRecommended ? ' — Up next' : ''
                  }`}
                >
                  {!isLocked ? (
                    <div
                      className="absolute inset-y-0 left-0 transition-[width] duration-500"
                      style={{
                        width: `${fillPct}%`,
                        background: dotAccent,
                        opacity: isMastered ? 1 : 0.85,
                      }}
                    />
                  ) : null}
                  {isMastered ? (
                    <span
                      aria-hidden
                      className="absolute right-1 top-1/2 -translate-y-1/2 text-[8px]"
                      style={{ color: '#062118' }}
                    >
                      ✓
                    </span>
                  ) : null}
                </div>
              )
            })}
          </div>
        </header>

        {/* V2-F — milestone strip. A single emotional line that
            anchors the page to a clear next-beat (mastered, capstone
            unlocked, X reps to mastery, cold-start). Hidden on the
            'fallback' tone so a returning player who has not earned
            a real milestone yet sees the CTA card without filler. */}
        {milestone.tone !== 'fallback' ? (
          <PathwayMilestoneStrip milestone={milestone} accent={accent} />
        ) : null}

        {/* V1 Premiumization — primary CTA. Centralized via pickPathwayCta
            so the player always sees the right next-action: cold-start
            label for first-time users, "Continue training" for mid-
            pathway, capstone framing for Final Mix unlocks, and a
            review/browse path for mastered pathways. */}
        <PathwayPrimaryCta cta={cta} pathway={pathway} />

        {/* V1 Premiumization — compact at-a-glance progress card. Always
            mounted (cold-start shows zeros) so Pathways feels like a
            home you return to, not a one-shot link. The "View your
            progress" deep-link sits inside this surface so it is one
            tap away for every player who has trained, regardless of
            how far down the chapter map they have scrolled. */}
        <PathwayProgressCard
          pathway={pathway}
          progressPct={progressPct}
          breakdown={breakdown}
          hasAnyProgress={hasAnyProgress}
        />

        {/* Parent / coach summary */}
        <section className="rounded-2xl border border-hairline-2 bg-bg-1 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[1.5px] text-text-dim">
            What you build here
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-text">{pathway.parentSummary}</p>
          {weakest ? (
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-heat/40 bg-heat/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[1px] text-heat">
              Watch this · {getDecoderLabel(weakest)}
            </p>
          ) : null}
        </section>

        {/* Chapter map */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-[1.5px] text-text-dim">
              Chapters
            </p>
            <p className="text-[10px] font-semibold uppercase tracking-[1.2px] text-text-mute tabular-nums">
              {breakdown.chaptersMastered}/{breakdown.totalChapters} mastered
            </p>
          </div>
          {pathway.chapters.map((chapter, i) => (
            <ChapterRow
              key={chapter.slug}
              pathway={pathway}
              pathwaySlug={pathway.slug}
              chapter={chapter}
              progress={progress?.chapters[i] ?? null}
              isHighlighted={recommended?.chapterSlug === chapter.slug}
              challengeAttempts={progress?.challengeAttempts ?? []}
            />
          ))}
        </section>

        <div className="flex gap-2 pt-2">
          <Link
            href="/pathways"
            className="rounded-xl bg-bg-2 px-5 py-3 font-display text-[13px] font-semibold text-text-dim"
          >
            All Pathways
          </Link>
          <Link
            href="/home"
            className="rounded-xl bg-bg-2 px-5 py-3 font-display text-[13px] font-semibold text-text-dim"
          >
            Home
          </Link>
        </div>
      </div>
    </main>
  )
}

/**
 * V1 Premiumization — primary CTA card. Centralizes copy + accent
 * across cold-start / continue / capstone / mastered / fallback so
 * every priority gets the same surface treatment but with branch-
 * appropriate framing. The CTA itself is sized as the page's most
 * prominent action — full-width, brand fill, large tap target —
 * because Pathways should feel like a home that always knows what
 * the player should do next.
 */
function PathwayPrimaryCta({
  cta,
  pathway,
}: {
  cta: ReturnType<typeof pickPathwayCta>
  pathway: PathwayConfig
}) {
  const isCelebratory = cta.priority === 'mastered' || cta.priority === 'capstone'
  const accentClass =
    cta.priority === 'mastered'
      ? 'border-brand/45 bg-brand/5'
      : cta.priority === 'capstone'
        ? 'border-iq/40 bg-iq/5'
        : 'border-brand/30 bg-bg-1'

  return (
    <section
      className={`rounded-2xl border p-4 ${accentClass}`}
      data-cta-priority={cta.priority}
    >
      <p
        className={[
          'text-[11px] font-semibold uppercase tracking-[1.5px]',
          cta.priority === 'capstone' ? 'text-iq' : 'text-brand',
        ].join(' ')}
      >
        {cta.eyebrow}
      </p>
      <p className="mt-2 font-display text-[18px] font-bold leading-tight">
        {cta.subline ?? pathway.title}
      </p>
      <Link
        href={cta.primaryHref}
        className={[
          'ciq-press mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl py-3 font-display text-[14px] font-bold uppercase tracking-[0.5px]',
          cta.priority === 'capstone'
            ? 'bg-iq text-bg-0 shadow-[0_0_24px_-6px_rgba(139,124,255,0.55)]'
            : 'bg-brand text-brand-ink shadow-brand-sm',
        ].join(' ')}
      >
        {cta.primaryLabel}
        <span aria-hidden>→</span>
      </Link>
      {isCelebratory ? (
        <p className="mt-2 text-center text-[11px] uppercase tracking-[1.2px] text-text-mute">
          {cta.priority === 'mastered'
            ? 'Re-run a chapter to keep the reads sharp.'
            : 'No decoder pill. Read the play.'}
        </p>
      ) : null}
    </section>
  )
}

/**
 * V2-F — emotional milestone strip. Sits between the hero and the
 * primary CTA so every returning player lands on a clear "what
 * matters next" beat that is less abstract than the percentage ring
 * (e.g. "1 rep to master Backdoor Window", "Final Mix unlocked",
 * "Pathway mastered"). The tone drives the accent — capstone uses
 * the iq purple, mastered uses brand mint, near-milestones use the
 * pathway's accent.
 */
function PathwayMilestoneStrip({
  milestone,
  accent,
}: {
  milestone: PathwayMilestone
  accent: string
}) {
  const tone = milestone.tone
  const dot = MILESTONE_DOT[tone] ?? accent
  // Tone-driven background tint. We layer a translucent fill on top of
  // bg-1 so the strip sits a notch brighter than the surrounding
  // surface without adopting a saturated background that would
  // compete with the primary CTA below it.
  const tintLayer =
    tone === 'mastered'
      ? 'bg-brand/10 border-brand/40'
      : tone === 'capstone-unlocked'
        ? 'bg-iq/10 border-iq/40'
        : tone === 'capstone-near'
          ? 'bg-iq/5 border-iq/30'
          : tone === 'chapter-near'
            ? 'bg-info/10 border-info/30'
            : 'bg-bg-1 border-hairline-2'

  // V2-G — capstone-unlocked + chapter-near surfaces also get a
  // single-shot attention pulse so the eye lands on the milestone
  // before the CTA. Mastered/cold-start skip the pulse since they
  // are persistent states, not "moments."
  const shouldPulse = tone === 'capstone-unlocked' || tone === 'chapter-near'

  return (
    <section
      data-milestone-tone={tone}
      className={`ciq-stage-in ${shouldPulse ? 'ciq-pulse-attn' : ''} flex items-center gap-3 rounded-2xl border px-4 py-3 ${tintLayer}`}
      role="status"
      aria-live="polite"
    >
      <span
        aria-hidden
        className="relative flex h-2.5 w-2.5 shrink-0"
      >
        <span
          className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-50"
          style={{ background: dot }}
        />
        <span
          className="relative inline-flex h-2.5 w-2.5 rounded-full"
          style={{ background: dot, boxShadow: `0 0 8px ${dot}` }}
        />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-display text-[14px] font-bold leading-snug text-text">
          {milestone.headline}
        </p>
        {milestone.detail ? (
          <p className="mt-0.5 text-[11px] leading-snug text-text-dim">
            {milestone.detail}
          </p>
        ) : null}
      </div>
    </section>
  )
}

const MILESTONE_DOT: Record<PathwayMilestoneTone, string> = {
  mastered: '#3BFF9D',
  'capstone-unlocked': '#8B7CFF',
  'capstone-near': '#8B7CFF',
  'chapter-near': '#3D9CFF',
  'cold-start': '#FFB070',
  fallback: '#7E8A9B',
}

/**
 * V1 Premiumization — compact progress home-base card. Shows the
 * pathway's progress at a glance + the deep-link into the per-
 * pathway progress view. Always rendered so cold-start players see
 * the same surface as returning players, just with zeros — the
 * point is the page should *feel* like a home, not a one-shot CTA.
 */
function PathwayProgressCard({
  pathway,
  progressPct,
  breakdown,
  hasAnyProgress,
}: {
  pathway: PathwayConfig
  progressPct: number
  breakdown: ReturnType<typeof summarisePathwayProgress>
  hasAnyProgress: boolean
}) {
  const repsCopy = breakdown.totalReps
    ? `${breakdown.bestReps}/${breakdown.totalReps} best reps`
    : 'No reps yet'
  return (
    <section className="rounded-2xl border border-hairline-2 bg-bg-1 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[1.5px] text-text-dim">
            Your progress
          </p>
          <p className="mt-1 font-display text-[16px] font-bold leading-tight">
            {progressPct}% pathway · {breakdown.chaptersMastered}/{breakdown.totalChapters} chapters mastered
          </p>
          <p className="mt-0.5 text-[12px] text-text-dim">{repsCopy}</p>
        </div>
        {breakdown.weakestDecoderLabel ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-heat/40 bg-heat/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[1px] text-heat">
            Watch · {breakdown.weakestDecoderLabel}
          </span>
        ) : null}
      </div>
      <Link
        href={`/pathways/${encodeURIComponent(pathway.slug)}/progress`}
        className="mt-3 flex items-center justify-between rounded-xl border border-hairline bg-bg-2 px-3 py-2.5 text-[11px] font-bold uppercase tracking-[1.5px] text-text-dim transition-colors hover:border-brand/40 hover:text-text"
      >
        <span>{hasAnyProgress ? 'View detailed progress' : 'Open progress view'}</span>
        <span aria-hidden>→</span>
      </Link>
    </section>
  )
}

function ChapterRow({
  pathway,
  pathwaySlug,
  chapter,
  progress,
  isHighlighted,
  challengeAttempts,
}: {
  pathway: PathwayConfig
  pathwaySlug: string
  chapter: PathwayChapterConfig
  progress: PathwayChapterProgress | null
  isHighlighted: boolean
  /** PTH-4: best server-persisted challenge attempts for the whole
   *  pathway. We pick the row(s) that match this chapter when
   *  rendering the boss/mixed CTA so a passed boss shows as cleared
   *  on first paint, regardless of localStorage. */
  challengeAttempts: readonly PathwayChallengeAttemptSummary[]
}) {
  const tag = chapter.decoderTag
  const accent = tag ? getAccentColor(getDecoderAccent(tag)) : getAccentColor('heat')
  const state = progress?.state ?? 'locked'
  const stateCopy = CHAPTER_STATE_COPY[state]
  const totalScenarios = countChapterScenarios(chapter)
  const chapterProgressPct = Math.round((progress?.progress ?? 0) * 100)
  const isCapstone = chapter.decoderTag === null
  const decoderAccPct =
    progress?.decoderAccuracy != null ? Math.round(progress.decoderAccuracy * 100) : null

  // PTH-3: a boss is "ready" once any non-boss skill node has been
  // attempted. We keep the gate simple — strict "all nodes mastered"
  // would block early experimentation, and the warning copy ("Practice
  // first recommended") still nudges the right behavior.
  const nonBossAttempts = progress?.skillNodes.reduce(
    (acc, n) => acc + (n.attemptedCount > 0 ? 1 : 0),
    0,
  ) ?? 0
  const allNonBossMastered =
    chapter.skillNodes.length > 0 &&
    chapter.skillNodes.every((n) => {
      const np = progress?.skillNodes.find((p) => p.slug === n.slug)
      return np?.state === 'mastered'
    })
  const bossReady = nonBossAttempts > 0
  const bossHref = buildBossChallengeTrainHref(pathway, chapter)
  const mixedHref = isCapstone ? buildMixedReadsTrainHref(pathway, chapter) : null

  // PTH-4: pick the matching server-persisted attempts for this chapter.
  // We pass `serverCleared` truthy when the best attempt for that
  // mode has `passed: true` — the BossMixedRows island then renders
  // the cleared decoration without needing localStorage.
  const bossServerAttempt = chapter.bossChallenge
    ? challengeAttempts.find(
        (a) =>
          a.chapterSlug === chapter.slug &&
          a.mode === 'boss-challenge' &&
          a.challengeSlug === chapter.bossChallenge!.slug,
      ) ?? null
    : null
  const mixedNodeForCapstone = chapter.skillNodes.find((n) => n.trainingMode === 'mixed-reads')
  const mixedChallengeSlug = mixedNodeForCapstone?.slug ?? chapter.slug
  const mixedServerAttempt = isCapstone
    ? challengeAttempts.find(
        (a) =>
          a.chapterSlug === chapter.slug &&
          a.mode === 'mixed-reads' &&
          (a.challengeSlug === mixedChallengeSlug || a.challengeSlug === chapter.slug),
      ) ?? null
    : null

  return (
    <article
      data-chapter-state={state}
      className={[
        'ciq-lift relative overflow-hidden rounded-2xl border-2 bg-bg-1 transition-colors',
        isHighlighted ? 'border-brand/50 ciq-pulse-attn' : 'border-hairline-2',
        state === 'locked' ? 'opacity-70' : '',
      ].join(' ')}
    >
      <div
        className="absolute inset-x-0 top-0 h-0.5"
        style={{ background: state === 'locked' ? 'rgba(255,255,255,0.05)' : accent }}
      />

      <div className="space-y-3 p-4">
        <div className="flex items-center justify-between text-[10px] uppercase tracking-[1.5px]">
          <span className="font-bold text-text-mute">
            Chapter {chapter.order}
            {isCapstone ? ' · Capstone' : ''}
          </span>
          <span className={`flex items-center gap-1 ${stateCopy.tone}`}>
            <span aria-hidden>{stateCopy.emoji}</span>
            {stateCopy.label}
          </span>
        </div>

        <div>
          <h3 className="font-display text-[18px] font-bold leading-tight text-text">
            {chapter.title}
          </h3>
          <p className="mt-1 text-[12px] leading-snug text-text-dim">{chapter.subtitle}</p>
        </div>

        <p className="text-[12px] italic leading-snug text-text-mute">{chapter.basketballCue}</p>

        <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[1px]">
          {chapter.decoderTags && chapter.decoderTags.length > 0 ? (
            chapter.decoderTags.map((decoderTag) => {
              const decoderAccent = getAccentColor(getDecoderAccent(decoderTag))
              return (
                <span
                  key={decoderTag}
                  className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-bold"
                  style={{ color: decoderAccent, borderColor: `${decoderAccent}55` }}
                >
                  {getDecoderLabel(decoderTag)}
                </span>
              )
            })
          ) : null}
          <span className="rounded-full border border-hairline px-2 py-0.5 font-bold text-text-mute">
            {totalScenarios} {totalScenarios === 1 ? 'rep' : 'reps'}
          </span>
          {decoderAccPct !== null ? (
            <span className="rounded-full border border-hairline px-2 py-0.5 font-bold text-text-mute">
              {decoderAccPct}% accuracy
            </span>
          ) : null}
        </div>

        {/* Skill node row */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {chapter.skillNodes.map((node) => {
            const nodeProgress = progress?.skillNodes.find((n) => n.slug === node.slug)
            return (
              <SkillNodeTile
                key={node.slug}
                pathwaySlug={pathwaySlug}
                chapterSlug={chapter.slug}
                node={node}
                state={nodeProgress?.state ?? 'locked'}
                bestCount={nodeProgress?.bestCount ?? 0}
                attemptedCount={nodeProgress?.attemptedCount ?? 0}
              />
            )
          })}
        </div>

        {/* PTH-3 → PTH-5: Boss challenge — real launch CTA. Cleared
            decoration is driven by the server-persisted attempt when
            available, with localStorage as a fallback for the in-flight
            first paint. PTH-5 also threads the full challengeState so
            an attempted-but-failed boss prompts "Run it back" with the
            user's last score. */}
        {chapter.bossChallenge && bossHref ? (
          <BossChallengeRow
            pathwaySlug={pathwaySlug}
            chapter={chapter}
            href={bossHref}
            ready={bossReady}
            recommended={allNonBossMastered}
            disabled={state === 'locked'}
            serverCleared={bossServerAttempt?.passed ?? false}
            challengeState={progress?.challengeState ?? null}
          />
        ) : null}

        {/* PTH-3 → PTH-5: Mixed Reads / capstone CTA — only on the
            Real Game Mix chapter, where decoderTag is null and the
            player has to identify the cue without the decoder pill.
            Server-cleared state and attempted-but-failed copy hydrate
            from progress.challengeState. */}
        {isCapstone && mixedHref ? (
          <MixedReadsRow
            pathwaySlug={pathwaySlug}
            chapter={chapter}
            href={mixedHref}
            disabled={state === 'locked'}
            challengeSlug={mixedChallengeSlug}
            serverCleared={mixedServerAttempt?.passed ?? false}
            challengeState={progress?.challengeState ?? null}
          />
        ) : null}

        {/* Chapter-level CTA — built from the first un-mastered skill
            node so the player drops straight into the right reps. */}
        {state !== 'locked' ? (
          <ChapterCta pathwaySlug={pathwaySlug} chapter={chapter} progress={progress} />
        ) : (
          <p className="rounded-xl border border-hairline-2 bg-bg-2 p-3 text-[11px] uppercase tracking-[1.5px] text-text-mute">
            Unlocks once the previous chapter is mastered.
          </p>
        )}
      </div>

      {state !== 'locked' ? (
        <div className="h-1.5 bg-bg-2">
          <div
            className="h-full transition-all"
            style={{ width: `${chapterProgressPct}%`, background: accent }}
          />
        </div>
      ) : null}
    </article>
  )
}

function SkillNodeTile({
  pathwaySlug,
  chapterSlug,
  node,
  state,
  bestCount,
  attemptedCount,
}: {
  pathwaySlug: string
  chapterSlug: string
  node: SkillNodeConfig
  state: SkillNodeState
  bestCount: number
  attemptedCount: number
}) {
  const stateCopy = NODE_STATE_COPY[state]
  const total = node.scenarioIds.length
  const isLocked = state === 'locked'
  const isMastered = state === 'mastered'

  const tile = (
    <div
      className={[
        'flex h-full flex-col gap-2 rounded-xl border bg-bg-2 p-3 transition-colors',
        isLocked ? 'border-hairline-2 opacity-70' : 'border-hairline hover:border-hairline-2',
        isMastered ? 'border-brand/40' : '',
      ].join(' ')}
    >
      <div className="flex items-center justify-between text-[10px] uppercase tracking-[1.5px]">
        <span className="font-bold text-text-mute">Step {node.order}</span>
        <span className={stateCopy.tone}>{stateCopy.label}</span>
      </div>
      <p className="font-display text-[13px] font-semibold leading-tight text-text">
        {node.title}
      </p>
      {node.subtitle ? (
        <p className="text-[11px] leading-snug text-text-dim">{node.subtitle}</p>
      ) : null}
      <div className="mt-auto flex items-center justify-between text-[10px] text-text-mute">
        <span>
          {total} {total === 1 ? 'rep' : 'reps'}
        </span>
        {attemptedCount > 0 ? (
          <span>
            {bestCount}/{total} best
          </span>
        ) : null}
      </div>
      {node.academyLessonSlug ? (
        <Link
          href={`/academy/${node.academyLessonSlug}`}
          className="text-[10px] font-bold uppercase tracking-[1.5px] text-iq hover:underline"
        >
          Read the lesson →
        </Link>
      ) : null}
    </div>
  )

  if (isLocked) return tile
  return (
    <Link
      href={buildSkillNodeTrainHref(node, { pathwaySlug, chapterSlug })}
      className="block transition-transform active:scale-[0.99]"
    >
      {tile}
    </Link>
  )
}

function ChapterCta({
  pathwaySlug,
  chapter,
  progress,
}: {
  pathwaySlug: string
  chapter: PathwayChapterConfig
  progress: PathwayChapterProgress | null
}) {
  // Pick the first un-mastered, non-locked skill node — that's what
  // tapping "Continue chapter" should drop the player into.
  let target: SkillNodeConfig | null = null
  for (const node of chapter.skillNodes) {
    const nodeProgress = progress?.skillNodes.find(
      (n: PathwaySkillNodeProgress) => n.slug === node.slug,
    )
    if (nodeProgress?.state === 'locked') continue
    if (nodeProgress?.state === 'mastered') continue
    target = node
    break
  }
  if (!target) target = chapter.skillNodes[0] ?? null
  if (!target) return null

  const isFresh = !progress || progress.attemptedCount === 0
  const verb = isFresh ? 'Start chapter' : 'Continue chapter'

  return (
    <Link
      href={buildSkillNodeTrainHref(target, { pathwaySlug, chapterSlug: chapter.slug })}
      className="ciq-press flex items-center justify-center gap-2 rounded-xl bg-brand py-2.5 font-display text-[13px] font-bold uppercase tracking-[0.5px] text-brand-ink shadow-brand-sm"
    >
      {verb}
      <span aria-hidden>→</span>
    </Link>
  )
}

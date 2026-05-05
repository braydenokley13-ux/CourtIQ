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
import { getPathwayProgress } from '@/lib/pathways/progressService'
import type {
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

          <div className="mt-4 flex flex-wrap gap-1.5">
            {pathway.chapters.map((chapter, i) => {
              const chProgress = progress?.chapters[i]
              const tag = chapter.decoderTag
              const dotAccent = tag ? getAccentColor(getDecoderAccent(tag)) : accent
              const filled =
                chProgress?.state === 'mastered' ||
                chProgress?.state === 'completed' ||
                chProgress?.state === 'in_progress'
              return (
                <span
                  key={chapter.slug}
                  className="inline-flex h-2 w-6 rounded-full"
                  style={{
                    background: filled ? dotAccent : 'rgba(255,255,255,0.06)',
                  }}
                  aria-label={`Chapter ${chapter.order} ${chProgress?.state ?? 'locked'}`}
                />
              )
            })}
          </div>
        </header>

        {/* Recommended next */}
        {recommended ? (
          <section className="rounded-2xl border border-brand/30 bg-bg-1 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[1.5px] text-brand">
              Up next
            </p>
            <p className="mt-2 font-display text-[18px] font-bold leading-tight">
              {recommended.label}
            </p>
            <Link
              href={recommended.trainHref}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-3 font-display text-[14px] font-bold uppercase tracking-[0.5px] text-brand-ink"
            >
              {progressPct === 0 ? 'Start training' : 'Continue training'}
              <span aria-hidden>→</span>
            </Link>
          </section>
        ) : progress?.pathwayMastered ? (
          <section className="rounded-2xl border border-brand/40 bg-bg-1 p-4 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[1.5px] text-brand">
              Pathway mastered
            </p>
            <p className="mt-2 font-display text-[18px] font-bold leading-tight">
              You completed Complete IQ Foundation.
            </p>
            <p className="mt-2 text-[13px] text-text-dim">
              Re-run a chapter to keep the reads sharp, or tap a coming-soon Pathway to vote up
              what we ship next.
            </p>
            <Link
              href="/pathways"
              className="mt-3 inline-flex items-center justify-center gap-1 rounded-xl border border-hairline-2 bg-bg-2 px-4 py-2 font-display text-[13px] font-semibold text-text-dim"
            >
              Browse Pathways
            </Link>
          </section>
        ) : null}

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
          <p className="text-[11px] font-semibold uppercase tracking-[1.5px] text-text-dim">
            Chapters
          </p>
          {pathway.chapters.map((chapter, i) => (
            <ChapterRow
              key={chapter.slug}
              pathway={pathway}
              pathwaySlug={pathway.slug}
              chapter={chapter}
              progress={progress?.chapters[i] ?? null}
              isHighlighted={recommended?.chapterSlug === chapter.slug}
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

function ChapterRow({
  pathway,
  pathwaySlug,
  chapter,
  progress,
  isHighlighted,
}: {
  pathway: PathwayConfig
  pathwaySlug: string
  chapter: PathwayChapterConfig
  progress: PathwayChapterProgress | null
  isHighlighted: boolean
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

  return (
    <article
      className={[
        'relative overflow-hidden rounded-2xl border-2 bg-bg-1 transition-colors',
        isHighlighted ? 'border-brand/50' : 'border-hairline-2',
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

        {/* PTH-3: Boss challenge — real launch CTA when boss config
            exists. Locked → coming-soon style; unlocked-but-cold →
            "Practice first recommended" tag; mastered → boss is the
            recommended next step. */}
        {chapter.bossChallenge && bossHref ? (
          <BossChallengeRow
            chapter={chapter}
            href={bossHref}
            ready={bossReady}
            recommended={allNonBossMastered}
            disabled={state === 'locked'}
          />
        ) : null}

        {/* PTH-3: Mixed Reads / capstone CTA — only on the Real Game
            Mix chapter, where decoderTag is null and the player has
            to identify the cue without the decoder pill. */}
        {isCapstone && mixedHref ? (
          <MixedReadsRow chapter={chapter} href={mixedHref} disabled={state === 'locked'} />
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

function BossChallengeRow({
  chapter,
  href,
  ready,
  recommended,
  disabled,
}: {
  chapter: PathwayChapterConfig
  href: string
  ready: boolean
  recommended: boolean
  disabled: boolean
}) {
  const boss = chapter.bossChallenge!
  const cleanTitle = boss.title.replace(/^Boss\s*[—-]\s*/, '')
  const ctaLabel = recommended ? 'Run the Boss' : ready ? 'Try the Boss' : 'Try the Boss anyway'
  const tone = recommended
    ? 'border-heat/60 bg-heat/15 text-heat shadow-heat'
    : 'border-heat/40 bg-heat/5 text-heat'
  const subline = recommended
    ? 'Chapter mastered. Lock it in.'
    : ready
      ? boss.subtitle
      : 'Practice first recommended.'
  return (
    <div className={`space-y-2 rounded-xl border p-3 ${tone}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[1.5px]">
          Boss · {cleanTitle}
        </p>
        <span className="rounded-full border border-heat/40 bg-bg-2 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[1px] text-text-mute">
          {boss.scenarioIds.length} reps · no hints
        </span>
      </div>
      <p className="text-[12px] text-text-dim">{subline}</p>
      {disabled ? (
        <p className="rounded-lg border border-hairline-2 bg-bg-2 px-3 py-2 text-center text-[10px] uppercase tracking-[1.5px] text-text-mute">
          Unlocks once the chapter starts
        </p>
      ) : (
        <Link
          href={href}
          className="flex items-center justify-center gap-2 rounded-lg bg-heat/90 py-2.5 text-center font-display text-[12px] font-bold uppercase tracking-[1px] text-bg-0 transition-transform active:scale-[0.99]"
        >
          {ctaLabel}
          <span aria-hidden>→</span>
        </Link>
      )}
    </div>
  )
}

function MixedReadsRow({
  chapter,
  href,
  disabled,
}: {
  chapter: PathwayChapterConfig
  href: string
  disabled: boolean
}) {
  return (
    <div className="space-y-2 rounded-xl border border-iq/40 bg-iq/5 p-3 text-iq">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[1.5px]">
          Mixed Reads · {chapter.title}
        </p>
        <span className="rounded-full border border-iq/40 bg-bg-2 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[1px] text-text-mute">
          No decoder pill
        </span>
      </div>
      <p className="text-[12px] text-text-dim">
        Read the play, not the decoder. {countChapterScenarios(chapter)} reps.
      </p>
      {disabled ? (
        <p className="rounded-lg border border-hairline-2 bg-bg-2 px-3 py-2 text-center text-[10px] uppercase tracking-[1.5px] text-text-mute">
          Unlocks after Chapter 4
        </p>
      ) : (
        <Link
          href={href}
          className="flex items-center justify-center gap-2 rounded-lg bg-iq/90 py-2.5 text-center font-display text-[12px] font-bold uppercase tracking-[1px] text-bg-0 transition-transform active:scale-[0.99]"
        >
          Run Mixed Reads
          <span aria-hidden>→</span>
        </Link>
      )}
    </div>
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
      className="flex items-center justify-center gap-2 rounded-xl bg-brand py-2.5 font-display text-[13px] font-bold uppercase tracking-[0.5px] text-brand-ink shadow-brand-sm transition-transform active:scale-[0.99]"
    >
      {verb}
      <span aria-hidden>→</span>
    </Link>
  )
}

'use client'

import Link from 'next/link'
import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  buildBossChallengeTrainHref,
  buildMixedReadsTrainHref,
  buildPathwayDetailHref,
  buildPathwayTrainHref,
  getChapterBySlug,
  getPathwayBySlug,
} from '@/lib/pathways/helpers'
import type {
  PathwayChapterConfig,
  PathwayConfig,
  PathwayProgressSummary,
} from '@/lib/pathways/types'
import {
  isPassingAttempt,
  recordChallengeAttempt,
  type ChallengeMode,
} from '@/lib/pathways/localChallengeProgress'

type ModuleSummary = {
  slug: string
  title: string
  state: 'locked' | 'new' | 'in_progress' | 'mastered'
  scenario_count: number
  rolling_accuracy: number
  attempts: number
  concept_id: string
}

export default function TrainSummaryPage() {
  return (
    <Suspense fallback={<SummaryFallback />}>
      <SummaryContent />
    </Suspense>
  )
}

function SummaryFallback() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg-0 text-text">
      <p className="text-sm text-text-dim">Loading your results…</p>
    </main>
  )
}

function rankFromAccuracy(pct: number): { label: string; tone: string } {
  if (pct >= 90) return { label: 'Lights out', tone: 'text-brand' }
  if (pct >= 70) return { label: 'Big game', tone: 'text-brand' }
  if (pct >= 50) return { label: 'Solid effort', tone: 'text-iq' }
  if (pct >= 30) return { label: 'Keep working', tone: 'text-xp' }
  return { label: "Let's run it back", tone: 'text-heat' }
}

function SummaryContent() {
  const params = useSearchParams()
  const correct = Number(params.get('correct') ?? 0)
  const total = Number(params.get('total') ?? 0)
  const xp = Number(params.get('xp') ?? 0)
  const iq = Number(params.get('iq') ?? 0)
  const duration = Number(params.get('duration') ?? 0)
  const concept = params.get('concept') ?? ''
  // PTH-2 pathway context, only present when /train was entered via
  // a Pathway link.
  const pathwaySlug = params.get('pathway')
  const chapterSlug = params.get('chapter')
  const nodeSlug = params.get('node')
  // PTH-3 challenge mode — flips the summary into pass/fail framing.
  const modeParam = params.get('mode')
  const challengeMode: ChallengeMode | null =
    modeParam === 'boss-challenge' || modeParam === 'mixed-reads' ? modeParam : null

  const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0
  const rank = rankFromAccuracy(accuracy)
  const seconds = Math.max(1, Math.round(duration / 1000))

  // Pathway data — derived from helpers (config) + a single
  // /api/pathways/.../progress fetch.
  const pathway: PathwayConfig | null = pathwaySlug ? getPathwayBySlug(pathwaySlug) : null
  const chapter: PathwayChapterConfig | null =
    pathway && chapterSlug ? getChapterBySlug(pathway, chapterSlug) : null

  const [pathwayProgress, setPathwayProgress] = useState<PathwayProgressSummary | null>(null)
  const [pathwayProgressLoading, setPathwayProgressLoading] = useState<boolean>(Boolean(pathway))

  useEffect(() => {
    if (!pathway) return
    let alive = true
    void (async () => {
      try {
        const res = await fetch(
          `/api/pathways/${encodeURIComponent(pathway.slug)}/progress`,
        )
        if (!alive) return
        if (res.ok) {
          const body = (await res.json()) as PathwayProgressSummary
          setPathwayProgress(body)
        }
      } catch {
        // Soft-fail: the Pathway block falls back to a plain
        // "Back to Pathway" link.
      } finally {
        if (alive) setPathwayProgressLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [pathway])

  const [nextModule, setNextModule] = useState<ModuleSummary | null>(null)

  useEffect(() => {
    // The Academy "Try next" suggestion is specific to non-Pathway
    // sessions. A Pathway session has its own Up Next CTA driven by
    // recommendedNext, so don't double up.
    if (pathway) return
    let alive = true
    void (async () => {
      try {
        const res = await fetch('/api/academy/modules')
        if (!res.ok) return
        const body = (await res.json()) as { modules?: ModuleSummary[] }
        if (!alive) return
        const list = body.modules ?? []
        const candidate =
          list.find((m) => m.state === 'in_progress' && m.concept_id !== concept) ??
          list.find((m) => m.state === 'new' && m.concept_id !== concept) ??
          list.find((m) => m.state === 'in_progress') ??
          list.find((m) => m.state === 'new') ??
          null
        setNextModule(candidate)
      } catch {
        // ignore — summary still works without a suggestion
      }
    })()
    return () => {
      alive = false
    }
  }, [concept, pathway])

  // PTH-3: Boss / mixed-reads pass-fail computation. Pass criteria
  // come from the chapter's bossChallenge (boss) or the chapter's
  // own passCriteria (mixed reads). v1 uses correct count as a
  // bestCount approximation — see localChallengeProgress.ts.
  const passRatio =
    challengeMode === 'boss-challenge'
      ? chapter?.bossChallenge?.passCriteria.bossBestRatio ?? 0.8
      : challengeMode === 'mixed-reads'
        ? // Mixed reads passes on a high score across the chapter.
          0.7
        : null
  const passed =
    challengeMode != null && total > 0
      ? isPassingAttempt(correct, total, passRatio)
      : false
  const passPct = passRatio != null ? Math.round(passRatio * 100) : null

  // Mirror the result into localStorage so the pathway detail page
  // can show "Cleared" without re-fetching. /train already does this
  // on the way through, but we re-record here to cover the case
  // where the user lands on summary via direct URL (e.g. shared link
  // or back-button).
  // PTH-4: also dual-write to the server here. /train normally posts
  // first, but covering this path means a direct link to /train/summary
  // still promotes the result to account-level state.
  useEffect(() => {
    if (!challengeMode) return
    if (!pathwaySlug || !chapterSlug) return
    if (total <= 0) return
    const challengeSlug =
      challengeMode === 'boss-challenge'
        ? nodeSlug ?? `${chapterSlug}-boss`
        : nodeSlug ?? chapterSlug
    try {
      recordChallengeAttempt({
        pathwaySlug,
        chapterSlug,
        mode: challengeMode,
        challengeSlug,
        bestCount: correct,
        total,
        scenarioIds: [],
        passRatio,
      })
    } catch {
      // ignore
    }

    // PTH-4: server dual-write — best-effort. If this fails the
    // localStorage write above still drives the immediate UI; the
    // pathway detail page falls back to that signal.
    void (async () => {
      try {
        await fetch('/api/pathways/challenge-attempt', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            pathwaySlug,
            chapterSlug,
            mode: challengeMode,
            challengeSlug,
            sessionRunId: params.get('sessionId'),
            total,
          }),
        })
      } catch (err) {
        console.warn('[pathways/challenge-attempt] server write failed', err)
      }
    })()
  }, [challengeMode, pathwaySlug, chapterSlug, nodeSlug, correct, total, passRatio, params])

  // Retry hrefs — boss replays the canonical boss scenario set;
  // mixed-reads replays the chapter's mixed scenario set.
  const retryHref =
    challengeMode === 'boss-challenge' && pathway && chapter
      ? buildBossChallengeTrainHref(pathway, chapter)
      : challengeMode === 'mixed-reads' && pathway && chapter
        ? buildMixedReadsTrainHref(pathway, chapter, { nodeSlug })
        : null

  return (
    <main className="min-h-dvh bg-bg-0 p-5 text-text">
      <div className="mx-auto max-w-md space-y-4">
        {challengeMode ? (
          <ChallengeHero
            mode={challengeMode}
            chapterTitle={chapter?.title ?? null}
            bossTitle={chapter?.bossChallenge?.title ?? null}
            correct={correct}
            total={total}
            passed={passed}
            passPct={passPct}
            seconds={seconds}
          />
        ) : (
          <motion.header
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
            className="rounded-3xl border-2 border-brand bg-gradient-to-br from-bg-1 to-bg-2 p-6 text-center shadow-brand-sm"
          >
            <p className={`text-[12px] font-semibold uppercase tracking-[2px] ${rank.tone}`}>
              {rank.label}
            </p>
            <p className="mt-2 font-display text-[44px] font-black leading-none tracking-tight text-text">
              {correct}<span className="text-text-dim">/{total}</span>
            </p>
            <p className="mt-1 text-sm text-text-dim">{accuracy}% right · {seconds}s</p>
            {chapter ? (
              <p className="mt-3 text-[12px] font-semibold uppercase tracking-[1.5px] text-text-dim">
                You trained · {chapter.title}
              </p>
            ) : null}
          </motion.header>
        )}

        {/* Reward grid */}
        <div className="grid grid-cols-2 gap-3">
          <RewardStat label="XP earned" value={`+${xp}`} accent="xp" />
          <RewardStat
            label="IQ change"
            value={`${iq > 0 ? '+' : ''}${iq}`}
            accent={iq >= 0 ? 'iq' : 'heat'}
          />
        </div>

        {/* Pathway block — surfaces Continue / Back when /train was
            entered via a Pathway link. */}
        {pathway ? (
          <PathwayCtaBlock
            pathway={pathway}
            chapter={chapter}
            currentNodeSlug={nodeSlug}
            progress={pathwayProgress}
            loading={pathwayProgressLoading}
          />
        ) : null}

        {/* What improved */}
        <div className="rounded-2xl border border-hairline-2 bg-bg-1 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[1.5px] text-text-dim">
            What just happened
          </p>
          <ul className="mt-2 space-y-1.5 text-sm text-text">
            <li className="flex items-start gap-2">
              <span aria-hidden className="mt-0.5 text-brand">▶</span>
              <span>You finished {total} {total === 1 ? 'play' : 'plays'} in {seconds} seconds.</span>
            </li>
            <li className="flex items-start gap-2">
              <span aria-hidden className="mt-0.5 text-brand">▶</span>
              <span>You earned <strong className="text-xp">+{xp} XP</strong> toward your next level.</span>
            </li>
            {iq !== 0 && (
              <li className="flex items-start gap-2">
                <span aria-hidden className="mt-0.5 text-brand">▶</span>
                <span>
                  Your IQ {iq > 0 ? 'went up' : 'dipped'} by{' '}
                  <strong className={iq > 0 ? 'text-brand' : 'text-heat'}>
                    {iq > 0 ? '+' : ''}
                    {iq}
                  </strong>
                  .
                </span>
              </li>
            )}
            {accuracy >= 80 && (
              <li className="flex items-start gap-2">
                <span aria-hidden className="mt-0.5 text-brand">▶</span>
                <span>Mastery on this concept moved up. Nice reads.</span>
              </li>
            )}
          </ul>
        </div>

        {/* Suggested next — only for non-Pathway sessions; Pathway
            sessions already get a dedicated Up Next via PathwayCtaBlock. */}
        {!pathway && nextModule && (
          <Link
            href={`/academy/${nextModule.slug}`}
            className="block rounded-2xl border border-hairline-2 bg-bg-1 p-4 active:scale-[0.99]"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[1.5px] text-iq">Try next</p>
            <p className="mt-1 font-display text-[16px] font-bold text-text">{nextModule.title}</p>
            <p className="mt-0.5 text-[13px] text-text-dim">
              {nextModule.scenario_count} {nextModule.scenario_count === 1 ? 'play' : 'plays'} ·{' '}
              {nextModule.state === 'in_progress' ? 'Pick up where you left off' : 'Start lesson'}
            </p>
          </Link>
        )}

        {/* Actions — Pathway sessions hide "Back to lessons" so the
            user lands back on the Pathway map by default. PTH-3
            challenge runs swap to retry/continue framing. */}
        {challengeMode && pathway ? (
          <ChallengeActions
            mode={challengeMode}
            passed={passed}
            retryHref={retryHref}
            pathwayHref={buildPathwayDetailHref(pathway.slug)}
            pathwaySlug={pathway.slug}
          />
        ) : (
          <div className="grid grid-cols-2 gap-3 pt-2">
            <Link
              href={
                pathway
                  ? buildPathwayTrainHref({
                      pathwaySlug: pathway.slug,
                      chapterSlug: chapter?.slug ?? null,
                      nodeSlug: nodeSlug ?? null,
                    })
                  : concept
                    ? `/train?concept=${encodeURIComponent(concept)}`
                    : '/train'
              }
              className="rounded-xl bg-brand py-3.5 text-center font-display text-[14px] font-bold uppercase tracking-[0.5px] text-brand-ink shadow-brand-sm active:scale-[0.99]"
            >
              Play again
            </Link>
            <Link
              href={pathway ? buildPathwayDetailHref(pathway.slug) : '/academy'}
              className="rounded-xl border border-hairline-2 bg-bg-1 py-3.5 text-center font-display text-[14px] font-semibold text-text active:scale-[0.99]"
            >
              {pathway ? 'Back to Pathway' : 'Back to lessons'}
            </Link>
          </div>
        )}

        <Link
          href="/home"
          className="block rounded-xl bg-bg-2 py-3 text-center font-display text-[13px] font-semibold text-text-dim"
        >
          Home
        </Link>
      </div>
    </main>
  )
}

function PathwayCtaBlock({
  pathway,
  chapter,
  currentNodeSlug,
  progress,
  loading,
}: {
  pathway: PathwayConfig
  chapter: PathwayChapterConfig | null
  currentNodeSlug: string | null
  progress: PathwayProgressSummary | null
  loading: boolean
}) {
  const recommended = progress?.recommendedNext ?? null
  const chapterProgress = chapter
    ? progress?.chapters.find((c) => c.slug === chapter.slug)
    : null

  // Pull the recommended-next chapter title from config (helpers stays
  // pure / client-safe, so this is a cheap synchronous lookup).
  const nextChapter =
    recommended && pathway
      ? pathway.chapters.find((c) => c.slug === recommended.chapterSlug) ?? null
      : null

  const chapterMastered = chapterProgress?.state === 'mastered'
  const justFinishedChapter = Boolean(
    chapter &&
      currentNodeSlug &&
      chapter.skillNodes.length > 0 &&
      chapter.skillNodes[chapter.skillNodes.length - 1]!.slug === currentNodeSlug,
  )

  // Headline copy:
  //  - chapter mastered → celebrate
  //  - finished the last node of the chapter (but not yet mastered) →
  //    "chapter complete, here's what's next"
  //  - mid-chapter → keep it simple
  let headline: string
  if (chapterMastered && chapter) {
    headline = `Chapter complete: ${chapter.title}`
  } else if (justFinishedChapter && chapter) {
    headline = `You finished ${chapter.title}`
  } else {
    headline = `Pathway · ${pathway.title}`
  }

  const upNextLabel = recommended?.label ?? null
  const upNextHref = recommended?.trainHref ?? null

  // V1 Premiumization — show a visible "+X reps" delta when the
  // current rep contributed a best to the chapter. progress.bestCount
  // is post-attempt (the API rolls up server-side before /train calls
  // /complete), so we surface a "best so far" rather than a delta the
  // page would have to derive separately.
  const bestRatio = chapterProgress
    ? `${chapterProgress.bestCount}/${chapterProgress.totalScenarios}`
    : null

  return (
    <div className="space-y-2 rounded-2xl border border-brand/30 bg-brand/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[1.5px] text-brand">
            Pathway progress
          </p>
          <p className="mt-1 font-display text-[16px] font-bold leading-tight text-text">
            {headline}
          </p>
          {chapterProgress ? (
            <p className="mt-1 text-[12px] text-text-dim">
              {chapterProgress.bestCount}/{chapterProgress.totalScenarios} best ·{' '}
              {Math.round(chapterProgress.progress * 100)}% chapter progress
            </p>
          ) : null}
        </div>
        <div className="text-right">
          <p className="font-display text-[20px] font-black leading-none text-brand">
            {Math.round((progress?.pathwayProgress ?? 0) * 100)}%
          </p>
          <p className="text-[10px] uppercase tracking-[1.2px] text-text-mute">pathway</p>
        </div>
      </div>

      {/* V1 Premiumization — chapter mastery progress bar so the player
          sees how this rep moved their chapter forward, not just the
          static percentage chip. Renders only when we have chapter
          progress; the chip above stays for the bigger pathway %. */}
      {chapterProgress ? (
        <div className="rounded-xl border border-hairline bg-bg-2 p-2.5">
          <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[1.5px] text-text-dim">
            <span>{chapter?.title ?? 'Chapter'}</span>
            {bestRatio ? <span className="tabular-nums text-text">{bestRatio}</span> : null}
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-bg-0">
            <div
              className="h-full rounded-full bg-brand transition-[width] duration-500"
              style={{ width: `${Math.round(chapterProgress.progress * 100)}%` }}
              aria-label={`Chapter progress ${Math.round(chapterProgress.progress * 100)}%`}
            />
          </div>
        </div>
      ) : null}

      {/* Up next CTA — falls back to the pathway detail link when
          recommendedNext is unavailable (loading, all mastered, etc.). */}
      {loading ? (
        <div className="h-10 animate-pulse rounded-xl bg-bg-2" />
      ) : upNextLabel && upNextHref ? (
        <Link
          href={upNextHref}
          className="flex items-center justify-center gap-2 rounded-xl bg-brand py-3 font-display text-[13px] font-bold uppercase tracking-[0.5px] text-brand-ink shadow-brand-sm transition-transform active:scale-[0.99]"
        >
          {nextChapter && nextChapter.slug !== chapter?.slug
            ? `Up next: ${nextChapter.title}`
            : upNextLabel}
          <span aria-hidden>→</span>
        </Link>
      ) : (
        <Link
          href={buildPathwayDetailHref(pathway.slug)}
          className="flex items-center justify-center gap-2 rounded-xl bg-brand py-3 font-display text-[13px] font-bold uppercase tracking-[0.5px] text-brand-ink shadow-brand-sm transition-transform active:scale-[0.99]"
        >
          Continue Pathway
          <span aria-hidden>→</span>
        </Link>
      )}

      {/* V1 Premiumization — direct deep-link into the per-pathway
          progress view from the post-rep loop. Sits between the up-
          next primary CTA and the back-to-pathway link so a returning
          player can confirm what mastery the rep moved without
          climbing back through the pathway → progress hop. */}
      <Link
        href={`/pathways/${encodeURIComponent(pathway.slug)}/progress`}
        className="flex items-center justify-between rounded-xl border border-hairline bg-bg-2 px-3 py-2 text-[11px] font-bold uppercase tracking-[1.5px] text-text-dim transition-colors hover:border-brand/40 hover:text-text"
      >
        <span>View detailed progress</span>
        <span aria-hidden>→</span>
      </Link>

      <Link
        href={buildPathwayDetailHref(pathway.slug)}
        className="block text-center text-[11px] font-semibold uppercase tracking-[1.5px] text-text-dim hover:text-text"
      >
        Back to {pathway.title}
      </Link>
    </div>
  )
}

function ChallengeHero({
  mode,
  chapterTitle,
  bossTitle,
  correct,
  total,
  passed,
  passPct,
  seconds,
}: {
  mode: ChallengeMode
  chapterTitle: string | null
  bossTitle: string | null
  correct: number
  total: number
  passed: boolean
  passPct: number | null
  seconds: number
}) {
  const isBoss = mode === 'boss-challenge'
  const accent = passed ? 'brand' : 'heat'
  const eyebrow = isBoss ? 'Boss Challenge' : 'Final Mix'
  const title = isBoss
    ? bossTitle?.replace(/^Boss\s*[—-]\s*/, '') ?? 'Boss Challenge'
    : chapterTitle ?? 'Final Mix'
  // PTH-5 copy: a passed mixed-reads run clears the foundation; we say
  // it that way to celebrate the milestone rather than just labeling
  // the rep.
  const headline = passed
    ? isBoss
      ? 'Boss cleared.'
      : 'Foundation cleared.'
    : isBoss
      ? 'Not cleared yet.'
      : 'Almost. Run it back.'
  const subline = passed
    ? isBoss
      ? 'Chapter mastered. Keep the read sharp.'
      : 'You read the play, not the decoder.'
    : isBoss
      ? 'Review the cue, then run it back.'
      : 'You had to identify the cue without the decoder label.'
  return (
    <motion.header
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
      className={[
        'rounded-3xl border-2 bg-gradient-to-br from-bg-1 to-bg-2 p-6 text-center',
        passed ? 'border-brand shadow-brand-sm' : 'border-heat/60 shadow-heat',
      ].join(' ')}
    >
      <p
        className={[
          'text-[10px] font-bold uppercase tracking-[2px]',
          passed ? 'text-brand' : 'text-heat',
        ].join(' ')}
      >
        {eyebrow} · {passed ? 'Passed' : 'Try again'}
      </p>
      <p className="mt-2 font-display text-[44px] font-black leading-none tracking-tight text-text">
        {correct}
        <span className="text-text-dim">/{total}</span>
      </p>
      <p className="mt-1 text-sm text-text-dim">
        {passPct !== null ? `${passPct}% to pass · ${seconds}s` : `${seconds}s`}
      </p>
      <p className={`mt-3 font-display text-[18px] font-bold leading-tight text-${accent}`}>
        {headline}
      </p>
      <p className="mt-1 text-[13px] leading-snug text-text-dim">{subline}</p>
      <p className="mt-3 text-[11px] font-semibold uppercase tracking-[1.5px] text-text-mute">
        {title}
      </p>
    </motion.header>
  )
}

function ChallengeActions({
  mode,
  passed,
  retryHref,
  pathwayHref,
  pathwaySlug,
}: {
  mode: ChallengeMode
  passed: boolean
  retryHref: string | null
  pathwayHref: string
  // V1 Premiumization — slug used to build the per-pathway progress
  // deep-link below so a passed boss / cleared Final Mix has a one-
  // tap path into the player's mastery view.
  pathwaySlug: string
}) {
  // PTH-5 copy: passed primary CTA → continue pathway / next pathway;
  // failed primary CTA → retry the challenge directly.
  const retryLabel =
    mode === 'boss-challenge'
      ? passed
        ? 'Run it back'
        : 'Retry Boss'
      : passed
        ? 'Run it back'
        : 'Retry Final Mix'
  const continueLabel = passed ? 'Continue Pathway' : 'Review chapter'
  return (
    <div className="space-y-3 pt-2">
      <div className="grid grid-cols-2 gap-3">
        {retryHref ? (
          <Link
            href={retryHref}
            className={[
              'rounded-xl py-3.5 text-center font-display text-[14px] font-bold uppercase tracking-[0.5px] active:scale-[0.99]',
              passed
                ? 'border border-hairline-2 bg-bg-1 text-text'
                : 'bg-heat text-bg-0 shadow-heat',
            ].join(' ')}
          >
            {retryLabel}
          </Link>
        ) : (
          <span className="rounded-xl border border-hairline-2 bg-bg-2 py-3.5 text-center font-display text-[14px] font-semibold text-text-mute">
            {retryLabel}
          </span>
        )}
        <Link
          href={pathwayHref}
          className={[
            'rounded-xl py-3.5 text-center font-display text-[14px] font-bold uppercase tracking-[0.5px] active:scale-[0.99]',
            passed
              ? 'bg-brand text-brand-ink shadow-brand-sm'
              : 'border border-hairline-2 bg-bg-1 text-text',
          ].join(' ')}
        >
          {continueLabel}
        </Link>
      </div>
      <Link
        href={pathwayHref}
        className="block rounded-xl bg-bg-2 py-3 text-center font-display text-[12px] font-semibold uppercase tracking-[1.5px] text-text-dim"
      >
        Back to Pathway
      </Link>
      {/* V1 Premiumization — direct deep-link into the per-pathway
          progress view from a challenge result so the player can see
          exactly how this run moved their chapter mastery (or what
          still needs work for a retry). */}
      <Link
        href={`/pathways/${encodeURIComponent(pathwaySlug)}/progress`}
        className="block text-center text-[11px] font-semibold uppercase tracking-[1.5px] text-text-dim hover:text-text"
      >
        View detailed progress →
      </Link>
    </div>
  )
}

function RewardStat({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent: 'xp' | 'iq' | 'heat'
}) {
  const color = accent === 'xp' ? 'var(--xp)' : accent === 'iq' ? 'var(--iq)' : 'var(--heat)'
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
      className="rounded-2xl border border-hairline-2 bg-bg-1 p-4"
    >
      <p className="text-[11px] font-semibold uppercase tracking-[1.5px] text-text-dim">{label}</p>
      <p className="mt-1 font-display text-[28px] font-black tabular-nums" style={{ color }}>
        {value}
      </p>
    </motion.div>
  )
}

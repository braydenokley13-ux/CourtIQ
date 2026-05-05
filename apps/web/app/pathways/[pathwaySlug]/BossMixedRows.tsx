'use client'

/**
 * Client-only wrappers for the chapter Boss + Mixed Reads rows on
 * /pathways/[pathwaySlug] (PTH-3).
 *
 * The parent page is a server component, so this island is the only
 * place that can read the localStorage-backed boss/mixed pass state
 * surfaced by `localChallengeProgress`. The "cleared" decoration is
 * advisory: it appears post-pass but never gates anything, so it's
 * safe for it to be missing on first paint.
 */

import Link from 'next/link'
import { useEffect, useState } from 'react'
import {
  hasClearedChallenge,
  type ChallengeMode,
} from '@/lib/pathways/localChallengeProgress'
import { countChapterScenarios } from '@/lib/pathways/helpers'
import type { PathwayChapterConfig } from '@/lib/pathways/types'

function useClearedTag(args: {
  pathwaySlug: string
  chapterSlug: string
  mode: ChallengeMode
  challengeSlug: string
}) {
  const { pathwaySlug, chapterSlug, mode, challengeSlug } = args
  const [cleared, setCleared] = useState(false)
  useEffect(() => {
    setCleared(
      hasClearedChallenge({ pathwaySlug, chapterSlug, mode, challengeSlug }),
    )
  }, [pathwaySlug, chapterSlug, mode, challengeSlug])
  return cleared
}

export function BossChallengeRow({
  pathwaySlug,
  chapter,
  href,
  ready,
  recommended,
  disabled,
}: {
  pathwaySlug: string
  chapter: PathwayChapterConfig
  href: string
  ready: boolean
  recommended: boolean
  disabled: boolean
}) {
  const boss = chapter.bossChallenge!
  const cleared = useClearedTag({
    pathwaySlug,
    chapterSlug: chapter.slug,
    mode: 'boss-challenge',
    challengeSlug: boss.slug,
  })
  const cleanTitle = boss.title.replace(/^Boss\s*[—-]\s*/, '')
  const ctaLabel = cleared
    ? 'Run the Boss again'
    : recommended
      ? 'Run the Boss'
      : ready
        ? 'Try the Boss'
        : 'Try the Boss anyway'
  const tone = cleared
    ? 'border-brand/50 bg-brand/10 text-brand'
    : recommended
      ? 'border-heat/60 bg-heat/15 text-heat shadow-heat'
      : 'border-heat/40 bg-heat/5 text-heat'
  const subline = cleared
    ? 'Boss cleared. Lock it in with another rep.'
    : recommended
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
        <span className="rounded-full border border-hairline-2 bg-bg-2 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[1px] text-text-mute">
          {cleared ? 'Cleared' : `${boss.scenarioIds.length} reps · no hints`}
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
          className={[
            'flex items-center justify-center gap-2 rounded-lg py-2.5 text-center font-display text-[12px] font-bold uppercase tracking-[1px] transition-transform active:scale-[0.99]',
            cleared ? 'bg-brand/90 text-brand-ink' : 'bg-heat/90 text-bg-0',
          ].join(' ')}
        >
          {ctaLabel}
          <span aria-hidden>→</span>
        </Link>
      )}
    </div>
  )
}

export function MixedReadsRow({
  pathwaySlug,
  chapter,
  href,
  disabled,
  challengeSlug,
}: {
  pathwaySlug: string
  chapter: PathwayChapterConfig
  href: string
  disabled: boolean
  challengeSlug: string
}) {
  const cleared = useClearedTag({
    pathwaySlug,
    chapterSlug: chapter.slug,
    mode: 'mixed-reads',
    challengeSlug,
  })
  return (
    <div
      className={[
        'space-y-2 rounded-xl border p-3',
        cleared ? 'border-brand/50 bg-brand/10 text-brand' : 'border-iq/40 bg-iq/5 text-iq',
      ].join(' ')}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[1.5px]">
          Mixed Reads · {chapter.title}
        </p>
        <span className="rounded-full border border-hairline-2 bg-bg-2 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[1px] text-text-mute">
          {cleared ? 'Cleared' : 'No decoder pill'}
        </span>
      </div>
      <p className="text-[12px] text-text-dim">
        {cleared
          ? 'Mixed reads cleared. Run it again to keep the eye sharp.'
          : `Read the play, not the decoder. ${countChapterScenarios(chapter)} reps.`}
      </p>
      {disabled ? (
        <p className="rounded-lg border border-hairline-2 bg-bg-2 px-3 py-2 text-center text-[10px] uppercase tracking-[1.5px] text-text-mute">
          Unlocks after Chapter 4
        </p>
      ) : (
        <Link
          href={href}
          className={[
            'flex items-center justify-center gap-2 rounded-lg py-2.5 text-center font-display text-[12px] font-bold uppercase tracking-[1px] transition-transform active:scale-[0.99]',
            cleared ? 'bg-brand/90 text-brand-ink' : 'bg-iq/90 text-bg-0',
          ].join(' ')}
        >
          {cleared ? 'Run Mixed Reads again' : 'Run Mixed Reads'}
          <span aria-hidden>→</span>
        </Link>
      )}
    </div>
  )
}

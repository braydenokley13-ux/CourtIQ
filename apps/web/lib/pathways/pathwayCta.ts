/**
 * V1 Premiumization — Pathway primary-CTA mapping.
 *
 * Centralizes the player-facing copy + href that should sit at the
 * top of the Pathway detail page so the page knows, at a glance,
 * what the next action is. The previous component-level branching
 * worked but was duplicated across `ActivePathwayView`, the
 * `ChapterCta` row, and `/train/summary`'s PathwayCtaBlock; pinning
 * the policy in one pure helper keeps those surfaces in sync.
 *
 * Pure data layer — no DOM, no fetches, no authoring of `/train`
 * URLs (those still live in `helpers.ts`). Just consumes a progress
 * summary and a recommended-next, returns a typed CTA descriptor.
 *
 * Tests pin every priority branch + the cold-start fallback so a
 * regression cannot quietly demote a returning player to the cold-
 * start label.
 */

import type {
  PathwayConfig,
  PathwayProgressSummary,
  PathwayRecommendedNext,
} from './types'
import { buildPathwayDetailHref } from './helpers'

/**
 * Player-facing CTA shape. The `priority` is a stable enumerated
 * reason the CTA was picked so callers can colour-code or animate
 * the surface differently per priority (e.g. brighten the card on
 * 'mastered').
 *
 *   - 'cold-start'    — no progress yet; "Start training" framing.
 *   - 'continue'      — mid-pathway; "Continue [chapter]" framing.
 *   - 'capstone'      — the recommended-next is the capstone (Final
 *                        Mix); upgrade copy + accent.
 *   - 'mastered'      — pathway is complete; offer review / browse.
 *   - 'fallback'      — no recommended-next AND not mastered (e.g.
 *                        all chapters locked behind unlocking — very
 *                        rare). Sends to the pathway detail page.
 */
export type PathwayCtaPriority =
  | 'cold-start'
  | 'continue'
  | 'capstone'
  | 'mastered'
  | 'fallback'

export interface PathwayCta {
  primaryLabel: string
  primaryHref: string
  /** Eyebrow over the primary CTA, e.g. "Up next" or "Pathway mastered". */
  eyebrow: string
  /** Why this CTA was selected — drives accent colour. */
  priority: PathwayCtaPriority
  /** Optional subline beneath the eyebrow — chapter title for continue,
   *  short summary for mastered/cold-start. Null when no extra context. */
  subline: string | null
}

export interface PickPathwayCtaInput {
  pathway: PathwayConfig
  progress: PathwayProgressSummary | null
  /** Convenience handle on `progress.recommendedNext`; the helper
   *  accepts it explicitly so a caller that already destructured the
   *  field doesn't have to thread the whole summary back in. */
  recommended?: PathwayRecommendedNext | null
}

/**
 * Resolves the pathway-page primary CTA. Priority order:
 *
 *   1. Pathway mastered    → 'mastered'
 *   2. Recommended-next is the capstone (reason === 'capstone')
 *                          → 'capstone'
 *   3. Recommended-next exists AND progress > 0
 *                          → 'continue'
 *   4. Recommended-next exists AND progress === 0
 *                          → 'cold-start'
 *   5. No recommended-next AND not mastered
 *                          → 'fallback' (linked to detail)
 *
 * The helper never throws; missing data degrades to 'fallback'.
 */
export function pickPathwayCta(input: PickPathwayCtaInput): PathwayCta {
  const { pathway, progress } = input
  const recommended = input.recommended ?? progress?.recommendedNext ?? null
  const progressPct = Math.round((progress?.pathwayProgress ?? 0) * 100)

  if (progress?.pathwayMastered) {
    return {
      primaryLabel: 'Review pathway',
      primaryHref: buildPathwayDetailHref(pathway.slug),
      eyebrow: 'Pathway mastered',
      priority: 'mastered',
      subline: pathway.title,
    }
  }

  if (recommended) {
    if (recommended.reason === 'capstone') {
      return {
        primaryLabel: recommended.label,
        primaryHref: recommended.trainHref,
        eyebrow: 'Final Mix unlocked',
        priority: 'capstone',
        subline: 'Read the play without the decoder.',
      }
    }
    if (progressPct === 0) {
      return {
        primaryLabel: 'Start training',
        primaryHref: recommended.trainHref,
        eyebrow: 'First step',
        priority: 'cold-start',
        subline: recommended.label,
      }
    }
    return {
      primaryLabel: 'Continue training',
      primaryHref: recommended.trainHref,
      eyebrow: 'Up next',
      priority: 'continue',
      subline: recommended.label,
    }
  }

  return {
    primaryLabel: 'Open pathway',
    primaryHref: buildPathwayDetailHref(pathway.slug),
    eyebrow: 'Pathway',
    priority: 'fallback',
    subline: pathway.title,
  }
}

/**
 * Compact progress summary for the pathway home. Counts chapters
 * that have reached `mastered` / `completed` so the surface can
 * say "3 of 5 chapters done". Pure: derived from the summary's
 * chapter array; no fetches.
 */
export interface PathwayProgressBreakdown {
  totalChapters: number
  chaptersMastered: number
  chaptersInProgress: number
  totalReps: number
  bestReps: number
  weakestDecoderLabel: string | null
}

export function summarisePathwayProgress(
  pathway: PathwayConfig,
  progress: PathwayProgressSummary | null,
  decoderLabelLookup: (tag: PathwayProgressSummary['weakestDecoder']) => string | null,
): PathwayProgressBreakdown {
  const totalChapters = pathway.chapters.length
  if (!progress) {
    return {
      totalChapters,
      chaptersMastered: 0,
      chaptersInProgress: 0,
      totalReps: 0,
      bestReps: 0,
      weakestDecoderLabel: null,
    }
  }
  let chaptersMastered = 0
  let chaptersInProgress = 0
  let totalReps = 0
  let bestReps = 0
  for (const ch of progress.chapters) {
    if (ch.state === 'mastered') chaptersMastered += 1
    else if (
      ch.state === 'completed' ||
      ch.state === 'in_progress' ||
      ch.state === 'unlocked'
    ) {
      // unlocked + attempted counts as in-progress for the player's
      // mental model — but `unlocked` with zero attempts shouldn't
      // light up the chip.
      if (ch.attemptedCount > 0) chaptersInProgress += 1
    }
    totalReps += ch.totalScenarios
    bestReps += ch.bestCount
  }
  return {
    totalChapters,
    chaptersMastered,
    chaptersInProgress,
    totalReps,
    bestReps,
    weakestDecoderLabel: decoderLabelLookup(progress.weakestDecoder),
  }
}

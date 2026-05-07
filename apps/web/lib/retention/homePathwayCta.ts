/**
 * V3 P8 — pure CTA derivation for the home Pathway primary card.
 *
 * Picks the eyebrow / label / subline / href the home page surfaces
 * based on the pathway progress lite payload, attempts count, and
 * loading state. Extracted so the banding (cold-start / continue /
 * mastered) can be unit-tested without mounting the home page.
 *
 * Lifted out of `app/home/page.tsx` after V3 P5 introduced the
 * Pathway-driven CTA — the test harness wouldn't otherwise have a
 * way to lock the "Start Foundation" / "Continue: <chapter>" / "Run
 * it back" banding against future copy edits or progress-shape
 * changes.
 */

export interface HomePathwayLite {
  pathwayProgress: number
  pathwayMastered: boolean
  recommendedNext: { trainHref: string; label: string } | null
}

export type HomePathwayCtaBand =
  | 'loading'
  | 'mastered'
  | 'cold-start'
  | 'continue'

export interface HomePathwayCta {
  band: HomePathwayCtaBand
  eyebrow: string
  primaryLabel: string
  primarySubline: string
  primaryHref: string
}

const FOUNDATION_DETAIL_HREF = '/pathways/complete-iq-foundation'

export function pickHomePathwayCta(input: {
  pathway: HomePathwayLite | null
  attempts: number
  loading: boolean
}): HomePathwayCta {
  const { pathway, attempts, loading } = input
  const progressPct = Math.round((pathway?.pathwayProgress ?? 0) * 100)

  if (loading) {
    return {
      band: 'loading',
      eyebrow: 'Your Pathway',
      primaryLabel: 'Loading…',
      primarySubline: 'Pulling your next read.',
      primaryHref: FOUNDATION_DETAIL_HREF,
    }
  }

  if (pathway?.pathwayMastered) {
    return {
      band: 'mastered',
      eyebrow: 'Foundation mastered',
      primaryLabel: 'Run it back',
      primarySubline: 'Re-run a chapter — keeps the reads sharp.',
      primaryHref: FOUNDATION_DETAIL_HREF,
    }
  }

  const hasRecommendation = !!pathway?.recommendedNext?.trainHref
  if (attempts === 0 || !hasRecommendation) {
    return {
      band: 'cold-start',
      eyebrow: 'Start here',
      primaryLabel: 'Start Foundation',
      primarySubline: 'Four reads. ~25 min total. First read is two taps away.',
      primaryHref: pathway?.recommendedNext?.trainHref ?? FOUNDATION_DETAIL_HREF,
    }
  }

  return {
    band: 'continue',
    eyebrow: "Today's reps",
    primaryLabel: pathway!.recommendedNext!.label,
    primarySubline: `Foundation · ${progressPct}% in.`,
    primaryHref: pathway!.recommendedNext!.trainHref,
  }
}

export { FOUNDATION_DETAIL_HREF }

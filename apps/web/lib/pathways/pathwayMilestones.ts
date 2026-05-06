/**
 * V2-F — Pathway Milestone copy.
 *
 * Pure helper that produces the small "what's next + why it matters"
 * line that anchors the Pathway hub to a clear emotional reward. The
 * pre-V2 detail page surfaced progress as raw percentages and
 * accuracy numbers; that reads as data, not as a journey. This helper
 * looks at the same progress summary and picks the single most
 * motivating piece of copy:
 *
 *   - "Mastered. Open for review." — every chapter mastered.
 *   - "Final Mix unlocked. Read the play." — capstone is open.
 *   - "1 chapter to Capstone." — last non-capstone chapter mastered.
 *   - "X reps to master Chapter Y." — current chapter is close.
 *   - "Start Chapter Y." — cold start on a fresh chapter.
 *   - "Keep training." — fallback for any other state.
 *
 * The helper never throws: missing data degrades to the fallback
 * line. Pure: same input → byte-identical output.
 */

import type {
  PathwayConfig,
  PathwayProgressSummary,
  PathwayChapterProgress,
} from './types'

/**
 * The motivational tone of the milestone. Drives accent colour /
 * emoji choice in the UI without forcing a particular layout.
 */
export type PathwayMilestoneTone =
  | 'mastered'
  | 'capstone-unlocked'
  | 'capstone-near'
  | 'chapter-near'
  | 'cold-start'
  | 'fallback'

export interface PathwayMilestone {
  /** Short, player-voice copy (≤ ~64 chars). */
  headline: string
  /** Optional second-line that quantifies the milestone. */
  detail: string | null
  tone: PathwayMilestoneTone
}

const FALLBACK_MILESTONE: PathwayMilestone = {
  headline: 'Keep training.',
  detail: null,
  tone: 'fallback',
}

/**
 * Returns the most motivating milestone copy for the player's current
 * state. Pure helper — same inputs → byte-identical output.
 *
 * Priority order:
 *   1. Pathway mastered → 'mastered'
 *   2. Capstone is the recommended-next → 'capstone-unlocked'
 *   3. Only the capstone chapter remains un-mastered → 'capstone-near'
 *   4. Current (recommended) chapter is within 2 reps of mastery
 *      → 'chapter-near'
 *   5. Recommended-next exists with zero progress → 'cold-start'
 *   6. Otherwise fallback.
 */
export function deriveMilestone(
  pathway: PathwayConfig,
  progress: PathwayProgressSummary | null,
): PathwayMilestone {
  if (!progress) return FALLBACK_MILESTONE

  if (progress.pathwayMastered) {
    return {
      headline: 'Pathway mastered.',
      detail: 'Open chapters again to keep your reads sharp.',
      tone: 'mastered',
    }
  }

  const recommended = progress.recommendedNext
  const chapters = progress.chapters
  const totalChapters = pathway.chapters.length

  // §2: Capstone = the recommended-next chapter is the capstone (the
  // only chapter with no decoderTag in the config).
  if (recommended?.reason === 'capstone') {
    return {
      headline: 'Final Mix unlocked.',
      detail: 'Read the play without the decoder pill.',
      tone: 'capstone-unlocked',
    }
  }

  // §3: Capstone-near = every non-capstone chapter is mastered, but
  // the capstone itself isn't yet recommended (e.g. one boss attempt
  // still pending). Look at the chapter array for accurate state.
  const capstoneIndex = pathway.chapters.findIndex(
    (c) => c.decoderTag === null,
  )
  if (capstoneIndex >= 0 && totalChapters > 1) {
    const masteredNonCapstone = chapters.filter(
      (ch, i) => i !== capstoneIndex && ch.state === 'mastered',
    ).length
    const otherChapters = totalChapters - 1
    if (masteredNonCapstone === otherChapters) {
      return {
        headline: '1 chapter to Capstone.',
        detail: 'Finish the boss to unlock Final Mix.',
        tone: 'capstone-near',
      }
    }
  }

  // §4: Chapter-near = the recommended-next's chapter is within ~2
  // best-reps of full mastery. We lean on the chapter's bestCount
  // and totalScenarios since `progress` is 0..1 and not always
  // granular enough to pick a tipping point.
  if (recommended) {
    const ch = chapters.find((c) => c.slug === recommended.chapterSlug)
    if (ch && ch.totalScenarios > 0) {
      const remaining = chapterRepsToMastery(ch)
      if (remaining > 0 && remaining <= 2) {
        const chapterTitle = pathway.chapters.find(
          (c) => c.slug === recommended.chapterSlug,
        )?.title
        return {
          headline:
            remaining === 1
              ? `1 rep to master ${chapterTitle ?? 'this chapter'}.`
              : `${remaining} reps to master ${chapterTitle ?? 'this chapter'}.`,
          detail: 'You are right at the edge.',
          tone: 'chapter-near',
        }
      }
    }
  }

  // §5: Cold start.
  if (recommended && (progress.pathwayProgress ?? 0) === 0) {
    const chapterTitle = pathway.chapters.find(
      (c) => c.slug === recommended.chapterSlug,
    )?.title
    return {
      headline: chapterTitle
        ? `Start with ${chapterTitle}.`
        : 'Start your foundation.',
      detail: 'A few minutes a day builds the IQ.',
      tone: 'cold-start',
    }
  }

  return FALLBACK_MILESTONE
}

/**
 * Returns how many additional best-reps the chapter needs to reach
 * full mastery, on a heuristic best-of-total scale. Bounded below by
 * 0 (already mastered).
 */
function chapterRepsToMastery(ch: PathwayChapterProgress): number {
  if (ch.state === 'mastered') return 0
  if (ch.totalScenarios <= 0) return 0
  // The mastery target is "best across the whole chapter". 1 rep
  // short reads as "right at the edge"; 2 reps short still reads
  // as "almost there"; beyond that it's not a milestone.
  return Math.max(0, ch.totalScenarios - ch.bestCount)
}

/**
 * Convenience: a stable ordered list of every tone the helper can
 * emit. Surfaced so tests + UI exhaustively map every tone to a
 * style without `default:` fallbacks that swallow new tones.
 */
export const ALL_MILESTONE_TONES: readonly PathwayMilestoneTone[] = [
  'mastered',
  'capstone-unlocked',
  'capstone-near',
  'chapter-near',
  'cold-start',
  'fallback',
] as const

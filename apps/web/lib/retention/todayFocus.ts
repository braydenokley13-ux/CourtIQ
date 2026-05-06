/**
 * V3 P6 — return-loop "today's focus" derivation.
 *
 * Pure helper that turns the data the /home page already fetches
 * (profile decoders + pathway progress lite) into ONE coaching line
 * the returning player can act on. No new endpoints, no new tables,
 * no streak/XP framing — the goal is the player thinks "I'm becoming
 * a smarter reader" not "I owe the app a rep".
 *
 * Banding (in priority order):
 *   - mastered        → "Pathway mastered. Run it back any time."
 *   - close-to-mastery → "Close on <decoder>. A few sharp reads from mastery."
 *   - in-progress     → "You're sharpening <decoder>." + recommendedNext
 *   - cold            → null (the home Pathway CTA is enough)
 */

export interface DecoderProgressLite {
  tag: string
  title: string
  state: 'new' | 'in_progress' | 'mastered'
  attempts: number
  rolling_accuracy: number
}

export interface PathwayProgressLite {
  pathwayProgress: number
  pathwayMastered: boolean
  recommendedNext: { trainHref: string; label: string } | null
}

export type ReturnFocusBand =
  | 'mastered'
  | 'close-to-mastery'
  | 'in-progress'
  | 'fresh-start'

export interface ReturnFocus {
  band: ReturnFocusBand
  /** Single coaching line, basketball-IQ flavored. */
  headline: string
  /** Optional second line — the "next best rep" CTA copy. */
  sub: string | null
  /** Optional href for the chip's tap — falls back to the Pathway
   *  primary card if absent. */
  href: string | null
}

const CLOSE_ACCURACY_FLOOR = 0.6
const CLOSE_ATTEMPTS_FLOOR = 3

/**
 * Pick the strongest in-progress decoder a player is close to mastering.
 * "Close" means high rolling accuracy with enough attempts to be real.
 */
function pickClosestDecoder(decoders: readonly DecoderProgressLite[]): DecoderProgressLite | null {
  const candidates = decoders
    .filter(
      (d) =>
        d.state === 'in_progress' &&
        d.attempts >= CLOSE_ATTEMPTS_FLOOR &&
        d.rolling_accuracy >= CLOSE_ACCURACY_FLOOR,
    )
    .sort((a, b) => b.rolling_accuracy - a.rolling_accuracy)
  return candidates[0] ?? null
}

/**
 * Pick any decoder the player is actively working — used as a fallback
 * for the "you're sharpening X" voice when no one is mastery-close.
 */
function pickActiveDecoder(decoders: readonly DecoderProgressLite[]): DecoderProgressLite | null {
  const inProgress = decoders
    .filter((d) => d.state === 'in_progress' && d.attempts > 0)
    .sort((a, b) => b.attempts - a.attempts)
  return inProgress[0] ?? null
}

export function deriveReturnFocus({
  attemptsCount,
  decoders,
  pathway,
}: {
  attemptsCount: number
  decoders: readonly DecoderProgressLite[]
  pathway: PathwayProgressLite | null
}): ReturnFocus | null {
  if (attemptsCount <= 0) return null

  if (pathway?.pathwayMastered) {
    return {
      band: 'mastered',
      headline: 'Pathway mastered.',
      sub: 'Run a chapter back any time — keeps the reads sharp.',
      href: pathway?.recommendedNext?.trainHref ?? null,
    }
  }

  const closest = pickClosestDecoder(decoders)
  if (closest) {
    return {
      band: 'close-to-mastery',
      headline: `${closest.title} is starting to click.`,
      sub: 'A few more sharp reads and it’s locked.',
      href: pathway?.recommendedNext?.trainHref ?? null,
    }
  }

  const active = pickActiveDecoder(decoders)
  if (active) {
    return {
      band: 'in-progress',
      headline: `${active.title} is sharpening up.`,
      sub: pathway?.recommendedNext?.label ?? null,
      href: pathway?.recommendedNext?.trainHref ?? null,
    }
  }

  // Reps logged but no decoder is yet "in progress" (e.g. all attempts
  // were on a single rep that ended `new`). Keep the chip useful by
  // pointing at the next best rep the Pathway recommends.
  if (pathway?.recommendedNext) {
    return {
      band: 'fresh-start',
      headline: 'Pick up where you left off.',
      sub: pathway.recommendedNext.label,
      href: pathway.recommendedNext.trainHref,
    }
  }

  return null
}

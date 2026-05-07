/**
 * Classifies a single attempt into one of five cognitive states.
 *
 * The whole module is one switch table over (correctness × speed ×
 * choice quality × prior exposure). It deliberately produces a
 * categorical output, not a continuous score — categorical decisions
 * are easier to explain, easier to test, and harder to game.
 */
import {
  type AdaptiveAttempt,
  type ClassifiedAttempt,
  type AttemptClass,
  RECOGNITION_LATENCY_MS_BY_DIFFICULTY,
  HESITATION_FACTOR,
  GUESS_FACTOR,
} from './types'

export interface ClassifyContext {
  /** Total prior attempts on this decoder (across all templates). Used
   *  to flag lucky guesses on brand-new decoders. */
  decoderAttemptsBefore: number
}

export function classifyAttempt(
  attempt: AdaptiveAttempt,
  ctx: ClassifyContext = { decoderAttemptsBefore: 0 },
): ClassifiedAttempt {
  const threshold =
    RECOGNITION_LATENCY_MS_BY_DIFFICULTY[attempt.difficulty] ??
    RECOGNITION_LATENCY_MS_BY_DIFFICULTY[5]!
  const fast = attempt.timeMs <= threshold
  const slow = attempt.timeMs > threshold * HESITATION_FACTOR
  const veryFast = attempt.timeMs < threshold * GUESS_FACTOR

  const cls = pick(attempt, ctx, { fast, slow, veryFast })
  return {
    class: cls,
    inadmissibleForPromotion: cls === 'guessing',
  }
}

function pick(
  attempt: AdaptiveAttempt,
  ctx: ClassifyContext,
  speed: { fast: boolean; slow: boolean; veryFast: boolean },
): AttemptClass {
  // Lucky-guess detector — correct + instantaneous on a brand-new decoder.
  // We refuse to promote band on these so a player can't tap their way to
  // mastery on a coin flip.
  if (attempt.isCorrect && speed.veryFast && ctx.decoderAttemptsBefore === 0) {
    return 'guessing'
  }
  if (attempt.isCorrect) {
    return speed.fast ? 'recognized' : 'resolved'
  }
  if (attempt.choiceQuality === 'acceptable') {
    return 'missed_acceptable'
  }
  return speed.slow ? 'stuck' : 'missed_wrong'
}

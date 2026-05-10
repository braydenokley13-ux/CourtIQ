/**
 * Phase 4 — Adaptive Training Intelligence.
 *
 * Pure heuristics that turn the player's existing Attempt + Mastery
 * history into interpretable per-decoder routing signals. No DB, no I/O.
 *
 * Consumers:
 *   - scenarioService.generateSessionBundle: reads `nextProbe` per
 *     decoder to compose the 5-rep bundle (route via banded selection
 *     instead of raw weakest-concept).
 *   - /train summary + pathway progress UI: surfaces the 3-segment
 *     decoder ring (recognizing → reflexive → mastered).
 *   - dailyChallenge.compose: honors per-user transfer-probe / mystery-
 *     mode signals when ordering the daily seed.
 */
export type {
  AdaptiveAttempt,
  AttemptClass,
  ClassifiedAttempt,
  DecoderBand,
  DecoderConfidence,
  NextProbe,
  ChoiceQuality,
} from './types'
export {
  RECOGNITION_LATENCY_MS_BY_DIFFICULTY,
  RECOGNITION_WINDOW,
  CONFIDENCE_FLOOR_ATTEMPTS,
  HESITATION_FACTOR,
  GUESS_FACTOR,
} from './types'
export { classifyAttempt } from './classifyAttempt'
export { computeDecoderConfidence } from './decoderBand'
// Pack 2 (Phase β) — pure adaptive eligibility helper. Additive
// re-export; not yet wired into live routing. Surfaces alongside the
// existing adaptive primitives so future routing-layer changes land
// as a single import.
export {
  eligibleDifficultyForDecoder,
  ELIGIBILITY_LOW_ACCURACY_FLOOR,
  ELIGIBILITY_MIN_ATTEMPTS_FOR_D2,
  ELIGIBILITY_MIN_ATTEMPTS_FOR_D3,
  ELIGIBILITY_STRONG_ACCURACY_GATE,
} from './eligibility'
export type {
  Difficulty,
  EligibilityReason,
  EligibilityResult,
} from './eligibility'
